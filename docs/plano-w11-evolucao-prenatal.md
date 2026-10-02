# Plano: evolução de pré-natal (W11)

## Objetivo

A médica vinculada registra a evolução de cada atendimento: medidas da caderneta e texto clínico,
primeiro como rascunho e depois assinada. Isso funciona no web (`/mesa/:pacienteId`) e no mobile
(cartão da paciente), e no mobile o rascunho sobrevive à falta de rede. Evolução assinada é
imutável; para corrigir, a médica cria uma retificação, e as versões anteriores continuam
legíveis. A gestante vê no app só as medidas das evoluções assinadas. Todas as decisões de fundo
estão no [ADR 0006](adr/0006-prontuario-obstetrico.md); este plano é a execução dele.

## Escopo

**Dentro**

- Migration no `prenatalapp`: tabela `evolucoes`, enums, colunas de CRM em `profiles`, trigger de
  imutabilidade e oito RPCs.
- Cenários 93–104 no `supabase/tests/rls_smoke.sql`.
- Web: `ProntuarioService`, componente `CartaoProntuario` no cartão da gestante, CRM em `/equipe`
  e rótulos novos em `/auditoria`.
- Mobile (médica): repositório, rascunho local cifrado com sincronização, tela do prontuário e
  editor de evolução.
- Mobile (gestante): tela "Minha caderneta" com as medidas.
- ADR 0006 passa a **Aceito**; marcar a W11 no `docs/roadmap-web.md`.

**Fora**

- Anamnese, antecedentes e risco gestacional (W12); exames estruturados e vacinas (W13); curvas e
  linha do tempo unificada (W14); prescrição e atestado (W15); ICP-Brasil (W16).
- Segundo BCF para gestação gemelar: na W11 vai no texto do exame físico.
- Biometria e logout por inatividade no mobile (Fase 7 do app). São pré-requisito para a fatia
  mobile ir ao piloto, mas não são implementados aqui.
- Policy de select em `evolucoes`: toda leitura é por RPC, inclusive a da médica.
- Rascunho local no web (o web só faz autosave no servidor).
- Médica editando o próprio CRM (só o admin define).
- Push sobre evolução.
- Sem calcular IG em TypeScript ou em Dart para gravar: a IG congelada vem do Postgres.

## Decisões técnicas

| Decisão                     | Escolha                                                                                                                                                              | Motivo                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Leitura de `evolucoes`      | RLS ligada **sem nenhuma policy** e `revoke all` de `anon`/`authenticated`; leitura só por RPC                                                                       | A gestante não pode alcançar o texto nem por select direto; uma regra só para os dois clientes |
| Parâmetros das RPCs         | Explícitos e tipados (sem `jsonb`)                                                                                                                                   | Segue as RPCs existentes e gera tipos no `database.types.ts`                                   |
| Id da evolução              | UUID gerado no cliente, recebido como `p_id`                                                                                                                         | ADR 0006: upsert idempotente na sincronização                                                  |
| Concorrência                | `revisao integer` com mensagem fixa `'Rascunho alterado em outro aparelho'`                                                                                          | Os clientes detectam conflito pela mensagem, como já fazem com outros P0001                    |
| Reenvio da mesma revisão    | Se `revisao = p_revisao_base + 1` e o conteúdo enviado é idêntico ao gravado, devolve a revisão sem erro                                                             | Retry após timeout não pode virar conflito falso                                               |
| Uma evolução por consulta   | Índice único parcial em `consulta_id` onde `retifica_id is null`                                                                                                     | A retificação herda a consulta; a original é única                                             |
| Um rascunho aberto por raiz | Índice único parcial em `raiz_id` onde `status = 'rascunho'`                                                                                                         | Impede duas retificações paralelas da mesma evolução                                           |
| IG congelada                | `ig_dias` gravado na assinatura: `atendida_em::date - (dpp_final - 280)`                                                                                             | Mesma base de `ig_semanas`, em dias; correção de DUM não reescreve o passado                   |
| Hash                        | `encode(sha256(convert_to(<jsonb canônico>::text, 'UTF8')), 'hex')` com o conteúdo, `id`, `gestacao_id`, `autora_id`, `atendida_em`, `assinada_em`, `crm` e `crm_uf` | `jsonb::text` ordena as chaves de forma determinística; `sha256()` é nativo, sem pgcrypto      |
| CRM na assinatura           | Snapshot em `evolucoes.crm`/`crm_uf`                                                                                                                                 | O CRM do perfil pode ser corrigido depois; o assinado não muda                                 |
| Quem define CRM             | Admin, pela RPC `definir_crm` chamada de `/equipe`                                                                                                                   | É dado de identidade da conta, como papel e nome                                               |
| Auditoria de abertura       | Dentro de `prontuario_da_paciente`, com dedupe de 10 min por ator+paciente                                                                                           | Ninguém lê sem registrar, e o autosave que relê não polui o log                                |
| Auditoria de rascunho       | `evolucao.rascunho_criado` só no insert, não a cada autosave                                                                                                         | Autosave geraria centenas de linhas por atendimento                                            |
| Mobile, armazenamento local | `flutter_secure_storage` (Keychain/EncryptedSharedPreferences), um item JSON por rascunho                                                                            | Rascunho tem poucos KB e há poucos por médica; sem banco local nem SQLCipher                   |
| Mobile, UUID                | Pacote `uuid` (v4)                                                                                                                                                   | Dart não gera UUID nativamente                                                                 |
| Gatilho de sincronização    | Ao salvar (debounce 2 s), ao abrir o prontuário e ao voltar o app para primeiro plano                                                                                | Cobre o "voltou a rede" sem serviço em background                                              |
| Web, onde fica o prontuário | Componente `CartaoProntuario` dentro de `/mesa/:pacienteId`                                                                                                          | O cartão já é a tela clínica da médica; nenhuma rota nova                                      |
| Medidas, faixas aceitas     | peso 30–250 kg; PA sistólica 60–260 e diastólica 30–160, as duas ou nenhuma, sistólica > diastólica; AU 5–50 cm; BCF 60–220 bpm                                      | Recusa erro de digitação sem bloquear valor clínico extremo plausível                          |
| Assinar exige conteúdo      | Pelo menos uma medida ou um texto não vazio                                                                                                                          | Evolução vazia assinada é ruído no prontuário                                                  |
| Motivo da retificação       | Obrigatório, mínimo de 10 caracteres após `trim`                                                                                                                     | ADR 0006 item 4                                                                                |

## Pré-requisitos

- Stack local da Supabase rodando em `/Users/joaohenrique/Documents/VoidSans/prenatalapp`
  (`supabase start`).
- Depois da migration, regenerar `prenatalweb/src/types/database.types.ts` com
  `supabase gen types typescript --local`.
- No `prenatalapp`: `flutter pub add flutter_secure_storage uuid`.

## Etapas

### Fatia 1 — Banco

### 1 — Criar a migration do prontuário

**Depende de:** nenhuma
**Arquivo:** `prenatalapp/supabase/migrations/20261001120000_prontuario_evolucao.sql` (criar)
**O que fazer:**

- Enums:
  - `status_evolucao ('rascunho', 'assinada')`
  - `movimentacao_fetal ('presente', 'diminuida', 'ausente')`
  - `grau_edema ('ausente', 'uma_cruz', 'duas_cruzes', 'tres_cruzes', 'quatro_cruzes')`
  - `apresentacao_fetal ('cefalica', 'pelvica', 'transversa', 'indefinida')`
- `profiles`: colunas `crm text null` e `crm_uf char(2) null`. Check: as duas ou nenhuma;
  `crm ~ '^[0-9]{1,7}$'`; `crm_uf` numa das 27 UFs.
- Tabela `evolucoes`:
  - `id uuid pk` (sem default)
  - `raiz_id uuid not null`
  - `retifica_id uuid null references evolucoes`
  - `motivo_retificacao text null`
  - `gestacao_id uuid not null references gestacoes on delete restrict`
  - `consulta_id uuid null references consultas on delete restrict`
  - `autora_id uuid not null references profiles`
  - `papel_vinculo papel_vinculo not null`
  - `status status_evolucao not null default 'rascunho'`
  - `revisao integer not null default 1`
  - `atendida_em timestamptz not null`
  - textos `queixa`, `exame_fisico`, `avaliacao`, `conduta` (todos `text null`)
  - `peso_kg numeric(5,2)`, `pa_sistolica smallint`, `pa_diastolica smallint`,
    `altura_uterina_cm numeric(4,1)`, `bcf_bpm smallint`
  - `movimentacao_fetal movimentacao_fetal`, `edema grau_edema`, `apresentacao apresentacao_fetal`
  - `ig_dias integer null`, `assinada_em timestamptz null`, `conteudo_hash text null`,
    `crm text null`, `crm_uf char(2) null`
  - `created_at timestamptz not null default now()`, `atualizado_em timestamptz not null default now()`
- Constraints e índices:
  - checks das faixas da tabela de decisões;
  - check "assinada ⇒ `assinada_em`, `conteudo_hash`, `crm`, `crm_uf` e `ig_dias` não nulos";
  - check "`retifica_id` não nulo ⇒ `motivo_retificacao` não nulo quando assinada";
  - índices únicos parciais `evolucoes_consulta_original_uq (consulta_id) where retifica_id is null and consulta_id is not null`
    e `evolucoes_rascunho_por_raiz_uq (raiz_id) where status = 'rascunho'`;
  - índice `(gestacao_id, atendida_em)`.
- Acesso à tabela: `alter table evolucoes enable row level security` sem policy;
  `revoke all on evolucoes from anon, authenticated`.
- Trigger `evolucoes_imutavel` (before update or delete): se `old.status = 'assinada'`, levanta
  `'Evolução assinada não pode ser alterada'`. Isso vale também para as RPCs `security definer`.
- Função interna `validar_medidas_evolucao(...)` com as mensagens em português de cada faixa,
  reusada por `salvar_rascunho_evolucao` antes do insert/update, para que o erro chegue legível e
  não como violação de check.
- Função interna `evolucao_vigente(p_raiz_id uuid) returns uuid`: a última assinada da raiz por
  `assinada_em`.

RPCs, todas `security definer`, `set search_path = public`, com mensagem única de gate (não vazar
existência, mesmo princípio de `marcar_consulta`):

- `salvar_rascunho_evolucao(p_id uuid, p_gestacao_id uuid, p_consulta_id uuid, p_revisao_base integer, p_atendida_em timestamptz, p_queixa text, p_exame_fisico text, p_avaliacao text, p_conduta text, p_peso_kg numeric, p_pa_sistolica smallint, p_pa_diastolica smallint, p_altura_uterina_cm numeric, p_bcf_bpm smallint, p_movimentacao_fetal movimentacao_fetal, p_edema grau_edema, p_apresentacao apresentacao_fetal) returns integer`
  - Gate: `current_papel() = 'medica'` e `medica_vinculada_a_gestacao(p_gestacao_id)`.
  - Se `p_id` não existe: exige `p_revisao_base = 0`; `consulta_id`, se dado, precisa ser da
    mesma gestação e não estar `faltou`/`cancelada`; grava `papel_vinculo` a partir de `vinculos`
    ativo; `raiz_id = p_id`; audita `evolucao.rascunho_criado` (meta: `gestacao_id`,
    `consulta_id`); devolve 1.
  - Se existe: exige autora = `auth.uid()` e status `rascunho`; `gestacao_id`/`consulta_id` não
    mudam (se diferentes, levanta erro). Se `revisao = p_revisao_base`, atualiza, incrementa a
    revisão e `atualizado_em` e devolve a nova revisão. Se `revisao = p_revisao_base + 1` e o
    conteúdo é idêntico, devolve `revisao`. Em qualquer outro caso levanta
    `'Rascunho alterado em outro aparelho'`.
  - `atendida_em` não pode estar no futuro (tolerância de 5 min).
- `iniciar_retificacao(p_id uuid, p_evolucao_id uuid) returns void`: exige que a evolução seja
  assinada, vigente, da própria autora e que o vínculo esteja ativo. Insere um rascunho copiando
  conteúdo, `gestacao_id`, `consulta_id`, `atendida_em` e `raiz_id`, com
  `retifica_id = p_evolucao_id` e revisão 1. Sem auditoria (é rascunho).
- `excluir_rascunho_evolucao(p_id uuid) returns void`: autora e status `rascunho`. Sem auditoria.
- `assinar_evolucao(p_id uuid, p_revisao_base integer, p_motivo_retificacao text default null) returns timestamptz`
  - Exige: autora, status `rascunho`, `revisao = p_revisao_base` (ela assina o que viu), vínculo
    ativo, CRM no perfil (mensagem `'Cadastre seu CRM com a administração antes de assinar'`) e
    conteúdo mínimo.
  - Se `retifica_id` não é nulo: a retificada precisa continuar vigente e o motivo é obrigatório.
  - Grava `assinada_em = now()`, `ig_dias`, `crm`/`crm_uf` do perfil e `conteudo_hash`, e muda o
    status para `assinada`.
  - Se `consulta_id` aponta para consulta `agendada`, faz o update para `realizada` e grava
    `consulta.registrada` com o mesmo meta de `marcar_consulta`.
  - Audita `evolucao.assinada` ou `evolucao.retificada` (meta: `raiz_id`, `retifica_id`,
    `motivo`) e devolve `assinada_em`.
- `prontuario_da_paciente(p_paciente_id uuid) returns table (...)` (volatile)
  - Gate: médica com `medica_vinculada_ao_paciente`.
  - Devolve todas as evoluções assinadas das gestações da paciente, todas as versões, mais os
    rascunhos **da própria médica**.
  - Colunas: todas as de `evolucoes` (menos `conteudo_hash`), `autora_nome`, `vigente boolean` e
    `retificada boolean`.
  - Grava `prontuario.aberto` (entidade `pacientes`), exceto se o mesmo ator já gravou para a
    mesma paciente nos últimos 10 minutos.
- `medidas_da_gestacao(p_gestacao_id uuid) returns table (evolucao_id uuid, atendida_em timestamptz, ig_dias integer, peso_kg numeric, pa_sistolica smallint, pa_diastolica smallint, altura_uterina_cm numeric, bcf_bpm smallint, movimentacao_fetal movimentacao_fetal, edema grau_edema, apresentacao apresentacao_fetal)`
  - Gate: `paciente_dona_da_gestacao(p_gestacao_id)` ou `medica_vinculada_a_gestacao(p_gestacao_id)`.
  - Só vigentes assinadas, ordenadas por `atendida_em`.
- `definir_crm(p_medica_id uuid, p_crm text, p_crm_uf text) returns void`: gate `is_admin()`; o
  alvo precisa ter papel `medica`; aceita `null`/`null` para limpar. Audita `profiles.crm_definido`.
- `grant execute` das oito RPCs para `authenticated`.

Validação desta etapa (é migration): `supabase db reset` sem erro.

### 2 — Cenários 93–104 no smoke de RLS

**Depende de:** Etapa 1
**Arquivo:** `prenatalapp/supabase/tests/rls_smoke.sql` (editar, antes do `rollback` final)

Usa `smoke_ids` (`medica_a` vinculada à `gestacao`, `medica_b` sem vínculo, `secretaria`,
`admin`, `paciente_user`) e os helpers `pg_temp.as_user` / `back_to_postgres`. O admin define o
CRM da `medica_a` no começo do cenário 93.

- **93** — A médica vinculada cria rascunho, salva duas vezes (revisões 1→2→3) e assina; `ig_dias`,
  `conteudo_hash` e `crm` ficam preenchidos.
- **94** — Update e delete na linha assinada são recusados mesmo como `postgres` (trigger).
- **95** — Revisão defasada gera `'Rascunho alterado em outro aparelho'`; reenviar a mesma
  revisão com o mesmo conteúdo devolve a revisão sem erro.
- **96** — Retificação: `iniciar_retificacao` + assinar sem motivo é recusado; com motivo, a nova
  vira vigente e a original fica `retificada` e intacta (hash igual ao de antes).
- **97** — Assinar sem CRM é recusado (perfil da `medica_b` vinculada temporariamente, sem CRM).
- **98** — Assinar evolução de consulta `agendada` a marca `realizada`; evolução em consulta
  `cancelada` é recusada; segunda evolução original na mesma consulta é recusada.
- **99** — `medica_b` sem vínculo: `prontuario_da_paciente` recusa e
  `salvar_rascunho_evolucao` recusa.
- **100** — Secretaria e admin recebem recusa em `prontuario_da_paciente` e
  `medidas_da_gestacao`.
- **101** — A gestante lê `medidas_da_gestacao` só da própria gestação, sem rascunho e só a versão
  vigente; `select` direto em `evolucoes` como `authenticated` falha por privilégio.
- **102** — `prontuario_da_paciente` não devolve o rascunho de outra médica; grava
  `prontuario.aberto` uma vez em duas chamadas seguidas.
- **103** — Medida fora de faixa (PA 300/80, sistólica ≤ diastólica, BCF 30) devolve a mensagem
  de `validar_medidas_evolucao`.
- **104** — `definir_crm` recusado para médica e secretaria; admin define e limpa; alvo não-médica
  é recusado.

### Fatia 2 — Web

### 3 — Regenerar tipos e criar `ProntuarioService`

**Depende de:** Etapa 1
**Arquivos:**

- `src/types/database.types.ts` (regenerar)
- `src/app/core/prontuario/prontuario.service.ts` (criar)
- `src/app/core/prontuario/prontuario.service.spec.ts` (criar)

**O que fazer:** serviço `providedIn: 'root'` no molde de `CartaoService`: injeta
`SUPABASE_CLIENT` e `ErroSupabase`, tem o próprio `Resultado<T>` local como os outros serviços e
mapeia snake_case → camelCase.

- Tipos exportados:
  - `EvolucaoProntuario` (todas as colunas da RPC, mais `vigente` e `retificada`);
  - `DadosEvolucao` (o que o editor envia);
  - `MovimentacaoFetal`, `GrauEdema` e `ApresentacaoFetal` a partir de `Database['public']['Enums']`.
- Constante `CONFLITO_RASCUNHO = 'Rascunho alterado em outro aparelho'`.
- Métodos:
  - `prontuario(pacienteId: string): Promise<Resultado<EvolucaoProntuario[]>>`
  - `salvarRascunho(id: string, gestacaoId: string, consultaId: string | null, revisaoBase: number, dados: DadosEvolucao): Promise<Resultado<number>>`
  - `iniciarRetificacao(novoId: string, evolucaoId: string): Promise<Resultado<null>>`
  - `excluirRascunho(id: string): Promise<Resultado<null>>`
  - `assinar(id: string, revisaoBase: number, motivo: string | null): Promise<Resultado<string>>`
  - `medidas(gestacaoId: string): Promise<Resultado<MedidaCaderneta[]>>`
- O id novo vem de `crypto.randomUUID()` no componente, não no serviço.

### 4 — Componente `CartaoProntuario`

**Depende de:** Etapa 3
**Arquivos:**

- `src/app/pages/mesa/cartao/cartao-prontuario.ts`, `.html`, `.scss` e `.spec.ts` (criar)
- `src/app/pages/mesa/cartao/cartao-gestante.html` e `cartao-gestante.ts` (editar)

**O que fazer:**

- **Encaixe no cartão.** Componente standalone no molde de `CartaoDocumentos`.
  - Inputs: `pacienteId`, `gestacaoId`, `gestacaoAtiva` e `consultas: ConsultaCartao[]`.
  - Output: `alterado` (o cartão recarrega as consultas quando uma assinatura fecha uma consulta).
  - Fica em `cartao-gestante.html` como uma `<section class="bloco">` com `<h2>Prontuário</h2>`,
    logo depois do bloco **Consultas**.
- **Lista.** Evoluções da gestação selecionada, vigentes, da mais recente para a mais antiga.
  - Cada linha mostra data, IG congelada (semanas+dias), autora, PA, peso, AU e BCF, e expande
    para os quatro textos.
  - Evolução retificada: tag "Retificada", com "Ver versões anteriores" listando a cadeia da
    `raiz_id`.
  - Rascunhos próprios aparecem no topo com a tag "Rascunho".
- **Nova evolução.** Abre o editor num `p-dialog` largo.
  - Seletor de consulta: consultas da gestação `agendada` com data ≤ agora ou `realizada`, ainda
    sem evolução original, ou "Sem consulta (intercorrência/puerpério)".
  - `atendida_em` assume a `dataHora` da consulta ou agora.
- **Editor.**
  - Medidas em `p-inputnumber`; selects dos três enums; quatro `textarea` (Queixa, Exame físico,
    Avaliação, Conduta).
  - Autosave com debounce de 2 s depois da última mudança, chamando `salvarRascunho` com a
    revisão em signal, e indicador "Salvo às HH:MM" / "Salvando…" / erro.
  - Conflito (`CONFLITO_RASCUNHO`): mensagem com duas ações. **Recarregar versão salva** relê o
    prontuário e descarta o form. **Manter esta tela** relê só a revisão e salva por cima.
- **Assinar.** Diálogo de confirmação com o resumo das medidas, o CRM da médica e, se for
  retificação, o campo de motivo obrigatório. Ao assinar, recarrega o prontuário e emite `alterado`.
- **Retificar.** Ação em evolução vigente da própria médica: `iniciarRetificacao` e abre o editor.
- **Excluir rascunho.** Pede confirmação.
- Gestação encerrada: **Nova evolução** continua disponível, mas sem o seletor de consulta (só
  "Sem consulta"), porque o encerramento cancela as consultas futuras e o puerpério não tem
  consulta agendável (ADR 0006 item 1).

### 5 — CRM em `/equipe` e rótulos da auditoria

**Depende de:** Etapa 3
**Arquivos:**

- `prenatalapp/supabase/functions/gerir-equipe/index.ts` (editar): `listar` passa a selecionar e
  devolver `crm` e `crm_uf`.
- `src/app/core/equipe/equipe.service.ts` e `.spec.ts` (editar): `MembroEquipe` ganha
  `crm: string | null` e `crmUf: string | null`; novo
  `definirCrm(medicaId: string, crm: string | null, crmUf: string | null): Promise<Resultado<null>>`
  via RPC `definir_crm`.
- `src/app/pages/equipe/lista/equipe-lista.ts`, `.html` e `.spec.ts` (editar): coluna "CRM"
  (`123456/SP` ou "—"); para membros `medica`, ação **Definir CRM** abrindo diálogo com número e
  select de UF.
- `src/app/pages/auditoria/lista/auditoria-lista.ts` (editar): em `ROTULO_ACAO`,
  - `evolucao.rascunho_criado` → "Rascunho de evolução criado"
  - `evolucao.assinada` → "Evolução assinada"
  - `evolucao.retificada` → "Evolução retificada"
  - `prontuario.aberto` → "Prontuário aberto"
  - `profiles.crm_definido` → "CRM definido"

  Atualizar a contagem no comentário (29 → 34).

### Fatia 3 — Mobile da médica

### 6 — Modelo e repositório de evolução

**Depende de:** Etapa 1
**Arquivos:**

- `prenatalapp/lib/features/prontuario/data/evolucao.dart` (criar): classe `Evolucao`, com
  `fromJson` da linha de `prontuario_da_paciente`; enums Dart `StatusEvolucao`,
  `MovimentacaoFetal`, `GrauEdema` e `ApresentacaoFetal` com `rotulo`; classe imutável
  `DadosEvolucao` com `toJson`/`fromJson` (usada também no armazenamento local) e `copyWith`.
- `prenatalapp/lib/features/prontuario/data/evolucao_repository.dart` (criar): `EvolucaoRepository`
  no molde de `GestacaoRepository`, com `demoMode` e seeds estáticos em memória com `resetDemo()`.
  - Métodos: `prontuario(String pacienteId)`, `salvarRascunho(...) → Future<int>`,
    `iniciarRetificacao`, `excluirRascunho`, `assinar(...) → Future<DateTime>` e
    `medidas(String gestacaoId)`.
  - Erros de rede (`SocketException`, `ClientException`, timeout) viram `SemConexaoException`.
  - A mensagem `'Rascunho alterado em outro aparelho'` vira `ConflitoRascunhoException`.
  - Provider `evolucaoRepositoryProvider`.

### 7 — Rascunho local cifrado e sincronização

**Depende de:** Etapa 6
**Arquivos:**

- `prenatalapp/lib/features/prontuario/data/rascunho_local_store.dart` (criar): `RascunhoLocalStore`
  sobre `FlutterSecureStorage`.
  - Chave `rascunho_evolucao:<userId>:<evolucaoId>`; valor JSON com `gestacaoId`, `consultaId`,
    `revisaoBase`, `dados`, `salvoLocalEm` e `estado` (`pendente` | `sincronizado` | `conflito`).
  - Métodos: `salvar`, `ler`, `listarDoUsuario(userId)`, `remover` e
    `limparDoUsuario(userId)`.
  - Provider `rascunhoLocalStoreProvider`.
- `prenatalapp/lib/features/prontuario/data/sincronizador_rascunhos.dart` (criar):
  `SincronizadorRascunhos`.
  - `salvar(...)`: grava local como `pendente` primeiro e depois tenta a RPC. Em sucesso, atualiza
    `revisaoBase` e vira `sincronizado`; com `SemConexaoException` fica `pendente`; com
    `ConflitoRascunhoException` vira `conflito`.
  - `sincronizarPendentes(userId)`: envia todos os `pendente`.
  - Depois de `assinar` com sucesso, `remover`.
  - Escuta `AppLifecycleState.resumed` via `WidgetsBindingObserver` registrado no provider.
- `prenatalapp/lib/features/auth/providers/auth_provider.dart` (editar): `signOut` chama
  `limparDoUsuario` antes de encerrar a sessão; troca de usuário no login também limpa o anterior.

### 8 — Telas da médica

**Depende de:** Etapa 7
**Arquivos:**

- `prenatalapp/lib/features/prontuario/presentation/screens/prontuario_screen.dart` (criar): rota
  `/medica/paciente/:id/prontuario`. Lista as evoluções como no web (Etapa 4) e chama
  `sincronizarPendentes` ao abrir. Rascunhos locais `pendente` mostram "Não enviado"; `conflito`
  mostra "Conflito".
- `prenatalapp/lib/features/prontuario/presentation/screens/evolucao_editor_screen.dart` (criar):
  rota `/medica/gestacao/:gestacaoId/evolucao/:evolucaoId`, com query `consultaId` opcional.
  Formulário em tela cheia, autosave com debounce de 2 s pelo sincronizador e indicador "Salvo no
  aparelho" / "Enviado" / "Sem conexão". **Assinar** fica desabilitado sem rede, com a dica
  "Assinar exige conexão".
- `prenatalapp/lib/features/prontuario/presentation/widgets/assinar_evolucao_sheet.dart` (criar):
  bottom sheet com o resumo, o CRM e o motivo quando for retificação.
- `prenatalapp/lib/features/prontuario/presentation/widgets/conflito_rascunho_dialog.dart` (criar):
  "Versão do aparelho" × "Versão do servidor". Escolher o aparelho relê a revisão e salva por
  cima; escolher o servidor descarta o local.
- `prenatalapp/lib/routes/app_router.dart` (editar): as duas rotas, no grupo da médica.
- `prenatalapp/lib/features/medica/presentation/screens/paciente_card_screen.dart` (editar): botão
  **Prontuário**, e ação **Evoluir** nas consultas passadas `agendada`/`realizada` sem evolução,
  abrindo o editor com `consultaId`.

### Fatia 4 — Mobile da gestante

### 9 — Minha caderneta

**Depende de:** Etapa 6
**Arquivos:**

- `prenatalapp/lib/features/prontuario/presentation/screens/caderneta_screen.dart` (criar): rota
  `/caderneta`, lista de `medidas` da gestação ativa (data, IG em semanas, peso, PA, AU e BCF;
  campos nulos como "—"), sem nenhum texto clínico.
- `prenatalapp/lib/features/home/presentation/screens/patient_home_screen.dart` (editar): cartão
  "Minha caderneta" que navega para `/caderneta`.
- `prenatalapp/lib/routes/app_router.dart` (editar): rota no grupo da paciente.

### 10 — Documentação

**Depende de:** Etapas 2, 5, 8 e 9
**Arquivos:**

- `docs/adr/0006-prontuario-obstetrico.md`: status para **Aceito**, citando a migration.
- `docs/roadmap-web.md`: marcar o item W11 com o resumo da entrega e o link para este plano.
- `prenatalapp/docs/roadmap.md`: uma linha na seção da Fase 7 dizendo que a W11 do mobile só vai
  ao piloto depois da biometria.

## Testes

- `prenatalapp/supabase/tests/rls_smoke.sql`: cenários 93–104 (Etapa 2).
- `src/app/core/prontuario/prontuario.service.spec.ts`: mapeamento de linha, parâmetros enviados
  a cada RPC e erro P0001 repassado.
- `src/app/pages/mesa/cartao/cartao-prontuario.spec.ts`:
  - lista só vigentes e expande versões;
  - autosave chama `salvarRascunho` uma vez após o debounce (fake timers) e incrementa a revisão;
  - conflito mostra as duas ações e "Manter esta tela" salva com a revisão relida;
  - assinar retificação sem motivo fica bloqueado;
  - assinar emite `alterado`.
- `src/app/pages/equipe/lista/equipe-lista.spec.ts`: coluna CRM e ação só para `medica`.
- `src/app/core/equipe/equipe.service.spec.ts`: `definirCrm` chama `definir_crm`.
- `prenatalapp/test/w11_prontuario_test.dart`, com `FlutterSecureStorage.setMockInitialValues({})`:
  - repositório demo: salvar, assinar e retificar;
  - sincronizador: sem rede fica `pendente`, e `sincronizarPendentes` envia;
  - conflito vira `conflito`;
  - assinar remove o local;
  - logout chama `limparDoUsuario`;
  - widget do editor desabilita Assinar sem rede;
  - `CadernetaScreen` não renderiza texto clínico.

## Validação final

No `prenatalapp`:

```bash
supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

```bash
flutter analyze && flutter test
```

Esperado: `OK 93` a `OK 104` no fim da saída, nenhum `FAIL`, e a suíte do Flutter verde.

No `prenatalweb`:

```bash
npm run lint && npm run typecheck && npm test
```

Esperado: lint, tipos e Vitest verdes.

Verificação de ponta a ponta:

1. Como admin, definir o CRM da médica em `/equipe`.
2. Como médica no web, abrir `/mesa/:pacienteId`, criar uma evolução de uma consulta passada,
   esperar o "Salvo às", assinar e ver a consulta passar a "Realizada".
3. Retificar com motivo e conferir a versão anterior em "Ver versões anteriores".
4. No mobile em modo avião, abrir o editor e digitar. Fechar e reabrir o app e ver o rascunho
   "Não enviado". Voltar a rede, ver "Enviado" e assinar.
5. Como gestante no app, abrir "Minha caderneta" e ver só as medidas.
6. Em `/auditoria`, conferir `prontuario.aberto`, `evolucao.assinada`, `evolucao.retificada` e
   `profiles.crm_definido`.
