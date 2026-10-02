# Plano: exames estruturados e vacinas (W13)

## Contexto

Até a W12, exame é só um item do checklist marcado "realizado" e um laudo em PDF em `documentos`:
nenhum valor é consultável e nada avisa que um resultado veio alterado. Vacina não existe no
sistema. A W13 (fase listada no [ADR 0006](adr/0006-prontuario-obstetrico.md)) transforma
resultado de exame em dado estruturado e passa a registrar as vacinas da gestação.

Decisões do usuário nesta sessão:

- Registrar o resultado marca o item do protocolo como realizado, automaticamente.
- Médica e secretaria registram resultados de exame e vacinas.
- A gestante vê só os exames liberados pela médica; um resultado alterado exige comunicação
  presencial antes de liberar.
- Os tipos de exame são um catálogo fixo no Postgres, com componentes, e cada item do protocolo
  pode apontar para um tipo.
- No app, a médica vê os resultados, libera e registra vacinas. O formulário de resultado fica só
  no web.

## Objetivo

Médica ou secretaria registram o resultado de um exame do catálogo (valores numéricos com
unidade e referência, ou reagente/não reagente). O sistema marca o componente e o exame como
alterados conforme a referência, liga o resultado ao laudo em PDF quando houver e marca o item do
protocolo correspondente como realizado. A médica libera o resultado para a gestante; resultado
alterado só é liberado com a confirmação de comunicação presencial. As vacinas da gestação (dTpa,
influenza, hepatite B e COVID-19) são registradas com dose, data, lote e local. A caderneta da
gestante mostra os exames liberados e a situação das vacinas.

## Escopo

**Dentro**

- Migration no `prenatalapp`: catálogo de tipos e componentes de exame (seed), vínculo
  `protocolo_itens.tipo_exame`, tabelas `exames`, `exame_resultados` e `vacinas_gestacao`, e as
  RPCs.
- Cenários 117–130 no `supabase/tests/rls_smoke.sql`.
- Web: `ExamesService`; blocos **Exames** e **Vacinas** no cartão `/mesa/:pacienteId` e na ficha
  `/pacientes/:id`; vínculo de exame em `/protocolo`; rótulos novos em `/auditoria`.
- Mobile (médica): lista de exames com liberação e vacinas com registro.
- Mobile (gestante): exames liberados e vacinas na caderneta.
- ADR 0008 (terceira exceção da secretaria), emendas nos ADRs 0003 e 0006, roadmap.

**Fora**

- Pedido/solicitação de exame como entidade própria: a solicitação continua sendo o status
  `solicitado` do checklist.
- Formulário de resultado no mobile.
- Curvas e gráficos (W14), prescrição (W15).
- OCR ou leitura automática do PDF do laboratório.
- Integração com laboratório ou RNDS.
- Catálogo editável pela tela: os tipos e as referências mudam por migration.
- Mostrar "alterado" para a gestante: ela vê valor e referência, sem rótulo de alarme (mesma
  regra da Fase 4 do app: "alarme clínico é conversa com a médica").
- Rubéola, anti-HCV e outros exames fora do protocolo atual, exceto Coombs indireto.

## Decisões técnicas

| Decisão                          | Escolha                                                                                                                                                                                                                                                                                                                                                                                                      | Motivo                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Catálogo                         | Tabelas `tipos_exame` e `componentes_exame` com seed na migration; sem tela de edição                                                                                                                                                                                                                                                                                                                        | Decisão do usuário (catálogo fixo); as referências são clínicas e mudam com validação          |
| Natureza do componente           | `quantitativo` (valor numérico, `unidade`, `ref_min`, `ref_max`) ou `qualitativo` (`negativo`/`positivo`/`indeterminado`, com rótulos por componente e `positivo_alterado`)                                                                                                                                                                                                                                  | Toxoplasmose IgG positivo significa imune, não alterado; VDRL usa "reagente"                   |
| Alterado                         | Calculado no Postgres ao gravar: quantitativo fora de `[ref_min, ref_max]`; qualitativo `positivo` com `positivo_alterado`; `indeterminado` sempre alterado. `exames.alterado` = algum componente alterado                                                                                                                                                                                                   | Regra num lugar só, sem confiar no cliente                                                     |
| Referências                      | Provisórias, a validar com as médicas: Hb ≥ 11 g/dL; Ht ≥ 33%; plaquetas 150–450 mil/mm³; glicemia de jejum ≤ 91 mg/dL; TOTG 0h ≤ 91, 1h ≤ 179, 2h ≤ 152 mg/dL                                                                                                                                                                                                                                               | Valores de gestação (OMS/IADPSG); comentário na migration marca como provisório                |
| Vínculo com o protocolo          | Coluna `protocolo_itens.tipo_exame text references tipos_exame(codigo)`, alterada pela RPC `vincular_exame_protocolo(p_raiz_id, p_tipo_exame)` em **todas as versões da raiz**, sem criar versão nova                                                                                                                                                                                                        | É metadado de ligação, não mudança clínica do item; versionar quebraria o checklist já marcado |
| Vínculo do seed                  | A migration liga os itens do protocolo por nome exato (lista na Etapa 1); tipagem, cardiotocografia e itens criados depois ficam sem vínculo até a médica escolher                                                                                                                                                                                                                                           | O seed atual tem nomes conhecidos; o resto é decisão da médica em `/protocolo`                 |
| Marcação automática do checklist | Ao gravar um resultado com coleta, procurar o item ativo da gestação com o mesmo `tipo_exame` cuja janela contém a IG da coleta; senão, o primeiro item desse tipo ainda não `realizado` (por `semana_ini`). Faz upsert em `gestacao_checklist` com `realizado` e `data = coletado_em`, grava `exames.protocolo_item_id` e `exames.marcou_checklist = true`, e audita `checklist.marcado` com `por: 'exame'` | Hemograma e VDRL repetem por trimestre; a janela escolhe a ocorrência certa                    |
| Excluir resultado                | Só antes de liberar; se `marcou_checklist`, volta o item para `pendente`                                                                                                                                                                                                                                                                                                                                     | Não deixa checklist "realizado" órfão                                                          |
| Edição                           | `registrar_resultado_exame` faz upsert por `p_id` (UUID do cliente) enquanto `liberado_em is null`; depois de liberado, um trigger recusa update/delete em `exames` e `exame_resultados`                                                                                                                                                                                                                     | Mesma regra do documento publicado: o que a gestante viu não muda                              |
| Componentes na RPC               | Parâmetro `p_resultados jsonb` (`[{componente, valor_numerico, valor_qualitativo}]`), validado contra o catálogo                                                                                                                                                                                                                                                                                             | O número de campos varia por tipo; parâmetros explícitos seriam inviáveis                      |
| Quem registra resultado          | Médica vinculada ou secretaria (qualquer gestação ativa da clínica); quem libera é só a médica vinculada                                                                                                                                                                                                                                                                                                     | Decisão do usuário; liberar é ato clínico                                                      |
| Leitura                          | `exames_da_gestacao` para médica vinculada e secretaria, com `exames.abertos` na auditoria (dedupe de 10 min por ator e gestação)                                                                                                                                                                                                                                                                            | Mesmo tratamento da anamnese (ADR 0007)                                                        |
| Liberação                        | `liberar_exame(p_id, p_confirmar_comunicado)`: exige médica vinculada; alterado sem confirmação recusa com `'Resultado alterado: confirme a comunicação presencial antes de liberar'`                                                                                                                                                                                                                        | Espelha `publicar_documento`                                                                   |
| Vacinas                          | Tabela `vacinas_gestacao` editável por RPC (upsert por `p_id` e exclusão) com auditoria; enums `vacina ('dtpa', 'influenza', 'hepatite_b', 'covid_19')` e `situacao_vacina ('aplicada', 'recusada', 'contraindicada', 'dispensada')`                                                                                                                                                                         | Registro administrativo trazido da UBS; corrigir digitação é comum                             |
| Calendário de vacinas            | Doses esperadas por gestação: dTpa 1, influenza 1, hepatite B 3, COVID-19 1. A situação de cada vacina vem calculada pela RPC: `em_dia`, `pendente`, `recusada`, `contraindicada` ou `dispensada`                                                                                                                                                                                                            | Regra num lugar só; o cliente só mostra                                                        |
| Gestante                         | `meus_exames()` (liberados da gestação ativa, com valores e referência, sem `alterado`) e `minhas_vacinas()`                                                                                                                                                                                                                                                                                                 | Decisões do usuário e regra da Fase 4                                                          |
| Mobile da médica                 | Ver, liberar e registrar vacina; sem formulário de resultado                                                                                                                                                                                                                                                                                                                                                 | Decisão do usuário                                                                             |

## Pré-requisitos

- Stack local da Supabase em `/Users/joaohenrique/Documents/VoidSans/prenatalapp`.
- Depois da migration, regenerar `prenatalweb/src/types/database.types.ts`
  (`supabase gen types typescript --local`).
- Smoke de RLS rodado sobre cópia que esvazia as tabelas dentro da transação (sem `db reset`,
  para não apagar dados locais), como na W11 e na W12.

## Etapas

### Fatia 1 — Banco

### 1 — Migration de catálogo, exames e vacinas

**Depende de:** nenhuma
**Arquivo:** `prenatalapp/supabase/migrations/20261003120000_exames_vacinas.sql` (criar)
**O que fazer:**

- **Enums:**
  - `natureza_componente ('quantitativo', 'qualitativo')`
  - `resultado_qualitativo ('negativo', 'positivo', 'indeterminado')`
  - `vacina ('dtpa', 'influenza', 'hepatite_b', 'covid_19')`
  - `situacao_vacina ('aplicada', 'recusada', 'contraindicada', 'dispensada')`
- **Catálogo:**
  - `tipos_exame (codigo text pk, nome text not null, ordem smallint not null)`.
  - `componentes_exame (tipo_exame text references tipos_exame, codigo text, nome text, natureza natureza_componente, unidade text, ref_min numeric, ref_max numeric, rotulo_negativo text, rotulo_positivo text, positivo_alterado boolean not null default true, ordem smallint, primary key (tipo_exame, codigo))`.
  - Seed (comentário: referências provisórias a validar com as médicas):

    | Tipo              | Componentes                                                                                                   |
    | ----------------- | ------------------------------------------------------------------------------------------------------------- |
    | `hemograma`       | `hb` g/dL min 11; `ht` % min 33; `plaquetas` mil/mm³ 150–450                                                  |
    | `glicemia_jejum`  | `glicemia` mg/dL max 91                                                                                       |
    | `totg`            | `jejum` max 91; `uma_hora` max 179; `duas_horas` max 152 (mg/dL)                                              |
    | `vdrl`            | `vdrl` qualitativo Não reagente/Reagente                                                                      |
    | `hiv`             | `hiv` qualitativo Não reagente/Reagente                                                                       |
    | `hbsag`           | `hbsag` qualitativo Não reagente/Reagente                                                                     |
    | `toxoplasmose`    | `igg` qualitativo Não reagente/Reagente, `positivo_alterado = false`; `igm` qualitativo Não reagente/Reagente |
    | `urina`           | `urina_tipo1` qualitativo Normal/Alterada; `urocultura` qualitativo Negativa/Positiva                         |
    | `estreptococo_b`  | `cultura` qualitativo Negativa/Positiva                                                                       |
    | `coombs_indireto` | `coombs` qualitativo Negativo/Positivo                                                                        |
    | `ultrassom`       | `ig_semanas` semanas, sem referência; `peso_fetal` g, sem referência                                          |

- **Vínculo no protocolo:** `alter table protocolo_itens add column tipo_exame text references tipos_exame(codigo)`. Ligar o seed por nome exato:
  - Hemograma completo, Hemograma de acompanhamento, Hemograma 3º trimestre → `hemograma`
  - Glicemia de jejum → `glicemia_jejum`
  - Teste de tolerância à glicose (TOTG) → `totg`
  - VDRL / sífilis, VDRL / sífilis (repetir), VDRL / sífilis (3º trimestre) → `vdrl`
  - HIV, HIV (repetir), HIV (3º trimestre) → `hiv`
  - Hepatite B (HBsAg) → `hbsag`
  - Toxoplasmose IgM/IgG → `toxoplasmose`
  - Urina tipo I + urocultura, Urina tipo I → `urina`
  - Estreptococo do grupo B (cultura vaginal/retal) → `estreptococo_b`
  - os quatro "Ultrassom ..." → `ultrassom`
- **Tabela `exames`:**
  - Identificação e vínculos: `id uuid pk`, `gestacao_id` (restrict), `tipo_exame` (references),
    `protocolo_item_id uuid null references protocolo_itens`,
    `marcou_checklist boolean not null default false`, `documento_id uuid null references documentos`.
  - Conteúdo: `coletado_em date not null`, `observacao text`, `alterado boolean not null`.
  - Autoria: `registrado_por uuid not null`, `papel_autor papel_usuario not null`,
    `registrado_em timestamptz default now()`.
  - Liberação: `liberado_em timestamptz`, `liberado_por uuid`,
    `comunicado_presencialmente boolean not null default false`.
- **Tabela `exame_resultados`:** `(exame_id uuid references exames on delete cascade, componente text, valor_numerico numeric, valor_qualitativo resultado_qualitativo, alterado boolean not null, primary key (exame_id, componente))`, com check "exatamente um dos dois valores".
- **Tabela `vacinas_gestacao`:**
  - `id uuid pk`, `gestacao_id`, `vacina`, `dose smallint not null check (dose between 1 and 3)`,
    `situacao situacao_vacina not null`.
  - Detalhes: `aplicada_em date` (obrigatória quando `aplicada`), `lote text`, `local text`,
    `observacao text`.
  - Autoria: `registrado_por`, `papel_autor`, `registrado_em`.
  - `unique (gestacao_id, vacina, dose)`.
- **Acesso:** RLS sem policy e `revoke all` de `anon`/`authenticated` nas cinco tabelas novas. O
  catálogo também: é lido pela RPC.
- **Imutabilidade:** trigger `exame_liberado_imutavel` em `exames` e `exame_resultados`, recusando
  update/delete quando o exame tem `liberado_em`, com a mensagem `'Exame liberado não pode ser
alterado'`.
- **Gates:**
  - Função `pode_registrar_exame(p_gestacao_id) returns boolean`: `is_secretaria()` ou médica
    vinculada à gestação.
  - Vacinas usam o mesmo gate.

RPCs (todas `security definer`, sem `revoke execute`, gate interno com mensagem única):

- **`catalogo_exames() returns table (tipo_exame, tipo_nome, componente, componente_nome, natureza, unidade, ref_min, ref_max, rotulo_negativo, rotulo_positivo, ordem_tipo, ordem_componente)`**
  - Para `medica`, `secretaria` e `admin`; o admin lê para a tela de protocolo não quebrar, sem
    alcançar exame nenhum.
- **`registrar_resultado_exame(p_id uuid, p_gestacao_id uuid, p_tipo_exame text, p_coletado_em date, p_resultados jsonb, p_observacao text default null, p_documento_id uuid default null) returns boolean`**
  - Devolve `alterado`.
  - Gate `pode_registrar_exame`; gestação ativa; `p_coletado_em` não futura e não anterior à DUM
    menos 30 dias.
  - Valida `p_resultados`: todo componente obrigatório do tipo presente, sem componente estranho,
    natureza coerente com o valor. Mensagens: `'Informe <componente_nome>'` e
    `'Componente inválido para este exame'`.
  - Documento, se dado, precisa ser da mesma gestação.
  - Insert ou update se não liberado (`'Exame liberado não pode ser alterado'`); recalcula os
    `alterado`.
  - Marca o checklist conforme a decisão técnica, na primeira gravação ou quando a coleta muda.
  - Audita `exame.registrado` (meta `{tipo_exame, por, alterado}`).
- **`excluir_resultado_exame(p_id uuid)`**
  - Gate `pode_registrar_exame`; só não liberado.
  - Se `marcou_checklist`, volta o item para `pendente` e limpa `data`.
  - Audita `exame.excluido`.
- **`liberar_exame(p_id uuid, p_confirmar_comunicado boolean default false)`**
  - Só a médica vinculada; idempotente se já liberado.
  - Grava `comunicado_presencialmente` quando confirmado e audita `exame.liberado`.
- **`exames_da_gestacao(p_gestacao_id uuid) returns table (...)`**
  - Gate de leitura igual ao de registro; uma linha por exame, com os resultados agregados em
    `resultados jsonb` (componente, nome, natureza, valor, rótulos, unidade, referência e
    `alterado`).
  - Grava `exames.abertos` com dedupe de 10 minutos.
- **`vincular_exame_protocolo(p_raiz_id uuid, p_tipo_exame text)`**: só médica; atualiza todas as
  versões da raiz; aceita `null` para desvincular; audita `protocolo.exame_vinculado`.
- **`protocolo_da_clinica` e `checklist_da_gestacao`**: `drop` + `create` com a coluna
  `tipo_exame` a mais no fim do retorno (aditiva; web e Flutter leem por chave).
- **`registrar_vacina(p_id uuid, p_gestacao_id uuid, p_vacina vacina, p_dose smallint, p_situacao situacao_vacina, p_aplicada_em date default null, p_lote text default null, p_local text default null, p_observacao text default null)`**
  - Gate `pode_registrar_exame`; upsert por id.
  - Valida `aplicada_em` obrigatória e não futura quando `aplicada`, e a dose dentro do esperado
    da vacina (dTpa, influenza e COVID-19: 1; hepatite B: 1 a 3).
  - Audita `vacina.registrada`.
- **`excluir_vacina(p_id uuid)`**: mesmo gate; audita `vacina.excluida`.
- **`vacinas_da_gestacao(p_gestacao_id uuid) returns table (vacina, doses_esperadas smallint, situacao_calendario text, registros jsonb)`**
  - Mesmo gate. Uma linha por vacina, com `situacao_calendario` calculada:
    - `contraindicada` ou `dispensada`, se houver registro com essa situação;
    - senão `em_dia`, se as doses aplicadas forem iguais às esperadas;
    - senão `recusada`, se houver recusa;
    - senão `pendente`.
- **`meus_exames()`**: só `paciente`; exames liberados da própria gestação ativa, com resultados,
  rótulos, unidade e referência, sem `alterado`.
- **`minhas_vacinas()`**: só `paciente`; mesmo formato de `vacinas_da_gestacao`.
- `grant execute` para `authenticated`.

Validação desta etapa: a migration aplica do zero numa transação com rollback.

### 2 — Cenários 117–130 no smoke de RLS

**Depende de:** Etapa 1
**Arquivo:** `prenatalapp/supabase/tests/rls_smoke.sql` (editar, antes do `rollback` final)

Fixtures próprias da W13: paciente com conta, gestação ativa com DUM de 100 dias atrás e vínculo
com a `medica_a`; reusar `pg_temp.espera_erro`.

- **117** — A secretaria registra hemograma com Hb 10,2: o exame e o componente `hb` ficam
  alterados; o item "Hemograma completo" vira `realizado` com a data da coleta.
- **118** — TOTG com 1h = 185 é alterado; com todos dentro da faixa, não.
- **119** — Toxoplasmose IgG positivo e IgM negativo não é alterado; IgM positivo é.
- **120** — Componente faltando ou estranho é recusado com mensagem própria.
- **121** — Atualizar antes de liberar recalcula `alterado`; depois de liberado, update e delete
  são recusados, inclusive como `postgres`.
- **122** — `liberar_exame` de alterado sem confirmação é recusado; com confirmação libera; a
  secretaria é recusada.
- **123** — Excluir resultado que marcou o checklist devolve o item a `pendente`; excluir
  liberado é recusado.
- **124** — Médica sem vínculo e admin são recusados em registrar, ler e liberar.
- **125** — `select` direto nas tabelas novas falha para médica, secretaria e gestante.
- **126** — `meus_exames` devolve à gestante só os liberados da própria gestação, sem a coluna
  `alterado`; médica e secretaria são recusadas.
- **127** — `vincular_exame_protocolo` atualiza todas as versões da raiz; a secretaria é recusada.
- **128** — Vacinas:
  - dTpa aplicada vira `em_dia`;
  - hepatite B com 1 de 3 doses fica `pendente`;
  - influenza recusada fica `recusada`;
  - `aplicada` sem data é recusada;
  - dose 2 de dTpa é recusada.
- **129** — `minhas_vacinas` devolve à gestante a situação da própria gestação; o admin é recusado.
- **130** — `exames.abertos` gravado uma vez em duas leituras seguidas; meta de
  `exame.registrado` sem valores de resultado.

### Fatia 2 — Web

### 3 — Tipos e `ExamesService`

**Depende de:** Etapa 1
**Arquivos:**

- `src/types/database.types.ts` (regenerar)
- `src/app/core/exames/exames.service.ts` e `.spec.ts` (criar)

**O que fazer:** no molde de `AnamneseService` (`src/app/core/anamnese/anamnese.service.ts`).

- **Tipos:** `ComponenteCatalogo`, `TipoExameCatalogo` (com `componentes`), `ResultadoComponente`,
  `Exame` (com `resultados`, `alterado`, `liberadoEm`, `documentoId`), `VacinaGestacao` e
  `RegistroVacina`.
- **Mapas de rótulo:** `ROTULO_VACINA` e `ROTULO_SITUACAO_VACINA` como `Record`, e
  `ROTULO_CALENDARIO`.
- **Métodos:**
  - `catalogo()`
  - `exames(gestacaoId)`
  - `registrarResultado(id, gestacaoId, tipoExame, coletadoEm, resultados, observacao, documentoId)`
  - `excluirResultado(id)`
  - `liberar(id, confirmarComunicado)`
  - `vacinas(gestacaoId)`
  - `registrarVacina(id, gestacaoId, dados)`
  - `excluirVacina(id)`
  - `vincularProtocolo(raizId, tipoExame)`
- **Formatação:** `formatarValor(resultado, componente)` produz `"10,2 g/dL"` ou o rótulo
  qualitativo.

### 4 — Painéis compartilhados de exames e vacinas

**Depende de:** Etapa 3
**Arquivos:**

- `src/app/pages/exames/painel/painel-exames.ts`, `.html`, `.scss` e `.spec.ts` (criar)
- `src/app/pages/exames/vacinas/painel-vacinas.ts`, `.html`, `.scss` e `.spec.ts` (criar)

**O que fazer:**

- **`PainelExames`**
  - Inputs: `gestacaoId`, `gestacaoAtiva` e `podeLiberar: boolean` (médica true, secretaria
    false), mais `documentos: { id; titulo }[]` opcional.
  - Lista os exames por data de coleta: tipo, componentes com valor formatado e referência, tag
    `danger` "Alterado", tag "Liberado" ou "Não liberado".
  - **Registrar resultado:** diálogo com `p-select` do tipo vindo de `catalogo()`, data da coleta,
    campos gerados pelos componentes do tipo (`p-inputnumber` `[fluid]` para quantitativo,
    `p-selectbutton` com os rótulos para qualitativo), observação e laudo opcional (select dos
    documentos da gestação). O id vem de `crypto.randomUUID()`.
  - **Editar:** mesmo diálogo, enquanto o exame não estiver liberado.
  - **Liberar:** só quando `podeLiberar`; se alterado, abre confirmação com checkbox "Comuniquei
    presencialmente", mesmo texto e padrão de `cartao-documentos.html`.
  - **Excluir:** só não liberado, com confirmação.
- **`PainelVacinas`**
  - Inputs: `gestacaoId` e `gestacaoAtiva`.
  - Uma linha por vacina, com tag da situação do calendário e as doses registradas (data, lote,
    local).
  - Diálogo de registro: vacina, dose (limitada às esperadas), situação, data obrigatória quando
    aplicada, lote, local e observação. Editar e excluir por dose.

### 5 — Encaixe no cartão, na ficha e no protocolo

**Depende de:** Etapa 4
**Arquivos:**

- `src/app/pages/mesa/cartao/cartao-gestante.html` e `.ts` (editar): `app-painel-exames` (com
  `podeLiberar = true` e os documentos que o cartão já carrega via `CartaoService.documentos`) e
  `app-painel-vacinas`, em `<section class="bloco">` com `<h2>`, depois do Checklist e antes de
  Documentos. Ao registrar resultado, recarregar o checklist (output `alterado` →
  `carregar()`).
- `src/app/pages/pacientes/formulario/paciente-formulario.html` e `.ts` (editar): novo componente
  `src/app/pages/pacientes/exames/paciente-exames.ts` (+ html, scss, spec) que obtém a gestação ativa
  por `PacientesService.gestacaoAtiva` (já usado em `PacienteGestacao`) e mostra os dois painéis
  com `podeLiberar = false`; sem gestação ativa, mostra "Cadastre a gestação para registrar exames
  e vacinas". Fica abaixo de `app-paciente-anamnese`.
- `src/app/core/protocolo/protocolo.service.ts` e `.spec.ts`, e
  `src/app/pages/protocolo/lista/protocolo-lista.*` (editar): coluna "Exame" com `p-select` (lista
  de `catalogo()` + "Sem vínculo") chamando `vincularProtocolo(raizId, tipo)`.
- `src/app/pages/auditoria/lista/auditoria-lista.ts` (editar): rótulos novos e contagem do
  comentário (37 → 44).
  - `exame.registrado` → "Resultado de exame registrado"
  - `exame.excluido` → "Resultado de exame excluído"
  - `exame.liberado` → "Exame liberado"
  - `exames.abertos` → "Exames consultados"
  - `vacina.registrada` → "Vacina registrada"
  - `vacina.excluida` → "Registro de vacina excluído"
  - `protocolo.exame_vinculado` → "Exame vinculado ao protocolo"

  Em `entidades`, acrescentar "Exames" (`exames`) e "Vacinas" (`vacinas_gestacao`).

### Fatia 3 — Mobile

### 6 — Modelo e repositório de exames e vacinas

**Depende de:** Etapa 1
**Arquivos:**

- `prenatalapp/lib/features/exames/data/exame.dart` (criar): `Exame`, `ResultadoComponente`,
  `VacinaGestacao`, `RegistroVacina`, `ExameGestante`, enums `Vacina` e `SituacaoVacina` com
  `dbValue`/`rotulo`, e `rotuloValor`.
- `prenatalapp/lib/features/exames/data/exames_repository.dart` (criar): no molde de
  `lib/features/anamnese/data/anamnese_repository.dart` (demo em memória com `resetDemo`,
  `_chamar` traduzindo `PostgrestException`).
  - Seed demo: um hemograma alterado não liberado e uma glicemia normal liberada para `demo-g1`;
    dTpa aplicada.
  - Métodos: `exames`, `liberar`, `vacinas`, `registrarVacina`, `excluirVacina`, `meusExames` e
    `minhasVacinas`.
  - Providers família por gestação, mais `meusExamesProvider` e `minhasVacinasProvider`.

### 7 — Telas da médica

**Depende de:** Etapa 6
**Arquivos:**

- `prenatalapp/lib/features/exames/presentation/screens/exames_screen.dart` (criar): rota
  `/medica/gestacao/:gestacaoId/exames`. Lista dos exames com valores, "Alterado" em
  `AconchegoColors.link`, e botão Liberar. Alterado abre um diálogo com a confirmação de comunicação
  presencial, no molde de `lib/features/documentos/presentation/widgets/publicar_documento_dialog.dart`.
- `prenatalapp/lib/features/exames/presentation/widgets/registrar_vacina_sheet.dart` (criar):
  bottom sheet com vacina, dose, situação, data, lote e local.
- `prenatalapp/lib/features/medica/presentation/screens/paciente_card_screen.dart` (editar): card
  "Exames e vacinas" depois do checklist, com a contagem de "não liberados" e "alterados", a
  situação de cada vacina e os botões "Ver exames" e "Registrar vacina".
- `prenatalapp/lib/routes/app_router.dart` (editar): rota nova no grupo `/medica`.

### 8 — Caderneta da gestante

**Depende de:** Etapa 6
**Arquivo:** `prenatalapp/lib/features/prontuario/presentation/screens/caderneta_screen.dart` (editar)

- A tela vira um `ListView` com seções:
  - ficha essencial (já existe);
  - "Vacinas": uma linha por vacina com a situação ("Em dia", "Pendente" etc.);
  - "Exames": exames liberados, com valor e referência, sem "alterado";
  - "Medidas" (já existe).
- Seção vazia mostra o texto próprio dela, sem esconder as outras.

### Fatia 4 — Documentação

### 9 — ADR 0008 e emendas

**Depende de:** Etapas 2, 5 e 7
**Arquivos:**

- `docs/adr/0008-exames-e-vacinas-pela-secretaria.md` (criar), no formato do ADR 0007. Registra:
  a secretaria registra e lê resultados e vacinas, com leitura auditada; liberar é só da médica;
  catálogo fixo; marcação automática do checklist.
- `docs/adr/0003-escopo-de-leitura-da-equipe.md`: emenda W13 no Status.
- `docs/adr/0006-prontuario-obstetrico.md`: W13 marcada como entregue.
- `docs/roadmap-web.md`: W13 marcada, com a pendência "referências de exame provisórias —
  validar com as médicas".

## Testes

- `prenatalapp/supabase/tests/rls_smoke.sql`: cenários 117–130.
- `src/app/core/exames/exames.service.spec.ts`: mapeamento do catálogo e dos exames,
  `p_resultados` montado com valores numéricos e qualitativos, erro P0001 repassado,
  `formatarValor`.
- `src/app/pages/exames/painel/painel-exames.spec.ts`:
  - campos gerados pelo tipo escolhido;
  - Liberar ausente quando `podeLiberar` é falso;
  - alterado exige a confirmação antes de chamar `liberar`;
  - excluir só não liberado.
- `src/app/pages/exames/vacinas/painel-vacinas.spec.ts`: situação por vacina, data obrigatória
  quando aplicada, dose limitada às esperadas.
- `src/app/pages/protocolo/lista/protocolo-lista.spec.ts`: o select de exame chama
  `vincularProtocolo` com a raiz.
- `prenatalapp/test/w13_exames_test.dart`:
  - repositório demo (liberar alterado sem confirmação recusa);
  - card da paciente mostra "1 alterado";
  - a tela de exames libera com confirmação;
  - registrar vacina atualiza a situação;
  - a caderneta da gestante mostra só o exame liberado e não mostra "Alterado".

## Validação final

No `prenatalapp`, smoke sobre a cópia que esvazia as tabelas na transação (como na W11 e na W12),
`flutter analyze` e `flutter test`:

```bash
flutter analyze && flutter test
```

No `prenatalweb`:

```bash
npm run lint && npm run typecheck && npm test
```

Esperado: `OK 117` a `OK 130` sem `FAIL`; suítes do Flutter e do Vitest verdes.

Ponta a ponta no navegador:

1. Como secretaria, em `/pacientes/:id`, registrar um hemograma com Hb 10,2 e ver "Alterado" e
   "Não liberado"; registrar dTpa aplicada.
2. Como médica, no cartão, ver o checklist com "Hemograma completo" realizado e liberar o exame
   (pede a confirmação de comunicação).
3. Em `/protocolo`, ver a coluna Exame e trocar um vínculo.
4. Em `/auditoria`, ver `exame.registrado`, `exame.liberado`, `vacina.registrada` e
   `exames.abertos`.
