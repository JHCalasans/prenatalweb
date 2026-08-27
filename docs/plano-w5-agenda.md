# Plano: W5 — Agenda da clínica

> Ao aprovar, salve como docs/plano-w5-agenda.md no repo prenatalweb.

## Objetivo

Ao final, `/agenda` mostra as consultas da clínica em tabela densa agrupada por dia, com navegação semanal/mensal, filtro por médica (secretaria) e por status. Secretaria e médica criam consulta, reagem, cancelam e marcam falta pela web; marcar falta acende a pendência `faltou_sem_reagendar` no `/mesa` (cálculo que já existe no `painel_da_medica`). Registrar consulta como **realizada** continua só no mobile. O app Flutter não muda.

## Escopo

**Dentro:** migration no `prenatalapp` (ajuste do trigger `consultas_set_medica` + 5 RPCs novas), cenários 53–59 no `rls_smoke.sql`, regeneração do `database.types.ts`, `AgendaService` + página `/agenda` + rota + sidebar + roadmap.

**Fora — não fazer:**

- Não registrar consulta como realizada no web (fluxo clínico do mobile via `marcar_consulta`).
- Não tocar em Dart/mobile: insert direto de consulta e `marcar_consulta` seguem como estão.
- Não mexer no cartão da gestante (`/mesa/:pacienteId` permanece leitura de consultas).
- Não criar grade de calendário visual nem dependência npm nova (tabela densa, padrão do app).
- Não criar regra de slot/conflito de horário, duração padrão ou horário comercial (não existe hoje; registrado como dívida para W6/W7).
- Não editar cenários 1–52 do smoke. Se algo quebrar, parar e reportar.

## Decisões técnicas

| Decisão                        | Escolha                                                                                                                              | Motivo                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Papéis da agenda               | `secretaria` e `medica` (`papelGuard('secretaria', 'medica')`)                                                                       | Escolha do usuário; roadmap pede filtro por médica                                                                                        |
| Poderes da secretaria          | criar, reagendar, cancelar e marcar falta                                                                                            | As 4 ações do roadmap W5; escolha do usuário                                                                                              |
| "Realizada" no web             | não                                                                                                                                  | Registro clínico fica no mobile; escolha do usuário                                                                                       |
| Visual                         | tabela densa agrupada por dia, alternância semana/mês                                                                                | Escolha do usuário; zero dependência nova                                                                                                 |
| Leitura                        | RPC `agenda_da_clinica` (security definer com gate), sem policy nova de `consultas`                                                  | Menos superfície RLS; join com nomes pronto; padrão das leituras agregadas                                                                |
| Escrita                        | RPCs `security definer` com gate interno dos dois papéis; update/delete em `consultas` continuam revogados para `authenticated`      | Padrão `criar_paciente_pela_secretaria`; sem reabrir grants                                                                               |
| Semântica cancelar × falta     | cancelar exige `data_hora > now()`; falta exige `data_hora <= now()` e status `agendada`                                             | Espelha o painel ("consulta vencida é a que vira falta"); as duas regras cobrem tudo sem sobreposição                                     |
| Reagendar                      | atômico (`update data_hora` mantendo status `agendada`)                                                                              | UX de agenda; consulta cancelada espúria confunde o histórico                                                                             |
| Agendar recebe `p_paciente_id` | RPC resolve a gestação ativa internamente                                                                                            | UI não precisa saber de `gestacao_id`                                                                                                     |
| Médica dona da consulta        | `agendar_consulta` força `p_medica_id := auth.uid()` quando papel = medica; exige vínculo ativo médica↔paciente para ambos os papéis | Consistente com policy `consultas_insert_medica` e com `marcar_consulta`                                                                  |
| Trigger `consultas_set_medica` | passa a forçar `medica_id := auth.uid()` só quando `current_papel() = 'medica'`                                                      | Sem isso, agendamento pela secretaria gravaria o perfil dela em `medica_id`; médica e service_role ficam idênticos ao comportamento atual |
| Falta × pendência              | nenhuma mudança no `painel_da_medica`                                                                                                | `faltou_sem_reagendar` já zera quando existe consulta agendada futura; a W5 só passa a escrever o dado pela web                           |
| Auditoria                      | `consulta.agendada`, `consulta.reagendada`, `consulta.cancelada` e `consulta.registrada` (meta `{status: 'faltou'}`)                 | Mesma `acao` do mobile em falta → viewer da W6 agrupa naturalmente                                                                        |

## Pré-requisitos

Docker + stack Supabase local do `prenatalapp` rodando; `psql` e `supabase` CLI no PATH; Node 22. Web no commit `adcb2f4` (pós-W4). Nenhuma dependência npm nova.

## Etapas

Etapas 1–2 no repo `~/Documents/VoidSans/prenatalapp`; etapas 3–6 no `prenatalweb`.

### 1 — Migration: trigger + 5 RPCs da agenda

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260827120000_agenda_web.sql` (criar)
**O que fazer:** uma migration única (todas `plpgsql security definer set search_path = public`, gate interno, sem `revoke execute`, `insert into public.audit_log` nas escritas — padrão de `criar_paciente_pela_secretaria`):

1. `create or replace function public.consultas_set_medica()` nova versão: força `new.medica_id := auth.uid()` apenas quando `public.current_papel() = 'medica'`; caso contrário mantém o valor recebido. Recriar o trigger `consultas_medica_autor` (drop + create, `before insert on public.consultas`).
2. `agenda_da_clinica(p_de timestamptz, p_ate timestamptz, p_medica_id uuid default null) returns table (consulta_id uuid, gestacao_id uuid, paciente_id uuid, nome text, data_hora timestamptz, tipo text, local text, status public.status_consulta, medica_id uuid, medica_nome text)` — `stable`. Gate: papel fora de `(secretaria, medica)` → `'Apenas secretaria e médica acessam a agenda'`. Médica ignora `p_medica_id` e filtra por `public.medica_vinculada_a_gestacao(c.gestacao_id)`; secretaria filtra por `p_medica_id` quando informado. Intervalo `[p_de, p_ate)`, join `gestacoes → pacientes` e `profiles` (nome da médica), ordenação por `data_hora`. Validar `p_de < p_ate` → `'Período inválido'`.
3. `agendar_consulta(p_paciente_id uuid, p_medica_id uuid, p_data_hora timestamptz, p_tipo text default 'Consulta de pré-natal', p_local text default null) returns uuid` — gate dois papéis (`'Apenas secretaria e médica agendam consultas'`); se medica, força `p_medica_id := auth.uid()`. Validações e mensagens exatas: `p_data_hora > now()` senão `'Consulta nova precisa estar no futuro'`; paciente existe senão `'Paciente não encontrada'`; gestação ativa senão `'Paciente não tem gestação ativa'`; médica com `papel = 'medica'` e vínculo ativo com a paciente senão `'Médica não tem vínculo ativo com a paciente'`; tipo não vazio senão `'Tipo da consulta é obrigatório'`. Insert e audit `consulta.agendada` (meta `medica_id`, `data_hora`). Retorna o id.
4. `reagendar_consulta(p_consulta_id uuid, p_data_hora timestamptz) returns void` — para médica, mensagem única `'Apenas a médica vinculada reagenda a consulta'` cobre consulta inexistente/sem vínculo (padrão de `marcar_consulta`); secretária recebe `'Consulta não encontrada'`. Status `agendada` senão `'Só consulta agendada pode ser reagendada'`; data futura senão `'Reagendamento precisa estar no futuro'`. Audit `consulta.reagendada` (meta `de`/`para`).
5. `cancelar_consulta(p_consulta_id uuid) returns void` — mesmos gates (`'Apenas a médica vinculada cancela a consulta'` / `'Consulta não encontrada'`); status senão `'Só consulta agendada pode ser cancelada'`; `data_hora > now()` senão `'Só consulta futura pode ser cancelada'`. Audit `consulta.cancelada`.
6. `marcar_falta(p_consulta_id uuid) returns void` — gates (`'Apenas a médica vinculada registra a falta'` / `'Consulta não encontrada'`); status senão `'Só consulta agendada pode ser marcada como falta'`; `data_hora <= now()` senão `'Só consulta vencida pode ser marcada como falta'`. Audit `consulta.registrada` meta `{status: 'faltou'}`.

**Validação:** `supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.agenda*"` — as 5 funções listadas.

### 2 — Cenários 53–59 no smoke

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)
**O que fazer:** inserir imediatamente antes do `rollback;`, sem tocar em fixtures/cenários 1–52. Cada cenário cria as próprias consultas via insert como médica ou RPC. Cenários: **53** secretaria lista agenda com consultas das médicas; médica vê só pacientes vinculadas; gestante → exceção do gate; **54** secretária agenda (assert `medica_id` = médica vinculada, não a secretária; erros: passado, sem gestação ativa, sem vínculo); **55** médica agenda para si (id forçado); médica alheia e gestante → erro; **56** reagendar muda `data_hora`; erros de status, passado e médica não vinculada (mensagem única); **57** cancelar futura vira `cancelada`; vencida → erro; já cancelada → erro; **58** `marcar_falta` em vencida vira `faltou`; futura → erro; **59** falta alimenta pendência: após `marcar_falta`, `painel_da_medica` devolve `faltou_sem_reagendar = true`; após agendar futura, `false` e `proxima_consulta_em` preenchida.

**Validação:** `supabase db reset && psql ... -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql` → 59 `OK` e exit 0 (cenários 1–52 verdes sem edição — prova de que o trigger não regrediu).

### 3 — Regenerar os tipos do banco

**Depende de:** Etapa 2
**Arquivos:** `src/types/database.types.ts` (regerar)
**O que fazer:** `supabase gen types typescript --local > src/types/database.types.ts` a partir do `prenatalapp`; conferir as 5 funções novas na seção `Functions`.

### 4 — AgendaService

**Depende de:** Etapa 3
**Arquivos:** `src/app/core/agenda/agenda.service.ts` (criar), `src/app/core/agenda/agenda.service.spec.ts` (criar)
**O que fazer:** `@Injectable({ providedIn: 'root' })` no padrão de `mesa.service.ts` (`type Resultado<T>`, `mensagemDeErro` mapeando `P0001`). Tipo `ConsultaAgenda = Database['public']['Functions']['agenda_da_clinica']['Returns'][number]` com correção de nulabilidade (`local | null`). Métodos: `listar(de: Date, ate: Date, medicaId: string | null)`, `agendar({pacienteId, medicaId, dataHora, tipo, local})`, `reagendar(consultaId, dataHora)`, `cancelar(consultaId)`, `marcarFalta(consultaId)` — todos via `supabase.rpc`; `pacientesAgendaveis(busca)` escolhe a RPC pelo `AuthService.papel()`: secretaria → `pacientes_da_secretaria`, médica → `painel_da_medica`, mapeando para `{pacienteId, nome}`.
**Spec:** mock do `SUPABASE_CLIENT` no padrão de `mesa.service.spec.ts`; args corretos das RPCs (ISO strings, `p_medica_id` null) e escolha da listagem por papel.

### 5 — Página /agenda

**Depende de:** Etapa 4
**Arquivos:** `src/app/pages/agenda/agenda.ts|.html|.scss` (criar), `src/app/pages/agenda/agenda.spec.ts` (criar)
**O que fazer:** classe `Agenda` (standalone, signals, `NonNullableFormBuilder`) com `visao = signal<'semana' | 'mes'>('semana')`, `ref = signal<Date>` (segunda-feira da semana corrente), `consultas`, `carregando`, `erro`, `agindo`, `filtroStatus`, `filtroMedicaId` (secretaria), `medicas` via `PacientesService.listarMedicas()`. `periodo = computed` — semana: `[ref, ref+7d)`; mês: primeiro dia do mês de `ref` até +1 mês. Navegação ‹ Hoje › ajusta `ref` (±7 dias ou ±1 mês). Recarga ao mudar período/filtro. Corpo: `computed` agrupando por dia local (`yyyy-mm-dd`, helpers de `core/formato/data.ts`); seção por dia (`formatarData` + contagem) com `p-table` (Hora, Paciente, Médica, Tipo, Local, Situação, Ações). `p-tag`: agendada=info, realizada=success, cancelada=secondary, faltou=warn. Ações em status `agendada`: futura → Reagendar + Cancelar; vencida (`data_hora <= now`) → Reagendar + Marcar falta; demais status sem ações. Dialogs no padrão do app: nova consulta (paciente `p-select` com filtro, médica `p-select` só para secretaria, `p-datepicker` `[showTime]`, tipo default `'Consulta de pré-natal'`, local opcional), reagendamento (`p-datepicker` `[showTime]`) e confirmação de cancelar/faltar. Erros inline com `p-message`; mutações com `agindo`.
**Spec:** cálculo de período (semana inicia na segunda; mês inteiro), agrupamento por dia, ações visíveis por status+data, filtro de status client-side.

### 6 — Rota, sidebar e roadmap

**Depende de:** Etapa 5
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.html` (editar), `docs/roadmap-web.md` (editar), `docs/plano-w5-agenda.md` (criar — este plano)
**O que fazer:** rota filha de `''` com `papelGuard('secretaria', 'medica')`, path `agenda`, lazy load; item "Agenda" (`pi pi-calendar`, `routerLink="/agenda"`) no nav logo após Início, **sem** `@if` de papel (os dois papéis veem); W5 do roadmap vira checkboxes `[x]` no estilo da W4 (trigger/RPCs, cenários 53–59, `/agenda`).

## Testes

| Arquivo                  | Caso                      | Assegura                                                             |
| ------------------------ | ------------------------- | -------------------------------------------------------------------- |
| `rls_smoke.sql` 53       | leitura por papel         | secretaria vê tudo; médica só vinculadas; gestante bloqueada         |
| `rls_smoke.sql` 54–55    | agendar                   | `medica_id` correto pela secretaria; vínculo/gestação/data validados |
| `rls_smoke.sql` 56–58    | reagendar/cancelar/falta  | regras de status e de data; mensagens exatas                         |
| `rls_smoke.sql` 59       | falta → pendência         | `faltou_sem_reagendar` acende e apaga no painel                      |
| `agenda.service.spec.ts` | RPCs e papel              | args corretos; listagem por papel                                    |
| `agenda.spec.ts`         | período/agrupamento/ações | semana começa segunda; ações por status+data; filtro status          |

## Validação final

```
cd ~/Documents/VoidSans/prenatalapp && supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
cd ~/Documents/VoidSans/prenatalweb
npm run lint && npm run typecheck && npm test -- --run && npm run build && npm run format:check
```

Esperado: 59 `OK` no smoke; pipeline npm verde. Roteiro manual: como secretaria, criar/reagendar/cancelar consulta e marcar falta de consulta vencida, com filtro por médica; como médica, ver só a própria agenda e agendar para paciente vinculada; marcar falta e conferir a pendência "Faltas" no `/mesa`. Commits em ambos os repos (migration no `prenatalapp`, resto no `prenatalweb`).

## Riscos e rollback

- **Trigger compartilhado com o mobile:** o gate `current_papel() = 'medica'` preserva os dois comportamentos atuais (médica força, service_role sem claim mantém); os cenários 1–52 rodando sem edição são a prova.
- **Nenhum `grant update/delete` reaberto** em `consultas`; escrita só pelas RPCs.
- **Rollback:** web → revert do commit; backend → migration nova com `drop function if exists` das 5 (assinaturas completas) + restore de `consultas_set_medica` original (`if auth.uid() is not null`) + recriação do trigger.
