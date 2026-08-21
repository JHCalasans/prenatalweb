# Plano de Implementação: W2 (fatia 2) — Convites

## 1. Objetivo

Ao final, a secretaria acessa `/convites`, vê todas as pacientes da clínica com a situação do
convite de cada uma (sem convite, pendente, ativo, expirado, revogado), filtra por situação e
busca por nome ou CPF. Emite convite para uma paciente e recebe o código em texto uma única vez
numa janela com botão de copiar; reemite para quem trocou de aparelho (revogando o anterior);
revoga convites pendentes; e emite em lote para várias pacientes recém-cadastradas de uma vez.
A médica e a gestante não têm nenhum comportamento alterado, e o app Flutter continua emitindo
e reemitindo convites como hoje.

## 2. Contexto atual

### Backend — `~/Documents/VoidSans/prenatalapp/supabase/`

A tabela `public.convites` (`migrations/20260808193116_init_schema.sql:69`):

```
id, paciente_id, codigo_hash (unique), criado_por, criado_em,
expira_em (default now() + 30 days), ativado_em, revogado_em
```

O código em texto **nunca** é gravado — só o sha256 do formato canônico (maiúsculas sem
separadores), via `public.convite_codigo_hash(text)`. `public.gerar_codigo_convite()` produz
20 caracteres em grupos de 4. Ambos existem desde o `init_schema`.

RPCs de convite hoje:

| Função                                      | Gate                                                              | O que faz                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `criar_paciente_com_convite`                | `current_papel() = 'medica'`                                      | Cria paciente + vínculo com `auth.uid()` + convite; devolve o código |
| `reemitir_convite(p_paciente_id)`           | `current_papel() = 'medica'` **e** `medica_vinculada_ao_paciente` | Revoga os não-revogados e emite outro                                |
| `registrar_ativacao_convite(p_codigo_hash)` | `request.jwt.claims ->> 'role' = 'service_role'`                  | Queima o código; chamada pela Edge Function                          |

**Nenhuma delas alcança a secretaria** — as duas primeiras exigem papel `medica`.

Policies e grants de `convites` (`init_schema.sql:591-608`):

- `convites_select_medica` — `using (public.medica_vinculada_ao_paciente(paciente_id))`. Não há
  policy para secretaria: hoje ela não lê nem uma linha.
- `revoke all on public.convites from anon, authenticated` + `grant select` em nível de coluna
  (sem `codigo_hash`).
- View `public.convites_status` com `security_invoker = true`, expondo as mesmas colunas.
- Escrita direta em `convites` está fechada para qualquer cliente.

Edge Function `supabase/functions/ativar-convite/index.ts`: recebe `{ codigo }`, normaliza
igual ao helper SQL (`toUpperCase()` + remove não-alfanuméricos), chama
`registrar_ativacao_convite`, cria o usuário e **apaga o profile anterior** da paciente
(`deleteUser(profileAnterior)`, linha 161) — é assim que a reemissão troca o aparelho.

O que a fatia 1 da W2 já entregou (`migrations/20260820120400/500/600`, commit `cea131c`):

- `public.is_secretaria()` — `sql stable security definer`.
- Policies `pacientes_select_secretaria`, `profiles_select_secretaria`, `vinculos_select_secretaria`.
- `criar_paciente_pela_secretaria` — cria paciente + vínculo, **sem convite**.
- `atualizar_paciente_pela_secretaria`, `pacientes_da_secretaria(p_busca)`.
- `pacientes.cpf` normalizado para 11 dígitos com `check constraint`.

`supabase/tests/rls_smoke.sql` tem 1395 linhas, cenários **1 a 32**, `rollback;` na linha 1391.
Helpers `pg_temp.as_user(uuid)`, `pg_temp.as_service_role()`, `pg_temp.back_to_postgres()`.
Chaves em `smoke_ids`: `medica_a`, `medica_b`, `secretaria`, `paciente_user`, `paciente_row`,
`paciente_nova`, `gestacao`. A `paciente_nova` (criada no cenário 30) **não tem convite** —
é a fixture natural para os cenários novos.

### Frontend — `~/Documents/VoidSans/prenatalweb/` (commit `5274b79`)

| Arquivo                                              | Papel                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/pacientes/pacientes.service.ts`        | Modelo a seguir: `Resultado<T>`, `mensagemDeErro(PostgrestError)`, helper `opcional()` para os args `p_x?: string` gerados |
| `src/app/pages/pacientes/lista/pacientes-lista.ts`   | Modelo de tela: signals `linhas`/`carregando`/`erro`, `formulario` de busca, `ngOnInit` → `carregar()`                     |
| `src/app/pages/pacientes/lista/pacientes-lista.html` | `p-table` + `p-tag` + `p-message`, `ng-template #header/#body/#emptymessage`                                               |
| `src/app/app.routes.ts`                              | `/pacientes` sob `papelGuard('secretaria')` com filhos `''`, `nova`, `:id`                                                 |
| `src/app/layout/shell/shell.html`                    | `<nav>` com `@if (papel() === 'secretaria')` já em uso                                                                     |
| `src/app/core/formato/cpf.ts` / `data.ts`            | `formatarCpf`, `formatarData`, `paraDataIso`, `deDataIso`                                                                  |

PrimeNG 21.1.9. Seletores confirmados em `node_modules/primeng/fesm2022/`: `p-table`
(`TableModule`, com `[(selection)]` e `p-tableCheckbox` que aceita `disabled`), `p-dialog`
(`DialogModule`), `p-select`, `p-tag` (severidades `success | secondary | info | warn | danger
| contrast`), `p-message`, `p-inputtext`.

Testes: Vitest via `@angular/build:unit-test`, globals por `tsconfig.spec.json`, `TestBed` com
`provideZonelessChangeDetection()`.

## 3. Escopo

**Dentro:**

- RPCs `emitir_convite_pela_secretaria`, `revogar_convite_pela_secretaria`,
  `emitir_convites_em_lote` e `convites_da_secretaria`.
- Cenários 33–37 em `supabase/tests/rls_smoke.sql`.
- Regeneração de `src/types/database.types.ts`.
- `ConvitesService` no web.
- Tela `/convites`: lista com situação, filtro por situação, busca, emitir/reemitir, revogar,
  emissão em lote por seleção, e janela que mostra os códigos gerados com botão de copiar.
- Item "Convites" na sidebar, só para `secretaria`.
- Testes unitários do serviço e da tela.
- Atualização de `docs/roadmap-web.md`.

**Fora — não fazer nesta tarefa:**

- Não criar policy de `select` para a secretaria em `public.convites` nem usar a view
  `convites_status` no web — tudo passa pelas RPCs (ver seção 4).
- Não alterar `criar_paciente_com_convite`, `reemitir_convite` nem `registrar_ativacao_convite`.
- Não alterar a Edge Function `ativar-convite`.
- Não emitir convite dentro de `criar_paciente_pela_secretaria` — a emissão continua sendo
  ação separada e explícita.
- Não adicionar botão de emitir convite na tela `/pacientes` — a emissão vive em `/convites`.
- Não exportar CSV/PDF dos códigos nem enviar por e-mail/SMS.
- Não mexer em vínculos (transferir, inativar, segundo vínculo) nem em gestão de equipe —
  são as fatias 3 e 4 da W2.
- Não adicionar dependência npm nova.
- Não editar nenhum arquivo de teste já existente.

## 4. Decisões técnicas

| Decisão                              | Escolha                                                                               | Motivo                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leitura dos convites pela secretaria | RPC `convites_da_secretaria`, **sem** policy nova em `convites`                       | A tela precisa de nome da paciente, médica responsável e situação derivada — a view `convites_status` não tem nada disso. Sem policy, a superfície de leitura direta da tabela continua fechada |
| Emitir e reemitir                    | Uma RPC só, `emitir_convite_pela_secretaria`                                          | Os dois casos são o mesmo comando: revogar os não-revogados e gerar outro. Duas funções com o mesmo corpo divergiriam na primeira correção                                                      |
| Ação de auditoria da emissão         | `convite.emitido` com `meta.reemissao`                                                | `reemitir_convite` da médica grava `convite.reemitido`; usar a mesma ação com um campo distingue os casos sem inventar um terceiro verbo no `audit_log`                                         |
| Revogação                            | Só convite **pendente** (`ativado_em is null and revogado_em is null`)                | Revogar convite já ativado não tira o acesso de ninguém: o código já virou usuário. Marcar seria mentira no relatório                                                                           |
| Revogar sem nada pendente            | `raise exception 'Nenhum convite pendente para revogar'`                              | Devolver 0 em silêncio faria a UI mostrar sucesso sem ter feito nada                                                                                                                            |
| Lote                                 | Só emite para paciente **sem nenhum convite**; as demais voltam com `emitido = false` | Lote é onboarding em volume. Reemitir em lote revogaria acesso de quem já usa o app — decisão que precisa ser individual e consciente                                                           |
| Teto do lote                         | 50 pacientes                                                                          | Cada emissão é um `update` + `insert` + `insert` no audit; 50 cabe folgado no timeout do PostgREST e é mais do que uma leva real de cadastro                                                    |
| Falha parcial no lote                | Não existe: a RPC devolve uma linha por paciente com `emitido` e `codigo`             | Erro no meio de um lote de 30 deixaria a secretaria sem saber quais códigos existem                                                                                                             |
| Empate em `criado_em`                | `order by c.criado_em desc, c.id desc` no lateral                                     | As quatro fixtures de convite do smoke nascem com o mesmo `now()`; sem desempate, "último convite" é não-determinístico                                                                         |
| Situação derivada                    | No SQL, `case` na RPC                                                                 | Mesma razão da regra de urgência estar no Postgres: dois clientes (web hoje, mobile amanhã) não podem divergir sobre o que é "expirado"                                                         |
| Ordem de precedência da situação     | `sem_convite` → `ativo` → `revogado` → `expirado` → `pendente`                        | `ativado_em` ganha de tudo: código queimado é fato consumado. Revogado ganha de expirado porque foi ação humana                                                                                 |
| Onde o código aparece                | `p-dialog` modal, uma vez, com botão de copiar                                        | O texto só existe no retorno da RPC. Reabrir a tela não o traz de volta — igual ao app da médica                                                                                                |
| Confirmação de revogação             | `p-dialog` controlado por signal, sem `ConfirmationService`                           | Mesma linha da fatia 1, que preferiu `p-message` inline a `p-toast`: menos serviço global, menos providers                                                                                      |
| Cópia para a área de transferência   | `navigator.clipboard.writeText` dentro de `try/catch`                                 | jsdom não implementa `clipboard`; sem o `catch` o teste de widget quebraria por um detalhe de ambiente                                                                                          |
| `mensagemDeErro`                     | Cópia local em `convites.service.ts`, sem extrair da fatia 1                          | O mapeamento de `23505` da fatia 1 fala de CPF duplicado, que não faz sentido para convites. Extrair exigiria parametrizar e mexer em código já testado                                         |
| Filtro "Todas" no `p-select`         | Valor `''`, convertido para `undefined` no serviço                                    | `optionValue` com `null` no `p-select` não distingue "não selecionado" de "selecionado como nulo"                                                                                               |
| Guard da rota                        | `papelGuard('secretaria')`                                                            | Mesmo tratamento de `/pacientes`; a médica emite convite pelo app                                                                                                                               |

## 5. Pré-requisitos

- Docker rodando com o stack local do Supabase do `prenatalapp`.
- Supabase CLI via `npx supabase`; `psql` no PATH.
- Fatia 1 da W2 aplicada — `public.is_secretaria()` precisa existir (commit `cea131c` no
  `prenatalapp`, `5274b79` no `prenatalweb`).
- Nenhuma dependência npm nova.

## 6. Etapas

Etapas 1–3 são no repo `~/Documents/VoidSans/prenatalapp`. Etapas 4–10 são no repo
`~/Documents/VoidSans/prenatalweb`.

---

### Etapa 1 — RPCs de emissão, reemissão, revogação e lote

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120700_convites_secretaria_emissao.sql` (criar)

**O que fazer:** criar as três RPCs de escrita. Sem `revoke execute` — o gate é interno
(`is_secretaria()`), pelo motivo documentado em `init_schema.sql:386-389`.

**Código:**

```sql
-- W2 fatia 2: a secretaria emite, reemite e revoga convites. reemitir_convite
-- exige papel medica E vínculo com a paciente, então não alcança a secretaria.
-- O gate é interno (is_secretaria), NÃO `revoke execute` — ver o comentário do
-- init_schema sobre o segfault do PG17/ARM64.

-- Emitir e reemitir são o mesmo comando: revogar os não-revogados e gerar
-- outro. O código em texto sai daqui uma única vez e nunca é gravado.
create or replace function public.emitir_convite_pela_secretaria(p_paciente_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_revogados integer;
begin
  if not public.is_secretaria() then
    raise exception 'Apenas a secretaria emite convites por aqui';
  end if;

  if not exists (select 1 from public.pacientes where id = p_paciente_id) then
    raise exception 'Paciente não encontrada';
  end if;

  update public.convites
     set revogado_em = now()
   where paciente_id = p_paciente_id
     and revogado_em is null;
  get diagnostics v_revogados = row_count;

  v_codigo := public.gerar_codigo_convite();

  insert into public.convites (paciente_id, codigo_hash, criado_por)
  values (p_paciente_id, public.convite_codigo_hash(v_codigo), auth.uid());

  insert into public.audit_log (ator_id, acao, entidade, entidade_id, meta)
  values (
    auth.uid(),
    'convite.emitido',
    'convites',
    p_paciente_id,
    jsonb_build_object('reemissao', v_revogados > 0, 'revogados', v_revogados)
  );

  return v_codigo;
end;
$$;

-- Só convite pendente: revogar convite já ativado não tira acesso de ninguém,
-- porque o código virou usuário na Edge Function.
create or replace function public.revogar_convite_pela_secretaria(p_paciente_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revogados integer;
begin
  if not public.is_secretaria() then
    raise exception 'Apenas a secretaria revoga convites por aqui';
  end if;

  update public.convites
     set revogado_em = now()
   where paciente_id = p_paciente_id
     and revogado_em is null
     and ativado_em is null;
  get diagnostics v_revogados = row_count;

  if v_revogados = 0 then
    raise exception 'Nenhum convite pendente para revogar';
  end if;

  insert into public.audit_log (ator_id, acao, entidade, entidade_id, meta)
  values (
    auth.uid(),
    'convite.revogado',
    'convites',
    p_paciente_id,
    jsonb_build_object('revogados', v_revogados)
  );

  return v_revogados;
end;
$$;

-- Lote é onboarding: emite só para quem nunca teve convite. Reemitir revoga o
-- acesso de quem já usa o app e por isso continua sendo ação individual.
-- Devolve uma linha por paciente para que nenhuma emissão fique invisível.
create or replace function public.emitir_convites_em_lote(p_paciente_ids uuid[])
returns table (
  paciente_id uuid,
  nome text,
  codigo text,
  emitido boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nome text;
begin
  if not public.is_secretaria() then
    raise exception 'Apenas a secretaria emite convites por aqui';
  end if;

  if p_paciente_ids is null or array_length(p_paciente_ids, 1) is null then
    raise exception 'Selecione ao menos uma paciente';
  end if;

  if array_length(p_paciente_ids, 1) > 50 then
    raise exception 'O lote aceita no máximo 50 pacientes';
  end if;

  foreach v_id in array p_paciente_ids loop
    select p.nome into v_nome from public.pacientes p where p.id = v_id;
    if v_nome is null then
      continue;
    end if;

    paciente_id := v_id;
    nome := v_nome;

    if exists (select 1 from public.convites c where c.paciente_id = v_id) then
      codigo := null;
      emitido := false;
    else
      codigo := public.emitir_convite_pela_secretaria(v_id);
      emitido := true;
    end if;

    return next;
  end loop;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset
```

Conclui sem erro. Depois:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select proname from pg_proc where proname in ('emitir_convite_pela_secretaria','revogar_convite_pela_secretaria','emitir_convites_em_lote') order by 1;"
```

Saída esperada: três linhas.

---

### Etapa 2 — RPC de listagem com a situação derivada

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120800_convites_da_secretaria.sql` (criar)

**O que fazer:** uma linha por paciente da clínica com o convite mais recente e a situação já
classificada. Espelha `pacientes_da_secretaria`.

**Código:**

```sql
-- Uma linha por paciente com o convite mais recente e a situação já
-- classificada no banco: web e mobile não podem divergir sobre o que é
-- "expirado". O desempate por id é obrigatório — convites criados na mesma
-- transação compartilham o criado_em e "o mais recente" viraria sorteio.

create or replace function public.convites_da_secretaria(
  p_busca text default null,
  p_situacao text default null
)
returns table (
  paciente_id uuid,
  nome text,
  cpf text,
  medicas text,
  convite_id uuid,
  criado_em timestamptz,
  expira_em timestamptz,
  ativado_em timestamptz,
  revogado_em timestamptz,
  situacao text
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
    raise exception 'Apenas a secretaria acompanha os convites da clínica';
  end if;

  v_busca := nullif(btrim(coalesce(p_busca, '')), '');
  v_digitos := nullif(regexp_replace(coalesce(v_busca, ''), '\D', '', 'g'), '');

  return query
    select
      linhas.paciente_id,
      linhas.nome,
      linhas.cpf,
      linhas.medicas,
      linhas.convite_id,
      linhas.criado_em,
      linhas.expira_em,
      linhas.ativado_em,
      linhas.revogado_em,
      linhas.situacao
    from (
      select
        p.id as paciente_id,
        p.nome as nome,
        p.cpf as cpf,
        coalesce(vin.medicas, '') as medicas,
        conv.id as convite_id,
        conv.criado_em as criado_em,
        conv.expira_em as expira_em,
        conv.ativado_em as ativado_em,
        conv.revogado_em as revogado_em,
        case
          when conv.id is null then 'sem_convite'
          when conv.ativado_em is not null then 'ativo'
          when conv.revogado_em is not null then 'revogado'
          when conv.expira_em <= now() then 'expirado'
          else 'pendente'
        end as situacao
      from public.pacientes p
      left join lateral (
        select c.id, c.criado_em, c.expira_em, c.ativado_em, c.revogado_em
        from public.convites c
        where c.paciente_id = p.id
        order by c.criado_em desc, c.id desc
        limit 1
      ) conv on true
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
    ) linhas
    where p_situacao is null or linhas.situacao = p_situacao
    order by linhas.nome
    limit 200;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select proname from pg_proc where proname = 'convites_da_secretaria';"
```

Saída esperada: uma linha com `convites_da_secretaria`.

---

### Etapa 3 — Cenários 33–37 no smoke de RLS

**Depende de:** Etapa 2
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

**O que fazer:** inserir o bloco abaixo **imediatamente antes** da linha `rollback;` (hoje linha
1391). Não altere as fixtures nem nenhum cenário existente — a `paciente_nova` criada no
cenário 30 ainda não tem convite, e é sobre ela que os cenários novos trabalham.

**Código:**

```sql
-- ---------------------------------------------------------------------------
-- 33) Emissão pela secretaria: gate de papel, paciente inexistente e hash
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova uuid := (select value from smoke_ids where key = 'paciente_nova');
  v_codigo text;
  v_count int;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform public.emitir_convite_pela_secretaria(v_nova);
    raise exception 'FAIL: médica executou a emissão da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria emite convites por aqui' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  begin
    perform public.emitir_convite_pela_secretaria(gen_random_uuid());
    raise exception 'FAIL: emissão aceitou paciente inexistente';
  exception when others then
    if sqlerrm <> 'Paciente não encontrada' then
      raise;
    end if;
  end;

  v_codigo := public.emitir_convite_pela_secretaria(v_nova);
  perform pg_temp.back_to_postgres();

  select count(*) into v_count
  from public.convites
  where paciente_id = v_nova
    and codigo_hash = public.convite_codigo_hash(v_codigo)
    and ativado_em is null
    and revogado_em is null;
  if v_count <> 1 then
    raise exception 'FAIL: o código devolvido não bate com o hash gravado';
  end if;

  select count(*) into v_count
  from public.audit_log
  where entidade = 'convites' and entidade_id = v_nova and acao = 'convite.emitido';
  if v_count <> 1 then
    raise exception 'FAIL: emissão não foi auditada';
  end if;

  raise notice 'OK 33: emissão pela secretaria segue papel, paciente e hash';
end $$;

-- ---------------------------------------------------------------------------
-- 34) Reemissão revoga o anterior e deixa só um convite vivo
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_nova uuid := (select value from smoke_ids where key = 'paciente_nova');
  v_codigo text;
  v_vivos int;
  v_total int;
  v_reemissao boolean;
begin
  perform pg_temp.as_user(v_secretaria);
  v_codigo := public.emitir_convite_pela_secretaria(v_nova);
  perform pg_temp.back_to_postgres();

  select count(*) into v_vivos
  from public.convites
  where paciente_id = v_nova and revogado_em is null and ativado_em is null;
  if v_vivos <> 1 then
    raise exception 'FAIL: reemissão deixou % convites vivos', v_vivos;
  end if;

  select count(*) into v_total from public.convites where paciente_id = v_nova;
  if v_total <> 2 then
    raise exception 'FAIL: reemissão deveria manter o histórico (esperado 2, veio %)', v_total;
  end if;

  select (meta ->> 'reemissao')::boolean into v_reemissao
  from public.audit_log
  where entidade = 'convites' and entidade_id = v_nova and acao = 'convite.emitido'
  order by em desc
  limit 1;
  if not v_reemissao then
    raise exception 'FAIL: a auditoria não marcou a reemissão';
  end if;

  raise notice 'OK 34: reemissão revoga o anterior e fica auditada como tal';
end $$;

-- ---------------------------------------------------------------------------
-- 35) Revogação atinge só o pendente e falha quando não há o que revogar
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova uuid := (select value from smoke_ids where key = 'paciente_nova');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_revogados int;
  v_ativados int;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform public.revogar_convite_pela_secretaria(v_nova);
    raise exception 'FAIL: médica executou a revogação da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria revoga convites por aqui' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  v_revogados := public.revogar_convite_pela_secretaria(v_nova);
  if v_revogados <> 1 then
    raise exception 'FAIL: deveria revogar exatamente 1 convite (veio %)', v_revogados;
  end if;

  begin
    perform public.revogar_convite_pela_secretaria(v_nova);
    raise exception 'FAIL: revogou duas vezes o mesmo convite';
  exception when others then
    if sqlerrm <> 'Nenhum convite pendente para revogar' then
      raise;
    end if;
  end;

  perform public.revogar_convite_pela_secretaria(v_paciente);
  perform pg_temp.back_to_postgres();

  select count(*) into v_ativados
  from public.convites
  where paciente_id = v_paciente and ativado_em is not null and revogado_em is not null;
  if v_ativados <> 0 then
    raise exception 'FAIL: revogação marcou convite já ativado';
  end if;

  raise notice 'OK 35: revogação atinge só pendente e recusa repetição';
end $$;

-- ---------------------------------------------------------------------------
-- 36) Lote emite para quem nunca teve convite e pula o resto
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova uuid := (select value from smoke_ids where key = 'paciente_nova');
  v_virgem uuid;
  v_emitidos int;
  v_pulados int;
  v_codigo text;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform * from public.emitir_convites_em_lote(array[v_nova]);
    raise exception 'FAIL: médica executou o lote da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria emite convites por aqui' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  v_virgem := public.criar_paciente_pela_secretaria('Lote Um', v_medica_a);

  begin
    perform * from public.emitir_convites_em_lote(array[]::uuid[]);
    raise exception 'FAIL: lote vazio foi aceito';
  exception when others then
    if sqlerrm <> 'Selecione ao menos uma paciente' then
      raise;
    end if;
  end;

  select
    count(*) filter (where emitido),
    count(*) filter (where not emitido)
  into v_emitidos, v_pulados
  from public.emitir_convites_em_lote(array[v_virgem, v_nova]);

  if v_emitidos <> 1 or v_pulados <> 1 then
    raise exception 'FAIL: lote emitiu % e pulou % (esperado 1 e 1)', v_emitidos, v_pulados;
  end if;

  select codigo into v_codigo
  from public.emitir_convites_em_lote(array[v_nova])
  limit 1;
  if v_codigo is not null then
    raise exception 'FAIL: lote emitiu para paciente que já tinha convite';
  end if;

  perform pg_temp.back_to_postgres();

  insert into smoke_ids values ('paciente_virgem', v_virgem);
  raise notice 'OK 36: lote emite só para quem nunca teve convite';
end $$;

-- ---------------------------------------------------------------------------
-- 37) Listagem classifica a situação, filtra e respeita o papel
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova uuid := (select value from smoke_ids where key = 'paciente_nova');
  v_virgem uuid := (select value from smoke_ids where key = 'paciente_virgem');
  v_situacao text;
  v_count int;
begin
  perform pg_temp.as_user(v_medica_a);
  begin
    perform * from public.convites_da_secretaria(null, null);
    raise exception 'FAIL: médica listou convites pela RPC da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria acompanha os convites da clínica' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_secretaria);

  select situacao into v_situacao
  from public.convites_da_secretaria(null, null)
  where paciente_id = v_nova;
  if v_situacao <> 'revogado' then
    raise exception 'FAIL: paciente com convite revogado veio como % ', v_situacao;
  end if;

  select situacao into v_situacao
  from public.convites_da_secretaria(null, null)
  where paciente_id = v_virgem;
  if v_situacao <> 'pendente' then
    raise exception 'FAIL: convite recém-emitido veio como %', v_situacao;
  end if;

  select count(*) into v_count from public.convites_da_secretaria(null, 'pendente');
  if v_count <> 1 then
    raise exception 'FAIL: filtro por pendente trouxe % linhas', v_count;
  end if;

  select count(*) into v_count from public.convites_da_secretaria('Lote Um', null);
  if v_count <> 1 then
    raise exception 'FAIL: busca por nome no painel de convites falhou';
  end if;

  select count(*) into v_count from public.convites_da_secretaria(null, 'sem_convite');
  if v_count <> 0 then
    raise exception 'FAIL: nenhuma paciente deveria estar sem convite neste ponto';
  end if;

  perform pg_temp.back_to_postgres();
  raise notice 'OK 37: listagem classifica situação, filtra e respeita o papel';
end $$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Saída esperada: avisos `OK 1` a `OK 37`, nenhum `FAIL`, encerrando em `ROLLBACK`.

---

### Etapa 4 — Regerar os tipos do banco

**Depende de:** Etapa 3
**Arquivos:** `~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` (regerar)

**Código:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase start && npx supabase gen types typescript --local > ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

**Validação:**

```bash
grep -n "convites_da_secretaria\|emitir_convites_em_lote\|emitir_convite_pela_secretaria\|revogar_convite_pela_secretaria" ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

Saída esperada: as quatro funções aparecem na seção `Functions`.

---

### Etapa 5 — `ConvitesService`

**Depende de:** Etapa 4
**Arquivos:** `src/app/core/convites/convites.service.ts` (criar)

**Código:**

```ts
import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaConvite = Database['public']['Functions']['convites_da_secretaria']['Returns'][number];
type LinhaLote = Database['public']['Functions']['emitir_convites_em_lote']['Returns'][number];

export type ConviteLista = LinhaConvite;
export type ConviteEmitido = LinhaLote;

export type SituacaoConvite = 'sem_convite' | 'pendente' | 'ativo' | 'expirado' | 'revogado';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// Os Args gerados usam `p_x?: string`; undefined omite a chave e a RPC aplica
// o `default null` do banco.
function opcional(valor: string): string | undefined {
  return valor.trim() === '' ? undefined : valor.trim();
}

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class ConvitesService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listar(busca: string, situacao: string): Promise<Resultado<ConviteLista[]>> {
    const { data, error } = await this.supabase.rpc('convites_da_secretaria', {
      p_busca: opcional(busca),
      p_situacao: opcional(situacao),
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async emitir(pacienteId: string): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('emitir_convite_pela_secretaria', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async revogar(pacienteId: string): Promise<Resultado<number>> {
    const { data, error } = await this.supabase.rpc('revogar_convite_pela_secretaria', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async emitirEmLote(pacienteIds: readonly string[]): Promise<Resultado<ConviteEmitido[]>> {
    const { data, error } = await this.supabase.rpc('emitir_convites_em_lote', {
      p_paciente_ids: [...pacienteIds],
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }
}
```

**Validação:**

```bash
npm run typecheck
```

Sem erro. Se `data` de `emitir` vier como `unknown`, a Etapa 4 não foi aplicada.

---

### Etapa 6 — Tela `/convites`

**Depende de:** Etapa 5
**Arquivos:** `src/app/pages/convites/lista/convites-lista.ts`, `convites-lista.html`,
`convites-lista.scss` (criar)

**O que fazer:** lista com busca, filtro de situação, seleção para lote, ações por linha e as
duas janelas modais (códigos gerados e confirmação de revogação).

`convites-lista.ts`:

```ts
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  ConviteEmitido,
  ConviteLista,
  ConvitesService,
} from '../../../core/convites/convites.service';
import { formatarCpf } from '../../../core/formato/cpf';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

const ROTULOS: Record<string, string> = {
  sem_convite: 'Sem convite',
  pendente: 'Pendente',
  ativo: 'Ativo',
  expirado: 'Expirado',
  revogado: 'Revogado',
};

const SEVERIDADES: Record<string, Severidade> = {
  sem_convite: 'secondary',
  pendente: 'info',
  ativo: 'success',
  expirado: 'warn',
  revogado: 'danger',
};

@Component({
  imports: [
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-convites-lista',
  styleUrl: './convites-lista.scss',
  templateUrl: './convites-lista.html',
})
export class ConvitesLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly convites = inject(ConvitesService);

  protected readonly linhas = signal<ConviteLista[]>([]);
  protected readonly selecionadas = signal<ConviteLista[]>([]);
  protected readonly carregando = signal(false);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly emitidos = signal<ConviteEmitido[]>([]);
  protected readonly copiado = signal(false);
  protected readonly aRevogar = signal<ConviteLista | null>(null);

  protected readonly situacoes = [
    { rotulo: 'Todas as situações', valor: '' },
    { rotulo: 'Sem convite', valor: 'sem_convite' },
    { rotulo: 'Pendente', valor: 'pendente' },
    { rotulo: 'Ativo', valor: 'ativo' },
    { rotulo: 'Expirado', valor: 'expirado' },
    { rotulo: 'Revogado', valor: 'revogado' },
  ];

  protected readonly formulario = this.fb.group({ busca: '', situacao: '' });

  protected readonly totalSelecionado = computed(() => this.selecionadas().length);

  protected readonly formatarCpf = formatarCpf;

  ngOnInit(): void {
    void this.carregar();
  }

  protected rotulo(situacao: string): string {
    return ROTULOS[situacao] ?? situacao;
  }

  protected severidade(situacao: string): Severidade {
    return SEVERIDADES[situacao] ?? 'secondary';
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    this.selecionadas.set([]);
    try {
      const { busca, situacao } = this.formulario.getRawValue();
      const resultado = await this.convites.listar(busca, situacao);
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
    this.formulario.setValue({ busca: '', situacao: '' });
    await this.carregar();
  }

  protected async emitir(linha: ConviteLista): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.convites.emitir(linha.paciente_id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.abrirCodigos([
        {
          paciente_id: linha.paciente_id,
          nome: linha.nome,
          codigo: resultado.valor,
          emitido: true,
        },
      ]);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async emitirLote(): Promise<void> {
    const ids = this.selecionadas().map((l) => l.paciente_id);
    if (ids.length === 0 || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.convites.emitirEmLote(ids);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.abrirCodigos(resultado.valor);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarRevogacao(): Promise<void> {
    const linha = this.aRevogar();
    if (linha === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.convites.revogar(linha.paciente_id);
      this.aRevogar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected fecharCodigos(): void {
    this.emitidos.set([]);
    this.copiado.set(false);
  }

  // O código só existe no retorno da RPC: uma vez fechada a janela, a única
  // saída é reemitir.
  protected async copiarTudo(): Promise<void> {
    const texto = this.emitidos()
      .filter((e) => e.codigo !== null)
      .map((e) => `${e.nome}: ${e.codigo}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(true);
    } catch {
      this.copiado.set(false);
      this.erro.set('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  private abrirCodigos(linhas: ConviteEmitido[]): void {
    this.copiado.set(false);
    this.emitidos.set(linhas);
  }
}
```

`convites-lista.html`:

```html
<section class="pagina">
  <header class="cabecalho">
    <div>
      <p class="eyebrow">Administração</p>
      <h1>Convites</h1>
    </div>
    <p-button
      label="Emitir em lote ({{ totalSelecionado() }})"
      icon="pi pi-send"
      [disabled]="totalSelecionado() === 0 || agindo()"
      (onClick)="emitirLote()"
    />
  </header>

  <form class="filtros" [formGroup]="formulario" (ngSubmit)="carregar()">
    <input
      pInputText
      type="search"
      formControlName="busca"
      placeholder="Buscar por nome ou CPF"
      aria-label="Buscar por nome ou CPF"
    />
    <p-select
      formControlName="situacao"
      [options]="situacoes"
      optionLabel="rotulo"
      optionValue="valor"
      ariaLabel="Filtrar por situação"
    />
    <p-button type="submit" label="Buscar" icon="pi pi-search" [loading]="carregando()" />
    <p-button type="button" label="Limpar" severity="secondary" (onClick)="limpar()" />
  </form>

  <p class="dica">
    Só pacientes sem convite podem entrar no lote. Reemitir revoga o acesso atual e é feito uma
    paciente por vez.
  </p>

  @if (erro()) {
  <p-message severity="error" [text]="erro()!" />
  }

  <p-table
    [value]="linhas()"
    [loading]="carregando()"
    [selection]="selecionadas()"
    (selectionChange)="selecionadas.set($event)"
    dataKey="paciente_id"
    [rows]="20"
    [paginator]="true"
  >
    <ng-template #header>
      <tr>
        <th class="coluna-selecao"></th>
        <th>Nome</th>
        <th>CPF</th>
        <th>Médica responsável</th>
        <th>Situação</th>
        <th></th>
      </tr>
    </ng-template>

    <ng-template #body let-linha>
      <tr>
        <td class="coluna-selecao">
          <p-tableCheckbox [value]="linha" [disabled]="linha.situacao !== 'sem_convite'" />
        </td>
        <td>{{ linha.nome }}</td>
        <td>{{ formatarCpf(linha.cpf) || '—' }}</td>
        <td>{{ linha.medicas || '—' }}</td>
        <td>
          <p-tag [value]="rotulo(linha.situacao)" [severity]="severidade(linha.situacao)" />
        </td>
        <td class="acoes">
          <p-button
            [label]="linha.situacao === 'sem_convite' ? 'Emitir' : 'Reemitir'"
            icon="pi pi-send"
            severity="secondary"
            [text]="true"
            [disabled]="agindo()"
            (onClick)="emitir(linha)"
          />
          @if (linha.situacao === 'pendente') {
          <p-button
            label="Revogar"
            icon="pi pi-ban"
            severity="danger"
            [text]="true"
            [disabled]="agindo()"
            (onClick)="aRevogar.set(linha)"
          />
          }
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

<p-dialog
  header="Códigos gerados"
  [visible]="emitidos().length > 0"
  (visibleChange)="fecharCodigos()"
  [modal]="true"
  [style]="{ width: '34rem' }"
>
  <p class="alerta">
    Anote agora: o código aparece uma única vez. Fechada esta janela, só reemitindo.
  </p>

  <ul class="codigos">
    @for (item of emitidos(); track item.paciente_id) {
    <li>
      <span class="quem">{{ item.nome }}</span>
      @if (item.codigo) {
      <code>{{ item.codigo }}</code>
      } @else {
      <span class="pulado">já tinha convite — não foi emitido</span>
      }
    </li>
    }
  </ul>

  @if (copiado()) {
  <p-message severity="success" text="Códigos copiados." />
  }

  <ng-template #footer>
    <p-button label="Copiar tudo" icon="pi pi-copy" severity="secondary" (onClick)="copiarTudo()" />
    <p-button label="Fechar" (onClick)="fecharCodigos()" />
  </ng-template>
</p-dialog>

<p-dialog
  header="Revogar convite"
  [visible]="aRevogar() !== null"
  (visibleChange)="aRevogar.set(null)"
  [modal]="true"
  [style]="{ width: '28rem' }"
>
  <p>
    O código pendente de <strong>{{ aRevogar()?.nome }}</strong> deixa de funcionar. Para dar acesso
    depois, emita um novo.
  </p>

  <ng-template #footer>
    <p-button label="Cancelar" severity="secondary" (onClick)="aRevogar.set(null)" />
    <p-button
      label="Revogar"
      severity="danger"
      [loading]="agindo()"
      (onClick)="confirmarRevogacao()"
    />
  </ng-template>
</p-dialog>
```

`convites-lista.scss`:

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

.filtros {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;

  input {
    flex: 1;
    min-width: 14rem;
  }
}

.dica {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.coluna-selecao {
  width: 3rem;
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

.alerta {
  margin: 0 0 1rem;
  font-weight: 700;
  color: var(--aconchego-erro);
}

.codigos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  code {
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--aconchego-texto-primario);
  }
}

.quem {
  font-weight: 700;
  color: var(--aconchego-texto-secundario);
}

.pulado {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}
```

**Validação:** coberta pela Etapa 7.

---

### Etapa 7 — Rota e item na sidebar

**Depende de:** Etapa 6
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.html` (editar)

**O que fazer:** registrar `/convites` sob o mesmo guard de `/pacientes` e acrescentar o item de
menu.

Em `src/app/app.routes.ts`, insira o bloco abaixo entre o objeto do path `'pacientes'` e a linha
`{ path: '', pathMatch: 'full', redirectTo: 'inicio' },`:

```ts
      {
        path: 'convites',
        canActivate: [papelGuard('secretaria')],
        loadComponent: () =>
          import('./pages/convites/lista/convites-lista').then((m) => m.ConvitesLista),
      },
```

Em `src/app/layout/shell/shell.html`, dentro do `@if (papel() === 'secretaria') { ... }`, logo
depois do link de `/pacientes`, acrescente:

```html
<a routerLink="/convites" routerLinkActive="ativo">
  <i class="pi pi-send" aria-hidden="true"></i>
  <span>Convites</span>
</a>
```

**Validação:**

```bash
npm run lint && npm run typecheck && npm run build
```

Os três sem erro; o build gera um chunk separado para `convites-lista`.

---

### Etapa 8 — Testes do `ConvitesService`

**Depende de:** Etapa 5
**Arquivos:** `src/app/core/convites/convites.service.spec.ts` (criar)

**Código:**

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ConvitesService } from './convites.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): ConvitesService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(ConvitesService);
}

describe('ConvitesService', () => {
  it('omite busca e situação vazias', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('   ', '');

    expect(cliente.rpc).toHaveBeenCalledWith('convites_da_secretaria', {
      p_busca: undefined,
      p_situacao: undefined,
    });
  });

  it('repassa termo trimado e situação', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('  Maria ', 'pendente');

    expect(cliente.rpc).toHaveBeenCalledWith('convites_da_secretaria', {
      p_busca: 'Maria',
      p_situacao: 'pendente',
    });
  });

  it('devolve o código emitido', async () => {
    const cliente = clienteFalso({ data: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
    const service = criar(cliente);

    const resultado = await service.emitir('p1');

    expect(resultado).toEqual({ ok: true, valor: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Nenhum convite pendente para revogar' },
    });
    const service = criar(cliente);

    const resultado = await service.revogar('p1');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Nenhum convite pendente para revogar',
    });
  });

  it('traduz erro desconhecido em mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: '08006', message: 'connection failure' } });
    const service = criar(cliente);

    const resultado = await service.listar('', '');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });

  it('manda o array de ids no lote', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.emitirEmLote(['p1', 'p2']);

    expect(cliente.rpc).toHaveBeenCalledWith('emitir_convites_em_lote', {
      p_paciente_ids: ['p1', 'p2'],
    });
  });
});
```

**Validação:**

```bash
npm test
```

Todos passam.

---

### Etapa 9 — Testes da tela

**Depende de:** Etapas 6, 7
**Arquivos:** `src/app/pages/convites/lista/convites-lista.spec.ts` (criar)

**Código:**

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConvitesService } from '../../../core/convites/convites.service';
import { ConvitesLista } from './convites-lista';

function montar(servico: Partial<ConvitesService>) {
  TestBed.configureTestingModule({
    imports: [ConvitesLista],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ConvitesService, useValue: servico },
    ],
  });
  return TestBed.createComponent(ConvitesLista);
}

const semConvite = {
  paciente_id: 'p1',
  nome: 'Maria Souza',
  cpf: '12345678900',
  medicas: 'Dra A',
  convite_id: null,
  criado_em: null,
  expira_em: null,
  ativado_em: null,
  revogado_em: null,
  situacao: 'sem_convite',
};

const pendente = { ...semConvite, paciente_id: 'p2', nome: 'Ana Lima', situacao: 'pendente' };

type Interno = {
  emitir(linha: unknown): Promise<void>;
  confirmarRevogacao(): Promise<void>;
  aRevogar: { set(v: unknown): void };
  emitidos: { (): unknown[] };
};

describe('ConvitesLista', () => {
  it('mostra a situação e o CPF formatado', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [semConvite, pendente] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Maria Souza');
    expect(texto).toContain('123.456.789-00');
    expect(texto).toContain('Sem convite');
    expect(texto).toContain('Pendente');
  });

  it('abre a janela com o código depois de emitir', async () => {
    const emitir = vi.fn().mockResolvedValue({ ok: true, valor: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [semConvite] }),
      emitir,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.emitir(semConvite);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitir).toHaveBeenCalledWith('p1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'AAAA-BBBB-CCCC-DDDD-EEEE',
    );
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem permissão.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem permissão.');
  });

  it('revoga apenas depois da confirmação', async () => {
    const revogar = vi.fn().mockResolvedValue({ ok: true, valor: 1 });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [pendente] }),
      revogar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(revogar).not.toHaveBeenCalled();

    componente.aRevogar.set(pendente);
    await componente.confirmarRevogacao();

    expect(revogar).toHaveBeenCalledWith('p2');
  });

  it('avisa quando não há paciente', async () => {
    const fixture = montar({ listar: vi.fn().mockResolvedValue({ ok: true, valor: [] }) });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma paciente encontrada',
    );
  });
});
```

**Validação:**

```bash
npm test
```

Todos passam, incluindo os já existentes de `auth`, `login`, `pacientes` e `formato`.

---

### Etapa 10 — Atualizar a documentação

**Depende de:** Etapa 9
**Arquivos:** `docs/roadmap-web.md` (editar)

**O que fazer:** substitua as três linhas pendentes da seção `### W2` por:

```markdown
- [x] Convites: emitir e reemitir (`emitir_convite_pela_secretaria`), revogar pendente, emissão em lote e painel de situação (`convites_da_secretaria`)
- [x] Cenários 33–37 no `supabase/tests/rls_smoke.sql`
- [ ] Vínculos: transferir, inativar, segundo vínculo (medicina fetal).
- [ ] Equipe: gerenciar usuários `medica`/`secretaria`.
```

**Validação:**

```bash
npm run format:check
```

Sem erro de formatação.

## 7. Testes

| Arquivo                    | Caso                                                 | O que assegura                                                                             |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `rls_smoke.sql` cenário 33 | gate de papel, paciente inexistente, hash, auditoria | Médica não emite pela RPC da secretaria; o código devolvido corresponde ao hash gravado    |
| cenário 34                 | reemissão                                            | O convite anterior fica revogado, o histórico é preservado e a auditoria marca `reemissao` |
| cenário 35                 | revogação                                            | Atinge só o pendente, recusa a segunda chamada e nunca marca convite já ativado            |
| cenário 36                 | lote                                                 | Gate de papel, lote vazio recusado, emite para quem nunca teve convite e pula o resto      |
| cenário 37                 | listagem                                             | Situação derivada correta, filtro por situação, busca por nome, gate de papel              |
| `convites.service.spec.ts` | busca/situação vazias                                | Viram `undefined` e a RPC aplica o `default null`                                          |
| `convites.service.spec.ts` | erros                                                | `P0001` repassa a mensagem da RPC; código desconhecido vira mensagem genérica              |
| `convites.service.spec.ts` | lote                                                 | O array de ids chega inteiro em `p_paciente_ids`                                           |
| `convites-lista.spec.ts`   | render                                               | Situação com rótulo em português e CPF formatado                                           |
| `convites-lista.spec.ts`   | emissão                                              | A janela abre com o código devolvido                                                       |
| `convites-lista.spec.ts`   | revogação                                            | Nada é revogado sem passar pela confirmação                                                |
| `convites-lista.spec.ts`   | erro e vazio                                         | Mensagem do serviço e estado sem resultados aparecem                                       |

Testes existentes que devem continuar verdes **sem edição**: `app.spec.ts`, `auth.service.spec.ts`,
`auth.guard.spec.ts`, `login.spec.ts`, `pacientes.service.spec.ts`, `pacientes-lista.spec.ts`,
`paciente-formulario.spec.ts`, `cpf.spec.ts`, `data.spec.ts`, e os cenários 1–32 do smoke.

## 8. Riscos e casos de borda

- **Reemissão derruba o aparelho atual.** A Edge Function apaga o profile anterior ao ativar
  (`ativar-convite/index.ts:161`). Reemitir para quem já usa o app **é** a troca de aparelho — por
  isso a tela separa "Emitir" de "Reemitir" no rótulo e o lote nunca reemite.
- **Empate em `criado_em`.** Convites criados na mesma transação compartilham o `now()`; sem o
  desempate `, c.id desc` do lateral, "o convite mais recente" seria sorteio. `painel_da_medica`
  tem o mesmo lateral sem desempate — não é escopo desta tarefa, mas vale registrar.
- **O código aparece no navegador.** Fica no DOM enquanto a janela está aberta e vai para a área
  de transferência no "Copiar tudo". É o mesmo grau de exposição do app da médica, que mostra o
  código na tela. Nada é gravado: a tabela só tem o hash.
- **Janela fechada sem anotar.** Não há como recuperar o texto — a única saída é reemitir, o que
  revoga o código perdido. O alerta em vermelho na janela existe para isso.
- **Lote acima de 50.** A RPC recusa com `'O lote aceita no máximo 50 pacientes'`; a mensagem
  chega inteira na tela pelo caminho `P0001`.
- **`navigator.clipboard` indisponível.** Em contexto não seguro (http) ou no jsdom dos testes a
  API não existe; o `catch` mostra a orientação de copiar manualmente em vez de quebrar a tela.
- **Convite expirado não vira revogado sozinho.** `expira_em` é comparado no `case` da listagem;
  não há job de expiração. Reemitir para uma paciente com convite expirado revoga o expirado e
  gera outro, que é o comportamento desejado.
- **Secretaria continua sem ler `public.convites` direto.** Se uma tela futura precisar da view
  `convites_status`, vai precisar de uma policy nova — deliberadamente fora desta fatia.
- **`emitir_convites_em_lote` chama `emitir_convite_pela_secretaria`,** que revalida
  `is_secretaria()` a cada iteração. São 50 chamadas de uma função `stable` com índice em
  `profiles.id`; o custo é irrelevante e o ganho é não duplicar a lógica de emissão.
- **Duas migrations no repo do mobile** exigem commit lá também; o `prenatalweb` só depende do
  `database.types.ts` regenerado.

## 9. Rollback

- **Frontend:** reverter o commit no `prenatalweb`. Nada persiste fora do bundle.
- **Backend:** migration nova com
  `drop function public.convites_da_secretaria(text, text);`,
  `drop function public.emitir_convites_em_lote(uuid[]);`,
  `drop function public.revogar_convite_pela_secretaria(uuid);` e
  `drop function public.emitir_convite_pela_secretaria(uuid);`.
  Nenhuma tabela, coluna ou policy é criada nesta fatia, então o rollback é limpo. Convites já
  emitidos pela secretaria continuam válidos e ativáveis — foram gravados pelo mesmo caminho que
  os da médica.

## 10. Checklist final

- [ ] `20260820120700_convites_secretaria_emissao.sql` criada; as três funções existem em `pg_proc`
- [ ] `20260820120800_convites_da_secretaria.sql` criada com o desempate `, c.id desc` no lateral
- [ ] `rls_smoke.sql` roda de `OK 1` a `OK 37` sem nenhum `FAIL`
- [ ] `src/types/database.types.ts` regenerado com as quatro funções novas
- [ ] `ConvitesService` criado, sem lançar exceção para o componente
- [ ] `/convites` registrada sob `papelGuard('secretaria')` e item na sidebar só para secretaria
- [ ] Checkbox de lote desabilitado para linha que não é `sem_convite`
- [ ] Janela de códigos com alerta de "aparece uma única vez" e botão de copiar com `try/catch`
- [ ] Revogação exige confirmação em janela própria
- [ ] Nenhum arquivo de teste existente foi editado
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` todos verdes
- [ ] Roteiro manual como `secretaria`: `/convites` lista → emitir para uma "Sem convite" → código aparece → situação vira "Pendente" → revogar → vira "Revogado" → reemitir → volta a "Pendente" → selecionar duas "Sem convite" e emitir em lote → dois códigos na janela
- [ ] Roteiro manual como `medica`: sidebar sem "Convites"; abrir `/convites` na URL cai em `/sem-acesso`
- [ ] Cadastro e reemissão de convite pelo app Flutter continuam funcionando
- [ ] `docs/roadmap-web.md` atualizado e `npm run format:check` limpo
- [ ] Este plano salvo como `docs/plano-w2-convites.md`
