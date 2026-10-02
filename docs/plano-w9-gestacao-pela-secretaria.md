# Plano: cadastro da gestação pela secretaria (W9)

## Contexto

Hoje a consulta é filha da gestação: `consultas.gestacao_id` é `not null`, e
`agendar_consulta` resolve a gestação ativa da paciente e levanta
`'Paciente não tem gestação ativa'` quando não há. Só a médica vinculada cria
gestação — as RPCs `criar_gestacao` / `atualizar_gestacao` têm gate
`current_papel() = 'medica' and medica_vinculada_ao_paciente(...)`, a tabela
`gestacoes` não tem policy de select para a secretaria e o único formulário é o
`CartaoGestacoes`, dentro de `/mesa/:pacienteId` (`papelGuard('medica')`).

O efeito prático é um beco sem saída na secretaria: ela cadastra a paciente em
`/pacientes/nova`, encontra a paciente na lista de agendáveis
(`pacientes_da_secretaria` não filtra por gestação) e o agendamento falha —
sem que ela tenha qualquer meio de resolver, nem de enxergar a causa antes de
submeter.

Ao final, a secretaria informa a DUM da paciente (na ficha da paciente ou no
próprio momento do agendamento) e a consulta é agendada na mesma tela. O
desfecho e a DPP por ultrassom continuam clínicos e exclusivos da médica.

## Escopo

**Dentro**

- RPCs novas para a secretaria criar gestação a partir da DUM e corrigir a DUM
  de uma gestação ativa que ela mesma criou (origem `dum`).
- RPC de leitura da gestação ativa numa projeção sem desfecho, para secretaria
  e médica vinculada.
- Bloco de gestação na ficha da paciente (`/pacientes/:id`).
- Campo de DUM inline no diálogo de nova consulta da `/agenda` quando a
  paciente escolhida não tem gestação ativa.
- Smoke de RLS, testes Angular, ADR e roadmap.

**Fora**

- Secretaria **não** encerra gestação nem informa desfecho (segue exclusivo da
  médica, via `encerrar_gestacao`).
- Secretaria **não** escolhe DPP por ultrassom nem tipo gemelar; gestação criada
  por ela nasce `dpp_origem = 'dum'` e `tipo = 'unica'`. Se a médica trocar a
  origem para `usg`, a correção pela secretaria é recusada.
- **Nenhuma** policy de select em `gestacoes` para a secretaria e **nenhum**
  grant de escrita direto na tabela — a fronteira do ADR 0003 continua valendo
  para a tabela; a secretaria alcança só a projeção da RPC.
- Sem rota nova, sem tela nova, sem tocar `/mesa/*`, `CartaoService` ou
  `CartaoGestacoes`.
- Sem alterar as assinaturas de `pacientes_da_secretaria`, `painel_da_medica`,
  `agendar_consulta`, `criar_gestacao`, `atualizar_gestacao`.
- Sem cadastro de gestação pela médica na agenda: no diálogo ela recebe aviso
  com link para o cartão.
- Sem calcular DPP ou IG em TypeScript (regra do roadmap; `dpp_final` vem do
  trigger `gestacoes_dpp_final`).
- App Flutter (`prenatalapp/lib`) não muda: a entrega é aditiva.

## Decisões técnicas

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Onde a secretaria escreve | RPCs novas `criar_gestacao_pela_secretaria` / `atualizar_dum_pela_secretaria` | Segue o padrão `*_pela_secretaria` já existente (`criar_paciente_pela_secretaria`), sem alargar o gate das RPCs clínicas que o Flutter usa |
| Validação de datas | Extraída para `validar_dados_gestacao` e reusada pelas quatro RPCs | Evita quinta cópia das mesmas quatro mensagens; as mensagens ficam idênticas e os cenários 72–77 seguem verdes |
| Leitura da gestação pela secretaria | RPC `gestacao_ativa_da_paciente`, sem policy nova | Policy exporia `desfecho` e `desfecho_observacao`, que são clínicos; a RPC devolve só a projeção necessária |
| Campos da secretaria | Só DUM; origem `dum` e tipo `unica` fixados no servidor | Decisão do usuário: DPP por ultrassom exige laudo em mãos |
| Correção pela secretaria | Só enquanto `dpp_origem = 'dum'` e status `ativa` | Se a médica definiu a DPP por ultrassom, a DUM da secretaria sobrescreveria a decisão clínica |
| Vínculo | `criar_gestacao_pela_secretaria` exige vínculo ativo com alguma médica | Mesma exigência de `agendar_consulta`; gestação de paciente sem vínculo é invisível para toda a equipe |
| Auditoria | Reusa as ações `gestacao.criada` / `gestacao.atualizada`, com `por: 'secretaria'` no meta | A tela `/auditoria` e os relatórios já conhecem essas ações; nenhum rótulo novo a mapear |
| Camada TS da secretaria | Métodos em `PacientesService` | `CartaoService` é a superfície da médica em `/mesa`; `PacientesService` já é injetado pelos dois consumidores (ficha e agenda) |
| Onde fica o bloco na ficha | Componente próprio `PacienteGestacao`, embutido em `paciente-formulario.html` sob `@if (edicao())` | Espelha `PacienteVinculos`, que resolve exatamente o mesmo problema de "bloco que só existe em paciente já salva" |

## Pré-requisitos

- Stack local da Supabase rodando no repo irmão
  `/Users/joaohenrique/Documents/VoidSans/prenatalapp` (`supabase start`).
- Após a migration, regenerar `src/types/database.types.ts` do `prenatalweb`
  com `supabase gen types typescript --local` apontando para essa stack.

## Etapas

### 1 — Criar a migration com as RPCs da secretaria

**Depende de:** nenhuma
**Arquivos:** `/Users/joaohenrique/Documents/VoidSans/prenatalapp/supabase/migrations/20260901120000_gestacao_pela_secretaria.sql` (criar)

**O que fazer:**

1. `public.validar_dados_gestacao(p_dpp_origem public.dpp_origem, p_dum date, p_dpp_usg date) returns void`, `language plpgsql`, `stable`, `set search_path = public`. Move para dentro dela, **sem alterar uma vírgula do texto**, as quatro validações hoje duplicadas em `criar_gestacao` e `atualizar_gestacao` (`20260831120000_gestacao_web.sql`): `'Informe a data da última menstruação'`, `'Informe a DPP calculada pelo ultrassom'`, `'DUM fora do intervalo de uma gestação em curso'` (`[current_date - 300, current_date]`), `'DPP do ultrassom fora do intervalo plausível'` (`[current_date - 60, current_date + 300]`).

2. `create or replace` de `public.criar_gestacao` e `public.atualizar_gestacao` idênticas às atuais, trocando os quatro blocos de `if` por `perform public.validar_dados_gestacao(p_dpp_origem, p_dum, p_dpp_usg);`. Gate, checagem de gestação ativa, insert/update e auditoria ficam como estão.

3. `public.criar_gestacao_pela_secretaria(p_paciente_id uuid, p_dum date) returns uuid`, `security definer`, `set search_path = public`, nesta ordem:
   - `if not public.is_secretaria() then raise exception 'Apenas a secretaria cadastra a gestação por aqui';`
   - paciente existe → senão `'Paciente não encontrada'`;
   - existe `vinculos` com `paciente_id = p_paciente_id and ativo` → senão `'Paciente sem médica vinculada'`;
   - não existe gestação `ativa` da paciente → senão `'Paciente já tem gestação ativa'` (mesma mensagem de `criar_gestacao`);
   - `perform public.validar_dados_gestacao('dum', p_dum, null);`
   - insert em `gestacoes` com `dpp_origem = 'dum'`, `dum = p_dum`, `dpp_usg = null`, `tipo = 'unica'` (`dpp_final` e `status` ficam para o trigger e o default);
   - `audit_log` com `acao = 'gestacao.criada'`, `entidade = 'gestacoes'`, meta `jsonb_build_object('dpp_origem', 'dum', 'tipo', 'unica', 'por', 'secretaria')`;
   - retorna o id.

4. `public.atualizar_dum_pela_secretaria(p_gestacao_id uuid, p_dum date) returns void`, `security definer`:
   - gate `is_secretaria()` → `'Apenas a secretaria corrige a DUM por aqui'`;
   - carrega `status`, `dpp_origem`, `dum` da gestação; se não achou → `'Gestação não encontrada'`;
   - `status <> 'ativa'` → `'Só gestação ativa pode ser editada'` (mensagem de `atualizar_gestacao`);
   - `dpp_origem <> 'dum'` → `'Gestação com DPP definida por ultrassom: só a médica corrige'`;
   - `perform public.validar_dados_gestacao('dum', p_dum, null);`
   - `update public.gestacoes set dum = p_dum where id = p_gestacao_id` (o trigger recalcula `dpp_final`);
   - `audit_log` com `acao = 'gestacao.atualizada'` e meta no mesmo formato `de`/`para` de `atualizar_gestacao`, com `dpp_origem`/`dum`/`dpp_usg`/`tipo` nos dois lados, mais `'por', 'secretaria'` na raiz do meta.

5. `public.gestacao_ativa_da_paciente(p_paciente_id uuid)`, `returns table (gestacao_id uuid, dpp_origem public.dpp_origem, dum date, dpp_usg date, dpp_final date, tipo public.tipo_gestacao)`, `stable security definer`:
   - gate `if not (public.is_secretaria() or public.medica_vinculada_ao_paciente(p_paciente_id)) then raise exception 'Sem acesso à gestação desta paciente';`
   - retorna a linha de `gestacoes` com `paciente_id = p_paciente_id and status = 'ativa'` (zero ou uma linha; o índice único garante).
   - `desfecho` e `desfecho_observacao` **não** entram na projeção.

Sem `revoke execute` (segfault PG17/ARM64 documentado em `init_schema.sql`), sem policy nova, sem grant novo — o comentário de cabeçalho da migration deve dizer isso, no tom das anteriores.

### 2 — Cobrir as RPCs novas no smoke de RLS

**Depende de:** Etapa 1
**Arquivos:** `/Users/joaohenrique/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar, acrescentar ao fim, antes do `rollback;`)

**O que fazer:** cenários 78–83, no formato dos existentes (DO block, `pg_temp.as_user` / `pg_temp.back_to_postgres`, `raise notice 'OK NN: ...'`), usando as fixtures já criadas no topo do arquivo:

- **78** — secretaria cria gestação por DUM em paciente vinculada sem gestação ativa; `dpp_origem = 'dum'`, `tipo = 'unica'`, `dpp_final = dum + 280`, e `audit_log` grava `gestacao.criada` com `meta->>'por' = 'secretaria'`.
- **79** — a mesma paciente passa a aparecer agendável de fato: `agendar_consulta` pela secretaria agora sucede onde antes levantava `'Paciente não tem gestação ativa'`.
- **80** — secretaria corrige a DUM: `atualizar_dum_pela_secretaria` muda `dum`, o trigger recalcula `dpp_final`, e o `audit_log` registra `gestacao.atualizada` com `de`/`para`.
- **81** — médica troca a gestação para `dpp_origem = 'usg'` via `atualizar_gestacao`; a correção seguinte da secretaria falha com `'Gestação com DPP definida por ultrassom: só a médica corrige'`.
- **82** — médica (papel `medica`) chamando `criar_gestacao_pela_secretaria` falha; secretaria chamando `criar_gestacao` falha com `'Apenas a médica vinculada cadastra a gestação'`.
- **83** — `gestacao_ativa_da_paciente` devolve uma linha para a secretaria e para a médica vinculada, e levanta exceção para médica sem vínculo; o insert direto em `gestacoes` como secretaria segue falhando com `insufficient_privilege` (a fronteira do cenário 69 permanece).

### 3 — Regenerar os tipos do banco no web

**Depende de:** Etapa 1
**Arquivos:** `src/types/database.types.ts` (editar — gerado)

**O que fazer:** rodar `supabase gen types typescript --local` na stack do `prenatalapp` e substituir o arquivo. Conferir que aparecem `criar_gestacao_pela_secretaria`, `atualizar_dum_pela_secretaria` e `gestacao_ativa_da_paciente` em `Database['public']['Functions']`.

### 4 — Expor as RPCs no PacientesService

**Depende de:** Etapa 3
**Arquivos:** `src/app/core/pacientes/pacientes.service.ts` (editar)

**O que fazer:** acrescentar

```ts
export interface GestacaoAtiva {
  id: string;
  dppOrigem: DppOrigem;
  dum: string | null;
  dppUsg: string | null;
  dppFinal: string;
  tipo: TipoGestacao;
}
```

com `DppOrigem` e `TipoGestacao` derivados de `Database['public']['Enums']`, e três métodos no padrão `Resultado<T>` já usado na classe, todos passando o erro por `this.mensagem(error)`:

- `gestacaoAtiva(pacienteId: string): Promise<Resultado<GestacaoAtiva | null>>` — rpc `gestacao_ativa_da_paciente`; lista vazia vira `{ ok: true, valor: null }`.
- `criarGestacao(pacienteId: string, dum: string): Promise<Resultado<string>>` — rpc `criar_gestacao_pela_secretaria`.
- `corrigirDum(gestacaoId: string, dum: string): Promise<Resultado<null>>` — rpc `atualizar_dum_pela_secretaria`.

A DUM trafega como ISO (`string`), como já acontece com `dataNascimento`; a conversão `Date` ↔ ISO fica nos componentes, com `paraDataIso` / `deDataIso` de `src/app/core/formato/data.ts`.

### 5 — Bloco de gestação na ficha da paciente

**Depende de:** Etapa 4
**Arquivos:** `src/app/pages/pacientes/gestacao/paciente-gestacao.ts`, `.html`, `.scss` (criar)

**O que fazer:** componente `PacienteGestacao`, seletor `app-paciente-gestacao`, `input.required<string>() pacienteId`, `output<void>() alterada`, modelado em `src/app/pages/pacientes/vinculos/paciente-vinculos.ts` (signals `carregando`/`agindo`/`erro`, `ngOnInit` chamando um `carregar()` privado, PrimeNG `ButtonModule`, `DatePickerModule`, `MessageModule`, `TagModule`).

Estados renderizados:

- **Sem gestação ativa:** texto explicando que a consulta só pode ser agendada com gestação cadastrada, `p-datepicker` de DUM (`dateFormat="dd/mm/yy"`, `[minDate]` = hoje − 300 dias, `[maxDate]` = hoje) e botão "Cadastrar gestação" → `criarGestacao`.
- **Gestação ativa com `dppOrigem === 'dum'`:** DUM e DPP prevista (`dppFinal`) formatadas com `formatarData`, e botão "Corrigir DUM" abrindo o mesmo datepicker → `corrigirDum`.
- **Gestação ativa com `dppOrigem === 'usg'`:** DPP prevista em modo leitura e a nota "DPP definida por ultrassom pela médica.", sem ação.

Erro da RPC vai para `erro` e é exibido com `p-message severity="error"`. Após sucesso, recarregar e emitir `alterada`. Nenhum cálculo de DPP/IG em TS.

### 6 — Embutir o bloco na ficha da paciente

**Depende de:** Etapa 5
**Arquivos:** `src/app/pages/pacientes/formulario/paciente-formulario.ts`, `paciente-formulario.html` (editar)

**O que fazer:** importar `PacienteGestacao` no `imports` do componente e renderizar `<app-paciente-gestacao [pacienteId]="id()!" />` dentro do `@if (edicao())` existente, **antes** de `<app-paciente-vinculos>` — é a gestação que bloqueia o agendamento.

### 7 — Cadastro inline no diálogo de nova consulta da agenda

**Depende de:** Etapa 4
**Arquivos:** `src/app/pages/agenda/agenda.ts`, `agenda.html` (editar)

**O que fazer:**

- Novo controle `dum: [null as Date | null]` em `formNova` (sem `Validators.required` fixo; a obrigatoriedade é aplicada dinamicamente).
- Signals `gestacaoDaPaciente = signal<GestacaoAtiva | null>(null)` e `verificandoGestacao = signal(false)`; `precisaDeGestacao = computed(...)` verdadeiro quando há paciente escolhida, a verificação terminou e não há gestação ativa.
- Ao mudar `formNova.controls.pacienteId` (subscrição em `ngOnInit`, no estilo já usado para os filtros), chamar `pacientes.gestacaoAtiva(...)`, guardar o resultado e adicionar/remover `Validators.required` em `dum`.
- No template, quando `precisaDeGestacao()`:
  - secretaria (`ehSecretaria()`): aviso "Esta paciente ainda não tem gestação cadastrada." + `p-datepicker` de DUM com os mesmos limites da Etapa 5;
  - médica (`ehMedica()`): aviso com `routerLink` para `/mesa/{{ pacienteId }}` e botão de submit desabilitado (ela cadastra pelo cartão).
- Em `agendar()`, quando `precisaDeGestacao()` e o papel é secretaria: chamar `pacientes.criarGestacao(pacienteId, paraDataIso(dum)!)` antes de `agenda.agendar(...)`; se a criação falhar, exibir a mensagem e não agendar. Ao fechar o diálogo, limpar `gestacaoDaPaciente` e o campo `dum`.
- `RouterLink` entra nos `imports` do componente.

### 8 — Testes Angular

**Depende de:** Etapas 4, 5, 7
**Arquivos:** `src/app/core/pacientes/pacientes.service.spec.ts` (editar), `src/app/pages/pacientes/gestacao/paciente-gestacao.spec.ts` (criar), `src/app/pages/agenda/agenda.spec.ts` (editar)

**O que fazer:** ver a seção **Testes**.

### 9 — Documentação

**Depende de:** Etapa 1
**Arquivos:** `docs/adr/0004-cadastro-da-gestacao-pela-secretaria.md` (criar), `docs/adr/0003-escopo-de-leitura-da-equipe.md` (editar), `docs/roadmap-web.md` (editar), `docs/plano-w9-gestacao-pela-secretaria.md` (criar)

**O que fazer:**

- **ADR 0004**, no formato dos existentes (Status / Contexto / Decisão / Alternativas consideradas / Consequências). Decisão a registrar: a fronteira do ADR 0003 é revista num ponto e só nele — a secretaria passa a **escrever a DUM** e a **ler uma projeção da gestação ativa sem desfecho**, sempre por RPC `security definer`; a tabela `gestacoes` continua sem policy nem grant para ela, e desfecho, DPP por ultrassom e tipo gemelar continuam clínicos. Alternativas a registrar como descartadas: (a) policy de select em `gestacoes` para a secretaria — vazaria desfecho; (b) alargar o gate de `criar_gestacao` — daria à secretaria a origem `usg` e o tipo gemelar de graça; (c) criar a gestação implicitamente dentro de `agendar_consulta` — dado clínico nascendo como efeito colateral, sem autoria explícita na auditoria.
- **ADR 0003:** acrescentar uma linha no bloco *Status* e ajustar a linha "Secretaria com a agenda, sem o prontuário", apontando a exceção nova e o ADR 0004. O cenário 28 continua válido (ela segue sem laudo e sem checklist).
- **roadmap-web.md:** entrada de fase W9 com os itens desta entrega.
- **docs/plano-w9-gestacao-pela-secretaria.md:** cópia deste plano, para manter a convenção de um plano por fase no repositório.

## Testes

| Caso | Onde |
| --- | --- |
| `gestacaoAtiva` mapeia a linha da RPC e devolve `null` em lista vazia | `src/app/core/pacientes/pacientes.service.spec.ts` |
| `criarGestacao` / `corrigirDum` enviam `p_paciente_id`/`p_gestacao_id` e `p_dum` corretos e propagam a mensagem de erro do `ErroSupabase` | `src/app/core/pacientes/pacientes.service.spec.ts` |
| Sem gestação: mostra o campo DUM e chama `criarGestacao`, emitindo `alterada` | `src/app/pages/pacientes/gestacao/paciente-gestacao.spec.ts` |
| Gestação com origem `dum`: mostra DPP prevista e permite corrigir | `src/app/pages/pacientes/gestacao/paciente-gestacao.spec.ts` |
| Gestação com origem `usg`: modo leitura, sem botão de correção | `src/app/pages/pacientes/gestacao/paciente-gestacao.spec.ts` |
| Erro da RPC aparece na tela e não emite `alterada` | `src/app/pages/pacientes/gestacao/paciente-gestacao.spec.ts` |
| Secretaria escolhe paciente sem gestação: campo DUM aparece e `agendar()` cria a gestação antes de agendar | `src/app/pages/agenda/agenda.spec.ts` |
| Falha ao criar a gestação aborta o agendamento e exibe a mensagem | `src/app/pages/agenda/agenda.spec.ts` |
| Médica com paciente sem gestação: aviso com link para o cartão, sem campo DUM | `src/app/pages/agenda/agenda.spec.ts` |
| Paciente com gestação ativa: fluxo atual intacto, sem chamada extra de criação | `src/app/pages/agenda/agenda.spec.ts` |

Os specs existentes usam dublês do `SupabaseClient` — seguir o mesmo padrão de
`agenda.spec.ts` e `paciente-vinculos.spec.ts`, sem rede.

## Validação final

No `prenatalapp`:

```bash
supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Esperado: `OK 78` a `OK 83` no fim da saída e nenhum `FAIL` — os cenários 1–77
continuam passando (a refatoração da Etapa 1 preserva as mensagens).

No `prenatalweb`:

```bash
npm run lint && npm run typecheck && npm test
```

Esperado: sem erro de lint, sem erro de tipo, e a suíte do Vitest verde,
incluindo os casos novos.

Verificação de ponta a ponta, logada como secretaria: em `/pacientes/:id` de uma
paciente sem gestação, informar a DUM e ver a DPP prevista aparecer; em
`/agenda`, escolher outra paciente sem gestação no diálogo de nova consulta,
preencher DUM e data/hora e confirmar que a consulta entra na grade; conferir em
`/auditoria` (logada como médica) que existem os registros `gestacao.criada` com
`por: secretaria`.
