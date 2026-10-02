# Plano: W10 — Perfil de administração

> Ao aprovar, salve como `docs/plano-w10-perfil-admin.md` no repo `prenatalweb`.

## Contexto

Hoje o enum `public.papel_usuario` tem três valores (`paciente`, `medica`, `secretaria`) e a secretaria acumula dois trabalhos que não têm nada a ver um com o outro: administrar a clínica no dia a dia (pacientes, convites, vínculos, agenda) e administrar as **contas de acesso** — a tela `/equipe`, que fala com a Edge Function `gerir-equipe` e tem a service role atrás dela. A mesma pessoa que agenda uma consulta também cria e desativa conta de médica.

Além disso a auditoria (`auditoria_da_clinica`) hoje é exclusiva da médica, de propósito (ADR 0003: o rastro `documento.lido` não deve chegar à secretaria). Não existe ninguém na clínica que veja o rastro **e** administre as contas — que é justamente o par que caracteriza um perfil administrativo.

Esta fatia cria o papel `admin`, move para ele a administração de contas e a auditoria, dá a ele os relatórios operacionais e os convites, e **tira da secretaria** o acesso a `/relatorios` e `/equipe`.

Levantamento do que muda por superfície:

| Superfície            | Médica                                  | Secretaria hoje  | Secretaria depois | Admin                   |
| --------------------- | --------------------------------------- | ---------------- | ----------------- | ----------------------- |
| `/inicio`             | mesa + agenda do dia                    | agenda do dia    | agenda do dia     | atalhos administrativos |
| `/agenda`             | sim                                     | sim              | sim               | **não**                 |
| `/pacientes`          | não                                     | sim              | sim               | não                     |
| `/convites`           | não                                     | sim              | sim               | **sim**                 |
| `/equipe`             | não                                     | sim              | **não**           | **sim**                 |
| `/auditoria`          | sim                                     | não              | não               | **sim**                 |
| `/relatorios`         | documentos, faltas, checklist, convites | faltas, convites | **nenhum**        | **faltas, convites**    |
| `/mesa`, `/protocolo` | sim                                     | não              | não               | não                     |

## Objetivo

Ao final existe um papel `admin` que entra no web, tem menu próprio, cria e desativa contas de médica, secretaria e admin em `/equipe`, acompanha convites de gestante em `/convites`, lê a auditoria completa da clínica em `/auditoria` e abre os dois relatórios operacionais em `/relatorios`. A secretaria perde `/relatorios` e `/equipe` — no menu, na rota **e** no gate das RPCs. A médica não muda em nada.

## Escopo

**Dentro**

- Valor `admin` no enum `papel_usuario`, helper `public.is_admin()` e `public.promover_para_admin`.
- Alargar os gates das RPCs de convite, auditoria e dos dois relatórios operacionais.
- Retirar `secretaria` do gate de `relatorio_faltas` e `relatorio_convites_pendentes`.
- Edge Function `gerir-equipe`: ator passa a ser o admin, papel `admin` vira criável, trava de lockout muda de "última secretaria" para "último admin".
- Front: `PapelEquipe` com três valores, guards das rotas, menu do shell orientado a dados, home do admin, filtro de papel dos relatórios, seletor de papel de `/equipe`.
- Runbook do primeiro admin no `README.md`, ADR 0005 e emenda no ADR 0003.

**Fora — não fazer**

- Não dar agenda ao admin. `agenda_da_clinica`, `agendar_consulta` e as demais RPCs de `20260827120000_agenda_web.sql` ficam intocadas com o gate `('secretaria','medica')`.
- Não dar relatório clínico ao admin. `relatorio_documentos_publicados` e `relatorio_checklist_vencidos` continuam `medica` + filtro de vínculo (`medica_vinculada_a_gestacao`), como o hardening da W7 deixou. Admin não tem vínculo com paciente nenhuma.
- Não alargar `is_secretaria()`. Alargar esse helper daria ao admin, de graça, toda a escrita da secretaria (`criar_paciente_pela_secretaria`, os três RPCs de vínculo, `criar_gestacao_pela_secretaria`, `atualizar_dum_pela_secretaria`). O admin administra contas, não cadastro clínico.
- Não dar `/pacientes`, `/mesa`, `/protocolo` ao admin.
- Não criar policy de `select` em `pacientes`, `gestacoes`, `consultas`, `documentos` ou `audit_log` para o admin. Toda leitura dele passa por `security definer`; a única policy nova é em `profiles`.
- Não mexer em `reemitir_convite` (é `medica` + vínculo, usado no cartão da gestante, não na tela `/convites`).
- Não migrar dado existente: nenhuma conta vira admin sozinha.
- App Flutter (`prenatalapp/lib`) não muda — `admin` não faz login no mobile e o `PapelEquipe` do Dart não existe.

## Decisões técnicas

| Decisão                           | Escolha                                                                            | Motivo                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nome do valor no enum             | `admin`                                                                            | Termo do usuário. Os outros valores são substantivos de função (`medica`, `secretaria`); `admin` cabe no mesmo lugar sem gênero.                                                                      |
| Rótulo em português               | `Administração`                                                                    | Aparece sob o nome da pessoa no topo do shell e na coluna Papel de `/equipe`; rótulo de função, não de pessoa, evita flexionar gênero.                                                                |
| `rotuloPapel`                     | Vira `Record<PapelEquipe, string>`                                                 | Hoje é um ternário (`papel.ts:15`). Com três valores o ternário aninhado esconde o caso faltante; o `Record` quebra em compilação quando um quarto papel entrar.                                      |
| Duas migrations                   | `alter type ... add value` sozinho em uma; o resto na seguinte                     | O valor novo do enum não pode ser usado na mesma transação que o adiciona. Mesmo par de `20260820120000_papel_secretaria.sql` + `20260820120100_promover_secretaria.sql`.                             |
| Gate de papel                     | `is_admin()` novo, e condições `is_secretaria() or is_admin()` onde os dois entram | Espelha `is_secretaria()` (`20260820120400_rls_secretaria.sql`). Mantém cada RPC dizendo explicitamente quem entra, em vez de um helper "equipe administrativa" que escorrega.                        |
| Auditoria do admin                | Clínica inteira, igual à médica                                                    | O par "administra contas + lê o rastro" é o que define o perfil. Emenda registrada no ADR 0003.                                                                                                       |
| Relatórios do admin               | Só `faltas` e `convites_pendentes`                                                 | Decisão do usuário. Os dois clínicos filtram por vínculo desde a W7; o admin não tem vínculo e receberia lista vazia — abrir para ele exigiria remover o filtro e vazar título de laudo.              |
| Secretaria e relatórios           | Sai do gate SQL, não só do menu                                                    | Doutrina do projeto (comentário de `20260829120000_relatorios_operacionais.sql`): "A tela esconder a opção não é segurança — quem chamar a RPC direto bate no mesmo muro."                            |
| Leitura de `profiles` pelo admin  | Policy `profiles_select_admin`                                                     | `PacientesService.listarMedicas()` (`pacientes.service.ts:90`) faz `.from('profiles')` direto para o filtro por médica do relatório de faltas. É a única leitura do admin fora de `security definer`. |
| Trava de lockout na Edge Function | `ehUltimaSecretariaAtiva` vira `ehUltimoAdminAtivo`                                | Depois desta fatia é o admin que administra contas. Manter a trava na secretaria deixaria a clínica sem ninguém para criar conta, que é exatamente o lockout que a trava existe para evitar.          |
| Primeiro admin                    | `promover_para_admin` com gate `service_role` + runbook manual                     | Decisão do usuário. Espelha `promover_para_secretaria`, inclusive o `delete from public.pacientes where profile_id = p_user_id`.                                                                      |
| Menu do shell                     | Array `MENU` com `papeis` por item + `@for`                                        | Com três papéis os dois `@if` de `shell.html` viram três blocos com `/agenda` e `/convites` duplicados. O array espelha o `RELATORIOS` de `relatorios.ts:111`, que já resolve o mesmo problema.       |
| Home do admin                     | Não carrega mesa nem agenda                                                        | `Inicio.carregar()` chama `agenda.listar()` para todo mundo; para o admin isso bateria no gate e pintaria erro na primeira tela depois do login.                                                      |

## Pré-requisitos

- Repo do banco: `/Users/joaohenrique/Documents/VoidSans/prenatalapp` (migrations, Edge Functions e `supabase/tests/rls_smoke.sql`).
- Supabase CLI local rodando (`supabase start`), Node 22, `npm ci` nos dois repos.
- Depois das migrations, regerar `src/types/database.types.ts` no `prenatalweb` (`supabase gen types typescript --local`). O arquivo é gerado — não editar à mão.

## Etapas

### 1 — Adicionar `admin` ao enum

**Depende de:** nenhuma
**Arquivos:** `prenatalapp/supabase/migrations/20260902120000_papel_admin.sql` (criar)

Só `alter type public.papel_usuario add value if not exists 'admin';`, com comentário explicando que o resto vive na migration seguinte porque o valor novo não pode ser usado na mesma transação. Espelha `20260820120000_papel_secretaria.sql`.

### 2 — Helper, promoção e policy do admin

**Depende de:** Etapa 1
**Arquivos:** `prenatalapp/supabase/migrations/20260902120100_perfil_admin.sql` (criar)

1. `public.is_admin() returns boolean`, `language sql stable security definer set search_path = public`, igual a `is_secretaria()` trocando o papel.
2. `public.promover_para_admin(p_user_id uuid, p_nome text default null) returns void` — cópia de `promover_para_secretaria` (`20260820120100`): gate `request.jwt.claims ->> 'role' = 'service_role'`, mensagem `'Promoção a admin é exclusiva do backend'`, `update public.profiles set papel = 'admin', ...`, `raise exception 'Profile % não encontrado'` quando `not found`, e `delete from public.pacientes where profile_id = p_user_id`.
3. `create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());`

Nenhuma outra policy. Nenhum grant novo — `profiles` já tem `grant select` para `authenticated` desde `20260820120200`.

### 3 — Alargar os gates de convite para o admin

**Depende de:** Etapa 2
**Arquivos:** `prenatalapp/supabase/migrations/20260902120100_perfil_admin.sql` (editar)

`create or replace` das quatro funções, mudando **apenas** a condição do gate de `if not public.is_secretaria() then` para `if not (public.is_secretaria() or public.is_admin()) then`, e as mensagens para citar os dois papéis (ex.: `'Apenas a secretaria e a administração emitem convites por aqui'`). Corpo e assinatura idênticos ao original:

- `convites_da_secretaria` (de `20260820120800`)
- `emitir_convite_pela_secretaria`, `revogar_convite_pela_secretaria`, `emitir_convites_em_lote` (de `20260820120700`)

`reemitir_convite` e `criar_paciente_com_convite` não entram — são da médica.

### 4 — Auditoria e relatórios operacionais

**Depende de:** Etapa 2
**Arquivos:** `prenatalapp/supabase/migrations/20260902120100_perfil_admin.sql` (editar)

`create or replace` mudando só o gate:

- `acoes_auditadas` e `auditoria_da_clinica` (de `20260828120000`): de `current_papel() <> 'medica'` para `current_papel() not in ('medica','admin')`, mensagem `'Apenas médicas e a administração consultam a auditoria'`. Copiar o corpo de `20260828120000_auditoria_da_clinica.sql` **inteiro** (o `left join lateral` do alvo é grande e não muda).
- `relatorio_faltas` e `relatorio_convites_pendentes` (de `20260829120000`): de `not in ('medica','secretaria')` para `not in ('medica','admin')`. É aqui que a secretaria perde o acesso.

`relatorio_documentos_publicados` e `relatorio_checklist_vencidos` não entram — a versão válida delas é a de `20260830120000_hardening_w7.sql`, com o filtro de vínculo, e recriá-las aqui a partir da versão antiga reabriria a clínica inteira.

### 5 — Edge Function `gerir-equipe`

**Depende de:** Etapa 2
**Arquivos:** `prenatalapp/supabase/functions/gerir-equipe/index.ts` (editar)

1. `PAPEIS_VALIDOS = ["medica", "secretaria", "admin"] as const`.
2. Gate do ator: `perfilAtor?.papel !== "admin"` → 403 `"Apenas a administração administra a equipe."`
3. Renomear `ehUltimaSecretariaAtiva(id)` para `ehUltimoAdminAtivo(id)` e trocar o `.eq("papel", "secretaria")` por `.eq("papel", "admin")`. Os dois callers (`alterar_papel` e `desativar`) passam a responder `"A clínica ficaria sem administração ativa."`
4. Em `alterar_papel`, a condição `papel === "medica" && await ehUltimaSecretariaAtiva(alvoId)` vira `papel !== "admin" && await ehUltimoAdminAtivo(alvoId)`.
5. Mapa de RPC de promoção nos dois pontos (`criar` e `alterar_papel`): um `Record<Papel, string>` com `medica → promover_para_medica`, `secretaria → promover_para_secretaria`, `admin → promover_para_admin`, no lugar do ternário atual.

`listar` já filtra por `.in("papel", PAPEIS_VALIDOS)` e passa a devolver os admins sem outra mudança. As proteções de conta própria (`alvoId === atorId`) ficam como estão.

### 6 — Cenários de RLS

**Depende de:** Etapas 3, 4, 5
**Arquivos:** `prenatalapp/supabase/tests/rls_smoke.sql` (editar)

Cenários 84–92, no formato existente (`pg_temp.as_user(uuid)`, saída `OK N:` / `FAIL:`), criando um profile de papel `admin` no bloco de fixtures:

84. admin lê `auditoria_da_clinica` e recebe linhas.
85. secretaria chamando `relatorio_faltas` levanta exceção.
86. secretaria chamando `relatorio_convites_pendentes` levanta exceção.
87. admin lê `relatorio_faltas` e `relatorio_convites_pendentes`.
88. admin chamando `relatorio_documentos_publicados` levanta exceção.
89. admin chamando `agenda_da_clinica` levanta exceção.
90. admin chamando `criar_paciente_pela_secretaria` levanta exceção (`is_secretaria` não o alcança).
91. admin lê `convites_da_secretaria` e emite convite; secretaria continua emitindo.
92. `promover_para_admin` chamado como `authenticated` levanta `'Promoção a admin é exclusiva do backend'`.

### 7 — Regenerar os tipos

**Depende de:** Etapa 6
**Arquivos:** `src/types/database.types.ts` (editar — gerado)

`supabase gen types typescript --local` no `prenatalapp`, saída para o `prenatalweb`. Confere que `papel_usuario` passou a ter `"admin"` e que `is_admin` e `promover_para_admin` apareceram em `Functions`.

### 8 — `PapelEquipe` com três valores

**Depende de:** Etapa 7
**Arquivos:** `src/app/core/auth/papel.ts` (editar)

- `PapelEquipe = Extract<PapelUsuario, 'medica' | 'secretaria' | 'admin'>`
- `PAPEIS_EQUIPE: readonly PapelEquipe[] = ['medica', 'secretaria', 'admin']`
- `const ROTULO: Record<PapelEquipe, string> = { medica: 'Médica', secretaria: 'Secretaria', admin: 'Administração' }` e `rotuloPapel` passa a ler dele.

`ehPapelEquipe` e `auth.guard.ts` não mudam — `papelGuard` já é genérico sobre `PapelEquipe`, e `AuthService.carregarPerfil` já aceita qualquer papel de equipe.

### 9 — Guards das rotas

**Depende de:** Etapa 8
**Arquivos:** `src/app/app.routes.ts` (editar)

| Rota         | De                                  | Para                               |
| ------------ | ----------------------------------- | ---------------------------------- |
| `relatorios` | `papelGuard('secretaria','medica')` | `papelGuard('medica','admin')`     |
| `convites`   | `papelGuard('secretaria')`          | `papelGuard('secretaria','admin')` |
| `equipe`     | `papelGuard('secretaria')`          | `papelGuard('admin')`              |
| `auditoria`  | `papelGuard('medica')`              | `papelGuard('medica','admin')`     |

`agenda`, `pacientes`, `protocolo` e `mesa` não mudam.

### 10 — Menu do shell orientado a dados

**Depende de:** Etapa 8
**Arquivos:** `src/app/layout/shell/shell.ts` (editar), `src/app/layout/shell/shell.html` (editar)

Em `shell.ts`, no topo do arquivo:

```ts
interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: string;
  papeis: readonly PapelEquipe[];
}
```

`const MENU: readonly ItemMenu[]`, nesta ordem, com os ícones que já estão no template: `/inicio` "Início" `pi-home` (todos os papéis), `/agenda` "Agenda" `pi-calendar` (`medica`, `secretaria`), `/mesa` "Minhas pacientes" `pi-users` (`medica`), `/pacientes` "Pacientes" `pi-users` (`secretaria`), `/convites` "Convites" `pi-send` (`secretaria`, `admin`), `/protocolo` "Protocolo" `pi-list-check` (`medica`), `/equipe` "Equipe" `pi-id-card` (`admin`), `/auditoria` "Auditoria" `pi-history` (`medica`, `admin`), `/relatorios` "Relatórios" `pi-chart-bar` (`medica`, `admin`).

Na classe: `protected readonly itens = computed(() => { const p = this.auth.papel(); return p === null ? [] : MENU.filter((i) => i.papeis.includes(p)); });`

Em `shell.html`, os dois blocos `@if` e os três links fixos viram um `@for (item of itens(); track item.rota)` com `[routerLink]="item.rota"`, `routerLinkActive="ativo"`, `<i class="pi {{ item.icone }}" aria-hidden="true">` e `<span>{{ item.rotulo }}</span>`. Cabeçalho e `<router-outlet />` não mudam.

### 11 — Home do admin

**Depende de:** Etapa 8
**Arquivos:** `src/app/pages/inicio/inicio.ts` (editar), `src/app/pages/inicio/inicio.html` (editar)

Em `inicio.ts`, adicionar `protected readonly ehAdmin = computed(() => this.auth.papel() === 'admin')` e, em `carregar()`, trocar a chamada de agenda por `this.ehAdmin() ? null : this.agenda.listar(inicioDoDia, fimDoDia, null)`, tratando o `null` como já se trata o `painel` nulo (o bloco só é avaliado quando a promessa existe).

Em `inicio.html`, envolver o bloco da agenda do dia em `@if (!ehAdmin())` e acrescentar um `@if (ehAdmin())` com os quatro atalhos administrativos (`routerLink` para `/equipe`, `/convites`, `/auditoria`, `/relatorios`), no mesmo estilo de cartão já usado na tela.

### 12 — Relatórios por papel

**Depende de:** Etapa 8
**Arquivos:** `src/app/pages/relatorios/relatorios.ts` (editar)

- No array `RELATORIOS`: `faltas` e `convites` passam de `papeis: ['medica','secretaria']` para `['medica','admin']`. `documentos` e `checklist` continuam `['medica']`.
- `ehSecretaria` vira `ehAdmin = computed(() => this.auth.papel() === 'admin')`; é ele que decide carregar a lista de médicas para o filtro do relatório de faltas, em `ngOnInit` e no template (`relatorios.html`, onde `ehSecretaria()` aparece controlando o campo de médica).
- `disponiveis()`, `atual()` e o resto ficam como estão: `ngOnInit` já seleciona o primeiro relatório disponível do papel.

### 13 — Seletor de papel em `/equipe`

**Depende de:** Etapa 8
**Arquivos:** `src/app/pages/equipe/lista/equipe-lista.ts` (editar)

Acrescentar `{ rotulo: 'Administração', valor: 'admin' as PapelEquipe }` ao array `papeis` (linhas 53–56). O restante da tela já é genérico sobre `PapelEquipe` — a coluna de papel usa `rotuloPapel` e o `p-select` de alteração usa o mesmo array.

### 14 — Documentação

**Depende de:** Etapa 13
**Arquivos:** `docs/adr/0005-perfil-admin.md` (criar), `docs/adr/0003-escopo-de-leitura-da-equipe.md` (editar), `docs/roadmap-web.md` (editar), `README.md` (editar)

- **ADR 0005**: contexto (secretaria acumulando administração de contas e dia a dia), a decisão (admin administra contas, lê auditoria e os dois relatórios operacionais; não tem agenda, cadastro clínico nem vínculo), e as alternativas descartadas: alargar `is_secretaria()` (daria escrita clínica de graça) e dar os relatórios clínicos ao admin (exigiria remover o filtro de vínculo da W7).
- **ADR 0003**: acrescentar ao Status a emenda da W10 — a auditoria da clínica passa a ser lida por `medica` e `admin`; os dois relatórios operacionais saem da secretaria.
- **Roadmap**: seção `W10 — Perfil de administração`, com as RPCs, os cenários 84–92 e o que muda por papel.
- **README**: o runbook do primeiro admin, na seção que já explica `promover_para_medica`/`promover_para_secretaria`, incluindo que é uma chamada por service role e que a partir dela a tela `/equipe` cria os demais.

## Testes

| Caso                                                                                                                 | Onde                                              |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `papelGuard('admin')` deixa passar admin e barra secretaria                                                          | `src/app/core/auth/auth.guard.spec.ts`            |
| Login com `papel: 'admin'` é aceito e popula `auth.papel()`                                                          | `src/app/core/auth/auth.service.spec.ts`          |
| Menu do admin traz Início, Convites, Equipe, Auditoria, Relatórios e **não** traz Agenda, Pacientes, Mesa, Protocolo | `src/app/layout/shell/shell.spec.ts` (criar)      |
| Menu da secretaria não traz mais Relatórios nem Equipe                                                               | `src/app/layout/shell/shell.spec.ts` (criar)      |
| Menu da médica continua idêntico ao de hoje                                                                          | `src/app/layout/shell/shell.spec.ts` (criar)      |
| Home do admin não chama `AgendaService.listar` nem `MesaService.listar`                                              | `src/app/pages/inicio/inicio.spec.ts`             |
| Admin vê só Faltas e Convites pendentes em `disponiveis()`                                                           | `src/app/pages/relatorios/relatorios.spec.ts`     |
| Admin carrega a lista de médicas para o filtro de faltas                                                             | `src/app/pages/relatorios/relatorios.spec.ts`     |
| Seletor de `/equipe` oferece os três papéis e criar com `papel: 'admin'` chega ao serviço                            | `src/app/pages/equipe/lista/equipe-lista.spec.ts` |
| `rotuloPapel('admin')` devolve `'Administração'`                                                                     | `src/app/core/auth/papel.spec.ts` (criar)         |
| Cenários 84–92                                                                                                       | `prenatalapp/supabase/tests/rls_smoke.sql`        |

O padrão dos specs é o do repositório: `provideZonelessChangeDetection()`, componentes standalone por `imports`, e mock do **serviço** (nunca do `SUPABASE_CLIENT`) nas telas — ver `src/app/pages/mesa/lista/mesa-lista.spec.ts`. Para os specs que dependem do papel, injetar `{ provide: AuthService, useValue: { papel: signal('admin'), perfil: signal(...) } }`.

## Validação final

No `prenatalapp`:

```bash
supabase db reset && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Esperado: nenhuma linha `FAIL:`, e as linhas `OK 84:` a `OK 92:` presentes.

```bash
supabase functions serve gerir-equipe
```

No `prenatalweb`:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Esperado: tudo verde. O `typecheck` é o detector das omissões — o `Record<PapelEquipe, string>` de `rotuloPapel` e o `papeis` de cada relatório quebram se algum papel ficar de fora.

Promover o primeiro admin (service role, uma vez):

```bash
psql "$DATABASE_URL" -c "select public.promover_para_admin('<uuid-do-usuario>', 'Nome');"
```

Roteiro manual, com `npm start` e a stack local:

1. Entrar como o admin promovido. O topo mostra "Administração"; o menu traz Início, Convites, Equipe, Auditoria e Relatórios, e nada mais. A home não pinta erro de agenda.
2. Em `/equipe`, criar uma médica, uma secretaria e um segundo admin. A senha provisória aparece uma vez em cada. Tentar desativar o próprio admin: recusa. Tentar rebaixar o segundo admin com o primeiro desativado: recusa com "A clínica ficaria sem administração ativa."
3. Em `/relatorios`, só Faltas e Convites pendentes no seletor; o filtro por médica lista as médicas.
4. Em `/auditoria`, as ações `equipe.criada` e `equipe.papel_alterado` do passo 2 aparecem com o nome do admin como ator.
5. Em `/convites`, emitir um convite para uma paciente e revogá-lo.
6. Entrar como secretaria: o menu não tem mais Relatórios nem Equipe; abrir `/relatorios` e `/equipe` pela URL cai em `/sem-acesso`. Pacientes, Convites e Agenda continuam funcionando.
7. Entrar como médica: nada mudou — mesa, protocolo, agenda, auditoria e os quatro relatórios.
8. Abrir `/agenda` pela URL como admin: cai em `/sem-acesso`.

## Riscos e rollback

- **Lockout de administração.** Entre a Etapa 5 (Edge Function passa a exigir `admin`) e a promoção do primeiro admin, ninguém administra contas — a secretaria já perdeu o acesso e o admin ainda não existe. Em produção, promover o primeiro admin **antes** de publicar a Edge Function nova.
- **`admin` sem gestação vira paciente órfã.** `promover_para_admin` faz `delete from public.pacientes where profile_id = p_user_id`, igual às outras promoções; se o uuid promovido por engano for de uma gestante, a exclusão cascateia sobre gestação, documentos e consultas dela. O runbook do README precisa mandar conferir `select nome, papel from profiles where id = '<uuid>'` antes.
- **Rollback.** O valor do enum não sai (`alter type ... drop value` não existe no Postgres); o rollback prático é reverter os gates: `create or replace` das funções da Etapa 3 e 4 com os gates originais, `drop function public.is_admin, public.promover_para_admin`, `drop policy profiles_select_admin on public.profiles`, e republicar a Edge Function anterior. Contas já promovidas a `admin` precisam voltar a `secretaria` por `promover_para_secretaria` antes disso, senão perdem acesso a tudo.
