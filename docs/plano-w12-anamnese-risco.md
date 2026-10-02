# Plano: anamnese, antecedentes e risco gestacional (W12)

## Objetivo

A ficha de anamnese da paciente (tipagem, alergias, medicações em uso, comorbidades, antecedentes
obstétricos, familiares e hábitos) pode ser preenchida pela médica vinculada e pela secretaria.
Cada gravação vira uma versão nova e imutável, e as anteriores continuam consultáveis com autor e
papel. A médica classifica o risco da gestação (habitual ou alto) a partir de fatores sugeridos pelo
Postgres; a classificação também é versionada. No app, a gestante vê na caderneta só a tipagem e as
alergias. Contexto: [ADR 0006](adr/0006-prontuario-obstetrico.md) e o novo ADR 0007 (Etapa 11).

## Escopo

**Dentro**

- Migration no `prenatalapp`: tabelas `anamneses` e `riscos_gestacionais`, enums, triggers de
  imutabilidade e sete RPCs.
- Cenários 105–116 no `supabase/tests/rls_smoke.sql`.
- Web: `AnamneseService`, formulário compartilhado de anamnese, bloco da secretaria em
  `/pacientes/:id`, bloco da médica no cartão `/mesa/:pacienteId` com classificação de risco e
  rótulos novos em `/auditoria`.
- Mobile (médica): cartão "Anamnese e risco", tela de anamnese e sheet de risco.
- Mobile (gestante): tipagem e alergias no topo de "Minha caderneta".
- ADR 0007, emenda no ADR 0003 e roadmap.

**Fora**

- Mudar `urgencia_score` ou `painel_da_medica` por causa do risco: os pesos da urgência foram
  validados com as médicas e alto risco precisa de nova validação. Fica registrado no roadmap como
  pendência.
- Exames, vacinas e curvas (W13/W14).
- Rascunho local ou autosave da anamnese: no web e no mobile a gravação é explícita (botão
  Salvar) e exige rede.
- Secretaria classificando risco ou lendo evolução: continuam exclusivos da médica.
- Admin lendo anamnese ou risco.
- Policy de select nas tabelas novas: toda leitura é por RPC.
- Catálogo de alergias: alergia é texto livre.

## Decisões técnicas

| Decisão                                                 | Escolha                                                                                                               | Motivo                                                                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Onde mora a anamnese                                    | Na paciente (`paciente_id`), não na gestação                                                                          | Antecedentes valem para a próxima gestação; não se redigita a ficha a cada gestação                            |
| Onde mora o risco                                       | Na gestação (`gestacao_id`)                                                                                           | O risco é desta gestação e muda ao longo dela                                                                  |
| Versionamento                                           | Append-only: cada gravação insere versão completa com `versao` sequencial por paciente; vigente = maior `versao`      | Histórico íntegro sem assinatura (a secretaria não tem CRM); mais simples que o ciclo rascunho/assinada da W11 |
| Concorrência                                            | `p_versao_base` igual à vigente (0 se não há), senão `'Anamnese alterada por outra pessoa'`                           | Secretaria e médica editam a mesma ficha; ninguém sobrescreve sem ver                                          |
| Imutabilidade                                           | Trigger recusa qualquer update/delete em `anamneses` e `riscos_gestacionais`                                          | Mesma defesa em profundidade da W11                                                                            |
| Comorbidades, intercorrências e antecedentes familiares | Arrays de enum mais um campo `*_outras` em texto                                                                      | Permite sugerir risco e filtrar sem engessar o preenchimento                                                   |
| "Sem alergias" × "não perguntado"                       | Coluna `sem_alergias_conhecidas boolean`; `alergias` e `sem_alergias_conhecidas = true` não coexistem                 | Ficha vazia não pode ser lida como "não tem alergia"                                                           |
| Quem escreve a anamnese                                 | Médica vinculada à paciente ou secretaria (qualquer paciente da clínica)                                              | Decisão do usuário; a secretaria já tem escopo de clínica no cadastro (ADR 0003)                               |
| Quem lê a anamnese                                      | Médica vinculada e secretaria, com auditoria `anamnese.aberta` (dedupe de 10 min por ator e paciente)                 | Quem escreve precisa ler; a leitura de dado clínico pela secretaria fica rastreada                             |
| Risco                                                   | Só a médica vinculada registra e lê; motivo obrigatório (mínimo de 10 caracteres) quando `alto`; exige gestação ativa | Classificação é ato clínico                                                                                    |
| Sugestão de fatores                                     | Função `fatores_risco_sugeridos` no Postgres devolve `(codigo, descricao)`                                            | Regra num lugar só para web e mobile, como a urgência                                                          |
| Regras de sugestão                                      | Lista provisória da Etapa 1, marcada como a validar com as médicas                                                    | Mesmo tratamento da urgência na Fase 0                                                                         |
| Gestante                                                | RPC `minha_ficha_essencial()` com tipagem, Rh, alergias e `sem_alergias_conhecidas` da versão vigente                 | Decisão do usuário; útil em emergência, sem expor antecedentes nem risco                                       |
| Gravação no mobile                                      | Online, botão Salvar; sem rede mostra "Salvar exige conexão"                                                          | A anamnese não é preenchida em ritmo de consulta; rascunho local só se justificou na evolução                  |
| Componente compartilhado no web                         | `FormularioAnamnese` usado pela secretaria e pela médica                                                              | Os mesmos campos nos dois lugares                                                                              |

## Pré-requisitos

- Stack local da Supabase rodando em `/Users/joaohenrique/Documents/VoidSans/prenatalapp`.
- Depois da migration, regenerar `src/types/database.types.ts` com
  `supabase gen types typescript --local`.

## Etapas

### Fatia 1 — Banco

### 1 — Criar a migration de anamnese e risco

**Depende de:** nenhuma
**Arquivo:** `prenatalapp/supabase/migrations/20261002120000_anamnese_risco.sql` (criar)
**O que fazer:**

- **Enums:**
  - `tipo_sanguineo ('A', 'B', 'AB', 'O')`
  - `fator_rh ('positivo', 'negativo')`
  - `consumo ('nunca', 'parou', 'atual')`
  - `comorbidade ('hipertensao_cronica', 'diabetes_previo', 'hipotireoidismo', 'hipertireoidismo', 'epilepsia', 'cardiopatia', 'doenca_renal', 'doenca_autoimune', 'trombofilia', 'hiv', 'anemia_falciforme', 'asma', 'transtorno_mental')`
  - `intercorrencia_obstetrica ('pre_eclampsia', 'eclampsia', 'diabetes_gestacional', 'parto_prematuro', 'restricao_crescimento', 'hemorragia_pos_parto', 'descolamento_placenta', 'isoimunizacao_rh')`
  - `antecedente_familiar ('hipertensao', 'diabetes', 'gemelaridade', 'malformacao', 'trombofilia', 'cancer_mama_ovario')`
  - `classificacao_risco ('habitual', 'alto')`

- **Tabela `anamneses`:**
  - Identificação: `id uuid pk default gen_random_uuid()`,
    `paciente_id uuid not null references pacientes on delete restrict`, `versao integer not null`,
    `unique (paciente_id, versao)`.
  - Autoria: `autor_id uuid not null references profiles`, `papel_autor papel_usuario not null`,
    `registrada_em timestamptz not null default now()`.
  - Tipagem: `tipo_sanguineo`, `fator_rh`.
  - Alergias e medicações: `alergias text`, `sem_alergias_conhecidas boolean not null default false`,
    `medicacoes_em_uso text`.
  - Antecedentes pessoais: `comorbidades comorbidade[] not null default '{}'`,
    `comorbidades_outras text`, `cirurgias_previas text`.
  - Antecedentes obstétricos: `gestacoes_anteriores`, `partos_normais`, `cesareas`, `abortos`,
    `natimortos`, todos `smallint not null default 0` com check `>= 0`; `data_ultimo_parto date`;
    `intercorrencias_previas intercorrencia_obstetrica[] not null default '{}'`,
    `intercorrencias_outras text`.
  - Antecedentes familiares: `antecedentes_familiares antecedente_familiar[] not null default '{}'`,
    `familiares_outros text`.
  - Hábitos: `tabagismo consumo`, `alcool consumo`, `outras_drogas consumo`.
  - Checks:
    - `partos_normais + cesareas + abortos <= gestacoes_anteriores`;
    - `natimortos <= partos_normais + cesareas`;
    - `not (sem_alergias_conhecidas and alergias is not null)`;
    - `tipo_sanguineo` e `fator_rh` preenchidos juntos ou nenhum.

- **Tabela `riscos_gestacionais`:**
  - `id uuid pk default gen_random_uuid()`,
    `gestacao_id uuid not null references gestacoes on delete restrict`.
  - `classificacao classificacao_risco not null`, `motivo text`, `fatores_sugeridos text[] not null`
    (os códigos sugeridos no momento, congelados).
  - `autora_id uuid not null references profiles`,
    `registrado_em timestamptz not null default now()`.
  - Check: `classificacao = 'habitual' or char_length(btrim(motivo)) >= 10`.

- **Acesso e imutabilidade:**
  - RLS ligada sem policy e `revoke all` de `anon`/`authenticated` nas duas tabelas.
  - Trigger `bloqueia_alteracao_historico()` (before update or delete, nas duas tabelas) levanta
    `'Histórico clínico não pode ser alterado'`.
  - Índices `(paciente_id, versao desc)` e `(gestacao_id, registrado_em desc)`.

RPCs, todas `security definer`, `set search_path = public`, com mensagem única de gate e sem
`revoke execute` (mesmo motivo da W11):

- **`registrar_anamnese(p_paciente_id uuid, p_versao_base integer, ...)`**, com um parâmetro
  `p_<coluna>` para cada coluna de conteúdo, os opcionais com `default null` e os arrays com
  `default '{}'`; `returns integer`.
  - Gate: `current_papel() = 'medica' and medica_vinculada_ao_paciente(p_paciente_id)` ou
    `is_secretaria()`; mensagem `'Sem permissão para registrar a anamnese'`.
  - Concorrência: compara `p_versao_base` com `coalesce(max(versao), 0)`; diferente levanta
    `'Anamnese alterada por outra pessoa'`.
  - Valida antes do insert, com mensagens próprias:
    - contagens obstétricas incoerentes: `'Partos e abortos não podem somar mais que as gestações anteriores'`;
    - alergia junto de "sem alergias": `'Marque "sem alergias conhecidas" ou descreva as alergias, não os dois'`;
    - `data_ultimo_parto` no futuro.
  - Normaliza textos com `nullif(btrim(...), '')`.
  - Insere a versão `p_versao_base + 1` com `papel_autor = current_papel()`, audita
    `anamnese.registrada` (entidade `pacientes`, meta `{versao, por}`) e devolve a versão nova.

- **`anamnese_da_paciente(p_paciente_id uuid) returns table (...)`** (volatile)
  - Mesmo gate da escrita; devolve todas as versões, mais recente primeiro, com `autor_nome`.
  - Grava `anamnese.aberta` com dedupe de 10 minutos, igual a `prontuario.aberto`.

- **`fatores_risco_sugeridos(p_gestacao_id uuid) returns table (codigo text, descricao text)`**
  - Gate: médica vinculada à gestação.
  - Lê a anamnese vigente da paciente, a gestação e `pacientes.data_nascimento`. Regras
    provisórias (comentário na migration dizendo que serão validadas com as médicas):

    | Condição                                                                                                                                                                                 | Código                   | Descrição                              |
    | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------- |
    | Comorbidade em `hipertensao_cronica`, `diabetes_previo`, `cardiopatia`, `doenca_renal`, `doenca_autoimune`, `trombofilia`, `hiv`, `anemia_falciforme`, `epilepsia` ou `hipertireoidismo` | `comorbidade:<valor>`    | Rótulo em português                    |
    | Intercorrência prévia em `pre_eclampsia`, `eclampsia`, `parto_prematuro`, `restricao_crescimento`, `descolamento_placenta` ou `isoimunizacao_rh`                                         | `intercorrencia:<valor>` | Rótulo em português                    |
    | `natimortos > 0`                                                                                                                                                                         | `natimorto_previo`       | Natimorto em gestação anterior         |
    | `abortos >= 3`                                                                                                                                                                           | `abortamento_habitual`   | Três ou mais abortamentos              |
    | `gestacoes.tipo = 'gemelar'`                                                                                                                                                             | `gemelar`                | Gestação gemelar                       |
    | Idade na DUM/DPP < 15 ou ≥ 35                                                                                                                                                            | `idade_materna`          | Idade materna                          |
    | `fator_rh = 'negativo'`                                                                                                                                                                  | `rh_negativo`            | Rh negativo (acompanhar isoimunização) |
    | `outras_drogas = 'atual'` ou `alcool = 'atual'`                                                                                                                                          | `uso_substancias`        | Uso atual de álcool ou drogas          |

  - Sem anamnese, devolve só os fatores da gestação e da idade.

- **`registrar_risco_gestacional(p_gestacao_id uuid, p_classificacao classificacao_risco, p_motivo text default null) returns uuid`**
  - Gate: médica vinculada.
  - Exige gestação ativa (`'Gestação não está ativa'`) e, se `alto`, motivo com 10 ou mais
    caracteres (`'Informe o motivo do alto risco (mínimo de 10 caracteres)'`).
  - Grava `fatores_sugeridos` chamando a função acima e audita `risco.classificado` (entidade
    `gestacoes`, meta `{classificacao}`, sem o motivo).

- **`riscos_da_gestacao(p_gestacao_id uuid) returns table (...)`**: gate médica vinculada; todas
  as classificações, mais recente primeiro, com `autora_nome` e `fatores_sugeridos`.

- **`minha_ficha_essencial() returns table (tipo_sanguineo, fator_rh, alergias text, sem_alergias_conhecidas boolean)`**
  - Gate `current_papel() = 'paciente'`.
  - Versão vigente da paciente cujo `profile_id = auth.uid()`; zero linhas se não houver ficha.

- `grant execute` das RPCs para `authenticated`.

Validação desta etapa: a migration aplica do zero numa transação com rollback (como na W11).

### 2 — Cenários 105–116 no smoke de RLS

**Depende de:** Etapa 1
**Arquivo:** `prenatalapp/supabase/tests/rls_smoke.sql` (editar, antes do `rollback` final)

Bloco de fixtures próprio da W12, como a W11 fez: paciente com conta de gestante, gestação ativa e
vínculo de obstetra com a `medica_a`. Reusar `pg_temp.espera_erro`.

- **105** — A secretaria registra a versão 1 e a médica a versão 2; `anamnese_da_paciente` devolve
  as duas, com `papel_autor` `secretaria` e `medica`.
- **106** — Versão base defasada gera `'Anamnese alterada por outra pessoa'`.
- **107** — Update e delete em `anamneses` e `riscos_gestacionais` são recusados mesmo como
  `postgres`.
- **108** — Validações: contagem obstétrica incoerente, alergia junto de "sem alergias", tipagem
  sem Rh.
- **109** — `medica_b` sem vínculo e o admin são recusados em escrita e leitura da anamnese.
- **110** — `select` direto nas duas tabelas falha por privilégio para médica, secretaria e
  gestante.
- **111** — `fatores_risco_sugeridos` devolve `comorbidade:hipertensao_cronica`, `gemelar` e
  `rh_negativo` para uma ficha e gestação montadas para isso, e lista vazia para ficha neutra.
- **112** — `registrar_risco_gestacional`: `alto` sem motivo é recusado; com motivo grava e
  congela os fatores; a secretaria é recusada; gestação encerrada é recusada.
- **113** — `riscos_da_gestacao` devolve o histórico ordenado e recusa a secretaria.
- **114** — `minha_ficha_essencial` devolve à gestante só os quatro campos da versão vigente;
  médica e secretaria são recusadas.
- **115** — Duas aberturas seguidas de `anamnese_da_paciente` geram um único `anamnese.aberta`.
- **116** — O motivo do risco não aparece no `meta` do `audit_log`.

### Fatia 2 — Web

### 3 — Regenerar tipos e criar `AnamneseService`

**Depende de:** Etapa 1
**Arquivos:**

- `src/types/database.types.ts` (regenerar)
- `src/app/core/anamnese/anamnese.service.ts` e `anamnese.service.spec.ts` (criar)

**O que fazer:** serviço no molde de `ProntuarioService` (`Resultado<T>` local, `ErroSupabase`,
`opcional()`, mapeamento camelCase).

- **Tipos:** `Anamnese` (versão completa + `autorNome`), `DadosAnamnese`, `RiscoGestacional`,
  `FatorRisco { codigo; descricao }`, e os tipos de enum a partir de `Database['public']['Enums']`.
- **Constante:** `CONFLITO_ANAMNESE = 'Anamnese alterada por outra pessoa'`.
- **Mapas de rótulo:** `Record` exportados `ROTULO_COMORBIDADE`, `ROTULO_INTERCORRENCIA`,
  `ROTULO_ANTECEDENTE_FAMILIAR` e `ROTULO_CONSUMO`, como `Record` para travar na compilação quando
  um enum ganhar valor.
- **Métodos:**
  - `historico(pacienteId: string): Promise<Resultado<Anamnese[]>>`
  - `registrar(pacienteId: string, versaoBase: number, dados: DadosAnamnese): Promise<Resultado<number>>`
  - `fatoresSugeridos(gestacaoId: string): Promise<Resultado<FatorRisco[]>>`
  - `riscos(gestacaoId: string): Promise<Resultado<RiscoGestacional[]>>`
  - `classificarRisco(gestacaoId: string, classificacao: ClassificacaoRisco, motivo: string | null): Promise<Resultado<string>>`

### 4 — Formulário compartilhado de anamnese

**Depende de:** Etapa 3
**Arquivos:** `src/app/pages/anamnese/formulario/formulario-anamnese.ts`, `.html`, `.scss` e
`.spec.ts` (criar)
**O que fazer:** componente standalone com inputs `anamnese: Anamnese | null` (vigente) e
`salvando: boolean`, e output `salvar: DadosAnamnese`.

- **Seções:** Tipagem (dois `p-select`), Alergias (checkbox "Sem alergias conhecidas" que desabilita
  e limpa o texto), Medicações em uso, Comorbidades (`p-multiselect` + "Outras"), Cirurgias,
  Antecedentes obstétricos (cinco `p-inputnumber` inteiros com `[fluid]="true"`, data do último
  parto, intercorrências em `p-multiselect` + "Outras"), Antecedentes familiares (`p-multiselect` +
  "Outros") e Hábitos (três `p-select` com `ROTULO_CONSUMO`).
- **Validação no cliente:** soma de partos e abortos ≤ gestações anteriores, e tipagem e Rh juntos.
  As mensagens são as mesmas da RPC.
- **Preenchimento:** os valores iniciais vêm da vigente; sem ficha, tudo vazio, com contagens 0.

### 5 — Bloco da secretaria em `/pacientes/:id`

**Depende de:** Etapa 4
**Arquivos:**

- `src/app/pages/pacientes/anamnese/paciente-anamnese.ts`, `.html`, `.scss` e `.spec.ts` (criar)
- `src/app/pages/pacientes/formulario/paciente-formulario.html` e `paciente-formulario.ts` (editar)

**O que fazer:** componente no molde de `PacienteGestacao`, com input `pacienteId`, embutido em
`paciente-formulario.html` dentro de `@if (edicao())`, entre `app-paciente-gestacao` e
`app-paciente-vinculos`.

- **Resumo:** tipagem, alergias e "Última atualização por <autor> (<papel>) em <data>".
- **Edição:** botão Editar abre `FormularioAnamnese` num `p-dialog` largo e grava com a `versao`
  vigente como base.
- **Conflito:** em `CONFLITO_ANAMNESE`, mostrar "Outra pessoa atualizou a ficha. Recarregue para
  ver a versão atual" e recarregar ao confirmar.
- **Histórico:** "Ver histórico" lista as versões (data, autor, papel).

### 6 — Bloco da médica no cartão da gestante

**Depende de:** Etapa 4
**Arquivos:**

- `src/app/pages/mesa/cartao/cartao-anamnese.ts`, `.html`, `.scss` e `.spec.ts` (criar)
- `src/app/pages/mesa/cartao/cartao-gestante.html` e `cartao-gestante.ts` (editar)

**O que fazer:** componente com inputs `pacienteId`, `gestacaoId` e `gestacaoAtiva`, colocado em
`cartao-gestante.html` logo depois de `app-cartao-gestacoes` e antes do bloco Consultas, para
alergia e risco aparecerem antes de qualquer conduta.

- **Faixa de alertas no topo:** tag `danger` "Alergias: ..." quando houver; tag `warn` "Rh
  negativo"; tag `danger` "Alto risco" ou `success` "Risco habitual" conforme a vigente; tag
  `secondary` "Ficha não preenchida" sem anamnese; "Alergias não registradas" quando a ficha
  existe sem alergias e sem "sem alergias conhecidas".
- **Anamnese:** resumo dos antecedentes (comorbidades, GPA no formato `G{n+1} P{normais+cesáreas}
A{abortos}`, intercorrências) e o mesmo Editar/Histórico da Etapa 5, reusando o formulário.
- **Classificar risco:** abre um diálogo com os fatores sugeridos em lista (ou "Nenhum fator
  sugerido"), a escolha habitual/alto e o motivo, obrigatório no alto. Se a escolha for
  `habitual` com fatores sugeridos, mostra o aviso "Há fatores sugeridos de alto risco"; o aviso
  não bloqueia.
- **Histórico do risco:** data, classificação, autora e motivo.

### 7 — Rótulos da auditoria

**Depende de:** Etapa 3
**Arquivo:** `src/app/pages/auditoria/lista/auditoria-lista.ts` (editar)

- Em `ROTULO_ACAO`: `anamnese.registrada` → "Anamnese registrada", `anamnese.aberta` → "Anamnese
  aberta", `risco.classificado` → "Risco gestacional classificado". Atualizar a contagem do
  comentário (34 → 37).
- Em `entidades`: nada novo. As ações gravam nas entidades `pacientes` e `gestacoes`, que já
  existem.

### Fatia 3 — Mobile

### 8 — Modelo e repositório de anamnese

**Depende de:** Etapa 1
**Arquivos:**

- `prenatalapp/lib/features/anamnese/data/anamnese.dart` (criar): `Anamnese`, `DadosAnamnese`
  com `toRpc()`, `RiscoGestacional`, `FatorRisco`, `FichaEssencial` e os enums Dart com `dbValue`
  e `rotulo`, no molde de `lib/features/prontuario/data/evolucao.dart`.
- `prenatalapp/lib/features/anamnese/data/anamnese_repository.dart` (criar): `AnamneseRepository`
  com `demoMode`, seed demo (uma ficha para `demo-1` com tipagem O−, alergia "Dipirona" e
  `hipertensao_cronica`), o tratamento de erro de `EvolucaoRepository._chamar` (reaproveitar
  `SemConexaoException` e `EvolucaoException` de `evolucao_repository.dart`, sem duplicar), e
  `ConflitoAnamneseException`.
  - Métodos: `historico`, `registrar`, `fatoresSugeridos`, `riscos`, `classificarRisco` e
    `minhaFichaEssencial`.
  - Providers: `anamneseRepositoryProvider`, `anamneseDaPacienteProvider` (family),
    `riscosDaGestacaoProvider` (family) e `minhaFichaEssencialProvider`.

### 9 — Telas da médica no app

**Depende de:** Etapa 8
**Arquivos:**

- `prenatalapp/lib/features/anamnese/presentation/screens/anamnese_screen.dart` (criar): rota
  `/medica/paciente/:id/anamnese`. Formulário em tela cheia com os mesmos campos (seleção múltipla
  com `FilterChip`), botão Salvar explícito, conflito tratado com diálogo "Outra pessoa atualizou
  a ficha" + recarregar, e sem rede o aviso "Salvar exige conexão".
- `prenatalapp/lib/features/anamnese/presentation/widgets/classificar_risco_sheet.dart` (criar):
  bottom sheet com fatores sugeridos, `SegmentedButton` habitual/alto, motivo e Salvar.
- `prenatalapp/lib/features/medica/presentation/screens/paciente_card_screen.dart` (editar): card
  "Anamnese e risco" acima de "Prontuário", com tipagem, alergias, risco vigente e os botões
  "Editar anamnese" e "Classificar risco".
- `prenatalapp/lib/routes/app_router.dart` (editar): a rota nova no grupo `/medica`.

### 10 — Caderneta da gestante

**Depende de:** Etapa 8
**Arquivo:** `prenatalapp/lib/features/prontuario/presentation/screens/caderneta_screen.dart` (editar)

- Cartão no topo da lista com "Tipo sanguíneo" (ex.: "O negativo") e "Alergias" (texto, "Nenhuma
  conhecida" ou "Não informadas"), lendo `minhaFichaEssencialProvider`.
- Sem ficha, o cartão não aparece. Erro na ficha não esconde as medidas.

### Fatia 4 — Documentação

### 11 — ADR 0007 e emendas

**Depende de:** Etapas 2, 6 e 9
**Arquivos:**

- `docs/adr/0007-anamnese-pela-secretaria.md` (criar), no formato do ADR 0004. Registra: a
  secretaria lê e escreve a anamnese de qualquer paciente da clínica por RPC, com leitura
  auditada; não alcança risco, evolução, laudo nem checklist; versões append-only com autor e
  papel. Alternativas descartadas: anamnese só da médica (decisão do usuário) e secretaria como
  rascunho que a médica confirma (atrito sem ganho, já que toda versão é rastreável).
- `docs/adr/0003-escopo-de-leitura-da-equipe.md` (editar): emenda W12 no Status apontando para o
  ADR 0007.
- `docs/adr/0006-prontuario-obstetrico.md` (editar): em "Fases decorrentes", marcar a W12 como
  entregue com link para este plano.
- `docs/roadmap-web.md` (editar): marcar a W12 com resumo e link, e incluir a pendência "alto
  risco na regra de urgência — validar peso com as médicas".

## Testes

- `prenatalapp/supabase/tests/rls_smoke.sql`: cenários 105–116.
- `src/app/core/anamnese/anamnese.service.spec.ts`: mapeamento do histórico, parâmetros de
  `registrar` com arrays vazios e nulos omitidos, conflito repassado, `classificarRisco` com e sem
  motivo.
- `src/app/pages/anamnese/formulario/formulario-anamnese.spec.ts`: "sem alergias" desabilita e
  limpa o texto; soma obstétrica incoerente bloqueia salvar; preenchimento a partir da vigente.
- `src/app/pages/pacientes/anamnese/paciente-anamnese.spec.ts`: salvar envia a versão base
  vigente; conflito mostra a mensagem e recarrega.
- `src/app/pages/mesa/cartao/cartao-anamnese.spec.ts`: tags de alergia, Rh negativo e alto risco;
  alto risco sem motivo não chama o serviço; aviso de habitual com fatores sugeridos.
- `prenatalapp/test/w12_anamnese_test.dart`: repositório demo (registrar, conflito, risco); cartão
  da paciente mostra alergia e risco; a tela de anamnese salva e volta; a caderneta da gestante
  mostra "O negativo" e "Dipirona" e não mostra comorbidades nem risco.

## Validação final

No `prenatalapp`, com a stack local de pé e banco vazio, rodar o smoke:

```bash
supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

```bash
flutter analyze && flutter test
```

No `prenatalweb`:

```bash
npm run lint && npm run typecheck && npm test
```

Esperado: `OK 105` a `OK 116` sem nenhum `FAIL`, e as suítes do Flutter e do Vitest verdes.

Verificação de ponta a ponta no navegador:

1. Como secretaria, em `/pacientes/:id`, preencher a ficha com alergia e Rh negativo.
2. Como médica, no cartão, ver as tags, editar a ficha (versão 2) e classificar alto risco com
   motivo a partir dos fatores sugeridos.
3. Repetir o salvamento da secretaria com a versão velha e ver a mensagem de conflito.
4. Em `/auditoria`, ver `anamnese.registrada`, `anamnese.aberta` e `risco.classificado`.
