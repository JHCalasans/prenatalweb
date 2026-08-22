# Plano de Implementação: W3 — Protocolo

## 1. Objetivo

Ao final, uma usuária com papel `medica` acessa `/protocolo` no web, vê os itens do protocolo
agrupados por trimestre com a janela de semanas, cria item novo, edita, reordena, aposenta e
reativa. Editar um item que **nenhuma** gestação marcou altera a linha no lugar; editar um item
que **alguma** gestação já marcou aposenta a versão antiga e cria uma substituta na mesma raiz —
as gestações que marcaram continuam vendo a versão antiga, as demais passam a ver a nova. A
gestante e o app Flutter não têm comportamento alterado, e `checklist_da_gestacao` continua com a
mesma assinatura.

## 2. Contexto atual

### Backend — `~/Documents/VoidSans/prenatalapp/supabase/`

`public.protocolo_itens` (`migrations/20260808193116_init_schema.sql:97`, mais a coluna da Fase 4):

```
id uuid pk default gen_random_uuid(),
nome text not null,
trimestre smallint not null check (trimestre between 1 and 3),
semana_ini smallint not null check (semana_ini between 0 and 42),
semana_fim smallint not null check (semana_fim between 0 and 42),
obrigatorio boolean not null default true,
ordem smallint not null default 0,
ativo boolean not null default true,
constraint protocolo_janela check (semana_ini <= semana_fim)
```

Índice `protocolo_itens_ativo_idx on public.protocolo_itens (trimestre, ordem) where ativo`.

`public.gestacao_checklist` referencia `protocolo_itens (id)` **sem** `on delete cascade`
(`init_schema.sql:111`), com `unique (gestacao_id, protocolo_item_id)`. Por isso a Fase 4 decidiu
aposentar em vez de deletar.

Acesso hoje:

- Policy `protocolo_select` (`init_schema.sql:630`): `for select to authenticated using (true)` —
  qualquer autenticado lê, inclusive gestante.
- `grant select on public.protocolo_itens to authenticated`
  (`20260820120200_grants_autenticado.sql`). **Nenhum grant de escrita** — não existe caminho de
  escrita para cliente algum hoje, nem RPC.

`public.checklist_da_gestacao(p_gestacao_id uuid)`
(`migrations/20260818120000_fase4_checklist.sql`) devolve `returns table (protocolo_item_id, nome,
trimestre, semana_ini, semana_fim, obrigatorio, ordem, status, data, observacao)`. O corpo é:

```sql
from public.protocolo_itens pi
left join public.gestacao_checklist gc
  on gc.protocolo_item_id = pi.id
 and gc.gestacao_id = p_gestacao_id
where pi.ativo or gc.id is not null
order by pi.trimestre, pi.ordem, pi.nome;
```

**É daí que vem o problema desta fatia:** a leitura é derivada do catálogo ao vivo, então editar
`semana_ini` de um item muda a janela de **todas** as gestações, ativas inclusive. O comentário da
própria migration assume isso ("Trocar o protocolo depois da Fase 0 propaga sozinha"), mas o
roadmap W3 pede o contrário.

`public.marcar_checklist_item` (mesma migration) exige `protocolo_itens.ativo` para aceitar a
marcação, e a escrita direta em `gestacao_checklist` está revogada.

`public.painel_da_medica()` (`20260819120000_fase5_painel_medica.sql:172`) agrega
`checklist_janelas` com `where pi.ativo and coalesce(gc.status, 'pendente') not in ('realizado',
'nao_aplicavel')`.

O seed provisório está em `migrations/20260808193117_seed_protocolo.sql`: 22 itens, ordem de 10 em
10, com o comentário "Substituir após resposta da pergunta 6 da descoberta com as médicas".

O app Flutter **nunca lê `protocolo_itens` direto** — só consome `checklist_da_gestacao` por
`lib/features/checklist/data/checklist_repository.dart`, mapeando por nome de coluna em
`lib/features/checklist/data/checklist_item.dart:72`. A regra de janela vive no cliente
(`checklist_item.dart:95`).

`supabase/tests/rls_smoke.sql` tem 1902 linhas, cenários **1 a 41**, `rollback;` na linha 1900.
Helpers `pg_temp.as_user(uuid)`, `pg_temp.as_service_role()`, `pg_temp.back_to_postgres()`.
Chaves de `smoke_ids`: `medica_a`, `medica_b`, `secretaria`, `paciente_user`, `paciente_row`,
`paciente_nova`, `paciente_virgem`, `gestacao`, `vinculo_fetal`.

Padrão das RPCs de escrita no projeto: `security definer`, `set search_path = public`, gate
interno com `raise exception`, **sem** `revoke execute` (ver `init_schema.sql:386-389` sobre o
segfault do PG17/ARM64), e `insert into public.audit_log` ao final.

### Frontend — `~/Documents/VoidSans/prenatalweb/` (commit `eb5e379`)

| Arquivo                                          | Papel                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/app/core/convites/convites.service.ts`      | Modelo do serviço: `Resultado<T>`, `mensagemDeErro` local mapeando `P0001`                             |
| `src/app/pages/convites/lista/convites-lista.ts` | Modelo de tela: `p-table`, `p-tag`, `p-dialog` de confirmação por signal, `agindo`/`carregando`/`erro` |
| `src/app/core/auth/auth.guard.ts`                | `papelGuard(...papeis)` aceita vários papéis                                                           |
| `src/app/app.routes.ts`                          | `/pacientes`, `/convites` e `/equipe` sob `papelGuard('secretaria')`                                   |
| `src/app/layout/shell/shell.html`                | `<nav>` com um único `@if (papel() === 'secretaria')` (linhas 9–22) — **não há bloco para `medica`**   |

PrimeNG 21.1.9: `p-table`, `p-dialog`, `p-select`, `p-tag`, `p-message`, `p-inputtext`,
`p-checkbox`, `p-inputnumber` disponíveis. Testes com Vitest + `TestBed` e
`provideZonelessChangeDetection()`; hoje 63 testes em 15 arquivos.

## 3. Escopo

**Dentro:**

- Coluna `protocolo_itens.raiz_id` + trigger que a preenche, e reescrita de
  `checklist_da_gestacao` para escolher uma versão por raiz.
- RPCs `criar_protocolo_item`, `atualizar_protocolo_item`, `aposentar_protocolo_item`,
  `reativar_protocolo_item`, `reordenar_protocolo` e `protocolo_da_clinica`.
- Cenários 42–46 em `supabase/tests/rls_smoke.sql`.
- Regeneração de `src/types/database.types.ts`.
- `ProtocoloService` no web.
- Tela `/protocolo` sob `papelGuard('medica')`, com bloco novo de `medica` na sidebar.
- Testes unitários do serviço e da tela.
- Atualização de `docs/roadmap-web.md`.

**Fora — não fazer nesta tarefa:**

- Não criar tabela `protocolo_versoes` nem coluna em `gestacoes`: o versionamento é por item, não
  por gestação.
- Não alterar `marcar_checklist_item`, `painel_da_medica` nem qualquer policy existente.
- Não alterar a assinatura de `checklist_da_gestacao` — as dez colunas e a ordem permanecem.
- Não tocar em nenhum arquivo Dart do `prenatalapp`.
- Não substituir o conteúdo de `20260808193117_seed_protocolo.sql` — trocar o protocolo
  provisório é a Fase 0, e agora passa a ser feito pela tela.
- Não permitir que `secretaria` escreva no protocolo (ela continua só lendo).
- Não implementar arrastar-e-soltar para reordenar.
- Não adicionar dependência npm nova.
- Não editar arquivo de teste existente, **exceto** se a tela nova for embutida em outra que já
  tenha spec — não é o caso aqui.

## 4. Decisões técnicas

| Decisão                       | Escolha                                                                                            | Motivo                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retroatividade                | Cópia-na-escrita por item, com `raiz_id`                                                           | Escolha do usuário. Não mexe na assinatura da RPC que o Flutter consome nem exige migrar `gestacoes`, e atende literalmente "não retroage sobre checklists já gerados": checklist gerado = linha em `gestacao_checklist` |
| Ligação entre versões         | `raiz_id` apontando para a **raiz** da cadeia, não para o antecessor imediato                      | Com antecessor, uma cadeia A→B→C faria a gestação que marcou A ver A **e** C (B fica escondido, C não). Agrupar por raiz resolve cadeias de qualquer tamanho com um `distinct on`                                        |
| Quem preenche `raiz_id`       | Trigger `before insert`, `new.raiz_id := coalesce(new.raiz_id, new.id)`                            | Defaults de coluna são aplicados antes de triggers `before`, então `new.id` já existe. Cobre o seed e qualquer insert futuro sem depender de a RPC lembrar                                                               |
| Escolha da versão na leitura  | `distinct on (pi.raiz_id) ... order by pi.raiz_id, (gc.id is not null) desc, pi.ativo desc, pi.id` | A versão que a gestação marcou vence; sem marcação, vence a ativa; o `pi.id` no fim torna o resultado determinístico                                                                                                     |
| Editar item nunca marcado     | Altera a linha no lugar, **sem** versionar                                                         | Versionar um item que ninguém usou só acumula lixo. O protocolo será muito editado antes de entrar em uso real                                                                                                           |
| Editar item aposentado        | Proibido, `raise exception 'Item aposentado não é editável'`                                       | Editar uma versão histórica reescreveria o passado de quem a marcou — exatamente o que esta fatia existe para impedir                                                                                                    |
| Quem escreve                  | `current_papel() = 'medica'` nas cinco RPCs de escrita                                             | Escolha do usuário: o protocolo é decisão clínica                                                                                                                                                                        |
| Quem lê pela tela             | `protocolo_da_clinica` aceita `medica` e `secretaria`                                              | A policy `protocolo_select` já libera leitura a todo autenticado; a RPC é mais restritiva de propósito, para não expor o catálogo administrativo à gestante                                                              |
| Contador de uso               | `protocolo_da_clinica` devolve `marcacoes` (linhas em `gestacao_checklist`)                        | É o que decide se editar vai versionar; a tela avisa antes de a médica salvar                                                                                                                                            |
| Reordenação                   | RPC `reordenar_protocolo(uuid[])` que reescreve `ordem` como 10, 20, 30…                           | Reatribuir tudo evita colisões e buracos; a UI manda a lista inteira do trimestre na ordem desejada                                                                                                                      |
| Controle de ordem na UI       | Botões subir/descer, não arrastar-e-soltar                                                         | `p-table` com reorder exige `[reorderableColumns]`/`pReorderableRow` e é difícil de testar em jsdom; setas cobrem o caso real de mover um item uma ou duas posições                                                      |
| Reativar item aposentado      | Permitido, mas recusado se já houver outra versão ativa na mesma raiz                              | Sem a guarda, reativar criaria duas versões ativas da mesma raiz e o `distinct on` escolheria uma delas em silêncio                                                                                                      |
| `painel_da_medica`            | **Não** é alterado                                                                                 | Ele já filtrava por `pi.ativo`; um item aposentado sai das janelas de urgência, o que é o comportamento certo — item aposentado não deve mais ser cobrado. Ver Riscos                                                    |
| Validação de janela/trimestre | Repetida nas RPCs, além dos `check` da tabela                                                      | O `check` devolve `23514` com texto em inglês; a RPC devolve `P0001` com a frase em português que a tela mostra direto                                                                                                   |
| Aposentar sem substituto      | Permitido                                                                                          | Tirar um exame do protocolo é decisão legítima; quem já marcou continua vendo pelo `gc.id is not null`                                                                                                                   |

## 5. Pré-requisitos

- Docker rodando com o stack local do Supabase do `prenatalapp`; `psql` no PATH.
- Fatias 1–4 da W2 aplicadas (commit `7f8065d` no `prenatalapp`, `eb5e379` no `prenatalweb`).
- `flutter` no PATH para rodar a suíte do mobile na Etapa 3.
- Nenhuma dependência npm nova.

## 6. Etapas

Etapas 1–4 no repo `~/Documents/VoidSans/prenatalapp`. Etapas 5–10 no `~/Documents/VoidSans/prenatalweb`.

---

### Etapa 1 — Coluna `raiz_id` e trigger

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260821120000_protocolo_raiz.sql` (criar)

**O que fazer:** adicionar a coluna que liga as versões de um mesmo item, preencher o que já
existe e garantir o preenchimento automático dali em diante.

**Código:**

```sql
-- W3: versionamento por item. Editar um item já marcado por alguma gestação
-- passa a aposentar a linha antiga e criar uma substituta; raiz_id é o que
-- mantém as duas ligadas para a leitura escolher uma só.

alter table public.protocolo_itens
  add column raiz_id uuid references public.protocolo_itens (id);

update public.protocolo_itens set raiz_id = id where raiz_id is null;

alter table public.protocolo_itens alter column raiz_id set not null;

create index protocolo_itens_raiz_idx on public.protocolo_itens (raiz_id);

-- Defaults de coluna são aplicados antes dos triggers `before`, então new.id
-- já existe aqui. Sem isso, todo insert precisaria lembrar de preencher raiz_id.
create or replace function public.protocolo_itens_set_raiz()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.raiz_id := coalesce(new.raiz_id, new.id);
  return new;
end;
$$;

create trigger protocolo_itens_raiz
before insert on public.protocolo_itens
for each row execute function public.protocolo_itens_set_raiz();
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset
```

Conclui sem erro. Depois:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select count(*) as itens, count(*) filter (where raiz_id = id) as raiz_propria from public.protocolo_itens;"
```

Saída esperada: `itens = 22` e `raiz_propria = 22`.

---

### Etapa 2 — Reescrever `checklist_da_gestacao`

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260821120100_checklist_por_raiz.sql` (criar)

**O que fazer:** substituir o corpo da RPC para devolver **uma linha por raiz**. A assinatura e as
dez colunas não mudam — o app Flutter consome esta função e mapeia por nome de coluna.

**Código:**

```sql
-- Uma linha por raiz: a versão que a gestação marcou vence; sem marcação,
-- vence a ativa. Sem isso, uma gestação que marcou a versão antiga veria a
-- antiga (por gc.id) e a nova (por pi.ativo) como dois itens separados.
-- Assinatura idêntica à da Fase 4: o app Flutter consome esta função.

create or replace function public.checklist_da_gestacao(p_gestacao_id uuid)
returns table (
  protocolo_item_id uuid,
  nome text,
  trimestre smallint,
  semana_ini smallint,
  semana_fim smallint,
  obrigatorio boolean,
  ordem smallint,
  status public.status_checklist,
  data date,
  observacao text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.paciente_dona_da_gestacao(p_gestacao_id)
    or public.medica_vinculada_a_gestacao(p_gestacao_id)
  ) then
    raise exception 'Sem acesso a esta gestação';
  end if;

  return query
    select
      escolhido.id,
      escolhido.nome,
      escolhido.trimestre,
      escolhido.semana_ini,
      escolhido.semana_fim,
      escolhido.obrigatorio,
      escolhido.ordem,
      coalesce(escolhido.gc_status, 'pendente'::public.status_checklist),
      escolhido.gc_data,
      escolhido.gc_observacao
    from (
      select distinct on (pi.raiz_id)
        pi.id,
        pi.nome,
        pi.trimestre,
        pi.semana_ini,
        pi.semana_fim,
        pi.obrigatorio,
        pi.ordem,
        gc.status as gc_status,
        gc.data as gc_data,
        gc.observacao as gc_observacao
      from public.protocolo_itens pi
      left join public.gestacao_checklist gc
        on gc.protocolo_item_id = pi.id
       and gc.gestacao_id = p_gestacao_id
      -- Item aposentado some do catálogo, mas não do histórico de quem já o fez.
      where pi.ativo or gc.id is not null
      order by pi.raiz_id, (gc.id is not null) desc, pi.ativo desc, pi.id
    ) escolhido
    order by escolhido.trimestre, escolhido.ordem, escolhido.nome;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Código de saída 0, terminando em `ROLLBACK`. Os cenários 21–23 da Fase 4, que já exercitam
`checklist_da_gestacao`, continuam passando sem edição.

---

### Etapa 3 — Confirmar que o mobile não quebrou

**Depende de:** Etapa 2
**Arquivos:** nenhum

**O que fazer:** a Etapa 2 mexeu na RPC que o app Flutter consome. Rodar a suíte do mobile é o que
prova que o contrato não mudou.

**Código:**

```bash
cd ~/Documents/VoidSans/prenatalapp && flutter analyze && flutter test
```

**Validação:** `No issues found!` e `All tests passed!`, com a mesma contagem de antes
(`+71`). Em especial `test/fase4_checklist_test.dart` deve continuar verde sem edição.

---

### Etapa 4 — RPCs de escrita e listagem do protocolo

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260821120200_protocolo_rpc.sql` (criar)

**O que fazer:** criar as seis RPCs. Sem `revoke execute` — o gate é interno.

**Código:**

```sql
-- W3: a médica edita o protocolo pelo web. Não existe grant de escrita em
-- protocolo_itens para nenhum cliente, então tudo passa por security definer.
-- O gate é interno (current_papel), NÃO `revoke execute` — ver o comentário do
-- init_schema sobre o segfault do PG17/ARM64.

create or replace function public.criar_protocolo_item(
  p_nome text,
  p_trimestre smallint,
  p_semana_ini smallint,
  p_semana_fim smallint,
  p_obrigatorio boolean default true,
  p_ordem smallint default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas editam o protocolo';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Nome do item é obrigatório';
  end if;
  if p_trimestre not between 1 and 3 then
    raise exception 'Trimestre deve ser 1, 2 ou 3';
  end if;
  if p_semana_ini not between 0 and 42 or p_semana_fim not between 0 and 42 then
    raise exception 'Semanas devem estar entre 0 e 42';
  end if;
  if p_semana_ini > p_semana_fim then
    raise exception 'A semana inicial não pode ser maior que a final';
  end if;

  insert into public.protocolo_itens
    (nome, trimestre, semana_ini, semana_fim, obrigatorio, ordem)
  values
    (btrim(p_nome), p_trimestre, p_semana_ini, p_semana_fim, p_obrigatorio, p_ordem)
  returning id into v_id;

  insert into public.audit_log (ator_id, acao, entidade, entidade_id, meta)
  values (
    auth.uid(),
    'protocolo.item_criado',
    'protocolo_itens',
    v_id,
    jsonb_build_object('nome', btrim(p_nome), 'trimestre', p_trimestre)
  );

  return v_id;
end;
$$;

-- Item que ninguém marcou é editado no lugar; item em uso é aposentado e
-- ganha substituto na mesma raiz. Devolve o id que passou a valer.
create or replace function public.atualizar_protocolo_item(
  p_item_id uuid,
  p_nome text,
  p_trimestre smallint,
  p_semana_ini smallint,
  p_semana_fim smallint,
  p_obrigatorio boolean,
  p_ordem smallint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raiz uuid;
  v_ativo boolean;
  v_em_uso boolean;
  v_novo uuid;
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas editam o protocolo';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Nome do item é obrigatório';
  end if;
  if p_trimestre not between 1 and 3 then
    raise exception 'Trimestre deve ser 1, 2 ou 3';
  end if;
  if p_semana_ini not between 0 and 42 or p_semana_fim not between 0 and 42 then
    raise exception 'Semanas devem estar entre 0 e 42';
  end if;
  if p_semana_ini > p_semana_fim then
    raise exception 'A semana inicial não pode ser maior que a final';
  end if;

  select pi.raiz_id, pi.ativo into v_raiz, v_ativo
    from public.protocolo_itens pi
   where pi.id = p_item_id;

  if v_raiz is null then
    raise exception 'Item do protocolo não encontrado';
  end if;
  if not v_ativo then
    raise exception 'Item aposentado não é editável';
  end if;

  select exists (
    select 1 from public.gestacao_checklist gc
     where gc.protocolo_item_id = p_item_id
  ) into v_em_uso;

  if not v_em_uso then
    update public.protocolo_itens
       set nome = btrim(p_nome),
           trimestre = p_trimestre,
           semana_ini = p_semana_ini,
           semana_fim = p_semana_fim,
           obrigatorio = p_obrigatorio,
           ordem = p_ordem
     where id = p_item_id;

    insert into public.audit_log (ator_id, acao, entidade, entidade_id, meta)
    values (
      auth.uid(),
      'protocolo.item_editado',
      'protocolo_itens',
      p_item_id,
      jsonb_build_object('versionado', false)
    );

    return p_item_id;
  end if;

  update public.protocolo_itens set ativo = false where id = p_item_id;

  insert into public.protocolo_itens
    (nome, trimestre, semana_ini, semana_fim, obrigatorio, ordem, raiz_id)
  values
    (btrim(p_nome), p_trimestre, p_semana_ini, p_semana_fim, p_obrigatorio,
     p_ordem, v_raiz)
  returning id into v_novo;

  insert into public.audit_log (ator_id, acao, entidade, entidade_id, meta)
  values (
    auth.uid(),
    'protocolo.item_editado',
    'protocolo_itens',
    v_novo,
    jsonb_build_object('versionado', true, 'substitui', p_item_id, 'raiz_id', v_raiz)
  );

  return v_novo;
end;
$$;

create or replace function public.aposentar_protocolo_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas editam o protocolo';
  end if;

  select pi.ativo into v_ativo
    from public.protocolo_itens pi
   where pi.id = p_item_id;

  if v_ativo is null then
    raise exception 'Item do protocolo não encontrado';
  end if;
  if not v_ativo then
    raise exception 'Item já está aposentado';
  end if;

  update public.protocolo_itens set ativo = false where id = p_item_id;

  insert into public.audit_log (ator_id, acao, entidade, entidade_id)
  values (auth.uid(), 'protocolo.item_aposentado', 'protocolo_itens', p_item_id);
end;
$$;

-- Duas versões ativas na mesma raiz fariam o distinct on da leitura escolher
-- uma em silêncio.
create or replace function public.reativar_protocolo_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raiz uuid;
  v_ativo boolean;
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas editam o protocolo';
  end if;

  select pi.raiz_id, pi.ativo into v_raiz, v_ativo
    from public.protocolo_itens pi
   where pi.id = p_item_id;

  if v_raiz is null then
    raise exception 'Item do protocolo não encontrado';
  end if;
  if v_ativo then
    raise exception 'Item já está ativo';
  end if;

  if exists (
    select 1 from public.protocolo_itens pi
     where pi.raiz_id = v_raiz and pi.ativo
  ) then
    raise exception 'Já existe uma versão ativa deste item';
  end if;

  update public.protocolo_itens set ativo = true where id = p_item_id;

  insert into public.audit_log (ator_id, acao, entidade, entidade_id)
  values (auth.uid(), 'protocolo.item_reativado', 'protocolo_itens', p_item_id);
end;
$$;

-- Reescreve a ordem inteira como 10, 20, 30… A UI manda a lista do trimestre
-- na ordem desejada; reatribuir tudo evita colisão e buraco.
create or replace function public.reordenar_protocolo(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos integer;
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas editam o protocolo';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Nenhum item para reordenar';
  end if;

  for v_pos in 1..array_length(p_ids, 1) loop
    update public.protocolo_itens
       set ordem = (v_pos * 10)::smallint
     where id = p_ids[v_pos]
       and ativo;
  end loop;

  insert into public.audit_log (ator_id, acao, entidade, meta)
  values (
    auth.uid(),
    'protocolo.reordenado',
    'protocolo_itens',
    jsonb_build_object('total', array_length(p_ids, 1))
  );
end;
$$;

-- `marcacoes` é o que diz à tela se editar vai versionar ou alterar no lugar.
create or replace function public.protocolo_da_clinica(p_incluir_aposentados boolean default false)
returns table (
  item_id uuid,
  nome text,
  trimestre smallint,
  semana_ini smallint,
  semana_fim smallint,
  obrigatorio boolean,
  ordem smallint,
  ativo boolean,
  raiz_id uuid,
  marcacoes integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_papel() not in ('medica', 'secretaria') then
    raise exception 'Apenas a equipe consulta o protocolo por aqui';
  end if;

  return query
    select
      pi.id,
      pi.nome,
      pi.trimestre,
      pi.semana_ini,
      pi.semana_fim,
      pi.obrigatorio,
      pi.ordem,
      pi.ativo,
      pi.raiz_id,
      coalesce(uso.total, 0)::integer
    from public.protocolo_itens pi
    left join lateral (
      select count(*) as total
      from public.gestacao_checklist gc
      where gc.protocolo_item_id = pi.id
    ) uso on true
    where p_incluir_aposentados or pi.ativo
    order by pi.trimestre, pi.ordem, pi.nome;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select proname from pg_proc where proname in ('criar_protocolo_item','atualizar_protocolo_item','aposentar_protocolo_item','reativar_protocolo_item','reordenar_protocolo','protocolo_da_clinica') order by 1;"
```

Saída esperada: seis linhas.

---

### Etapa 5 — Cenários 42–46 no smoke

**Depende de:** Etapa 4
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

**O que fazer:** inserir o bloco abaixo **imediatamente antes** da linha `rollback;` (hoje linha
1900). Não altere fixtures nem cenários existentes.

**Código:**

```sql
-- ---------------------------------------------------------------------------
-- 42) Escrita no protocolo é exclusiva da médica
-- ---------------------------------------------------------------------------
do $$
declare
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_paciente_user uuid := (select value from smoke_ids where key = 'paciente_user');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_id uuid;
begin
  perform pg_temp.as_user(v_secretaria);
  begin
    perform public.criar_protocolo_item('Invasor', 1::smallint, 6::smallint, 12::smallint);
    raise exception 'FAIL: secretaria criou item de protocolo';
  exception when others then
    if sqlerrm <> 'Apenas médicas editam o protocolo' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_paciente_user);
  begin
    perform * from public.protocolo_da_clinica(false);
    raise exception 'FAIL: gestante listou o protocolo pela RPC da equipe';
  exception when others then
    if sqlerrm <> 'Apenas a equipe consulta o protocolo por aqui' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_medica_a);

  begin
    perform public.criar_protocolo_item('Sem nome', 1::smallint, 20::smallint, 10::smallint);
    raise exception 'FAIL: aceitou semana inicial maior que a final';
  exception when others then
    if sqlerrm <> 'A semana inicial não pode ser maior que a final' then
      raise;
    end if;
  end;

  begin
    perform public.criar_protocolo_item('Trimestre 4', 4::smallint, 6::smallint, 12::smallint);
    raise exception 'FAIL: aceitou trimestre 4';
  exception when others then
    if sqlerrm <> 'Trimestre deve ser 1, 2 ou 3' then
      raise;
    end if;
  end;

  v_id := public.criar_protocolo_item('  Exame Novo  ', 2::smallint, 20::smallint, 24::smallint);
  perform pg_temp.back_to_postgres();

  if (select nome from public.protocolo_itens where id = v_id) <> 'Exame Novo' then
    raise exception 'FAIL: o nome não foi trimado';
  end if;
  if (select raiz_id from public.protocolo_itens where id = v_id) <> v_id then
    raise exception 'FAIL: item novo deveria ser a própria raiz';
  end if;

  insert into smoke_ids values ('protocolo_novo', v_id);
  raise notice 'OK 42: escrita do protocolo segue papel e validações';
end $$;

-- ---------------------------------------------------------------------------
-- 43) Item nunca marcado é editado no lugar
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_id uuid := (select value from smoke_ids where key = 'protocolo_novo');
  v_retorno uuid;
  v_total int;
begin
  perform pg_temp.as_user(v_medica_a);
  v_retorno := public.atualizar_protocolo_item(
    v_id, 'Exame Novo Revisado', 2::smallint, 21::smallint, 25::smallint, false, 500::smallint
  );
  perform pg_temp.back_to_postgres();

  if v_retorno <> v_id then
    raise exception 'FAIL: item sem marcação não deveria ter sido versionado';
  end if;

  select count(*) into v_total
  from public.protocolo_itens where raiz_id = v_id;
  if v_total <> 1 then
    raise exception 'FAIL: a raiz ficou com % versões', v_total;
  end if;

  if (select semana_ini from public.protocolo_itens where id = v_id) <> 21 then
    raise exception 'FAIL: a edição no lugar não gravou a semana';
  end if;

  raise notice 'OK 43: item sem marcação é editado no lugar';
end $$;

-- ---------------------------------------------------------------------------
-- 44) Item já marcado é versionado, e o checklist não duplica
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_ativa uuid;
  v_item uuid;
  v_novo uuid;
  v_linhas int;
  v_semana smallint;
begin
  select g.id into v_ativa
  from public.gestacoes g
  where g.paciente_id = v_paciente and g.status = 'ativa';

  select pi.id into v_item
  from public.protocolo_itens pi
  where pi.ativo and pi.nome = 'Hemograma completo';

  perform pg_temp.as_user(v_medica_a);

  perform public.marcar_checklist_item(v_ativa, v_item, 'solicitado');

  v_novo := public.atualizar_protocolo_item(
    v_item, 'Hemograma completo', 1::smallint, 8::smallint, 14::smallint, true, 20::smallint
  );

  if v_novo = v_item then
    raise exception 'FAIL: item marcado deveria ter sido versionado';
  end if;

  select count(*) into v_linhas
  from public.checklist_da_gestacao(v_ativa)
  where nome = 'Hemograma completo';
  if v_linhas <> 1 then
    raise exception 'FAIL: o checklist trouxe % linhas do mesmo item', v_linhas;
  end if;

  select semana_ini into v_semana
  from public.checklist_da_gestacao(v_ativa)
  where nome = 'Hemograma completo';
  if v_semana <> 6 then
    raise exception 'FAIL: a gestação que marcou deveria ver a janela antiga (veio %)', v_semana;
  end if;

  begin
    perform public.atualizar_protocolo_item(
      v_item, 'Tentando de novo', 1::smallint, 6::smallint, 12::smallint, true, 20::smallint
    );
    raise exception 'FAIL: item aposentado foi editado';
  exception when others then
    if sqlerrm <> 'Item aposentado não é editável' then
      raise;
    end if;
  end;

  perform pg_temp.back_to_postgres();

  if (select raiz_id from public.protocolo_itens where id = v_novo)
     <> (select raiz_id from public.protocolo_itens where id = v_item) then
    raise exception 'FAIL: a substituta não herdou a raiz';
  end if;

  insert into smoke_ids values ('protocolo_versionado', v_novo);
  raise notice 'OK 44: edição versiona, preserva a janela de quem marcou e não duplica';
end $$;

-- ---------------------------------------------------------------------------
-- 45) Gestação sem marcação enxerga a versão nova
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_nova_paciente uuid;
  v_nova_gestacao uuid;
  v_semana smallint;
  v_linhas int;
begin
  insert into public.pacientes (nome) values ('Gestante W3') returning id into v_nova_paciente;
  insert into public.vinculos (paciente_id, medica_id, papel)
  values (v_nova_paciente, v_medica_a, 'obstetra');
  insert into public.gestacoes (paciente_id, dum, dpp_final, dpp_origem)
  values (v_nova_paciente, current_date - 140, current_date + 140, 'dum')
  returning id into v_nova_gestacao;

  perform pg_temp.as_user(v_medica_a);

  select count(*), min(semana_ini) into v_linhas, v_semana
  from public.checklist_da_gestacao(v_nova_gestacao)
  where nome = 'Hemograma completo';

  perform pg_temp.back_to_postgres();

  if v_linhas <> 1 then
    raise exception 'FAIL: gestação nova viu % linhas do item', v_linhas;
  end if;
  if v_semana <> 8 then
    raise exception 'FAIL: gestação sem marcação deveria ver a janela nova (veio %)', v_semana;
  end if;

  raise notice 'OK 45: quem não marcou enxerga a versão nova';
end $$;

-- ---------------------------------------------------------------------------
-- 46) Aposentar, reativar e reordenar
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_novo uuid := (select value from smoke_ids where key = 'protocolo_novo');
  v_versionado uuid := (select value from smoke_ids where key = 'protocolo_versionado');
  v_a uuid;
  v_b uuid;
  v_ordem_a smallint;
  v_ordem_b smallint;
begin
  perform pg_temp.as_user(v_medica_a);

  perform public.aposentar_protocolo_item(v_novo);

  begin
    perform public.aposentar_protocolo_item(v_novo);
    raise exception 'FAIL: aposentou duas vezes o mesmo item';
  exception when others then
    if sqlerrm <> 'Item já está aposentado' then
      raise;
    end if;
  end;

  perform public.reativar_protocolo_item(v_novo);

  begin
    perform public.reativar_protocolo_item(v_novo);
    raise exception 'FAIL: reativou item já ativo';
  exception when others then
    if sqlerrm <> 'Item já está ativo' then
      raise;
    end if;
  end;

  begin
    perform public.reativar_protocolo_item(
      (select pi.id from public.protocolo_itens pi
        where pi.raiz_id = (select raiz_id from public.protocolo_itens where id = v_versionado)
          and not pi.ativo
        limit 1)
    );
    raise exception 'FAIL: reativou versão antiga com outra ativa na mesma raiz';
  exception when others then
    if sqlerrm <> 'Já existe uma versão ativa deste item' then
      raise;
    end if;
  end;

  select pi.id into v_a from public.protocolo_itens pi
   where pi.ativo and pi.trimestre = 1 order by pi.ordem limit 1;
  select pi.id into v_b from public.protocolo_itens pi
   where pi.ativo and pi.trimestre = 1 and pi.id <> v_a order by pi.ordem limit 1;

  perform public.reordenar_protocolo(array[v_b, v_a]);
  perform pg_temp.back_to_postgres();

  select ordem into v_ordem_b from public.protocolo_itens where id = v_b;
  select ordem into v_ordem_a from public.protocolo_itens where id = v_a;

  if v_ordem_b <> 10 or v_ordem_a <> 20 then
    raise exception 'FAIL: reordenação gravou % e %', v_ordem_b, v_ordem_a;
  end if;

  raise notice 'OK 46: aposentar, reativar e reordenar seguem as guardas';
end $$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql > /tmp/smoke.out 2>&1; echo "exit=$?"; grep -c "^DO" /tmp/smoke.out
```

Saída esperada: `exit=0` e `47` blocos `DO` (1 de fixtures + 46 cenários), com `ROLLBACK` no fim.

---

### Etapa 6 — Regerar os tipos do banco

**Depende de:** Etapa 5
**Arquivos:** `~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` (regerar)

**Código:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase start && supabase gen types typescript --local > ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

**Validação:**

```bash
grep -n "protocolo_da_clinica\|criar_protocolo_item\|atualizar_protocolo_item\|reordenar_protocolo" ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

Saída esperada: as quatro funções na seção `Functions`.

---

### Etapa 7 — `ProtocoloService`

**Depende de:** Etapa 6
**Arquivos:** `src/app/core/protocolo/protocolo.service.ts` (criar)

**Código:**

```ts
import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaProtocolo = Database['public']['Functions']['protocolo_da_clinica']['Returns'][number];

export type ItemProtocolo = LinhaProtocolo;

export interface DadosItem {
  nome: string;
  trimestre: number;
  semanaIni: number;
  semanaFim: number;
  obrigatorio: boolean;
  ordem: number;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC; 23514 é o check da tabela, que só aparece se a validação
// da RPC deixar passar algo.
function mensagemDeErro(erro: PostgrestError): string {
  if (erro.code === '23514') {
    return 'Janela de semanas inválida.';
  }
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class ProtocoloService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listar(incluirAposentados: boolean): Promise<Resultado<ItemProtocolo[]>> {
    const { data, error } = await this.supabase.rpc('protocolo_da_clinica', {
      p_incluir_aposentados: incluirAposentados,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async criar(dados: DadosItem): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('criar_protocolo_item', {
      p_nome: dados.nome,
      p_trimestre: dados.trimestre,
      p_semana_ini: dados.semanaIni,
      p_semana_fim: dados.semanaFim,
      p_obrigatorio: dados.obrigatorio,
      p_ordem: dados.ordem,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async atualizar(itemId: string, dados: DadosItem): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('atualizar_protocolo_item', {
      p_item_id: itemId,
      p_nome: dados.nome,
      p_trimestre: dados.trimestre,
      p_semana_ini: dados.semanaIni,
      p_semana_fim: dados.semanaFim,
      p_obrigatorio: dados.obrigatorio,
      p_ordem: dados.ordem,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async aposentar(itemId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('aposentar_protocolo_item', {
      p_item_id: itemId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  async reativar(itemId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('reativar_protocolo_item', {
      p_item_id: itemId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  async reordenar(ids: readonly string[]): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('reordenar_protocolo', {
      p_ids: [...ids],
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

Sem erro. Se `ItemProtocolo` resolver para `never`, a Etapa 6 não foi aplicada.

---

### Etapa 8 — Tela `/protocolo`

**Depende de:** Etapa 7
**Arquivos:** `src/app/pages/protocolo/lista/protocolo-lista.ts`, `protocolo-lista.html`,
`protocolo-lista.scss` (criar)

**Código:**

`protocolo-lista.ts`:

```ts
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ItemProtocolo, ProtocoloService } from '../../../core/protocolo/protocolo.service';

@Component({
  imports: [
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-protocolo-lista',
  styleUrl: './protocolo-lista.scss',
  templateUrl: './protocolo-lista.html',
})
export class ProtocoloLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly protocolo = inject(ProtocoloService);

  protected readonly itens = signal<ItemProtocolo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly mostrarAposentados = signal(false);

  protected readonly editando = signal<ItemProtocolo | null>(null);
  protected readonly criando = signal(false);
  protected readonly aAposentar = signal<ItemProtocolo | null>(null);

  protected readonly trimestres = [
    { rotulo: '1º trimestre', valor: 1 },
    { rotulo: '2º trimestre', valor: 2 },
    { rotulo: '3º trimestre', valor: 3 },
  ];

  protected readonly formulario = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    trimestre: [1, Validators.required],
    semanaIni: [0, Validators.required],
    semanaFim: [0, Validators.required],
    obrigatorio: [true],
    ordem: [0],
  });

  protected readonly aberto = computed(() => this.criando() || this.editando() !== null);

  // Editar item já marcado por alguma gestação cria uma versão nova; a médica
  // precisa saber disso antes de salvar.
  protected readonly avisoVersao = computed(() => {
    const item = this.editando();
    return item !== null && item.marcacoes > 0;
  });

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.listar(this.mostrarAposentados());
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.itens.set([]);
        return;
      }
      this.itens.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async alternarAposentados(): Promise<void> {
    this.mostrarAposentados.update((v) => !v);
    await this.carregar();
  }

  protected abrirCriacao(): void {
    this.formulario.setValue({
      nome: '',
      trimestre: 1,
      semanaIni: 0,
      semanaFim: 0,
      obrigatorio: true,
      ordem: 0,
    });
    this.criando.set(true);
  }

  protected abrirEdicao(item: ItemProtocolo): void {
    this.formulario.setValue({
      nome: item.nome,
      trimestre: item.trimestre,
      semanaIni: item.semana_ini,
      semanaFim: item.semana_fim,
      obrigatorio: item.obrigatorio,
      ordem: item.ordem,
    });
    this.editando.set(item);
  }

  protected fechar(): void {
    this.criando.set(false);
    this.editando.set(null);
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const bruto = this.formulario.getRawValue();
      const dados = {
        nome: bruto.nome.trim(),
        trimestre: bruto.trimestre,
        semanaIni: bruto.semanaIni,
        semanaFim: bruto.semanaFim,
        obrigatorio: bruto.obrigatorio,
        ordem: bruto.ordem,
      };

      const item = this.editando();
      const resultado = item
        ? await this.protocolo.atualizar(item.item_id, dados)
        : await this.protocolo.criar(dados);

      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.fechar();
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarAposentadoria(): Promise<void> {
    const item = this.aAposentar();
    if (item === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.aposentar(item.item_id);
      this.aAposentar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async reativar(item: ItemProtocolo): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.reativar(item.item_id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  // Move dentro do próprio trimestre e reescreve a ordem daquele trimestre.
  protected async mover(item: ItemProtocolo, direcao: -1 | 1): Promise<void> {
    if (this.agindo()) {
      return;
    }
    const doTrimestre = this.itens().filter((i) => i.trimestre === item.trimestre && i.ativo);
    const posicao = doTrimestre.findIndex((i) => i.item_id === item.item_id);
    const destino = posicao + direcao;
    if (posicao < 0 || destino < 0 || destino >= doTrimestre.length) {
      return;
    }

    const reordenado = [...doTrimestre];
    [reordenado[posicao], reordenado[destino]] = [reordenado[destino], reordenado[posicao]];

    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.reordenar(reordenado.map((i) => i.item_id));
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }
}
```

`protocolo-lista.html`:

```html
<section class="pagina">
  <header class="cabecalho">
    <div>
      <p class="eyebrow">Clínica</p>
      <h1>Protocolo</h1>
    </div>
    <div class="botoes">
      <p-button
        [label]="mostrarAposentados() ? 'Ocultar aposentados' : 'Mostrar aposentados'"
        icon="pi pi-eye"
        severity="secondary"
        [disabled]="agindo()"
        (onClick)="alternarAposentados()"
      />
      <p-button
        label="Novo item"
        icon="pi pi-plus"
        [disabled]="agindo()"
        (onClick)="abrirCriacao()"
      />
    </div>
  </header>

  <p class="dica">
    Editar um item que alguma gestação já marcou cria uma versão nova: quem marcou continua com a
    janela antiga.
  </p>

  @if (erro()) {
  <p-message severity="error" [text]="erro()!" />
  }

  <p-table
    [value]="itens()"
    [loading]="carregando()"
    dataKey="item_id"
    rowGroupMode="subheader"
    groupRowsBy="trimestre"
  >
    <ng-template #header>
      <tr>
        <th>Item</th>
        <th>Janela</th>
        <th>Obrigatório</th>
        <th>Em uso</th>
        <th>Situação</th>
        <th></th>
      </tr>
    </ng-template>

    <ng-template #groupheader let-item>
      <tr>
        <td colspan="6" class="grupo">{{ item.trimestre }}º trimestre</td>
      </tr>
    </ng-template>

    <ng-template #body let-item>
      <tr>
        <td>{{ item.nome }}</td>
        <td>{{ item.semana_ini }}–{{ item.semana_fim }} sem</td>
        <td>{{ item.obrigatorio ? 'Sim' : 'Não' }}</td>
        <td>{{ item.marcacoes }}</td>
        <td>
          <p-tag
            [value]="item.ativo ? 'Ativo' : 'Aposentado'"
            [severity]="item.ativo ? 'success' : 'secondary'"
          />
        </td>
        <td class="acoes">
          @if (item.ativo) {
          <p-button
            icon="pi pi-arrow-up"
            severity="secondary"
            [text]="true"
            ariaLabel="Subir"
            [disabled]="agindo()"
            (onClick)="mover(item, -1)"
          />
          <p-button
            icon="pi pi-arrow-down"
            severity="secondary"
            [text]="true"
            ariaLabel="Descer"
            [disabled]="agindo()"
            (onClick)="mover(item, 1)"
          />
          <p-button
            label="Editar"
            icon="pi pi-pencil"
            severity="secondary"
            [text]="true"
            [disabled]="agindo()"
            (onClick)="abrirEdicao(item)"
          />
          <p-button
            label="Aposentar"
            icon="pi pi-ban"
            severity="danger"
            [text]="true"
            [disabled]="agindo()"
            (onClick)="aAposentar.set(item)"
          />
          } @else {
          <p-button
            label="Reativar"
            icon="pi pi-check"
            severity="secondary"
            [text]="true"
            [disabled]="agindo()"
            (onClick)="reativar(item)"
          />
          }
        </td>
      </tr>
    </ng-template>

    <ng-template #emptymessage>
      <tr>
        <td colspan="6" class="vazio">Nenhum item no protocolo.</td>
      </tr>
    </ng-template>
  </p-table>
</section>

<p-dialog
  [header]="editando() ? 'Editar item' : 'Novo item'"
  [visible]="aberto()"
  (visibleChange)="fechar()"
  [modal]="true"
  [style]="{ width: '32rem' }"
>
  @if (avisoVersao()) {
  <p-message
    severity="warn"
    text="Este item já foi marcado em alguma gestação. Salvar cria uma versão nova; quem marcou continua com a janela atual."
  />
  }

  <form class="formulario" [formGroup]="formulario" (ngSubmit)="salvar()">
    <label for="nome">Nome do item</label>
    <input id="nome" type="text" pInputText formControlName="nome" autocomplete="off" />

    <label for="trimestre">Trimestre</label>
    <p-select
      inputId="trimestre"
      formControlName="trimestre"
      [options]="trimestres"
      optionLabel="rotulo"
      optionValue="valor"
    />

    <label for="ini">Semana inicial</label>
    <p-inputnumber inputId="ini" formControlName="semanaIni" [min]="0" [max]="42" />

    <label for="fim">Semana final</label>
    <p-inputnumber inputId="fim" formControlName="semanaFim" [min]="0" [max]="42" />

    <div class="linha">
      <p-checkbox inputId="obrigatorio" formControlName="obrigatorio" [binary]="true" />
      <label for="obrigatorio" class="inline">Obrigatório</label>
    </div>
  </form>

  <ng-template #footer>
    <p-button label="Cancelar" severity="secondary" (onClick)="fechar()" />
    <p-button
      label="Salvar"
      [disabled]="formulario.invalid || agindo()"
      [loading]="agindo()"
      (onClick)="salvar()"
    />
  </ng-template>
</p-dialog>

<p-dialog
  header="Aposentar item"
  [visible]="aAposentar() !== null"
  (visibleChange)="aAposentar.set(null)"
  [modal]="true"
  [style]="{ width: '28rem' }"
>
  <p>
    <strong>{{ aAposentar()?.nome }}</strong> sai do protocolo das gestações novas. Quem já marcou o
    item continua vendo no checklist.
  </p>

  <ng-template #footer>
    <p-button label="Cancelar" severity="secondary" (onClick)="aAposentar.set(null)" />
    <p-button
      label="Aposentar"
      severity="danger"
      [loading]="agindo()"
      (onClick)="confirmarAposentadoria()"
    />
  </ng-template>
</p-dialog>
```

`protocolo-lista.scss`:

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

.botoes {
  display: flex;
  gap: 0.5rem;
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

.dica {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.grupo {
  font-weight: 800;
  color: var(--aconchego-link);
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

.linha {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.inline {
  margin-top: 0;
}
```

**Validação:** coberta pela Etapa 9.

---

### Etapa 9 — Rota e item na sidebar

**Depende de:** Etapa 8
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.html` (editar)

**O que fazer:** registrar `/protocolo` sob `papelGuard('medica')` e criar o **primeiro** bloco de
navegação de médica na sidebar.

Em `src/app/app.routes.ts`, insira depois do objeto do path `'equipe'` e antes de
`{ path: '', pathMatch: 'full', redirectTo: 'inicio' },`:

```ts
      {
        path: 'protocolo',
        canActivate: [papelGuard('medica')],
        loadComponent: () =>
          import('./pages/protocolo/lista/protocolo-lista').then((m) => m.ProtocoloLista),
      },
```

Em `src/app/layout/shell/shell.html`, logo **depois** do `}` que fecha o
`@if (papel() === 'secretaria')` e antes de `</nav>`, acrescente:

```html
@if (papel() === 'medica') {
<a routerLink="/protocolo" routerLinkActive="ativo">
  <i class="pi pi-list-check" aria-hidden="true"></i>
  <span>Protocolo</span>
</a>
}
```

**Validação:**

```bash
npm run lint && npm run typecheck && npm run build
```

Os três sem erro; o build gera um chunk `protocolo-lista`.

---

### Etapa 10 — Testes e documentação

**Depende de:** Etapas 7, 9
**Arquivos:** `src/app/core/protocolo/protocolo.service.spec.ts`,
`src/app/pages/protocolo/lista/protocolo-lista.spec.ts` (criar), `docs/roadmap-web.md` (editar)

`protocolo.service.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ProtocoloService } from './protocolo.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): ProtocoloService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(ProtocoloService);
}

const dados = {
  nome: 'Hemograma',
  trimestre: 1,
  semanaIni: 6,
  semanaFim: 12,
  obrigatorio: true,
  ordem: 10,
};

describe('ProtocoloService', () => {
  it('repassa o filtro de aposentados', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar(true);

    expect(cliente.rpc).toHaveBeenCalledWith('protocolo_da_clinica', {
      p_incluir_aposentados: true,
    });
  });

  it('manda todos os campos na criação', async () => {
    const cliente = clienteFalso({ data: 'novo-id' });
    const service = criar(cliente);

    const resultado = await service.criar(dados);

    expect(cliente.rpc).toHaveBeenCalledWith('criar_protocolo_item', {
      p_nome: 'Hemograma',
      p_trimestre: 1,
      p_semana_ini: 6,
      p_semana_fim: 12,
      p_obrigatorio: true,
      p_ordem: 10,
    });
    expect(resultado).toEqual({ ok: true, valor: 'novo-id' });
  });

  it('devolve o id que passou a valer na edição', async () => {
    const cliente = clienteFalso({ data: 'versao-nova' });
    const service = criar(cliente);

    const resultado = await service.atualizar('antigo', dados);

    expect(resultado).toEqual({ ok: true, valor: 'versao-nova' });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Item aposentado não é editável' },
    });
    const service = criar(cliente);

    const resultado = await service.atualizar('x', dados);

    expect(resultado).toEqual({ ok: false, mensagem: 'Item aposentado não é editável' });
  });

  it('traduz o check da tabela', async () => {
    const cliente = clienteFalso({ error: { code: '23514', message: 'check violation' } });
    const service = criar(cliente);

    const resultado = await service.criar(dados);

    expect(resultado).toEqual({ ok: false, mensagem: 'Janela de semanas inválida.' });
  });

  it('manda o array de ids na reordenação', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    await service.reordenar(['a', 'b']);

    expect(cliente.rpc).toHaveBeenCalledWith('reordenar_protocolo', { p_ids: ['a', 'b'] });
  });
});
```

`protocolo-lista.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ItemProtocolo, ProtocoloService } from '../../../core/protocolo/protocolo.service';
import { ProtocoloLista } from './protocolo-lista';

const ativo = {
  item_id: 'i1',
  nome: 'Hemograma completo',
  trimestre: 1,
  semana_ini: 6,
  semana_fim: 12,
  obrigatorio: true,
  ordem: 10,
  ativo: true,
  raiz_id: 'i1',
  marcacoes: 0,
} as ItemProtocolo;

const emUso = { ...ativo, item_id: 'i2', nome: 'Glicemia', ordem: 20, marcacoes: 3 };
const aposentado = { ...ativo, item_id: 'i3', nome: 'Exame Velho', ativo: false };

function montar(servico: Partial<ProtocoloService>) {
  TestBed.configureTestingModule({
    imports: [ProtocoloLista],
    providers: [provideZonelessChangeDetection(), { provide: ProtocoloService, useValue: servico }],
  });
  return TestBed.createComponent(ProtocoloLista);
}

type Interno = {
  abrirEdicao(item: unknown): void;
  avisoVersao(): boolean;
  mover(item: unknown, direcao: number): Promise<void>;
  aAposentar: { set(v: unknown): void };
  confirmarAposentadoria(): Promise<void>;
};

describe('ProtocoloLista', () => {
  it('mostra os itens com janela e situação', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, aposentado] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Hemograma completo');
    expect(texto).toContain('6–12 sem');
    expect(texto).toContain('Ativo');
    expect(texto).toContain('Aposentado');
  });

  it('avisa que editar item em uso cria versão nova', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, emUso] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;

    componente.abrirEdicao(ativo);
    expect(componente.avisoVersao()).toBe(false);

    componente.abrirEdicao(emUso);
    expect(componente.avisoVersao()).toBe(true);
  });

  it('reordena mandando a lista do trimestre trocada', async () => {
    const reordenar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, emUso] }),
      reordenar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.mover(emUso, -1);

    expect(reordenar).toHaveBeenCalledWith(['i2', 'i1']);
  });

  it('não aposenta sem confirmação', async () => {
    const aposentar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo] }),
      aposentar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(aposentar).not.toHaveBeenCalled();

    componente.aAposentar.set(ativo);
    await componente.confirmarAposentadoria();

    expect(aposentar).toHaveBeenCalledWith('i1');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas a equipe.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Apenas a equipe.');
  });
});
```

Em `docs/roadmap-web.md`, substitua a seção W3 inteira por:

```markdown
### W3 — Protocolo

- [x] CRUD de `protocolo_itens` em `/protocolo` (janela `semana_ini`/`semana_fim`, trimestre, obrigatório, ordem), restrito a `medica`
- [x] Versionamento por item: editar item já marcado aposenta a versão antiga e cria substituta na mesma `raiz_id`; `checklist_da_gestacao` escolhe uma versão por raiz
- [x] Cenários 42–46 no `supabase/tests/rls_smoke.sql`
```

**Validação:**

```bash
npm test && npm run format:check
```

Todos os testes passam (63 existentes + 11 novos) e a formatação está limpa.

## 7. Testes

| Arquivo                     | Caso                                          | O que assegura                                                                                                                                                 |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rls_smoke.sql` 42          | gate e validações                             | Secretaria não escreve, gestante não lista, trimestre 4 e janela invertida são recusados, nome é trimado e `raiz_id` nasce igual ao `id`                       |
| `rls_smoke.sql` 43          | edição sem uso                                | Item nunca marcado é alterado no lugar e a raiz continua com uma versão só                                                                                     |
| `rls_smoke.sql` 44          | edição com uso                                | Versiona, a gestação que marcou continua vendo a janela antiga, o checklist traz **uma** linha, a substituta herda a raiz e a versão aposentada não é editável |
| `rls_smoke.sql` 45          | gestação nova                                 | Quem não marcou enxerga a versão nova, também em uma linha só                                                                                                  |
| `rls_smoke.sql` 46          | ciclo de vida                                 | Aposentar duas vezes falha, reativar funciona, reativar com outra ativa na raiz falha, reordenar grava 10 e 20                                                 |
| `flutter test` (Etapa 3)    | contrato do mobile                            | `fase4_checklist_test.dart` continua verde sem edição após a troca do corpo da RPC                                                                             |
| `protocolo.service.spec.ts` | argumentos e erros                            | Os seis `p_*` chegam certos; `P0001` repassa a mensagem; `23514` vira texto de janela inválida                                                                 |
| `protocolo-lista.spec.ts`   | render, aviso, reordenação, confirmação, erro | Janela e situação na tela; o aviso de versionamento só aparece com `marcacoes > 0`; mover manda a lista trocada; nada é aposentado sem confirmação             |

Cenários 1–41 e os 63 testes do web devem continuar verdes **sem edição**.

## 8. Riscos e casos de borda

- **A Etapa 2 troca o corpo de uma RPC que o app Flutter consome.** A assinatura e as dez colunas
  são idênticas, e `checklist_repository.dart` mapeia por nome. A Etapa 3 existe só para provar
  isso; se `fase4_checklist_test.dart` quebrar, o defeito está no `distinct on`, não no mobile.
- **`painel_da_medica` não é alterado.** Um item aposentado sai das janelas de urgência mesmo que
  a gestação o tenha marcado como `solicitado`. É o comportamento pretendido — item aposentado não
  deve mais ser cobrado —, mas significa que versionar um item tira a janela antiga do painel e
  põe a nova. Se isso incomodar na prática, é ajuste de uma linha no lateral `chk`.
- **Marcar duas versões da mesma raiz.** A médica marca a versão A, a edição a aposenta, e depois
  ela marca a versão B. As duas linhas existem em `gestacao_checklist`; o `distinct on` prefere a
  ativa, então a marcação de A fica invisível no checklist (mas continua no banco e no
  `audit_log`). Aceitável, e só acontece com edição no meio de uma gestação em andamento.
- **`reordenar_protocolo` ignora ids inexistentes ou aposentados** (o `update` não casa). Silencioso
  de propósito: a UI manda a lista que acabou de ler, e uma corrida com outra médica não deve
  estourar erro na cara de ninguém.
- **Reordenar mistura trimestres se a UI mandar tudo junto.** A tela só manda os itens ativos do
  trimestre do item movido; a RPC não valida isso porque reordenar entre trimestres é uma operação
  legítima se um dia a UI oferecer.
- **`raiz_id` é `not null` com FK para a própria tabela.** Apagar um item que é raiz de outro
  falharia por violação de FK — o que é bom: o projeto já decidiu na Fase 4 que item de protocolo
  nunca é deletado.
- **O seed provisório continua lá.** Depois da Fase 0, o protocolo definitivo passa a ser montado
  pela tela; se as médicas trocarem tudo, o caminho é aposentar os 22 itens e criar os novos, e o
  histórico das gestações antigas fica preservado.
- **Primeira tela de médica no web.** Até aqui a sidebar só tinha bloco de secretaria. Uma médica
  que entrar no web hoje vê só `/inicio`; a partir desta fatia vê `/protocolo`.
- **Três migrations no repo do mobile** exigem commit lá também; o web só depende do
  `database.types.ts` regenerado.

## 9. Rollback

- **Frontend:** reverter o commit no `prenatalweb`.
- **RPCs (Etapa 4):** migration nova com `drop function` das seis: `protocolo_da_clinica(boolean)`,
  `reordenar_protocolo(uuid[])`, `reativar_protocolo_item(uuid)`,
  `aposentar_protocolo_item(uuid)`,
  `atualizar_protocolo_item(uuid, text, smallint, smallint, smallint, boolean, smallint)` e
  `criar_protocolo_item(text, smallint, smallint, smallint, boolean, smallint)`.
- **Leitura (Etapa 2):** restaurar o corpo anterior de `checklist_da_gestacao`, que está
  em `20260818120000_fase4_checklist.sql`. Sem o `distinct on`, uma gestação que marcou uma versão
  antiga volta a ver duas linhas do mesmo item — então este rollback só é seguro se nenhuma edição
  tiver versionado item algum. Confira com
  `select count(*) from public.protocolo_itens group by raiz_id having count(*) > 1;`.
- **Coluna (Etapa 1):** `drop trigger protocolo_itens_raiz on public.protocolo_itens;`,
  `drop function public.protocolo_itens_set_raiz();`,
  `alter table public.protocolo_itens drop column raiz_id;`. Só faça depois de reverter a Etapa 2,
  que depende da coluna.

## 10. Checklist final

- [x] `20260821120000_protocolo_raiz.sql` criada; 22 itens com `raiz_id = id`
- [x] `20260821120100_checklist_por_raiz.sql` criada; `checklist_da_gestacao` com `distinct on (pi.raiz_id)` e a mesma assinatura de dez colunas
- [ ] `flutter analyze` e `flutter test` verdes no `prenatalapp`, com `fase4_checklist_test.dart` sem edição
- [x] `20260821120200_protocolo_rpc.sql` criada; as seis funções existem em `pg_proc`
- [ ] `rls_smoke.sql` roda com exit 0 e 47 blocos `DO`
- [x] `src/types/database.types.ts` regenerado com as seis funções
- [x] `ProtocoloService` criado, sem lançar exceção para o componente
- [x] `/protocolo` registrada sob `papelGuard('medica')` e bloco de `medica` novo na sidebar
- [x] Aviso de versionamento aparece só quando `marcacoes > 0`
- [x] Aposentar exige confirmação em diálogo próprio
- [x] Nenhum arquivo de teste existente foi editado
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run format:check` todos verdes
- [ ] Roteiro manual como `medica`: `/protocolo` lista por trimestre → criar item → editar (altera no lugar, "Em uso" = 0) → marcar esse item no checklist de uma gestação pelo app → editar de novo no web e ver o aviso → salvar → "Mostrar aposentados" revela as duas versões → o checklist daquela gestação continua com **uma** linha e a janela antiga
- [ ] Roteiro manual como `secretaria`: sidebar sem "Protocolo"; `/protocolo` na URL cai em `/sem-acesso`
- [x] `docs/roadmap-web.md` atualizado
- [x] Este plano salvo como `docs/plano-w3-protocolo.md`, **com os blocos de código**
