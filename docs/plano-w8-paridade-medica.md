# Plano: W8 — Paridade da médica no web

> Ao aprovar, salve como `docs/plano-w8-paridade-medica.md` no repo `prenatalweb`.

## Contexto

O web nasceu como ferramenta administrativa (secretaria) e ganhou a mesa da médica a partir da W4. A divisão nunca foi fechada: hoje a médica tem no celular seis ações que a web não oferece, e o pedido é que **tudo que ela faz pelo app ela também faça pela web**.

Levantamento das escritas da médica nos dois clientes:

| Ação                                       | App (Flutter)                                                                                                                     | Web hoje                    | Situação                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| Criar gestação                             | `INSERT gestacoes` direto ([gestacao_repository.dart:220](../../prenatalapp/lib/features/gestacao/data/gestacao_repository.dart)) | —                           | **lacuna, precisa de backend**                         |
| Editar gestação                            | —                                                                                                                                 | —                           | **não existe em lugar nenhum** (update revogado na W7) |
| Encerrar gestação                          | RPC `encerrar_gestacao`                                                                                                           | —                           | lacuna só de UI                                        |
| Registrar consulta realizada               | RPC `marcar_consulta`                                                                                                             | só faltou/cancelada         | lacuna só de UI (deixada de fora na W5 de propósito)   |
| Cadastrar paciente + convite               | RPC `criar_paciente_com_convite`                                                                                                  | só a secretaria cadastra    | lacuna só de UI                                        |
| Reemitir convite                           | RPC `reemitir_convite`                                                                                                            | só a secretaria (outra RPC) | lacuna só de UI                                        |
| Agendar consulta                           | `INSERT consultas` direto                                                                                                         | RPC `agendar_consulta` ✅   | paridade ok                                            |
| Documentos (rascunho/publicar/excluir/ler) | 4 RPCs                                                                                                                            | ✅ W4                       | paridade ok                                            |
| Checklist do protocolo                     | RPC `marcar_checklist_item`                                                                                                       | ✅ W4                       | paridade ok                                            |

Quatro das seis lacunas já têm RPC pronta no Postgres — são puro trabalho de tela. Só gestação exige migration, e ela traz junto uma dívida da W7: o `INSERT` direto em `gestacoes` é hoje a **única escrita clínica fora de RPC** no projeto, e por isso a criação de gestação é a única ação da médica que não deixa rastro no `audit_log`. O [ADR 0003](adr/0003-escopo-de-leitura-da-equipe.md) já declara "escrita clínica sempre por RPC e sempre exigindo vínculo" e abre exceção explícita para esse insert. Esta fatia fecha a exceção.

## Objetivo

Ao final, a médica faz pela web tudo que faz pelo app: cadastra paciente com convite e reemite o código, cria, **corrige** e encerra a gestação, e registra a consulta que já aconteceu. No Postgres, `gestacoes` deixa de aceitar escrita direta — as três mutações passam por RPC `security definer` com vínculo e auditoria, e o app Flutter é migrado para a mesma porta. Nenhuma tela do mobile muda de comportamento.

## Escopo

**Dentro:**

- `prenatalapp`: migration `20260831120000_gestacao_web.sql` (RPCs `criar_gestacao` e `atualizar_gestacao`, fechamento do insert direto), reescrita do cenário 69 e cenários 72–77 no `rls_smoke.sql`, e migração de `GestacaoRepository.criarGestacao` para a RPC.
- `prenatalweb`: `database.types.ts` regerado; `CartaoService` + `PacientesService` + `AgendaService` com os métodos novos; painel de gestações no cartão da gestante; diálogo de registro de consulta; página `/mesa/nova`; componente de exibição do código de convite; rotas, sidebar, roadmap e ADR 0003 atualizados.

**Fora — não fazer:**

- Não criar tela de gestação fora do cartão da gestante (`/mesa/:pacienteId` é o contexto; não existe rota `/gestacoes`).
- Não calcular DPP nem IG em TypeScript. `dpp_final` é derivada pelo trigger `gestacoes_set_dpp_final` e a IG por `ig_semanas` — o formulário salva e recarrega, sem prévia local. (O roadmap proíbe duplicar regra compartilhada em Dart/TS; o `dum + 280` do `IdadeGestacional.dppFromDum` no Flutter é dívida existente, não modelo a copiar.)
- Não mexer nas telas do Flutter. A única mudança no mobile é a linha de escrita dentro de `GestacaoRepository.criarGestacao`; `nova_gestacao_screen.dart` e o ramo `demoMode` ficam intactos.
- Não abrir `update`/`delete` direto em `gestacoes`. As RPCs são `security definer` e ignoram grant; o grant continua fechado.
- Não permitir que a médica se vincule a paciente já existente. Ela só cria vínculo cadastrando paciente nova (`criar_paciente_com_convite`); reatribuição continua exclusiva da secretaria.
- Não dar à secretaria nenhuma das ações novas (gestação e registro de consulta são clínicos; ela já tem `pacientes` e `convites` por outra via).
- Não editar os cenários 1–68 e 70–71 do smoke. O **69 é a exceção obrigatória** — ele hoje afirma que o insert direto funciona.
- Nenhuma dependência npm ou pub nova.

## Decisões técnicas

| Decisão                          | Escolha                                                                                                                                                   | Motivo                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Criação de gestação              | RPC `criar_gestacao`, insert direto revogado, Flutter migrado                                                                                             | Escolha do usuário. Fecha a última escrita clínica fora de RPC e faz a criação virar linha de auditoria nos dois clientes         |
| Edição de gestação               | RPC `atualizar_gestacao` nova, só gestação `ativa`                                                                                                        | Escolha do usuário. Corrigir DUM digitada errada hoje exige `service_role`; `dpp_final` e o checklist se recalculam sozinhos      |
| Grant em `gestacoes`             | `revoke insert` + `drop policy gestacoes_insert_medica`                                                                                                   | Com as três RPCs cobrindo criar/editar/encerrar, a policy vira porta lateral sem dono                                             |
| Validação de datas               | No Postgres, espelhando os limites dos `showDatePicker` do mobile (DUM: `current_date - 300` a hoje; DPP USG: `current_date - 60` a `current_date + 300`) | Regra compartilhada mora no banco; os dois clientes herdam a mesma mensagem                                                       |
| Segunda gestação ativa           | Checada na RPC com mensagem própria, antes do índice único                                                                                                | `23505` cru chega ao usuário como erro genérico                                                                                   |
| Troca de origem na edição        | A RPC grava `dum` e `dpp_usg` a partir dos parâmetros, anulando o não usado                                                                               | Mantém a linha honesta; `gestacoes_dpp_origem_check` não proíbe lixo na coluna ociosa                                             |
| Prévia de DPP/IG no formulário   | Não existe                                                                                                                                                | Duplicaria `dum + 280` em TS contra a premissa do roadmap                                                                         |
| Registrar consulta               | `marcar_consulta` (realizada/faltou/cancelada) num diálogo no cartão + ação "Realizada" na `/agenda`, só para médica                                      | Espelha `registrar_consulta_sheet.dart`. Faltou/cancelar na `/agenda` continuam pelas RPCs da agenda, que a secretaria também usa |
| Cadastro de paciente pela médica | Rota `/mesa/nova`, RPC `criar_paciente_com_convite` já existente                                                                                          | A RPC cria paciente + vínculo com `auth.uid()` + convite numa transação; zero backend novo                                        |
| Código do convite                | Componente compartilhado, exibido uma única vez após criar/reemitir                                                                                       | O código só existe em texto claro no retorno da RPC — o banco guarda só o `sha256`                                                |
| Painel de gestações              | Componente filho `CartaoGestacoes` recebendo a lista por `input` e emitindo `alterada`                                                                    | Precedente de `CartaoDocumentos`, mas sem refetch duplicado: o pai continua dono do estado que `gestacaoAtual()` deriva           |
| Auditoria                        | `gestacao.criada` (meta `dpp_origem`, `tipo`) e `gestacao.atualizada` (meta `de`/`para`)                                                                  | Entidade `gestacoes`, mesmo formato de `gestacao.encerrada`; o viewer da W6 agrupa sozinho                                        |

## Pré-requisitos

Docker + stack Supabase local do `prenatalapp` rodando; `psql`, `supabase` CLI e Flutter SDK no PATH; Node 22. Web no commit `a780b0a` (pós-W7). Nenhuma dependência nova.

## Etapas

Etapas 1–3 no repo `~/Documents/VoidSans/prenatalapp`; 4–10 no `~/Documents/VoidSans/prenatalweb`.

### 1 — Migration: RPCs de gestação e fechamento do insert

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260831120000_gestacao_web.sql` (criar)

Migration única. As duas funções são `language plpgsql security definer set search_path = public`, com gate interno e **sem `revoke execute`** (segfault PG17/ARM64 documentado em `init_schema.sql:386-389`).

1. `criar_gestacao(p_paciente_id uuid, p_dpp_origem public.dpp_origem, p_dum date default null, p_dpp_usg date default null, p_tipo public.tipo_gestacao default 'unica') returns uuid`.
   Gate único cobrindo papel, existência da paciente e vínculo — sem distinguir os casos, para não virar enumerador: `if public.current_papel() is distinct from 'medica' or not public.medica_vinculada_ao_paciente(p_paciente_id) then raise exception 'Apenas a médica vinculada cadastra a gestação'`.
   Validações, nesta ordem e com estas mensagens exatas:
   - já existe gestação `ativa` da paciente → `'Paciente já tem gestação ativa'`
   - `p_dpp_origem = 'dum'` e `p_dum is null` → `'Informe a data da última menstruação'`
   - `p_dpp_origem = 'usg'` e `p_dpp_usg is null` → `'Informe a DPP calculada pelo ultrassom'`
   - `p_dum` fora de `[current_date - 300, current_date]` → `'DUM fora do intervalo de uma gestação em curso'`
   - `p_dpp_usg` fora de `[current_date - 60, current_date + 300]` → `'DPP do ultrassom fora do intervalo plausível'`

   Insere `paciente_id`, `dum`, `dpp_usg`, `dpp_origem`, `tipo`, anulando a coluna de data que não corresponde a `p_dpp_origem`. Não envia `dpp_final` nem `status`. `returning id`, audita `gestacao.criada` em `gestacoes` com `meta = jsonb_build_object('dpp_origem', p_dpp_origem::text, 'tipo', p_tipo::text)`, retorna o id.

2. `atualizar_gestacao(p_gestacao_id uuid, p_dpp_origem public.dpp_origem, p_dum date default null, p_dpp_usg date default null, p_tipo public.tipo_gestacao default 'unica') returns void`.
   Gate: `public.current_papel() is distinct from 'medica' or not public.medica_vinculada_a_gestacao(p_gestacao_id)` → `'Apenas a médica vinculada edita a gestação'`.
   Lê a linha atual para o `meta` da auditoria; se `status <> 'ativa'` → `'Só gestação ativa pode ser editada'`. Repete as cinco validações de data/origem da etapa anterior (extraia num bloco comum dentro de cada função ou duplique — não crie função auxiliar pública).
   `update` de `dum`, `dpp_usg`, `dpp_origem`, `tipo` (anulando a data ociosa); o trigger `gestacoes_dpp_final` recalcula `dpp_final`. Audita `gestacao.atualizada` com `meta = jsonb_build_object('de', jsonb_build_object('dpp_origem', …, 'dum', …, 'dpp_usg', …, 'tipo', …), 'para', jsonb_build_object(…))`.

3. Fechamento do insert direto, com comentário explicando que as três RPCs (`criar_gestacao`, `atualizar_gestacao`, `encerrar_gestacao`) passam a ser o caminho único e que o Flutter foi migrado na mesma entrega:

```sql
revoke insert on public.gestacoes from anon, authenticated;
drop policy gestacoes_insert_medica on public.gestacoes;
```

**Validação:** `cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.*gestacao*"` — `criar_gestacao`, `atualizar_gestacao` e `encerrar_gestacao` listadas.

### 2 — Smoke: reescrever o 69 e acrescentar 72–77

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

**Cenário 69 (reescrever, mantendo o número e o resto do bloco).** O trecho hoje comentado como _"Insert direto em gestacoes é o caminho do mobile: continua funcionando"_ (junto com a nota sobre `RETURNING`) inverte de sinal: o insert como médica passa a ser esperado falhar com `insufficient_privilege`, e a gestação usada pelo resto do cenário passa a nascer de `public.criar_gestacao(...)`. As asserções de `update`/`delete` em `gestacoes` e todo o bloco de `pacientes` continuam como estão. Atualize o `raise notice` para refletir que agora **toda** escrita em `gestacoes` é RPC.

Cenários novos, imediatamente antes do `rollback;`, cada um criando as próprias fixtures:

- **72 — `criar_gestacao`, caminho feliz e gates.** Secretária e gestante recebem a exceção do gate; médica sem vínculo idem; médica vinculada cria e a linha volta com `dpp_final = dum + 280`, `status = 'ativa'`, `dpp_usg` nula; `audit_log` tem uma linha `gestacao.criada` com `ator_id` da médica.
- **73 — `criar_gestacao`, validações.** Segunda gestação ativa → `'Paciente já tem gestação ativa'` (e **não** `unique_violation`); origem `dum` sem `p_dum` e origem `usg` sem `p_dpp_usg` → as duas mensagens; DUM de 400 dias atrás e DPP USG de 400 dias à frente → as duas mensagens de intervalo. Criação por USG grava `dpp_final = p_dpp_usg` e `dum` nula.
- **74 — `atualizar_gestacao`, recálculo e limpeza.** Corrigir a DUM move `dpp_final` junto; trocar `dpp_origem` de `dum` para `usg` grava `dpp_usg`, anula `dum` e move `dpp_final`; `tipo` vai para `gemelar`; `audit_log` tem `gestacao.atualizada` com `meta->'de'` e `meta->'para'` diferentes.
- **75 — `atualizar_gestacao`, gates.** Médica não vinculada e secretária recebem `'Apenas a médica vinculada edita a gestação'`; gestação encerrada (via `encerrar_gestacao`) recebe `'Só gestação ativa pode ser editada'`.
- **76 — porta fechada.** `insert into public.gestacoes` como médica vinculada levanta `insufficient_privilege`; a mesma criação pela RPC passa. (Complementa o 69 do lado do caminho legítimo.)
- **77 — ponta a ponta.** Gestação criada pela RPC aparece em `painel_da_medica` para a médica vinculada (com `gestacao_id` preenchido) e em `checklist_da_gestacao` com os itens do protocolo pendentes; `marcar_consulta(consulta_vencida, 'realizada')` nessa gestação muda o status e audita `consulta.registrada` com `meta->>'status' = 'realizada'`.

**Validação:** `cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql` → 77 `OK` e exit 0, com 1–68 e 70–71 verdes sem edição.

### 3 — Migrar o Flutter para a RPC

**Depende de:** Etapa 2
**Arquivos:** `~/Documents/VoidSans/prenatalapp/lib/features/gestacao/data/gestacao_repository.dart` (editar)

Só o corpo não-demo de `criarGestacao` muda: o `.from('gestacoes').insert({...})` vira `.rpc('criar_gestacao', params: {'p_paciente_id': …, 'p_dpp_origem': origem.name, 'p_dum': …, 'p_dpp_usg': …, 'p_tipo': tipo.dbValue})`, mantendo `_soData` para as datas. A assinatura pública, o ramo `demoMode` e o docstring sobre `dpp_final` ficam; atualize o docstring para citar a RPC. Nenhuma tela muda — `nova_gestacao_screen.dart` já trata erro com `catch (_)`.

Nenhum teste Dart cobre o caminho real (os três testes que tocam o repositório rodam em `demoMode`), então não há teste novo aqui; a cobertura desta mudança é o cenário 76.

**Validação:** `cd ~/Documents/VoidSans/prenatalapp && flutter analyze && flutter test` → verde.

### 4 — Regenerar os tipos do banco

**Depende de:** Etapa 3
**Arquivos:** `src/types/database.types.ts` (regerar)

`supabase gen types typescript --local > ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` a partir do `prenatalapp`. Conferir `criar_gestacao` e `atualizar_gestacao` em `Functions`.

### 5 — CartaoService: gestação e consulta

**Depende de:** Etapa 4
**Arquivos:** `src/app/core/cartao/cartao.service.ts` (editar), `src/app/core/cartao/cartao.service.spec.ts` (editar)

Tipos novos exportados: `DppOrigem = Database['public']['Enums']['dpp_origem']`, `TipoGestacao`, `DesfechoGestacao`, `StatusConsulta`, e

```ts
export interface DadosGestacao {
  dppOrigem: DppOrigem;
  tipo: TipoGestacao;
  dum: string | null;
  dppUsg: string | null;
}
```

Métodos, no padrão dos existentes (`Resultado<T>`, `opcional()` para os `default null`, `this.erros.mensagem(error)`):

- `criarGestacao(pacienteId: string, dados: DadosGestacao): Promise<Resultado<string>>` → rpc `criar_gestacao`
- `atualizarGestacao(gestacaoId: string, dados: DadosGestacao): Promise<Resultado<null>>` → rpc `atualizar_gestacao`
- `encerrarGestacao(gestacaoId: string, desfecho: DesfechoGestacao, observacao: string | null): Promise<Resultado<null>>` → rpc `encerrar_gestacao`
- `registrarConsulta(consultaId: string, status: StatusConsulta): Promise<Resultado<null>>` → rpc `marcar_consulta`

Ampliar `CartaoService.gestacoes()` para trazer também `dum` e `dpp_usg` no `select` e no mapeamento de `GestacaoCartao` — o formulário de edição precisa preencher a data original.

**Spec:** estender o mapa de dispatch por nome de RPC já usado no arquivo; asserir os `params` exatos de cada método, incluindo a omissão da chave quando a data é nula.

### 6 — PacientesService: cadastro e convite pela médica

**Depende de:** Etapa 4
**Arquivos:** `src/app/core/pacientes/pacientes.service.ts` (editar), `src/app/core/pacientes/pacientes.service.spec.ts` (editar)

- `criarComConvite(dados: DadosPacienteMedica): Promise<Resultado<{ pacienteId: string; codigo: string }>>` → rpc `criar_paciente_com_convite`, lendo `(data ?? [])[0]`; lista vazia → `ERRO_GENERICO`. `DadosPacienteMedica` reaproveita `DadosPaciente` (nome, dataNascimento, cpf, contatoEmergencia) somando `papelVinculo: PapelVinculo`.
- `reemitirConvite(pacienteId: string): Promise<Resultado<string>>` → rpc `reemitir_convite`, retorno é `text`.

O `mensagem()` privado já mapeia `23505` (CPF duplicado) e `23514` (11 dígitos) — os dois valem aqui também.

### 7 — Painel de gestações no cartão

**Depende de:** Etapas 5 e 6
**Arquivos:** `src/app/pages/mesa/cartao/cartao-gestacoes.ts|.html|.scss` (criar), `src/app/pages/mesa/cartao/cartao-gestacoes.spec.ts` (criar), `src/app/pages/mesa/cartao/cartao-gestante.ts|.html` (editar), `src/app/pages/mesa/cartao/cartao-gestante.spec.ts` (editar)

`CartaoGestacoes` (standalone, signals): `readonly pacienteId = input.required<string>()`, `readonly gestacoes = input.required<GestacaoCartao[]>()`, `readonly alterada = output<void>()`. Sinais `agindo`, `erro`, `aEditar = signal<GestacaoCartao | null>(null)`, `criando = signal(false)`, `aEncerrar = signal<GestacaoCartao | null>(null)`.

Move para cá a `<p-table>` de gestações que hoje vive em `cartao-gestante.html` (colunas DPP, Origem, Tipo, Situação, Desfecho), somando:

- botão **Nova gestação** no cabeçalho da seção, visível só quando nenhuma gestação tem `status === 'ativa'`;
- ações **Editar** e **Encerrar** na linha da gestação `ativa`.

Três `<p-dialog>` no padrão do app (`[visible]` ligado ao sinal, `<ng-template #footer>`, `<p-message severity="error">` inline):

- **Nova / Editar** compartilham um `NonNullableFormBuilder` group `{ dppOrigem: ['dum' as DppOrigem, Validators.required], tipo: ['unica' as TipoGestacao, Validators.required], dum: [null as Date | null], dppUsg: [null as Date | null] }`. Dois `<p-select>` (Origem: "Pela DUM"/"Por ultrassom"; Tipo: "Única"/"Gemelar") e **um** `<p-datepicker dateFormat="dd/mm/yy" [showIcon]="true">` que troca de `formControlName` e de rótulo conforme `dppOrigem`. `[maxDate]`/`[minDate]` espelham os limites da RPC. Envia com `paraDataIso()`, anulando a data que não corresponde à origem. Uma `<p-message severity="secondary">` explica que a DPP é calculada pelo sistema.
- **Encerrar** com `<p-select>` sobre os seis valores de `desfecho_gestacao` (Parto normal, Cesárea, Aborto, Óbito fetal, Transferência de cuidado, Outro) e `<textarea pTextarea>` opcional, avisando que as consultas futuras agendadas serão canceladas.

Todo caminho de sucesso fecha o diálogo e emite `alterada`.

Em `CartaoGestante`: remover a tabela de gestações do template, inserir `<app-cartao-gestacoes [pacienteId]="…" [gestacoes]="gestacoes()" (alterada)="carregar()" />`, e acrescentar o registro de consulta — coluna de ação na tabela de Consultas com botão **Registrar**, habilitado quando `c.status === 'agendada'` e `new Date(c.dataHora) <= new Date()`, abrindo um `<p-dialog>` com `<p-select>` sobre `realizada | faltou | cancelada` que chama `cartao.registrarConsulta(...)` e recarrega.

### 8 — Cadastro de paciente pela médica

**Depende de:** Etapa 6
**Arquivos:** `src/app/pages/mesa/nova/mesa-nova-paciente.ts|.html|.scss` (criar), `src/app/pages/mesa/nova/mesa-nova-paciente.spec.ts` (criar), `src/app/pages/mesa/codigo-convite/codigo-convite.ts|.html|.scss` (criar), `src/app/pages/mesa/lista/mesa-lista.html` (editar), `src/app/pages/mesa/cartao/cartao-gestante.ts|.html` (editar)

`CodigoConvite`: componente de apresentação, `readonly codigo = input.required<string | null>()` e `readonly fechado = output<void>()`. Renderiza um `<p-dialog>` com o código em destaque, o aviso de que ele aparece **uma única vez** e um botão de copiar (`navigator.clipboard.writeText`, dentro de `try/catch` — a API não existe em contexto inseguro).

`MesaNovaPaciente`: formulário no padrão de `PacienteFormulario` — `nome` (`required`, `minLength(3)`), `papelVinculo` (`<p-select>` Obstetra/Medicina fetal, default `obstetra`), `dataNascimento` (`<p-datepicker>`, `[maxDate]="hoje"`), `cpf` (`<p-inputmask mask="999.999.999-99" [unmask]="true">`), `contatoEmergencia`. Ao salvar chama `pacientes.criarComConvite(...)`, guarda o código num sinal para o `<app-codigo-convite>` e, ao fechar o diálogo, navega para `/mesa/{pacienteId}`.

Em `MesaLista`: botão **Nova paciente** (`routerLink="/mesa/nova"`) no cabeçalho.
Em `CartaoGestante`: botão **Reemitir convite** no cabeçalho, com diálogo de confirmação avisando que o código anterior para de valer, chamando `pacientes.reemitirConvite(...)` e exibindo o retorno no mesmo `<app-codigo-convite>`.

### 9 — "Realizada" na agenda

**Depende de:** Etapa 4
**Arquivos:** `src/app/core/agenda/agenda.service.ts` (editar), `src/app/core/agenda/agenda.service.spec.ts` (editar), `src/app/pages/agenda/agenda.ts|.html` (editar), `src/app/pages/agenda/agenda.spec.ts` (editar)

`AgendaService.registrarRealizada(consultaId: string): Promise<Resultado<null>>` → rpc `marcar_consulta` com `p_status: 'realizada'`.

Na página, a ação **Realizada** entra ao lado de Reagendar/Marcar falta para consulta `agendada` já vencida, visível **apenas** quando `auth.papel() === 'medica'` (a RPC recusa a secretaria). Confirmação no mesmo diálogo genérico já usado por cancelar/faltar.

### 10 — Rotas, sidebar e documentação

**Depende de:** Etapas 7, 8 e 9
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.html` (editar), `docs/roadmap-web.md` (editar), `docs/adr/0003-escopo-de-leitura-da-equipe.md` (editar), `docs/plano-w8-paridade-medica.md` (criar — este plano)

- Rota `nova` como filha de `mesa`, **antes** de `:pacienteId`, senão `nova` é capturada como id de paciente:

```ts
{ path: 'nova', loadComponent: () => import('./pages/mesa/nova/mesa-nova-paciente').then((m) => m.MesaNovaPaciente) },
```

- Sidebar: nada novo (a entrada "Minhas pacientes" já cobre `/mesa/*`).
- Roadmap: seção **W8 — Paridade da médica no web** com as checkboxes das etapas.
- ADR 0003: a linha "gestacoes guarda o insert direto do mobile mas fecha update/delete" está agora obsoleta. Reescrever para registrar que a exceção foi encerrada na W8, que `gestacoes` só aceita escrita pelas três RPCs, e trocar a referência dos cenários (68/69 continuam, mais 72–77).

## Testes

| Arquivo                        | Caso                   | Assegura                                                                                                                           |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `rls_smoke.sql` 69 (reescrito) | insert direto recusado | a porta lateral que a W7 deixou aberta está fechada                                                                                |
| `rls_smoke.sql` 72–73          | `criar_gestacao`       | gates de papel/vínculo, as cinco validações, `dpp_final` derivada, auditoria                                                       |
| `rls_smoke.sql` 74–75          | `atualizar_gestacao`   | recálculo, limpeza da data ociosa, gates, gestação encerrada recusada                                                              |
| `rls_smoke.sql` 76             | porta única            | `insufficient_privilege` no insert, RPC passa                                                                                      |
| `rls_smoke.sql` 77             | ponta a ponta          | gestação nova alimenta painel e checklist; `marcar_consulta('realizada')` audita                                                   |
| `cartao.service.spec.ts`       | 4 métodos novos        | nomes e `params` das RPCs; datas nulas omitidas                                                                                    |
| `pacientes.service.spec.ts`    | criar/reemitir         | leitura de `[0]` do retorno tabular; `23505`/`23514`                                                                               |
| `cartao-gestacoes.spec.ts`     | diálogos               | "Nova" só sem gestação ativa; Editar/Encerrar só na ativa; datepicker troca de control com a origem; `alterada` emitido no sucesso |
| `cartao-gestante.spec.ts`      | registrar consulta     | botão só em `agendada` vencida; recarga após sucesso                                                                               |
| `mesa-nova-paciente.spec.ts`   | cadastro               | payload trimado; código exibido; navegação para `/mesa/:id` ao fechar                                                              |
| `agenda.spec.ts`               | ação Realizada         | visível só para médica e só em `agendada` vencida                                                                                  |

## Validação final

```
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && flutter analyze && flutter test
```

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f ~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql
```

```
cd ~/Documents/VoidSans/prenatalweb && npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
```

Esperado: 77 `OK` no smoke; `flutter test` e o pipeline npm verdes.

Roteiro manual, logado como médica: cadastrar paciente nova em `/mesa/nova` e anotar o código; abrir o cartão, criar a gestação por DUM e conferir a DPP calculada; editar trocando para USG e ver a DPP mudar; agendar uma consulta em `/agenda`, registrar como realizada; encerrar a gestação com desfecho e confirmar que "Nova gestação" reaparece; reemitir o convite; abrir `/auditoria` e ver `gestacao.criada`, `gestacao.atualizada`, `gestacao.encerrada` e `consulta.registrada`. Como secretaria, confirmar que `/mesa` continua inacessível e que a `/agenda` não mostra "Realizada".

Commits separados por repo: migration + smoke + Flutter no `prenatalapp`; o resto no `prenatalweb`.

## Riscos e rollback

- **Fechar o insert quebra o mobile se a Etapa 3 não for junto.** As duas mudanças precisam entrar no mesmo commit do `prenatalapp`. O cenário 76 falha se a RPC não existir; o `flutter analyze` não pega a regressão (o nome da RPC é string), então a prova é o smoke.
- **App em produção com versão antiga.** Não há projeto Supabase hospedado ainda (bloqueio registrado na W7 do roadmap), então não existe cliente antigo em campo. Quando existir, esta ordem se inverte: publicar a RPC, atualizar o app, e só depois revogar o insert.
- **`atualizar_gestacao` mexe em dado clínico já usado.** Corrigir a DUM reclassifica as janelas do checklist (`checklist_da_gestacao` é derivada da IG) e pode acender pendências no painel. É o comportamento desejado — a auditoria com `de`/`para` é o que torna a correção rastreável.
- **Rollback:** web e Flutter por revert dos commits; backend por migration nova com `drop function if exists public.criar_gestacao(uuid, public.dpp_origem, date, date, public.tipo_gestacao)` e a de `atualizar_gestacao`, mais `grant insert on public.gestacoes to authenticated` e recriação da policy `gestacoes_insert_medica` tal como está em `20260830120000_hardening_w7.sql:64`.
