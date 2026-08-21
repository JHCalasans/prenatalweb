# Plano de Implementação: W2 (fatia 1) — RLS de `secretaria` + Pacientes

## 1. Objetivo

Ao final, uma usuária com papel `secretaria` entra no web, acessa a rota `/pacientes`, vê a lista de todas as pacientes da clínica com a médica responsável, busca por nome ou CPF, cadastra uma paciente nova atribuindo a obstetra responsável e edita o cadastro de uma paciente existente. Toda escrita passa por RPC `security definer` auditada; a `secretaria` continua sem enxergar gestações, documentos, consultas ou checklists. A médica e a gestante não têm nenhum comportamento alterado.

## 2. Contexto atual

### Backend — `~/Documents/VoidSans/prenatalapp/supabase/`

Migrations aplicadas, em ordem:

| Arquivo                                                  | Conteúdo relevante                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migrations/20260808193116_init_schema.sql`              | Tabelas, helpers (`current_papel`, `is_medica`, `medica_vinculada_ao_paciente`), RPCs de convite, todas as policies base                               |
| `migrations/20260816120000_fase2_gestacao.sql`           | `gestacoes` (dpp trigger, uma ativa por paciente), `encerrar_gestacao`                                                                                 |
| `migrations/20260817120000_fase3_documentos.sql`         | Documentos (não toca `pacientes`/`profiles`/`vinculos`)                                                                                                |
| `migrations/20260818120000_fase4_checklist.sql`          | Checklist (idem)                                                                                                                                       |
| `migrations/20260819120000_fase5_painel_medica.sql`      | `painel_da_medica()` — **padrão de RPC que devolve `returns table` com gate de papel**; `marcar_consulta`                                              |
| `migrations/20260820120000_papel_secretaria.sql`         | `alter type public.papel_usuario add value 'secretaria'`                                                                                               |
| `migrations/20260820120100_promover_secretaria.sql`      | `promover_para_secretaria(uuid, text)`, gate por `request.jwt.claims ->> 'role' = 'service_role'`                                                      |
| `migrations/20260820120200_grants_autenticado.sql`       | Grants explícitos. Já concede `select, update, delete on public.pacientes`, `select on public.vinculos`, `select on public.profiles` a `authenticated` |
| `migrations/20260820120300_restringe_grant_profiles.sql` | `update` em `profiles` restrito às colunas `nome, telefone`                                                                                            |

Estado das policies que importam (`init_schema.sql`):

- `pacientes_select` (linha 555): `profile_id = auth.uid() or public.medica_vinculada_ao_paciente(id)`.
- `pacientes_update_medica` (562) e `pacientes_delete_medica` (573): exigem `current_papel() = 'medica'` **e** vínculo.
- `profiles_select_own_or_linked` (532): próprio perfil, ou perfil de paciente vinculada quando `current_papel() = 'medica'`.
- `vinculos_select` (582): `medica_id = auth.uid() or paciente_id = public.paciente_id_for_me()`; `insert/update/delete` **revogados** de `authenticated` (linha 589) — vínculo só nasce por `security definer`.
- Nenhuma policy cita `secretaria`. Hoje uma secretaria autenticada enxerga **apenas o próprio perfil**.

`public.criar_paciente_com_convite` (299) é a RPC do mobile: exige `current_papel() = 'medica'`, cria paciente + vínculo com `auth.uid()` + convite, numa transação. Grava `p_cpf` como `nullif(btrim(p_cpf), '')` — **sem normalizar**, e a tela Flutter (`lib/features/medica/presentation/screens/nova_paciente_screen.dart:105`) sugere o formato `000.000.000-00`. O `unique (cpf)` de `pacientes` portanto não impede a mesma pessoa entrar duas vezes com e sem pontuação.

`supabase/tests/rls_smoke.sql` (1131 linhas): transação única com `rollback` no fim, fixtures num `do $$` inicial (linhas 21–81), helpers `pg_temp.as_user(uuid)`, `pg_temp.as_service_role()`, `pg_temp.back_to_postgres()` (86–115), e cenários numerados de **1 a 27** no formato `do $$ ... raise exception 'FAIL: ...' ... raise notice 'OK N: ...' end $$;`. Fixtures atuais: `medica_a`, `medica_b`, `paciente_user`, `paciente_row`, `gestacao` na temp table `smoke_ids`.

### Frontend — `~/Documents/VoidSans/prenatalweb/`

| Arquivo                             | Estado                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/supabase-client.ts`   | `InjectionToken` `SUPABASE_CLIENT` com `createClient<Database>`                                                        |
| `src/app/core/auth/auth.service.ts` | Signals `sessao`/`perfil`/`autenticado`/`papel`; padrão de retorno `{ ok: true } \| { ok: false; motivo; mensagem }`   |
| `src/app/core/auth/auth.guard.ts`   | `sessaoGuard`, `deslogadoGuard`, `papelGuard(...papeis)` — **`papelGuard` existe e ainda não é usado em nenhuma rota** |
| `src/app/core/auth/papel.ts`        | `PapelEquipe`, `ehPapelEquipe`, `rotuloPapel`                                                                          |
| `src/app/app.routes.ts`             | `login`, `sem-acesso`, shell com filho `inicio`                                                                        |
| `src/app/layout/shell/shell.html`   | Sidebar com um único item (`/inicio`)                                                                                  |
| `src/app/pages/login/login.ts`      | Padrão de Reactive Forms do projeto (`NonNullableFormBuilder`, signals `enviando`/`erro`)                              |
| `src/styles.scss`                   | Tokens `--aconchego-*`, classe `.cartao-vidro`                                                                         |
| `src/types/database.types.ts`       | Gerado; já contém `papel_usuario: "paciente" \| "medica" \| "secretaria"`                                              |

Testes: Vitest via `@angular/build:unit-test` (`angular.json`), globals habilitados por `tsconfig.spec.json` (`types: ["vitest/globals"]`), `TestBed` com `provideZonelessChangeDetection()`.

PrimeNG 21.1.9 instalado. Seletores confirmados em `node_modules/primeng/fesm2022/`: `p-table` (`TableModule`), `p-select` (`SelectModule`), `p-datepicker` (`DatePickerModule`), `p-inputmask` (`InputMaskModule`, com input `unmask`), `p-message` (`MessageModule`), `p-iconfield`, `p-tag`.

## 3. Escopo

**Dentro:**

- Helper `public.is_secretaria()` e três policies de leitura de escopo clínica (`pacientes`, `profiles`, `vinculos`).
- Normalização de `pacientes.cpf` para 11 dígitos: migração dos dados existentes, `check constraint` e ajuste de `criar_paciente_com_convite` para o mobile não quebrar.
- RPCs `criar_paciente_pela_secretaria`, `atualizar_paciente_pela_secretaria` e `pacientes_da_secretaria(p_busca)`.
- Cenários 28–32 em `supabase/tests/rls_smoke.sql` + fixture de secretaria.
- Regeneração de `src/types/database.types.ts`.
- Helpers `src/app/core/formato/cpf.ts` e `src/app/core/formato/data.ts`.
- `PacientesService` e as telas `/pacientes` (lista + busca) e `/pacientes/nova` / `/pacientes/:id` (formulário), guardadas por `papelGuard('secretaria')`.
- Item "Pacientes" na sidebar, visível apenas para `secretaria`.
- Testes unitários do serviço, dos helpers e das duas telas.
- Atualização de `docs/roadmap-web.md`.

**Fora (não fazer nesta tarefa):**

- Convites: emitir, reemitir, revogar, lote, tela de status. A paciente criada aqui nasce **sem convite** — o fluxo de convite é a fatia seguinte da W2.
- Vínculos além do vínculo inicial obrigatório: transferir, inativar, adicionar segundo vínculo, tela dedicada.
- Gerenciamento de equipe (criar/promover usuárias `medica`/`secretaria`).
- Exclusão de paciente por secretaria.
- Qualquer alteração no que a `medica` ou a `paciente` já podem fazer, no app Flutter ou nas policies existentes — exceto a normalização de CPF descrita acima.
- Índice de busca por trigrama, paginação server-side, Playwright/E2E.

## 4. Decisões técnicas

| Decisão                                        | Escolha                                                                                        | Motivo                                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escopo de leitura da secretaria                | Clínica inteira (`is_secretaria()` sem filtro de vínculo)                                      | A secretaria administra a clínica; filtrar por vínculo não faz sentido — ela não é médica de ninguém                                                                            |
| Helper de papel                                | `public.is_secretaria()`, espelhando `public.is_medica()` (`init_schema.sql:187`)              | Mesma forma `sql stable security definer set search_path = public`; policies ficam legíveis e o planner faz inline                                                              |
| Policies novas vs. editar as existentes        | Policies **novas e separadas** (`*_secretaria`)                                                | Policies permissivas são OR'd; separar deixa o `drop policy` de rollback cirúrgico e não arrisca o caminho da médica                                                            |
| Escrita em `pacientes` pela secretaria         | Só por RPC `security definer`; **sem** policy de `update`                                      | Mesmo padrão que a Fase 5 aplicou em `consultas` (`revoke update` + `marcar_consulta`): centraliza normalização de CPF, validação e `audit_log` num lugar só                    |
| Delete de paciente                             | Não implementado                                                                               | `on delete cascade` derruba gestações, documentos e consultas; fora do escopo pedido ("cadastro/edição, busca")                                                                 |
| Vínculo no cadastro                            | `p_medica_id` **obrigatório** na RPC de criação                                                | `init_schema.sql:296` documenta a intenção de nunca criar paciente órfã; paciente sem vínculo fica invisível para toda médica                                                   |
| Convite no cadastro                            | Não emitido                                                                                    | Convite é a fatia seguinte da W2; emitir aqui exigiria devolver o código em texto e uma tela para ele                                                                           |
| Listagem                                       | RPC `pacientes_da_secretaria(p_busca)` com `returns table`                                     | Espelha `painel_da_medica()`, já no projeto; evita embedding aninhado do PostgREST (`vinculos(profiles(nome))`), que é frágil sob RLS                                           |
| Leitura de uma paciente (formulário de edição) | `select` direto via policy                                                                     | Uma linha por id; RPC extra não pagaria o custo                                                                                                                                 |
| Formato do CPF no banco                        | 11 dígitos, sem pontuação, com `check constraint`                                              | Sem isso o `unique (cpf)` é decorativo: `'123.456.789-00'` e `'12345678900'` coexistem                                                                                          |
| Migração do CPF existente                      | `update` normalizando + ajuste de `criar_paciente_com_convite`                                 | A constraint quebraria o cadastro do mobile, que hoje grava o que a médica digitou                                                                                              |
| Índice de busca                                | Nenhum índice novo                                                                             | `ilike '%termo%'` sobre a escala de uma clínica (centenas a poucos milhares de linhas) é seq scan sub-milissegundo; `pg_trgm` acrescenta dependência de extensão sem ganho hoje |
| Limite da listagem                             | `limit 200` na RPC                                                                             | Evita despejar a tabela inteira no navegador antes de existir paginação server-side                                                                                             |
| Guard das rotas                                | `papelGuard('secretaria')`                                                                     | O roadmap define a W2 como administração da secretaria; a mesa de trabalho da médica é a W4. Estreia o `papelGuard` já testado na W1                                            |
| Máscara de CPF                                 | `p-inputmask` com `[unmask]="true"`                                                            | O `FormControl` recebe dígitos puros; nada de `replace` espalhado pela tela                                                                                                     |
| Feedback de erro                               | `p-message` inline                                                                             | Toast exigiria `MessageService` + `<p-toast>` no shell; erro de formulário pertence ao formulário                                                                               |
| Mapeamento de erro do Postgres                 | Por `code`: `23505` → CPF duplicado, `23514` → CPF inválido, `P0001` → repassa `error.message` | `raise exception` de plpgsql chega como `P0001` com a mensagem em português já escrita na RPC                                                                                   |
| Estado                                         | Signals + serviço, sem store                                                                   | ADR 0001: "Signals + serviços por feature (sem NgRx)"                                                                                                                           |

## 5. Pré-requisitos

- Docker rodando com o stack local do Supabase do `prenatalapp`.
- Supabase CLI via `npx supabase` (já usado no projeto).
- `psql` disponível no PATH.
- Nenhuma dependência npm nova: `primeng` 21.1.9 já traz `table`, `select`, `datepicker`, `inputmask`, `message`.

## 6. Etapas

Etapas 1–4 são no repo `~/Documents/VoidSans/prenatalapp`. Etapas 5–15 são no repo `~/Documents/VoidSans/prenatalweb`; a Etapa 5 roda a CLI a partir do `prenatalapp`, mas escreve o arquivo no `prenatalweb`.

---

### Etapa 1 — Helper e policies de leitura da secretaria

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120400_rls_secretaria.sql` (criar)

**O que fazer:** criar o helper de papel e as três policies de leitura. Não criar policy de escrita — a escrita é fechada nas RPCs da Etapa 3.

**Código:**

```sql
-- W2 do web: a secretaria administra a clínica inteira. Ela não é médica de
-- ninguém, então os helpers de vínculo nunca a alcançam — daí policies
-- próprias, de escopo clínica, separadas das da médica.
-- Só LEITURA aqui: a escrita da secretaria passa pelas RPCs security definer
-- (mesmo padrão de consultas na Fase 5), que normalizam CPF e auditam.

create or replace function public.is_secretaria()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and papel = 'secretaria'
  );
$$;

create policy pacientes_select_secretaria on public.pacientes
  for select to authenticated
  using (public.is_secretaria());

create policy profiles_select_secretaria on public.profiles
  for select to authenticated
  using (public.is_secretaria());

create policy vinculos_select_secretaria on public.vinculos
  for select to authenticated
  using (public.is_secretaria());
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset
```

Conclui sem erro. Depois:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select policyname from pg_policies where schemaname='public' and policyname like '%secretaria%' order by 1;"
```

Saída esperada: três linhas — `pacientes_select_secretaria`, `profiles_select_secretaria`, `vinculos_select_secretaria`.

---

### Etapa 2 — Normalizar CPF e fechar o formato por constraint

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120500_pacientes_cpf_normalizado.sql` (criar)

**O que fazer:** normalizar os CPFs já gravados, adicionar a constraint de 11 dígitos e ajustar `criar_paciente_com_convite` (RPC do mobile) para normalizar também — sem esse ajuste o cadastro do app Flutter passa a falhar contra a constraint.

Antes de rodar, confira que os dados existentes suportam a normalização:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select regexp_replace(cpf,'\D','','g') as digitos, count(*) from public.pacientes where cpf is not null group by 1 having count(*) > 1 or length(regexp_replace(cpf,'\D','','g')) <> 11;"
```

Saída esperada: nenhuma linha. Se vier alguma, corrija manualmente esses cadastros antes de seguir (duplicata real ou CPF incompleto).

**Código:**

```sql
-- O CPF chegava livre do mobile (a tela sugere '000.000.000-00'), então
-- '12345678900' e '123.456.789-00' são a mesma pessoa e ambos passavam pelo
-- unique(cpf). Normaliza o que existe, fecha o formato por constraint e
-- normaliza na RPC do mobile — sem isso o cadastro do app quebraria.

update public.pacientes
   set cpf = regexp_replace(cpf, '\D', '', 'g')
 where cpf is not null
   and cpf <> regexp_replace(cpf, '\D', '', 'g');

alter table public.pacientes
  add constraint pacientes_cpf_digitos
  check (cpf is null or cpf ~ '^\d{11}$');

create or replace function public.criar_paciente_com_convite(
  p_nome text,
  p_data_nascimento date default null,
  p_cpf text default null,
  p_contato_emergencia text default null,
  p_papel_vinculo public.papel_vinculo default 'obstetra'
)
returns table (paciente_id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_codigo text;
  v_cpf text;
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas cadastram pacientes';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Nome da paciente é obrigatório';
  end if;

  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  if v_cpf is not null and length(v_cpf) <> 11 then
    raise exception 'CPF deve ter 11 dígitos';
  end if;

  insert into public.pacientes (nome, data_nascimento, cpf, contato_emergencia)
  values (btrim(p_nome), p_data_nascimento, v_cpf, p_contato_emergencia)
  returning id into v_paciente_id;

  insert into public.vinculos (paciente_id, medica_id, papel)
  values (v_paciente_id, auth.uid(), p_papel_vinculo);

  v_codigo := public.gerar_codigo_convite();

  insert into public.convites (paciente_id, codigo_hash, criado_por)
  values (
    v_paciente_id,
    public.convite_codigo_hash(v_codigo),
    auth.uid()
  );

  insert into public.audit_log (ator_id, acao, entidade, entidade_id)
  values (auth.uid(), 'convite.emitido', 'convites', v_paciente_id);

  return query select v_paciente_id, v_codigo;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select conname from pg_constraint where conname = 'pacientes_cpf_digitos';"
```

Saída esperada: uma linha com `pacientes_cpf_digitos`.

---

### Etapa 3 — RPCs de pacientes da secretaria

**Depende de:** Etapas 1 e 2
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120600_pacientes_secretaria_rpc.sql` (criar)

**O que fazer:** criar as três RPCs. Sem `revoke execute` — ver o comentário de `init_schema.sql:386-389` sobre o segfault do PG17/ARM64; o gate é a checagem interna de papel.

**Código:**

```sql
-- Escrita e listagem da secretaria. O gate é interno (is_secretaria), NÃO
-- `revoke execute` — ver 20260808193116_init_schema.sql sobre o segfault do
-- PG17/ARM64 quando authenticated chama function com execute revogado.

create or replace function public.criar_paciente_pela_secretaria(
  p_nome text,
  p_medica_id uuid,
  p_papel_vinculo public.papel_vinculo default 'obstetra',
  p_data_nascimento date default null,
  p_cpf text default null,
  p_contato_emergencia text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente_id uuid;
  v_cpf text;
begin
  if not public.is_secretaria() then
    raise exception 'Apenas a secretaria cadastra pacientes por aqui';
  end if;

  if nullif(btrim(p_nome), '') is null then
    raise exception 'Nome da paciente é obrigatório';
  end if;

  -- Vínculo obrigatório: paciente sem médica é invisível para toda a equipe.
  if not exists (
    select 1 from public.profiles
    where id = p_medica_id and papel = 'medica'
  ) then
    raise exception 'Médica responsável inválida';
  end if;

  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  if v_cpf is not null and length(v_cpf) <> 11 then
    raise exception 'CPF deve ter 11 dígitos';
  end if;

  insert into public.pacientes (nome, data_nascimento, cpf, contato_emergencia)
  values (
    btrim(p_nome),
    p_data_nascimento,
    v_cpf,
    nullif(btrim(p_contato_emergencia), '')
  )
  returning id into v_paciente_id;

  insert into public.vinculos (paciente_id, medica_id, papel)
  values (v_paciente_id, p_medica_id, p_papel_vinculo);

  insert into public.audit_log (ator_id, acao, entidade, entidade_id, meta)
  values (
    auth.uid(),
    'paciente.criado',
    'pacientes',
    v_paciente_id,
    jsonb_build_object('medica_id', p_medica_id, 'papel_vinculo', p_papel_vinculo::text)
  );

  return v_paciente_id;
end;
$$;

create or replace function public.atualizar_paciente_pela_secretaria(
  p_paciente_id uuid,
  p_nome text,
  p_data_nascimento date default null,
  p_cpf text default null,
  p_contato_emergencia text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text;
begin
  if not public.is_secretaria() then
    raise exception 'Apenas a secretaria edita o cadastro por aqui';
  end if;

  if nullif(btrim(p_nome), '') is null then
    raise exception 'Nome da paciente é obrigatório';
  end if;

  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  if v_cpf is not null and length(v_cpf) <> 11 then
    raise exception 'CPF deve ter 11 dígitos';
  end if;

  update public.pacientes
     set nome = btrim(p_nome),
         data_nascimento = p_data_nascimento,
         cpf = v_cpf,
         contato_emergencia = nullif(btrim(p_contato_emergencia), '')
   where id = p_paciente_id;

  if not found then
    raise exception 'Paciente não encontrada';
  end if;

  insert into public.audit_log (ator_id, acao, entidade, entidade_id)
  values (auth.uid(), 'paciente.atualizado', 'pacientes', p_paciente_id);
end;
$$;

-- Uma linha por paciente da clínica, com as médicas ativas agregadas. Busca
-- por nome (ilike) ou por prefixo de CPF quando o termo tem dígitos.
create or replace function public.pacientes_da_secretaria(p_busca text default null)
returns table (
  paciente_id uuid,
  nome text,
  data_nascimento date,
  cpf text,
  contato_emergencia text,
  tem_acesso boolean,
  medicas text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_busca text;
  v_digitos text;
begin
  if not public.is_secretaria() then
    raise exception 'Apenas a secretaria lista as pacientes da clínica';
  end if;

  v_busca := nullif(btrim(coalesce(p_busca, '')), '');
  v_digitos := nullif(regexp_replace(coalesce(v_busca, ''), '\D', '', 'g'), '');

  return query
    select
      p.id,
      p.nome,
      p.data_nascimento,
      p.cpf,
      p.contato_emergencia,
      p.profile_id is not null,
      coalesce(vin.medicas, '')
    from public.pacientes p
    left join lateral (
      select string_agg(pr.nome, ', ' order by pr.nome) as medicas
      from public.vinculos v
      join public.profiles pr on pr.id = v.medica_id
      where v.paciente_id = p.id
        and v.ativo
    ) vin on true
    where v_busca is null
       or p.nome ilike '%' || v_busca || '%'
       or (v_digitos is not null and p.cpf like v_digitos || '%')
    order by p.nome
    limit 200;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select proname from pg_proc where proname in ('is_secretaria','criar_paciente_pela_secretaria','atualizar_paciente_pela_secretaria','pacientes_da_secretaria') order by 1;"
```

Saída esperada: quatro linhas.

---

### Etapa 4 — Cenários de RLS no smoke

**Depende de:** Etapa 3
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

**O que fazer:** duas edições — acrescentar a fixture de secretaria ao `do $$` inicial e anexar os cenários 28–32 antes do `rollback;` final.

**Edição 1 — fixtures.** No bloco que começa na linha 21, adicione a declaração da variável logo depois de `v_medica_b uuid := gen_random_uuid();`:

```sql
  v_secretaria uuid := gen_random_uuid();
```

Ainda no mesmo bloco, substitua o trecho que vai de `perform set_config('request.jwt.claims', '{"role":"service_role"}', true);` até `perform set_config('request.jwt.claims', '', true);` por:

```sql
  insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data)
  values (v_secretaria, 'secretaria@smoke.test', crypt('smoke', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"nome":"Sec"}'::jsonb);

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.promover_para_medica(v_medica_a, 'Dra A');
  perform public.promover_para_medica(v_medica_b, 'Dra B');
  perform public.promover_para_secretaria(v_secretaria, 'Sec');
  perform set_config('request.jwt.claims', '', true);
```

E substitua o `insert into smoke_ids values` do fim do bloco por:

```sql
  insert into smoke_ids values
    ('medica_a', v_medica_a),
    ('medica_b', v_medica_b),
    ('secretaria', v_secretaria),
    ('paciente_user', v_paciente),
    ('paciente_row', v_paciente_row),
    ('gestacao', v_gestacao);
```

**Edição 2 — cenários.** Insira o bloco abaixo imediatamente antes da linha `rollback;` (hoje linha 1129):

```sql
-- ---------------------------------------------------------------------------
-- 28) Secretaria lê a clínica inteira, mas não alcança o prontuário
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_gestacao uuid := (select value from smoke_ids where key = 'gestacao');
  v_count int;
begin
  perform pg_temp.as_user(v_secretaria);

  select count(*) into v_count from public.pacientes where id = v_paciente;
  if v_count <> 1 then
    raise exception 'FAIL: secretaria não leu paciente sem vínculo com ela';
  end if;

  select count(*) into v_count from public.vinculos where paciente_id = v_paciente;
  if v_count <> 1 then
    raise exception 'FAIL: secretaria não leu o vínculo da paciente';
  end if;

  select count(*) into v_count from public.profiles where papel = 'medica';
  if v_count <> 2 then
    raise exception 'FAIL: secretaria deveria listar as médicas para o vínculo';
  end if;

  select count(*) into v_count from public.gestacoes where id = v_gestacao;
  if v_count <> 0 then
    raise exception 'FAIL: secretaria leu gestação (esperado 0)';
  end if;

  select count(*) into v_count from public.documentos where gestacao_id = v_gestacao;
  if v_count <> 0 then
    raise exception 'FAIL: secretaria leu documentos (esperado 0)';
  end if;

  perform pg_temp.back_to_postgres();
  raise notice 'OK 28: secretaria lê cadastro da clínica e não lê prontuário';
end $$;

-- ---------------------------------------------------------------------------
-- 29) Secretaria não escreve direto em pacientes nem em vinculos
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_rows int;
begin
  perform pg_temp.as_user(v_secretaria);

  update public.pacientes set contato_emergencia = 'por fora' where id = v_paciente;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: secretaria atualizou paciente por fora da RPC';
  end if;

  delete from public.pacientes where id = v_paciente;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: secretaria apagou paciente';
  end if;

  begin
    insert into public.vinculos (paciente_id, medica_id, papel)
    values (v_paciente, v_medica_a, 'medicina_fetal');
    raise exception 'FAIL: secretaria inseriu vínculo direto';
  exception when insufficient_privilege then
    null;
  end;

  perform pg_temp.back_to_postgres();
  raise notice 'OK 29: escrita da secretaria só pela RPC';
end $$;

-- ---------------------------------------------------------------------------
-- 30) criar_paciente_pela_secretaria: vínculo, normalização de CPF e gates
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova uuid;
  v_cpf text;
  v_count int;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform public.criar_paciente_pela_secretaria('Invasora', v_medica_a);
    raise exception 'FAIL: médica executou a RPC da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria cadastra pacientes por aqui' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  begin
    perform public.criar_paciente_pela_secretaria('Sem Médica', gen_random_uuid());
    raise exception 'FAIL: RPC aceitou médica inexistente';
  exception when others then
    if sqlerrm <> 'Médica responsável inválida' then
      raise;
    end if;
  end;

  begin
    perform public.criar_paciente_pela_secretaria(
      'CPF Curto', v_medica_a, 'obstetra', null, '1234567890'
    );
    raise exception 'FAIL: RPC aceitou CPF de 10 dígitos';
  exception when others then
    if sqlerrm <> 'CPF deve ter 11 dígitos' then
      raise;
    end if;
  end;

  v_nova := public.criar_paciente_pela_secretaria(
    'Nova Gestante', v_medica_a, 'obstetra', date '1995-04-10', '123.456.789-00'
  );

  select cpf into v_cpf from public.pacientes where id = v_nova;
  if v_cpf <> '12345678900' then
    raise exception 'FAIL: CPF não foi normalizado (veio %)', v_cpf;
  end if;

  select count(*) into v_count
  from public.vinculos
  where paciente_id = v_nova and medica_id = v_medica_a and ativo;
  if v_count <> 1 then
    raise exception 'FAIL: cadastro não criou o vínculo com a médica';
  end if;

  select count(*) into v_count
  from public.audit_log
  where entidade = 'pacientes' and entidade_id = v_nova and acao = 'paciente.criado';
  if v_count <> 1 then
    raise exception 'FAIL: cadastro não foi auditado';
  end if;

  perform pg_temp.back_to_postgres();

  insert into smoke_ids values ('paciente_nova', v_nova);
  raise notice 'OK 30: cadastro pela secretaria cria vínculo, normaliza CPF e audita';
end $$;

-- ---------------------------------------------------------------------------
-- 31) atualizar_paciente_pela_secretaria: edição, gate e CPF duplicado
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova uuid := (select value from smoke_ids where key = 'paciente_nova');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_nome text;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform public.atualizar_paciente_pela_secretaria(v_nova, 'Renomeada');
    raise exception 'FAIL: médica executou a edição da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria edita o cadastro por aqui' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  perform public.atualizar_paciente_pela_secretaria(
    v_nova, '  Nova Gestante Silva  ', date '1995-04-10', '98765432100'
  );

  select nome into v_nome from public.pacientes where id = v_nova;
  if v_nome <> 'Nova Gestante Silva' then
    raise exception 'FAIL: nome não foi salvo/trimado (veio %)', v_nome;
  end if;

  begin
    perform public.atualizar_paciente_pela_secretaria(gen_random_uuid(), 'Fantasma');
    raise exception 'FAIL: edição de paciente inexistente passou';
  exception when others then
    if sqlerrm <> 'Paciente não encontrada' then
      raise;
    end if;
  end;

  perform pg_temp.back_to_postgres();

  -- O probe precisa de exception próprio: capturar unique_violation no nível
  -- do DO faria rollback de tudo que o cenário gravou, inclusive o CPF da
  -- paciente nova que o cenário 32 busca.
  begin
    update public.pacientes set cpf = '98765432100' where id = v_paciente;
    raise exception 'FAIL: unique(cpf) aceitou duplicata';
  exception when unique_violation then
    null;
  end;

  raise notice 'OK 31: edição pela secretaria valida gate, trim e unicidade de CPF';
end $$;

-- ---------------------------------------------------------------------------
-- 32) pacientes_da_secretaria: agregação, busca e gate
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_count int;
  v_medicas text;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform public.pacientes_da_secretaria(null);
    raise exception 'FAIL: médica listou pela RPC da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria lista as pacientes da clínica' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  select count(*) into v_count from public.pacientes_da_secretaria(null);
  if v_count <> 2 then
    raise exception 'FAIL: listagem deveria trazer as 2 pacientes (veio %)', v_count;
  end if;

  select medicas into v_medicas
  from public.pacientes_da_secretaria('Nova Gestante');
  if v_medicas <> 'Dra A' then
    raise exception 'FAIL: médica responsável não agregou (veio %)', v_medicas;
  end if;

  select count(*) into v_count from public.pacientes_da_secretaria('987654');
  if v_count <> 1 then
    raise exception 'FAIL: busca por prefixo de CPF falhou (veio %)', v_count;
  end if;

  select count(*) into v_count from public.pacientes_da_secretaria('Zzz');
  if v_count <> 0 then
    raise exception 'FAIL: busca sem correspondência trouxe linhas';
  end if;

  perform pg_temp.back_to_postgres();
  raise notice 'OK 32: listagem agrega médicas, busca por nome e CPF, e respeita o papel';
end $$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Saída esperada: os avisos `OK 1` a `OK 32`, nenhum `FAIL`, encerrando em `ROLLBACK`.

---

### Etapa 5 — Regerar os tipos do banco

**Depende de:** Etapa 4
**Arquivos:** `~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` (regerar)

**O que fazer:** regerar os tipos a partir do banco local. O stack precisa estar de pé — depois da Etapa 4 ele está; se não estiver, rode `npx supabase start` antes (não encadeie os dois comandos com `&&`: `supabase start` falha quando o stack já está rodando).

**Código:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase gen types typescript --local > ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

**Validação:**

```bash
grep -n "pacientes_da_secretaria\|criar_paciente_pela_secretaria\|atualizar_paciente_pela_secretaria" ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

Saída esperada: as três funções aparecem na seção `Functions`.

---

### Etapa 6 — Helpers de formato

**Depende de:** Etapa 5
**Arquivos:** `src/app/core/formato/cpf.ts` (criar), `src/app/core/formato/data.ts` (criar)

`cpf.ts`:

```ts
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function formatarCpf(valor: string | null | undefined): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 11) {
    return digitos;
  }
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}
```

`data.ts`:

```ts
// `date` do Postgres é dia civil: converter por toISOString() joga o dia para
// trás em fusos negativos, que é o caso do Brasil.
export function paraDataIso(data: Date | null): string | null {
  if (data === null) {
    return null;
  }
  const mes = `${data.getMonth() + 1}`.padStart(2, '0');
  const dia = `${data.getDate()}`.padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function deDataIso(valor: string | null): Date | null {
  if (!valor) {
    return null;
  }
  const [ano, mes, dia] = valor.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export function formatarData(valor: string | null): string {
  const data = deDataIso(valor);
  return data === null ? '' : data.toLocaleDateString('pt-BR');
}
```

**Validação:**

```bash
npm run typecheck
```

Sem erro.

---

### Etapa 7 — `PacientesService`

**Depende de:** Etapa 6
**Arquivos:** `src/app/core/pacientes/pacientes.service.ts` (criar)

**O que fazer:** serviço root que encapsula as três RPCs, o `select` de uma paciente e o `select` das médicas. Retorno no padrão do `AuthService`: união discriminada por `ok`, nunca exceção para o componente.

**Código:**

```ts
import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaLista = Database['public']['Functions']['pacientes_da_secretaria']['Returns'][number];
type PapelVinculo = Database['public']['Enums']['papel_vinculo'];

export type PacienteLista = LinhaLista;

export interface Medica {
  id: string;
  nome: string;
}

export interface PacienteDetalhe {
  id: string;
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  contatoEmergencia: string | null;
}

export interface DadosPaciente {
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  contatoEmergencia: string | null;
}

export interface DadosNovaPaciente extends DadosPaciente {
  medicaId: string;
  papelVinculo: PapelVinculo;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// Os Args gerados usam `p_x?: string`; undefined omite a chave do payload e a
// RPC aplica o `default null` no banco.
function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC; os demais códigos viram texto legível aqui.
function mensagemDeErro(erro: PostgrestError): string {
  if (erro.code === '23505') {
    return 'Já existe uma paciente cadastrada com este CPF.';
  }
  if (erro.code === '23514') {
    return 'CPF deve ter 11 dígitos.';
  }
  if (erro.code === 'P0001') {
    return erro.message;
  }
  return ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listar(busca: string): Promise<Resultado<PacienteLista[]>> {
    const termo = busca.trim();
    const { data, error } = await this.supabase.rpc('pacientes_da_secretaria', {
      p_busca: termo === '' ? undefined : termo,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async listarMedicas(): Promise<Resultado<Medica[]>> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, nome')
      .eq('papel', 'medica')
      .order('nome');
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async buscarPorId(id: string): Promise<Resultado<PacienteDetalhe>> {
    const { data, error } = await this.supabase
      .from('pacientes')
      .select('id, nome, data_nascimento, cpf, contato_emergencia')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    if (!data) {
      return { ok: false, mensagem: 'Paciente não encontrada.' };
    }
    return {
      ok: true,
      valor: {
        id: data.id,
        nome: data.nome,
        dataNascimento: data.data_nascimento,
        cpf: data.cpf,
        contatoEmergencia: data.contato_emergencia,
      },
    };
  }

  async criar(dados: DadosNovaPaciente): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('criar_paciente_pela_secretaria', {
      p_nome: dados.nome,
      p_medica_id: dados.medicaId,
      p_papel_vinculo: dados.papelVinculo,
      p_data_nascimento: opcional(dados.dataNascimento),
      p_cpf: opcional(dados.cpf),
      p_contato_emergencia: opcional(dados.contatoEmergencia),
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async atualizar(id: string, dados: DadosPaciente): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('atualizar_paciente_pela_secretaria', {
      p_paciente_id: id,
      p_nome: dados.nome,
      p_data_nascimento: opcional(dados.dataNascimento),
      p_cpf: opcional(dados.cpf),
      p_contato_emergencia: opcional(dados.contatoEmergencia),
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }
}
```

**Validação:**

```bash
npm run typecheck
```

Sem erro. Se `data` de `criar` for tipado como `unknown`, a Etapa 5 não foi aplicada.

---

### Etapa 8 — Tela de lista com busca

**Depende de:** Etapa 7
**Arquivos:** `src/app/pages/pacientes/lista/pacientes-lista.ts`, `pacientes-lista.html`, `pacientes-lista.scss` (criar)

**O que fazer:** tabela PrimeNG com busca acionada por submit (sem debounce — a busca vai ao banco) e botões de cadastrar/editar.

`pacientes-lista.ts`:

```ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { formatarData } from '../../../core/formato/data';
import { formatarCpf } from '../../../core/formato/cpf';
import { PacienteLista, PacientesService } from '../../../core/pacientes/pacientes.service';

@Component({
  imports: [
    ButtonModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    TagModule,
  ],
  selector: 'app-pacientes-lista',
  styleUrl: './pacientes-lista.scss',
  templateUrl: './pacientes-lista.html',
})
export class PacientesLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pacientes = inject(PacientesService);
  private readonly router = inject(Router);

  protected readonly linhas = signal<PacienteLista[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = this.fb.group({ busca: '' });

  protected readonly formatarCpf = formatarCpf;
  protected readonly formatarData = formatarData;

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.pacientes.listar(this.formulario.getRawValue().busca);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.linhas.set([]);
        return;
      }
      this.linhas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async limpar(): Promise<void> {
    this.formulario.setValue({ busca: '' });
    await this.carregar();
  }

  protected abrir(linha: PacienteLista): void {
    void this.router.navigate(['/pacientes', linha.paciente_id]);
  }
}
```

`pacientes-lista.html`:

```html
<section class="pagina">
  <header class="cabecalho">
    <div>
      <p class="eyebrow">Administração</p>
      <h1>Pacientes</h1>
    </div>
    <p-button label="Cadastrar paciente" icon="pi pi-plus" routerLink="/pacientes/nova" />
  </header>

  <form class="busca" [formGroup]="formulario" (ngSubmit)="carregar()">
    <input
      pInputText
      type="search"
      formControlName="busca"
      placeholder="Buscar por nome ou CPF"
      aria-label="Buscar por nome ou CPF"
    />
    <p-button type="submit" label="Buscar" icon="pi pi-search" [loading]="carregando()" />
    <p-button type="button" label="Limpar" severity="secondary" (onClick)="limpar()" />
  </form>

  @if (erro()) {
  <p-message severity="error" [text]="erro()!" />
  }

  <p-table
    [value]="linhas()"
    [loading]="carregando()"
    dataKey="paciente_id"
    [rows]="20"
    [paginator]="true"
  >
    <ng-template #header>
      <tr>
        <th>Nome</th>
        <th>CPF</th>
        <th>Nascimento</th>
        <th>Médica responsável</th>
        <th>Acesso ao app</th>
        <th></th>
      </tr>
    </ng-template>

    <ng-template #body let-linha>
      <tr>
        <td>{{ linha.nome }}</td>
        <td>{{ formatarCpf(linha.cpf) || '—' }}</td>
        <td>{{ formatarData(linha.data_nascimento) || '—' }}</td>
        <td>{{ linha.medicas || '—' }}</td>
        <td>
          <p-tag
            [value]="linha.tem_acesso ? 'Ativo' : 'Sem acesso'"
            [severity]="linha.tem_acesso ? 'success' : 'warn'"
          />
        </td>
        <td class="acoes">
          <p-button
            label="Editar"
            icon="pi pi-pencil"
            severity="secondary"
            [text]="true"
            (onClick)="abrir(linha)"
          />
        </td>
      </tr>
    </ng-template>

    <ng-template #emptymessage>
      <tr>
        <td colspan="6" class="vazio">Nenhuma paciente encontrada.</td>
      </tr>
    </ng-template>
  </p-table>
</section>
```

`pacientes-lista.scss`:

```scss
.pagina {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.cabecalho {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--aconchego-link);
}

h1 {
  margin: 0.25rem 0 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--aconchego-texto-primario);
}

.busca {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;

  input {
    flex: 1;
    min-width: 14rem;
  }
}

.acoes {
  text-align: right;
  white-space: nowrap;
}

.vazio {
  padding: 1.5rem;
  text-align: center;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}
```

**Validação:** coberta pela Etapa 14.

---

### Etapa 9 — Tela de formulário (cadastro e edição)

**Depende de:** Etapa 7
**Arquivos:** `src/app/pages/pacientes/formulario/paciente-formulario.ts`, `paciente-formulario.html`, `paciente-formulario.scss` (criar)

**O que fazer:** um componente serve às duas rotas. Com `:id` na URL é edição (campo de médica escondido, pois vínculo é outra fatia); sem `:id` é cadastro (médica obrigatória).

`paciente-formulario.ts`:

```ts
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputMaskModule } from 'primeng/inputmask';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { deDataIso, paraDataIso } from '../../../core/formato/data';
import { Medica, PacientesService } from '../../../core/pacientes/pacientes.service';

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    InputMaskModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    RouterLink,
    SelectModule,
  ],
  selector: 'app-paciente-formulario',
  styleUrl: './paciente-formulario.scss',
  templateUrl: './paciente-formulario.html',
})
export class PacienteFormulario implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pacientes = inject(PacientesService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  protected readonly id = signal<string | null>(this.rota.snapshot.paramMap.get('id'));
  protected readonly edicao = computed(() => this.id() !== null);
  protected readonly medicas = signal<Medica[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly hoje = new Date();

  protected readonly papeisVinculo = [
    { rotulo: 'Obstetra', valor: 'obstetra' as const },
    { rotulo: 'Medicina fetal', valor: 'medicina_fetal' as const },
  ];

  protected readonly formulario = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    medicaId: [''],
    papelVinculo: ['obstetra' as 'obstetra' | 'medicina_fetal'],
    dataNascimento: [null as Date | null],
    cpf: [''],
    contatoEmergencia: [''],
  });

  async ngOnInit(): Promise<void> {
    try {
      if (this.edicao()) {
        const resultado = await this.pacientes.buscarPorId(this.id()!);
        if (!resultado.ok) {
          this.erro.set(resultado.mensagem);
          return;
        }
        this.formulario.patchValue({
          nome: resultado.valor.nome,
          dataNascimento: deDataIso(resultado.valor.dataNascimento),
          cpf: resultado.valor.cpf ?? '',
          contatoEmergencia: resultado.valor.contatoEmergencia ?? '',
        });
        return;
      }

      this.formulario.controls.medicaId.addValidators(Validators.required);
      this.formulario.controls.medicaId.updateValueAndValidity();

      const resultado = await this.pacientes.listarMedicas();
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.medicas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.salvando()) {
      return;
    }
    this.erro.set(null);
    this.salvando.set(true);
    try {
      const bruto = this.formulario.getRawValue();
      const comuns = {
        nome: bruto.nome.trim(),
        dataNascimento: paraDataIso(bruto.dataNascimento),
        cpf: bruto.cpf.trim() === '' ? null : bruto.cpf.trim(),
        contatoEmergencia:
          bruto.contatoEmergencia.trim() === '' ? null : bruto.contatoEmergencia.trim(),
      };

      const resultado = this.edicao()
        ? await this.pacientes.atualizar(this.id()!, comuns)
        : await this.pacientes.criar({
            ...comuns,
            medicaId: bruto.medicaId,
            papelVinculo: bruto.papelVinculo,
          });

      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.router.navigate(['/pacientes']);
    } finally {
      this.salvando.set(false);
    }
  }
}
```

`paciente-formulario.html`:

```html
<section class="cartao-vidro cartao">
  <p class="eyebrow">Administração</p>
  <h1>{{ edicao() ? 'Editar paciente' : 'Cadastrar paciente' }}</h1>

  @if (carregando()) {
  <p class="aviso">Carregando…</p>
  } @else {
  <form class="formulario" [formGroup]="formulario" (ngSubmit)="salvar()">
    <label for="nome">Nome completo</label>
    <input id="nome" type="text" pInputText formControlName="nome" autocomplete="off" />

    @if (!edicao()) {
    <label for="medica">Médica responsável</label>
    <p-select
      inputId="medica"
      formControlName="medicaId"
      [options]="medicas()"
      optionLabel="nome"
      optionValue="id"
      placeholder="Selecione a médica"
    />

    <label for="papel">Tipo de vínculo</label>
    <p-select
      inputId="papel"
      formControlName="papelVinculo"
      [options]="papeisVinculo"
      optionLabel="rotulo"
      optionValue="valor"
    />
    }

    <label for="nascimento">Data de nascimento (opcional)</label>
    <p-datepicker
      inputId="nascimento"
      formControlName="dataNascimento"
      dateFormat="dd/mm/yy"
      [showIcon]="true"
      [maxDate]="hoje"
    />

    <label for="cpf">CPF (opcional)</label>
    <p-inputmask
      inputId="cpf"
      formControlName="cpf"
      mask="999.999.999-99"
      [unmask]="true"
      placeholder="000.000.000-00"
    />

    <label for="contato">Contato de emergência (opcional)</label>
    <input id="contato" type="text" pInputText formControlName="contatoEmergencia" />

    @if (erro()) {
    <p-message severity="error" [text]="erro()!" />
    }

    <div class="acoes">
      <p-button
        type="submit"
        [label]="edicao() ? 'Salvar' : 'Cadastrar'"
        [loading]="salvando()"
        [disabled]="formulario.invalid || salvando()"
      />
      <p-button type="button" label="Cancelar" severity="secondary" routerLink="/pacientes" />
    </div>
  </form>
  }
</section>
```

`paciente-formulario.scss`:

```scss
.cartao {
  padding: 2rem;
  max-width: 34rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--aconchego-link);
}

h1 {
  margin: 0.25rem 0 1.25rem;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--aconchego-texto-primario);
}

.aviso {
  margin: 0;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.formulario {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  label {
    margin-top: 0.75rem;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--aconchego-texto-secundario);
  }
}

.acoes {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.5rem;
}
```

**Validação:** coberta pela Etapa 14.

---

### Etapa 10 — Rotas e sidebar

**Depende de:** Etapas 8 e 9
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.ts` (editar), `src/app/layout/shell/shell.html` (editar)

**O que fazer:** registrar as rotas sob o shell com `papelGuard('secretaria')` e mostrar o item de menu só para a secretaria.

Em `src/app/app.routes.ts`, troque o import da primeira linha de guards e o array `children` do path `''`:

```ts
import { Routes } from '@angular/router';
import { deslogadoGuard, papelGuard, sessaoGuard } from './core/auth/auth.guard';
```

```ts
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./pages/inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'pacientes',
        canActivate: [papelGuard('secretaria')],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/pacientes/lista/pacientes-lista').then((m) => m.PacientesLista),
          },
          {
            path: 'nova',
            loadComponent: () =>
              import('./pages/pacientes/formulario/paciente-formulario').then(
                (m) => m.PacienteFormulario,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./pages/pacientes/formulario/paciente-formulario').then(
                (m) => m.PacienteFormulario,
              ),
          },
        ],
      },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
```

Em `src/app/layout/shell/shell.ts`, acrescente a exposição do papel logo depois da linha `protected readonly perfil = this.auth.perfil;`:

```ts
  protected readonly papel = this.auth.papel;
```

Em `src/app/layout/shell/shell.html`, substitua o bloco `<nav>` por:

```html
<nav>
  <a routerLink="/inicio" routerLinkActive="ativo">
    <i class="pi pi-home" aria-hidden="true"></i>
    <span>Início</span>
  </a>
  @if (papel() === 'secretaria') {
  <a routerLink="/pacientes" routerLinkActive="ativo">
    <i class="pi pi-users" aria-hidden="true"></i>
    <span>Pacientes</span>
  </a>
  }
</nav>
```

**Validação:**

```bash
npm run lint && npm run typecheck && npm run build
```

Os três sem erro; o build gera chunks separados para `pacientes-lista` e `paciente-formulario`.

---

### Etapa 11 — Ajustar o texto de `/inicio`

**Depende de:** Etapa 10
**Arquivos:** `src/app/pages/inicio/inicio.html` (editar)

**O que fazer:** a frase atual promete pacientes "na próxima fase" — passou a ser falsa. Substitua a linha `<p class="aviso">…</p>` por:

```html
<p class="aviso">Convites, vínculos e equipe chegam nas próximas fatias da W2.</p>
```

**Validação:**

```bash
grep -n "próxima fase do roadmap" src/app/pages/inicio/inicio.html
```

Saída esperada: vazia.

---

### Etapa 12 — Testes dos helpers

**Depende de:** Etapa 6
**Arquivos:** `src/app/core/formato/cpf.spec.ts`, `src/app/core/formato/data.spec.ts` (criar)

`cpf.spec.ts`:

```ts
import { formatarCpf, somenteDigitos } from './cpf';

describe('formato de CPF', () => {
  it('mantém só os dígitos', () => {
    expect(somenteDigitos('123.456.789-00')).toBe('12345678900');
    expect(somenteDigitos(null)).toBe('');
  });

  it('formata CPF completo', () => {
    expect(formatarCpf('12345678900')).toBe('123.456.789-00');
  });

  it('devolve os dígitos crus quando não há 11', () => {
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCpf(null)).toBe('');
  });
});
```

`data.spec.ts`:

```ts
import { deDataIso, formatarData, paraDataIso } from './data';

describe('formato de data', () => {
  it('converte Date para o dia civil sem deslocar o fuso', () => {
    expect(paraDataIso(new Date(1995, 3, 10))).toBe('1995-04-10');
    expect(paraDataIso(null)).toBeNull();
  });

  it('reconstrói a data local a partir do ISO', () => {
    const data = deDataIso('1995-04-10');
    expect(data?.getFullYear()).toBe(1995);
    expect(data?.getMonth()).toBe(3);
    expect(data?.getDate()).toBe(10);
  });

  it('formata em pt-BR e tolera nulo', () => {
    expect(formatarData('1995-04-10')).toBe('10/04/1995');
    expect(formatarData(null)).toBe('');
  });
});
```

**Validação:**

```bash
npm test
```

Todos os testes passam.

---

### Etapa 13 — Testes do `PacientesService`

**Depende de:** Etapa 7
**Arquivos:** `src/app/core/pacientes/pacientes.service.spec.ts` (criar)

**Código:**

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { PacientesService } from './pacientes.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null });
  return {
    rpc,
    maybeSingle,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle,
          order: vi
            .fn()
            .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
        }),
      }),
    }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): PacientesService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(PacientesService);
}

describe('PacientesService', () => {
  it('manda undefined quando a busca está vazia', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('   ');

    expect(cliente.rpc).toHaveBeenCalledWith('pacientes_da_secretaria', { p_busca: undefined });
  });

  it('repassa o termo trimado', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('  Maria ');

    expect(cliente.rpc).toHaveBeenCalledWith('pacientes_da_secretaria', { p_busca: 'Maria' });
  });

  it('traduz CPF duplicado', async () => {
    const cliente = clienteFalso({ error: { code: '23505', message: 'duplicate key' } });
    const service = criar(cliente);

    const resultado = await service.criar({
      nome: 'Maria',
      medicaId: 'm1',
      papelVinculo: 'obstetra',
      dataNascimento: null,
      cpf: '12345678900',
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Já existe uma paciente cadastrada com este CPF.',
    });
  });

  it('repassa a mensagem das RPCs (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Médica responsável inválida' },
    });
    const service = criar(cliente);

    const resultado = await service.atualizar('p1', {
      nome: 'Maria',
      dataNascimento: null,
      cpf: null,
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({ ok: false, mensagem: 'Médica responsável inválida' });
  });

  it('traduz violação de check em mensagem de CPF', async () => {
    const cliente = clienteFalso({ error: { code: '23514', message: 'check violation' } });
    const service = criar(cliente);

    const resultado = await service.atualizar('p1', {
      nome: 'Maria',
      dataNascimento: null,
      cpf: '123',
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({ ok: false, mensagem: 'CPF deve ter 11 dígitos.' });
  });

  it('devolve erro quando a paciente não existe', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.buscarPorId('inexistente');

    expect(resultado).toEqual({ ok: false, mensagem: 'Paciente não encontrada.' });
  });
});
```

**Validação:**

```bash
npm test
```

Todos passam.

---

### Etapa 14 — Testes das telas

**Depende de:** Etapas 8 e 9
**Arquivos:** `src/app/pages/pacientes/lista/pacientes-lista.spec.ts`, `src/app/pages/pacientes/formulario/paciente-formulario.spec.ts` (criar)

`pacientes-lista.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacientesLista } from './pacientes-lista';

function montar(listar: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [PacientesLista],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: PacientesService, useValue: { listar } },
    ],
  });
  return TestBed.createComponent(PacientesLista);
}

const linha = {
  paciente_id: 'p1',
  nome: 'Maria Souza',
  data_nascimento: '1995-04-10',
  cpf: '12345678900',
  contato_emergencia: null,
  tem_acesso: true,
  medicas: 'Dra A',
};

describe('PacientesLista', () => {
  it('mostra as pacientes com CPF e data formatados', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [linha] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Maria Souza');
    expect(texto).toContain('123.456.789-00');
    expect(texto).toContain('10/04/1995');
    expect(texto).toContain('Dra A');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem permissão.' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem permissão.');
  });

  it('avisa quando não há resultado', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma paciente encontrada',
    );
  });
});
```

`paciente-formulario.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacienteFormulario } from './paciente-formulario';

// salvar() navega para /pacientes após o sucesso; sem a rota registrada o
// Router rejeita a navegação e derruba o teste.
class PaginaPacientes {}

function montar(servico: Partial<PacientesService>, id: string | null) {
  TestBed.configureTestingModule({
    imports: [PacienteFormulario],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'pacientes', component: PaginaPacientes }]),
      { provide: PacientesService, useValue: servico },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => id } } },
      },
    ],
  });
  return TestBed.createComponent(PacienteFormulario);
}

interface Interno {
  formulario: {
    setValue(v: unknown): void;
    patchValue(v: unknown): void;
    invalid: boolean;
  };
  salvar(): Promise<void>;
}

describe('PacienteFormulario', () => {
  it('exige nome e médica no cadastro', async () => {
    const fixture = montar(
      {
        listarMedicas: vi
          .fn()
          .mockResolvedValue({ ok: true, valor: [{ id: 'm1', nome: 'Dra A' }] }),
      },
      null,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(componente.formulario.invalid).toBe(true);
  });

  it('envia CPF sem máscara e data como dia civil', async () => {
    const criar = vi.fn().mockResolvedValue({ ok: true, valor: 'novo-id' });
    const fixture = montar(
      {
        criar,
        listarMedicas: vi
          .fn()
          .mockResolvedValue({ ok: true, valor: [{ id: 'm1', nome: 'Dra A' }] }),
      },
      null,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.patchValue({
      nome: '  Maria Souza ',
      medicaId: 'm1',
      papelVinculo: 'obstetra',
      dataNascimento: new Date(1995, 3, 10),
      cpf: '12345678900',
      contatoEmergencia: '',
    });

    await componente.salvar();

    expect(criar).toHaveBeenCalledWith({
      nome: 'Maria Souza',
      dataNascimento: '1995-04-10',
      cpf: '12345678900',
      contatoEmergencia: null,
      medicaId: 'm1',
      papelVinculo: 'obstetra',
    });
  });

  it('mostra o erro devolvido na edição', async () => {
    const fixture = montar(
      {
        buscarPorId: vi.fn().mockResolvedValue({
          ok: true,
          valor: {
            id: 'p1',
            nome: 'Maria',
            dataNascimento: null,
            cpf: null,
            contatoEmergencia: null,
          },
        }),
        atualizar: vi.fn().mockResolvedValue({
          ok: false,
          mensagem: 'Já existe uma paciente cadastrada com este CPF.',
        }),
      },
      'p1',
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.salvar();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Já existe uma paciente cadastrada com este CPF.',
    );
  });
});
```

**Validação:**

```bash
npm test
```

Todos passam, incluindo os já existentes de `auth` e `login`.

---

### Etapa 15 — Atualizar documentação

**Depende de:** Etapa 14
**Arquivos:** `docs/roadmap-web.md` (editar)

**O que fazer:** substitua a seção `### W2 — Administração da clínica (secretaria)` por:

```markdown
### W2 — Administração da clínica (secretaria)

- [x] RLS de escopo `secretaria`: `is_secretaria()` + policies de leitura em `pacientes`, `profiles` e `vinculos` (migration no `prenatalapp`)
- [x] Pacientes: lista com busca por nome/CPF, cadastro com médica responsável e edição — escrita fechada nas RPCs `criar_paciente_pela_secretaria` / `atualizar_paciente_pela_secretaria`
- [x] CPF normalizado para 11 dígitos com `check constraint` (migração dos dados existentes + ajuste de `criar_paciente_com_convite`)
- [x] Cenários 28–32 no `supabase/tests/rls_smoke.sql`
- [ ] Convites: emitir (inclusive em lote), reemitir, revogar, acompanhar status sobre `convites_status`.
- [ ] Vínculos: transferir, inativar, segundo vínculo (medicina fetal).
- [ ] Equipe: gerenciar usuários `medica`/`secretaria`.
```

**Validação:**

```bash
npm run format:check
```

Sem erro de formatação.

---

## 7. Testes

| Arquivo                                                                                   | Casos                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/tests/rls_smoke.sql` cenário 28                                                 | Secretaria lê pacientes, vínculos e profiles de médicas; **não** lê gestações nem documentos                                                                |
| cenário 29                                                                                | `update`/`delete` direto em `pacientes` e `insert` em `vinculos` são bloqueados para a secretaria                                                           |
| cenário 30                                                                                | Médica não executa a RPC da secretaria; médica inexistente é rejeitada; CPF de 10 dígitos é rejeitado; cadastro válido normaliza CPF, cria vínculo e audita |
| cenário 31                                                                                | Médica não executa a edição; nome é trimado; paciente inexistente falha; `unique(cpf)` barra duplicata após normalização                                    |
| cenário 32                                                                                | Médica não lista pela RPC; agregação da médica responsável; busca por nome e por prefixo de CPF; termo sem correspondência devolve zero                     |
| `src/app/core/formato/cpf.spec.ts`                                                        | `somenteDigitos` com máscara e nulo; `formatarCpf` completo, parcial e nulo                                                                                 |
| `src/app/core/formato/data.spec.ts`                                                       | `paraDataIso` sem deslocamento de fuso; `deDataIso` reconstrói local; `formatarData` pt-BR e nulo                                                           |
| `src/app/core/pacientes/pacientes.service.spec.ts`                                        | Busca vazia vira `null`; termo é trimado; `23505` → CPF duplicado; `23514` → CPF inválido; `P0001` repassa a mensagem; paciente inexistente                 |
| `src/app/pages/pacientes/lista/pacientes-lista.spec.ts`                                   | Linhas renderizadas com CPF e data formatados; mensagem de erro; estado vazio                                                                               |
| `src/app/pages/pacientes/formulario/paciente-formulario.spec.ts`                          | Formulário inválido no cadastro; CPF sem máscara e data como dia civil no payload; erro de edição renderizado                                               |
| `src/app/core/auth/*.spec.ts`, `src/app/pages/login/login.spec.ts`, `src/app/app.spec.ts` | Já existem — não devem quebrar                                                                                                                              |

## 8. Riscos e casos de borda

- **Normalização de CPF pode falhar por duplicata.** Se dois cadastros diferirem só na pontuação, o `update` da Etapa 2 estoura `unique_violation` e a migration para. É por isso que a Etapa 2 traz uma consulta de pré-checagem; resolva a duplicata manualmente antes de rodar.
- **CPF incompleto legado.** Um cadastro com menos de 11 dígitos faz a `check constraint` falhar no `alter table`. A mesma pré-checagem detecta.
- **O mobile quebraria sem o ajuste da RPC.** `criar_paciente_com_convite` é alterada na mesma migration da constraint, de propósito: separá-las deixaria uma janela em que o app Flutter não cadastra. A alteração é retrocompatível — a assinatura não muda, só a normalização interna.
- **`revoke execute` está proibido.** `init_schema.sql:386-389` documenta segfault no PG17/ARM64 da imagem local quando `authenticated` chama function com execute revogado. Os gates das RPCs novas são internos (`is_secretaria()`), como no resto do projeto.
- **Paciente sem convite.** O cadastro pela secretaria não emite convite: a gestante aparece na lista com "Sem acesso" até a fatia de convites. É comportamento esperado, não bug — a coluna de status existe justamente para deixar isso visível.
- **Vínculo obrigatório no cadastro.** Se a clínica ainda não tem nenhuma `medica` promovida, o `p-select` vem vazio e o cadastro fica travado. Promova a médica com `select public.promover_para_medica('<uuid>', 'Nome');` antes do teste manual.
- **`limit 200` na listagem.** Acima disso a busca precisa ser usada. Quando a clínica passar de alguns milhares de pacientes, troque por paginação server-side e acrescente um índice GIN `pg_trgm` sobre `lower(nome)` — não antes.
- **Secretaria enxerga todos os `profiles`,** inclusive de gestantes (nome, papel, telefone). É deliberado — ela administra o cadastro — mas vale registrar na revisão de RLS da W7.
- **`papelGuard` estreia aqui.** Se uma `medica` navegar para `/pacientes`, cai em `/sem-acesso`. É o comportamento pretendido nesta fase; a mesa de trabalho da médica é a W4.
- **Três migrations tocam o repo do mobile** (`prenatalapp`) e exigem commit lá também. O `prenatalweb` só depende do `database.types.ts` regenerado.

## 9. Rollback

- **Frontend:** reverter o commit no `prenatalweb`. Nada persiste fora do bundle.
- **Policies e RPCs (Etapas 1 e 3):** migration nova com `drop policy pacientes_select_secretaria on public.pacientes;` (idem `profiles_select_secretaria`, `vinculos_select_secretaria`), `drop function public.criar_paciente_pela_secretaria(text, uuid, public.papel_vinculo, date, text, text);`, `drop function public.atualizar_paciente_pela_secretaria(uuid, text, date, text, text);`, `drop function public.pacientes_da_secretaria(text);`, `drop function public.is_secretaria();`. Reversível sem perda.
- **CPF (Etapa 2):** `alter table public.pacientes drop constraint pacientes_cpf_digitos;` e restaurar o corpo anterior de `criar_paciente_com_convite` (versão de `init_schema.sql:299`). A normalização dos dados **não** é reversível — a pontuação original se perde. É perda aceitável: o dígito é a informação, a máscara é apresentação.

## 10. Checklist final

- [ ] `20260820120400_rls_secretaria.sql` criada; `pg_policies` lista as três policies `*_secretaria`
- [ ] Pré-checagem de CPF sem linhas antes de rodar a Etapa 2
- [ ] `20260820120500_pacientes_cpf_normalizado.sql` criada; constraint `pacientes_cpf_digitos` existe; `criar_paciente_com_convite` normaliza
- [ ] `20260820120600_pacientes_secretaria_rpc.sql` criada; as quatro funções existem em `pg_proc`
- [ ] `rls_smoke.sql` roda de `OK 1` a `OK 32` sem nenhum `FAIL`
- [ ] `src/types/database.types.ts` regenerado com as três funções novas
- [ ] `src/app/core/formato/cpf.ts` e `data.ts` criados
- [ ] `PacientesService` criado, sem lançar exceção para o componente
- [ ] `/pacientes` e `/pacientes/nova` e `/pacientes/:id` registradas sob `papelGuard('secretaria')`
- [ ] Item "Pacientes" aparece na sidebar só para `secretaria`
- [ ] Texto de `/inicio` atualizado
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` todos verdes
- [ ] Roteiro manual como `secretaria`: `/pacientes` lista → cadastrar com médica e CPF mascarado → aparece na lista com "Sem acesso" e a médica responsável → buscar por nome e por CPF → editar e salvar → cadastrar de novo com o mesmo CPF mostra "Já existe uma paciente cadastrada com este CPF."
- [ ] Roteiro manual como `medica`: sidebar sem "Pacientes"; abrir `/pacientes` na URL cai em `/sem-acesso`
- [ ] Cadastro pelo app Flutter continua funcionando com CPF digitado com e sem pontuação
- [ ] `docs/roadmap-web.md` atualizado e `npm run format:check` limpo
- [ ] Este plano salvo como `docs/plano-w2-rls-pacientes.md`
