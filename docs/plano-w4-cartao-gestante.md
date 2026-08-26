# Plano de Implementação: W4 (fatia 2) — Cartão da gestante

## 1. Objetivo

Ao final, a médica clica numa paciente em `/mesa` e abre `/mesa/:pacienteId`, onde vê num só
lugar: dados da paciente, todas as gestações (com IG e desfecho), os vínculos com a equipe,
as consultas da gestação ativa, o checklist do protocolo com a janela já classificada, e a lista
de documentos com o status de publicação. Dentro do checklist ela marca um item como solicitado,
realizado ou não se aplica. A regra de janela deixa de existir em Dart: `checklist_da_gestacao`
passa a devolver a coluna `janela`, e o app Flutter a consome — mesmo movimento que a fatia 1 fez
com `urgencia.dart`.

## 2. Contexto atual

### O que o backend já entrega — e os dois buracos

A médica vinculada já alcança, por policy, tudo que o cartão precisa **ler**:

| Tabela       | Policy                                              | Alcance da médica vinculada                            |
| ------------ | --------------------------------------------------- | ------------------------------------------------------ |
| `pacientes`  | `pacientes_select` (`init_schema.sql:555`)          | ✅ `medica_vinculada_ao_paciente(id)`                  |
| `gestacoes`  | `gestacoes_select` (`init_schema.sql:611`)          | ✅ `medica_vinculada_a_gestacao(id)`                   |
| `consultas`  | `consultas_select` (`init_schema.sql:679`)          | ✅                                                     |
| `documentos` | `documentos_select_medica` (`fase3_documentos.sql`) | ✅                                                     |
| `vinculos`   | `vinculos_select` (`init_schema.sql:582`)           | ❌ **só o próprio vínculo** — `medica_id = auth.uid()` |

E as RPCs de escrita que interessam a esta fatia já existem: `marcar_checklist_item` (Fase 4,
gate `current_papel() = 'medica'` + `medica_vinculada_a_gestacao` + gestação ativa + item ativo).

**Buraco 1 — vínculos.** `public.vinculos_da_paciente(p_paciente_id)`
(`20260820120900_vinculos_secretaria.sql`) devolve todos os vínculos com o nome da médica, mas o
gate é `if not public.is_secretaria() then raise exception 'Apenas a secretaria consulta os
vínculos por aqui'`. A médica não passa. Ler a tabela direto também não resolve: `vinculos_select`
só mostra o vínculo dela, e `profiles_select_own_or_linked` não deixa ler o nome das colegas.

**Buraco 2 — a janela ainda é Dart.** A fatia 1 registrou isso como risco. Hoje:

- `public.janela_checklist(ig, ini, fim)` (`20260822120000_urgencia_no_postgres.sql`) existe e é
  usada por `painel_da_medica` para contar vencidos/vencendo.
- `janelaPara(igSemanas, semanaIni, semanaFim)` em
  `lib/features/checklist/data/checklist_item.dart:96` faz a mesma coisa, e
  `ChecklistItem.janela(int igSemanas)` acrescenta o caso `resolvido` (status realizado ou
  nao_aplicavel).
- `public.checklist_da_gestacao(p_gestacao_id)` (reescrita na W3,
  `20260821120100_checklist_por_raiz.sql`) devolve dez colunas e **não** inclui a janela.

Consumidores de `janelaPara` / `ChecklistItem.janela` no Flutter:

| Arquivo                                                                      | Uso                                                                     |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `lib/features/checklist/presentation/widgets/checklist_item_tile.dart:23`    | `item.janela(igSemanas)` para cor e rótulo do tile                      |
| `lib/features/checklist/presentation/screens/checklist_screen.dart:80,140`   | Passa `igSemanas` para os tiles e mostra "Idade gestacional: N semanas" |
| `lib/features/medica/presentation/screens/paciente_card_screen.dart:500,507` | Conta vencidos e "na janela" no resumo                                  |
| `lib/features/home/presentation/screens/patient_home_screen.dart:337,362`    | `proximosItens(itens, igSemanas)` e `item.janela(igSemanas)`            |
| `lib/features/checklist/data/checklist_repository.dart:15-67`                | Fixture demo com cinco itens, sem janela                                |
| `test/fase4_checklist_test.dart:59-87`                                       | Cinco testes de `item.janela(ig)`                                       |

`ChecklistItem.fromMap` (`checklist_item.dart:70`) mapeia as dez colunas por nome.
`JanelaChecklist` é enum com `rotulo`, `peso` e `alerta`, e `proximosItens(itens, igSemanas)`
ordena a home da gestante pelo peso da janela.

**Atenção ao smoke:** o cenário 41 (`rls_smoke.sql`) asserta a mensagem exata
`'Apenas a secretaria consulta os vínculos por aqui'` usando `medica_a`. Mudar o gate muda a
mensagem, então esse cenário **precisa ser editado** — está declarado no escopo.

### Frontend web — `~/Documents/VoidSans/prenatalweb/` (commit `db6b468`)

| Arquivo                                  | Papel                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/mesa/mesa.service.ts`      | Modelo do serviço: `Resultado<T>`, `mensagemDeErro` com `P0001`, e o `Omit` que corrige a nulabilidade que o gerador de tipos erra em retorno de função |
| `src/app/pages/mesa/lista/mesa-lista.ts` | Tela de origem: `p-table` com `dataKey="paciente_id"`; hoje as linhas **não** são clicáveis                                                             |
| `src/app/core/formato/data.ts`           | `formatarData` (para `date`) e `formatarDataHora` (para `timestamptz`)                                                                                  |
| `src/app/core/formato/cpf.ts`            | `formatarCpf`                                                                                                                                           |
| `src/app/app.routes.ts`                  | `/mesa` sob `papelGuard('medica')`, sem rota filha                                                                                                      |

PrimeNG 21.1.9. Testes: Vitest + `TestBed` com `provideZonelessChangeDetection()` — hoje 84
testes em 19 arquivos. O smoke tem cenários 1–49; confira a linha do `rollback;` antes de inserir.

## 3. Escopo

**Dentro:**

- Coluna `janela` em `checklist_da_gestacao` e remoção de `janelaPara` do Dart.
- Gate de `vinculos_da_paciente` passa a aceitar a médica vinculada.
- Cenários 50–52 no smoke, mais a **edição do cenário 41** (mensagem do gate mudou).
- Mobile: `ChecklistItem.janela` vira campo, ajuste dos cinco consumidores, fixture demo e
  `test/fase4_checklist_test.dart`.
- Regeneração de `src/types/database.types.ts`.
- `CartaoService` e a tela `/mesa/:pacienteId` no web.
- Linha clicável em `/mesa` levando ao cartão.
- Marcar item do checklist pelo cartão (`marcar_checklist_item`).
- Testes do serviço e da tela no web.
- Atualização de `docs/roadmap-web.md`.

**Fora — não fazer nesta tarefa:**

- Não implementar upload de PDF nem publicar documento — é a fatia 3. Os documentos aparecem
  **em lista, somente leitura**, com o status.
- Não agendar consulta nem registrar realizada/faltou; não encerrar gestação. Ficam para depois
  da fatia 3.
- Não criar RPC agregadora do cartão: as leituras usam as policies que já existem.
- Não alterar `marcar_checklist_item`, `painel_da_medica`, `urgencia_score` nem policies.
- Não mexer nas telas de `secretaria` no web.
- Não alterar a aparência das telas do mobile — a migração da janela é de origem do dado.
- Não adicionar dependência npm ou pub nova.

## 4. Decisões técnicas

| Decisão                        | Escolha                                                                                                  | Motivo                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Janela                         | `checklist_da_gestacao` ganha coluna `janela text`; Dart apaga `janelaPara`                              | Fecha a última duplicação de regra do projeto, do mesmo jeito que a fatia 1 fez com o score                                             |
| Caso `resolvido`               | Calculado na RPC: status `realizado`/`nao_aplicavel` → `'resolvido'`                                     | Era o que `ChecklistItem.janela` fazia por cima de `janelaPara`; sem isso o cliente ainda precisaria da regra                           |
| IG dentro da RPC               | `select public.ig_semanas(g.dpp_final)` uma vez, em variável                                             | A RPC recebe `p_gestacao_id` e não tinha `gestacoes` no `from`; buscar por linha seria N vezes o mesmo valor                            |
| `proximosItens`                | Perde o parâmetro `igSemanas` e ordena por `item.janela.peso`                                            | A janela já vem pronta; manter o parâmetro obrigaria o chamador a ter a IG sem precisar dela                                            |
| Gate de `vinculos_da_paciente` | `is_secretaria() or medica_vinculada_ao_paciente(p_paciente_id)`                                         | Uma RPC serve aos dois papéis; criar uma segunda função com o mesmo corpo divergiria na primeira correção                               |
| Mensagem do gate               | `'Sem acesso aos vínculos desta paciente'`                                                               | A antiga citava só a secretaria e ficaria errada. Obriga editar o cenário 41 — previsto                                                 |
| Leituras do cartão             | Consultas PostgREST separadas, sem RPC agregadora                                                        | As policies já autorizam tudo; uma RPC nova seria superfície a mais para manter, e o cartão carrega uma paciente por vez                |
| Ordem das chamadas             | Paciente, gestações e vínculos em paralelo; consultas/checklist/documentos depois, para a gestação ativa | As três últimas dependem do `gestacao_id`, que só se conhece após carregar as gestações                                                 |
| Gestação exibida               | A ativa; se não houver, a mais recente por `created_at`                                                  | Uma paciente que encerrou a gestação ainda precisa ter o cartão legível                                                                 |
| Rota                           | `/mesa/:pacienteId`, filha de `/mesa`                                                                    | `/pacientes/:id` já é a tela administrativa da secretaria; aninhar deixa o guard de papel herdado                                       |
| Como se chega ao cartão        | Botão "Abrir" na linha de `/mesa`                                                                        | Linha inteira clicável dispara em qualquer clique dentro da célula; um botão explícito é testável e acessível                           |
| Marcar checklist               | `p-dialog` com status, data e observação                                                                 | Espelha o `marcar_item_sheet.dart` do mobile; a RPC exige data quando o status é `realizado` (ela preenche `current_date` se vier nula) |
| Documentos                     | Lista com `p-tag` de status, sem ação                                                                    | A publicação tem gate de achado comunicado e é o coração da fatia 3; mostrar o botão aqui sem o fluxo seria armadilha                   |
| Rótulos de janela no web       | Mapa local em `cartao-gestante.ts`, espelhando `JanelaChecklist`                                         | São quatro strings de UI, não regra: a classificação vem pronta do banco                                                                |

## 5. Pré-requisitos

- Docker rodando com o stack local do Supabase do `prenatalapp`; `psql` no PATH.
- `flutter` no PATH.
- W4 fatia 1 aplicada (commits `bc41da0` no `prenatalapp` e `3253b21` no `prenatalweb`).
- Nenhuma dependência npm ou pub nova.

## 6. Etapas

Etapas 1–5 no repo `~/Documents/VoidSans/prenatalapp`. Etapas 6–10 no `~/Documents/VoidSans/prenatalweb`.

---

### Etapa 1 — Coluna `janela` em `checklist_da_gestacao`

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260823120000_checklist_com_janela.sql` (criar)

**O que fazer:** substituir a função inteira, acrescentando a décima primeira coluna. O subselect
com `distinct on (pi.raiz_id)` da W3 permanece idêntico.

**Código:**

```sql
-- W4 fatia 2: a janela do item passa a vir classificada do banco, fechando a
-- última duplicação de regra do projeto — janelaPara() sai do Dart na mesma
-- entrega. O caso `resolvido` também vem daqui: dependia do status, que o
-- cliente tinha, mas manter metade da regra no Dart não resolveria nada.
--
-- `drop` antes do `create`: o Postgres não deixa `create or replace` mudar o
-- shape de `returns table` (coluna nova), só o corpo.
drop function if exists public.checklist_da_gestacao(uuid);

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
  observacao text,
  janela text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ig integer;
begin
  if not (
    public.paciente_dona_da_gestacao(p_gestacao_id)
    or public.medica_vinculada_a_gestacao(p_gestacao_id)
  ) then
    raise exception 'Sem acesso a esta gestação';
  end if;

  select public.ig_semanas(g.dpp_final) into v_ig
    from public.gestacoes g
   where g.id = p_gestacao_id;

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
      escolhido.gc_observacao,
      case
        when coalesce(escolhido.gc_status, 'pendente'::public.status_checklist)
             in ('realizado', 'nao_aplicavel') then 'resolvido'
        else public.janela_checklist(
          v_ig, escolhido.semana_ini, escolhido.semana_fim
        )
      end
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
cd ~/Documents/VoidSans/prenatalapp && supabase db reset
```

Conclui sem erro. A coluna é conferida pelo cenário 50 na Etapa 3.

---

### Etapa 2 — Médica vinculada passa a ler os vínculos

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260823120100_vinculos_para_medica.sql` (criar)

**O que fazer:** trocar só o gate. O corpo da consulta é o mesmo de
`20260820120900_vinculos_secretaria.sql`.

**Código:**

```sql
-- O cartão da gestante mostra a equipe inteira da paciente, e a policy
-- vinculos_select só deixa a médica ver o próprio vínculo — o nome das colegas
-- vem daqui. Mesma RPC para os dois papéis: duplicar o corpo divergiria.

create or replace function public.vinculos_da_paciente(p_paciente_id uuid)
returns table (
  vinculo_id uuid,
  medica_id uuid,
  medica_nome text,
  papel public.papel_vinculo,
  ativo boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.is_secretaria()
    or public.medica_vinculada_ao_paciente(p_paciente_id)
  ) then
    raise exception 'Sem acesso aos vínculos desta paciente';
  end if;

  return query
    select v.id, v.medica_id, pr.nome, v.papel, v.ativo, v.created_at
    from public.vinculos v
    join public.profiles pr on pr.id = v.medica_id
    where v.paciente_id = p_paciente_id
    order by v.ativo desc, pr.nome;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.vinculos_da_paciente"
```

A função existe com a mesma assinatura. O gate é conferido pelo cenário 51.

---

### Etapa 3 — Ajustar o cenário 41 e acrescentar 50–52

**Depende de:** Etapas 1 e 2
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

**O que fazer:** duas edições. Primeiro corrigir o cenário 41, cuja mensagem esperada mudou;
depois inserir os cenários novos antes do `rollback;` final.

**Edição 1 — cenário 41.** Localize, dentro do bloco do cenário 41, o trecho:

```sql
    raise exception 'FAIL: médica listou vínculos pela RPC da secretaria';
  exception when others then
    if sqlerrm <> 'Apenas a secretaria consulta os vínculos por aqui' then
      raise;
    end if;
  end;
```

e substitua por:

```sql
    raise exception 'FAIL: médica sem vínculo listou os vínculos da paciente';
  exception when others then
    if sqlerrm <> 'Sem acesso aos vínculos desta paciente' then
      raise;
    end if;
  end;
```

`medica_a` perdeu o vínculo com `paciente_row` no cenário 40, então ela continua sendo recusada —
só muda a mensagem e o motivo.

**Edição 2 — cenários novos.** Insira o bloco abaixo imediatamente antes da linha `rollback;`:

```sql
-- ---------------------------------------------------------------------------
-- 50) checklist_da_gestacao classifica a janela, inclusive resolvido
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_paciente uuid;
  v_ativa uuid;
  v_ig integer;
  v_vencido uuid;
  v_futuro uuid;
  v_janela text;
begin
  -- Fixture própria, isolada: a gestação de paciente_row foi permanentemente
  -- reduzida a 4 semanas pelo cenário 26 (Fase 5), então não serve de base
  -- fixa para este teste. IG fresca e previsível: dpp em +112 dias = 24 semanas.
  insert into public.pacientes (nome) values ('Gestante Janela W4') returning id into v_paciente;
  insert into public.vinculos (paciente_id, medica_id, papel)
  values (v_paciente, v_medica_a, 'obstetra');
  insert into public.gestacoes (paciente_id, dum, dpp_final, dpp_origem)
  values (v_paciente, current_date - 168, current_date + 112, 'dum')
  returning id into v_ativa;

  v_ig := public.ig_semanas((select dpp_final from public.gestacoes where id = v_ativa));
  if v_ig <> 24 then
    raise exception 'FAIL: a gestação nova deveria estar em 24 semanas (veio %)', v_ig;
  end if;

  -- Catálogo ativo: um item cuja janela já fechou (fim < 24) e um do 3º
  -- trimestre que ainda não abriu (início > 24). O seed garante os dois.
  select pi.id into v_vencido
  from public.protocolo_itens pi
  where pi.ativo and pi.semana_fim < 24
  order by pi.semana_fim desc
  limit 1;

  select pi.id into v_futuro
  from public.protocolo_itens pi
  where pi.ativo and pi.semana_ini > 24
  order by pi.semana_ini
  limit 1;

  perform pg_temp.as_user(v_medica_a);

  select janela into v_janela
  from public.checklist_da_gestacao(v_ativa)
  where protocolo_item_id = v_futuro;
  if v_janela <> 'futuro' then
    raise exception 'FAIL: item cujo início é depois da IG deveria estar em futuro (veio %)', v_janela;
  end if;

  select janela into v_janela
  from public.checklist_da_gestacao(v_ativa)
  where protocolo_item_id = v_vencido;
  if v_janela <> 'vencido' then
    raise exception 'FAIL: item cujo fim é antes da IG deveria estar vencido (veio %)', v_janela;
  end if;

  perform public.marcar_checklist_item(v_ativa, v_vencido, 'nao_aplicavel');

  select janela into v_janela
  from public.checklist_da_gestacao(v_ativa)
  where protocolo_item_id = v_vencido;
  if v_janela <> 'resolvido' then
    raise exception 'FAIL: item nao_aplicavel deveria ser resolvido (veio %)', v_janela;
  end if;

  perform pg_temp.back_to_postgres();

  raise notice 'OK 50: checklist_da_gestacao classifica futuro, vencido e resolvido';
end $$;

-- ---------------------------------------------------------------------------
-- 51) Médica vinculada lê os vínculos; sem vínculo, não
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_medica_b uuid := (select value from smoke_ids where key = 'medica_b');
  v_secretaria uuid := (select value from smoke_ids where key = 'secretaria');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_total int;
begin
  perform pg_temp.as_user(v_medica_b);
  select count(*) into v_total from public.vinculos_da_paciente(v_paciente);
  perform pg_temp.back_to_postgres();

  if v_total = 0 then
    raise exception 'FAIL: a médica vinculada deveria ver os vínculos da paciente';
  end if;

  perform pg_temp.as_user(v_medica_a);
  begin
    perform * from public.vinculos_da_paciente(v_paciente);
    raise exception 'FAIL: médica sem vínculo leu os vínculos';
  exception when others then
    if sqlerrm <> 'Sem acesso aos vínculos desta paciente' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  -- A secretaria continua alcançando, como na W2 fatia 3.
  perform pg_temp.as_user(v_secretaria);
  select count(*) into v_total from public.vinculos_da_paciente(v_paciente);
  perform pg_temp.back_to_postgres();

  if v_total = 0 then
    raise exception 'FAIL: a secretaria perdeu o acesso aos vínculos';
  end if;

  raise notice 'OK 51: vínculos seguem o vínculo da médica e a secretaria';
end $$;

-- ---------------------------------------------------------------------------
-- 52) Gestante lê o próprio checklist com janela; estranha não lê nada
-- ---------------------------------------------------------------------------
do $$
declare
  v_paciente_user uuid := (select value from smoke_ids where key = 'paciente_user');
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_gestacao uuid := (select value from smoke_ids where key = 'gestacao');
  v_total int;
  v_sem_janela int;
begin
  perform pg_temp.as_user(v_paciente_user);

  select count(*), count(*) filter (where janela is null)
    into v_total, v_sem_janela
  from public.checklist_da_gestacao(v_gestacao);

  perform pg_temp.back_to_postgres();

  if v_total = 0 then
    raise exception 'FAIL: a gestante deveria ler o próprio checklist';
  end if;
  if v_sem_janela <> 0 then
    raise exception 'FAIL: % itens vieram sem janela', v_sem_janela;
  end if;

  perform pg_temp.as_user(v_medica_a);
  begin
    perform * from public.checklist_da_gestacao(v_gestacao);
    raise exception 'FAIL: médica sem vínculo leu o checklist';
  exception when others then
    if sqlerrm <> 'Sem acesso a esta gestação' then
      raise;
    end if;
  end;
  perform pg_temp.back_to_postgres();

  raise notice 'OK 52: checklist com janela segue o acesso à gestação';
end $$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql > /tmp/smoke.out 2>&1; echo "exit=$?"; grep -c "^DO" /tmp/smoke.out
```

Saída esperada: `exit=0` e `53` blocos `DO` (1 de fixtures + 52 cenários), com `ROLLBACK` no fim.

---

### Etapa 4 — `janela` vira campo no Flutter

**Depende de:** Etapa 1
**Arquivos:** `lib/features/checklist/data/checklist_item.dart` (editar),
`lib/features/checklist/data/checklist_repository.dart` (editar),
`lib/features/checklist/presentation/widgets/checklist_item_tile.dart` (editar),
`lib/features/checklist/presentation/screens/checklist_screen.dart` (editar),
`lib/features/medica/presentation/screens/paciente_card_screen.dart` (editar),
`lib/features/home/presentation/screens/patient_home_screen.dart` (editar)

**O que fazer:** `ChecklistItem.janela` deixa de ser método e vira campo lido da RPC.

Em `checklist_item.dart`, acrescente o parser ao enum `JanelaChecklist`, logo depois do getter
`alerta`:

```dart
  static JanelaChecklist fromDb(String value) => switch (value) {
    'futuro' => JanelaChecklist.futuro,
    'na_janela' => JanelaChecklist.naJanela,
    'vencendo' => JanelaChecklist.vencendo,
    'vencido' => JanelaChecklist.vencido,
    _ => JanelaChecklist.resolvido,
  };
```

Ainda em `checklist_item.dart`: acrescente `required this.janela,` ao construtor de
`ChecklistItem`, declare o campo logo depois de `final StatusChecklist status;`:

```dart
  /// Classificada no Postgres desde a W4 fatia 2; `resolvido` também vem de lá.
  final JanelaChecklist janela;
```

remova o método

```dart
  JanelaChecklist janela(int igSemanas) => status.resolvido
      ? JanelaChecklist.resolvido
      : janelaPara(igSemanas, semanaIni, semanaFim);
```

acrescente ao `fromMap`, depois da linha de `observacao`:

```dart
      janela: JanelaChecklist.fromDb(map['janela'] as String),
```

apague a função `janelaPara` inteira (com o comentário de doc acima dela), e troque
`proximosItens` por:

```dart
/// O que a gestante vê na home: o mais atrasado primeiro, resolvido nunca.
/// A ordem usa a janela, mas o rótulo dela não vai para a tela da paciente.
List<ChecklistItem> proximosItens(List<ChecklistItem> itens, {int limite = 3}) {
  final pendentes = itens.where((i) => !i.status.resolvido).toList()
    ..sort((a, b) {
      final porJanela = b.janela.peso.compareTo(a.janela.peso);
      if (porJanela != 0) return porJanela;
      final porSemana = a.semanaIni.compareTo(b.semanaIni);
      return porSemana != 0 ? porSemana : a.ordem.compareTo(b.ordem);
    });

  return pendentes.take(limite).toList();
}
```

Em `checklist_repository.dart`, acrescente `janela:` a cada um dos cinco itens de `_seedDemo()`,
com os valores que a gestação demo de 24 semanas produz:

| `protocoloItemId`             | Janela                      |
| ----------------------------- | --------------------------- |
| `demo-p1` (6–12, pendente)    | `JanelaChecklist.vencido`   |
| `demo-p2` (20–24, solicitado) | `JanelaChecklist.vencendo`  |
| `demo-p3` (24–28, pendente)   | `JanelaChecklist.naJanela`  |
| `demo-p4` (24–28, realizado)  | `JanelaChecklist.resolvido` |
| `demo-p5` (35–37, pendente)   | `JanelaChecklist.futuro`    |

Ainda em `checklist_repository.dart`, o método que devolve o item atualizado após marcar
(linha ~120, dentro do caminho demo) recria o `ChecklistItem`; acrescente ali:

```dart
        janela: novoStatus.resolvido ? JanelaChecklist.resolvido : atual.janela,
```

Em `checklist_item_tile.dart`, troque `final janela = item.janela(igSemanas);` por
`final janela = item.janela;`, remova o campo `final int igSemanas;` e o parâmetro
`required this.igSemanas,` do construtor.

Em `checklist_screen.dart`, remova o argumento `igSemanas: igSemanas,` da construção do tile
(linha ~140). O `igSemanas` do cabeçalho ("Idade gestacional: N semanas") **permanece**.

Em `paciente_card_screen.dart`, troque `i.janela(igSemanas)` por `i.janela` nas duas ocorrências
(linhas ~500 e ~507).

Em `patient_home_screen.dart`, troque `proximosItens(itens, igSemanas)` por
`proximosItens(itens)` e `item.janela(igSemanas)` por `item.janela`. O campo `igSemanas` de
`_ItemLinha` fica sem uso: remova o campo e o argumento na construção.

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && flutter analyze
```

Espera-se erro apenas em `test/fase4_checklist_test.dart`, que a Etapa 5 corrige. Nenhum erro em
`lib/`.

---

### Etapa 5 — Ajustar os testes da Fase 4

**Depende de:** Etapa 4
**Arquivos:** `~/Documents/VoidSans/prenatalapp/test/fase4_checklist_test.dart` (editar)

**O que fazer:** os cinco testes de `item.janela(ig)` exercitavam a regra que saiu do Dart. A
regra agora é coberta pelos cenários 47 e 50 do smoke; aqui fica só o parser e o uso.

Substitua o `group` que testa a janela (linhas ~55–88) por:

```dart
  group('JanelaChecklist.fromDb', () {
    test('mapeia os valores que o Postgres devolve', () {
      expect(JanelaChecklist.fromDb('futuro'), JanelaChecklist.futuro);
      expect(JanelaChecklist.fromDb('na_janela'), JanelaChecklist.naJanela);
      expect(JanelaChecklist.fromDb('vencendo'), JanelaChecklist.vencendo);
      expect(JanelaChecklist.fromDb('vencido'), JanelaChecklist.vencido);
      expect(JanelaChecklist.fromDb('resolvido'), JanelaChecklist.resolvido);
    });

    test('vencendo e vencido são os únicos que alertam', () {
      expect(JanelaChecklist.vencendo.alerta, isTrue);
      expect(JanelaChecklist.vencido.alerta, isTrue);
      expect(JanelaChecklist.naJanela.alerta, isFalse);
      expect(JanelaChecklist.futuro.alerta, isFalse);
    });
  });
```

Qualquer construção de `ChecklistItem` nesse arquivo passa a exigir `janela:` — acrescente
`janela: JanelaChecklist.naJanela` (ou o valor que o teste espera) onde o analyzer apontar.

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && flutter analyze && flutter test
```

`No issues found!` e `All tests passed!`. O teste de widget que asserta
`'1 vencido · 2 na janela'` (linha ~121) deve continuar passando: a fixture demo da Etapa 4 foi
escolhida para reproduzir exatamente essa contagem.

---

### Etapa 6 — Regerar os tipos do banco

**Depende de:** Etapa 3
**Arquivos:** `~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` (regerar)

**Código:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase start && supabase gen types typescript --local > ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

**Validação:**

```bash
grep -n "janela" ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts | head -5
```

A coluna `janela` aparece no `Returns` de `checklist_da_gestacao`.

---

### Etapa 7 — `CartaoService`

**Depende de:** Etapa 6
**Arquivos:** `src/app/core/cartao/cartao.service.ts` (criar)

**O que fazer:** um serviço com as seis leituras e a marcação. As leituras usam as policies que já
existem; só vínculos e checklist passam por RPC.

**Código:**

```ts
import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaChecklist = Database['public']['Functions']['checklist_da_gestacao']['Returns'][number];
type LinhaVinculo = Database['public']['Functions']['vinculos_da_paciente']['Returns'][number];
type StatusChecklist = Database['public']['Enums']['status_checklist'];

// O gerador não sabe a nulabilidade das colunas de retorno de função.
export type ItemChecklist = Omit<LinhaChecklist, 'data' | 'observacao'> & {
  data: string | null;
  observacao: string | null;
};

export type VinculoCartao = LinhaVinculo;
export type { StatusChecklist };

export interface PacienteCartao {
  id: string;
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  contatoEmergencia: string | null;
}

export interface GestacaoCartao {
  id: string;
  dppFinal: string;
  dppOrigem: string;
  tipo: string;
  status: string;
  desfecho: string | null;
  desfechoObservacao: string | null;
  createdAt: string;
}

export interface ConsultaCartao {
  id: string;
  dataHora: string;
  tipo: string;
  local: string | null;
  status: string;
}

export interface DocumentoCartao {
  id: string;
  tipo: string;
  titulo: string;
  dataExame: string | null;
  achadoAlterado: boolean;
  comunicadoPresencialmente: boolean;
  publicadoEm: string | null;
  arquivoEnviadoEm: string | null;
}

export interface DadosMarcacao {
  gestacaoId: string;
  protocoloItemId: string;
  status: StatusChecklist;
  data: string | null;
  observacao: string | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

// Os Args gerados usam `p_x?: string`; undefined omite a chave e a RPC aplica
// o `default null` do banco.
function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

@Injectable({ providedIn: 'root' })
export class CartaoService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async paciente(pacienteId: string): Promise<Resultado<PacienteCartao>> {
    const { data, error } = await this.supabase
      .from('pacientes')
      .select('id, nome, data_nascimento, cpf, contato_emergencia')
      .eq('id', pacienteId)
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

  async gestacoes(pacienteId: string): Promise<Resultado<GestacaoCartao[]>> {
    const { data, error } = await this.supabase
      .from('gestacoes')
      .select('id, dpp_final, dpp_origem, tipo, status, desfecho, desfecho_observacao, created_at')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((g) => ({
        id: g.id,
        dppFinal: g.dpp_final,
        dppOrigem: g.dpp_origem,
        tipo: g.tipo,
        status: g.status,
        desfecho: g.desfecho,
        desfechoObservacao: g.desfecho_observacao,
        createdAt: g.created_at,
      })),
    };
  }

  async vinculos(pacienteId: string): Promise<Resultado<VinculoCartao[]>> {
    const { data, error } = await this.supabase.rpc('vinculos_da_paciente', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async consultas(gestacaoId: string): Promise<Resultado<ConsultaCartao[]>> {
    const { data, error } = await this.supabase
      .from('consultas')
      .select('id, data_hora, tipo, local, status')
      .eq('gestacao_id', gestacaoId)
      .order('data_hora', { ascending: false });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((c) => ({
        id: c.id,
        dataHora: c.data_hora,
        tipo: c.tipo,
        local: c.local,
        status: c.status,
      })),
    };
  }

  async checklist(gestacaoId: string): Promise<Resultado<ItemChecklist[]>> {
    const { data, error } = await this.supabase.rpc('checklist_da_gestacao', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: (data ?? []) as ItemChecklist[] };
  }

  async documentos(gestacaoId: string): Promise<Resultado<DocumentoCartao[]>> {
    const { data, error } = await this.supabase
      .from('documentos')
      .select(
        'id, tipo, titulo, data_exame, achado_alterado, comunicado_presencialmente, publicado_em, arquivo_enviado_em',
      )
      .eq('gestacao_id', gestacaoId)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((d) => ({
        id: d.id,
        tipo: d.tipo,
        titulo: d.titulo,
        dataExame: d.data_exame,
        achadoAlterado: d.achado_alterado,
        comunicadoPresencialmente: d.comunicado_presencialmente,
        publicadoEm: d.publicado_em,
        arquivoEnviadoEm: d.arquivo_enviado_em,
      })),
    };
  }

  async marcarChecklist(dados: DadosMarcacao): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('marcar_checklist_item', {
      p_gestacao_id: dados.gestacaoId,
      p_protocolo_item_id: dados.protocoloItemId,
      p_status: dados.status,
      p_data: opcional(dados.data),
      p_observacao: opcional(dados.observacao),
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

Sem erro. Se `ItemChecklist` não tiver `janela`, a Etapa 6 não foi aplicada.

---

### Etapa 8 — Tela do cartão

**Depende de:** Etapa 7
**Arquivos:** `src/app/pages/mesa/cartao/cartao-gestante.ts`, `cartao-gestante.html`,
`cartao-gestante.scss` (criar)

`cartao-gestante.ts`:

```ts
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  CartaoService,
  ConsultaCartao,
  DocumentoCartao,
  GestacaoCartao,
  ItemChecklist,
  PacienteCartao,
  StatusChecklist,
  VinculoCartao,
} from '../../../core/cartao/cartao.service';
import { formatarCpf } from '../../../core/formato/cpf';
import { deDataIso, formatarData, formatarDataHora, paraDataIso } from '../../../core/formato/data';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

const JANELA_ROTULO: Record<string, string> = {
  futuro: 'Ainda não',
  na_janela: 'Na janela',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
  resolvido: 'Resolvido',
};

const JANELA_SEVERIDADE: Record<string, Severidade> = {
  futuro: 'secondary',
  na_janela: 'info',
  vencendo: 'warn',
  vencido: 'danger',
  resolvido: 'success',
};

const STATUS_ROTULO: Record<string, string> = {
  pendente: 'Pendente',
  solicitado: 'Solicitado',
  realizado: 'Realizado',
  nao_aplicavel: 'Não se aplica',
};

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    RouterLink,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-cartao-gestante',
  styleUrl: './cartao-gestante.scss',
  templateUrl: './cartao-gestante.html',
})
export class CartaoGestante implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cartao = inject(CartaoService);
  private readonly rota = inject(ActivatedRoute);

  private readonly pacienteId = this.rota.snapshot.paramMap.get('pacienteId') ?? '';

  protected readonly paciente = signal<PacienteCartao | null>(null);
  protected readonly gestacoes = signal<GestacaoCartao[]>([]);
  protected readonly vinculos = signal<VinculoCartao[]>([]);
  protected readonly consultas = signal<ConsultaCartao[]>([]);
  protected readonly checklist = signal<ItemChecklist[]>([]);
  protected readonly documentos = signal<DocumentoCartao[]>([]);

  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aMarcar = signal<ItemChecklist | null>(null);

  protected readonly formatarCpf = formatarCpf;
  protected readonly formatarData = formatarData;
  protected readonly formatarDataHora = formatarDataHora;

  protected readonly statusOpcoes = [
    { rotulo: 'Pendente', valor: 'pendente' as StatusChecklist },
    { rotulo: 'Solicitado', valor: 'solicitado' as StatusChecklist },
    { rotulo: 'Realizado', valor: 'realizado' as StatusChecklist },
    { rotulo: 'Não se aplica', valor: 'nao_aplicavel' as StatusChecklist },
  ];

  protected readonly marcacao = this.fb.group({
    status: ['solicitado' as StatusChecklist, Validators.required],
    data: [null as Date | null],
    observacao: [''],
  });

  // A ativa manda; sem ativa, a mais recente ainda precisa abrir o cartão.
  protected readonly gestacaoAtual = computed(() => {
    const todas = this.gestacoes();
    return todas.find((g) => g.status === 'ativa') ?? todas[0] ?? null;
  });

  protected readonly gestacaoAtiva = computed(() => this.gestacaoAtual()?.status === 'ativa');

  protected readonly pendentes = computed(
    () => this.checklist().filter((i) => i.janela === 'vencido' || i.janela === 'vencendo').length,
  );

  async ngOnInit(): Promise<void> {
    try {
      await this.carregar();
    } finally {
      this.carregando.set(false);
    }
  }

  protected janelaRotulo(janela: string): string {
    return JANELA_ROTULO[janela] ?? janela;
  }

  protected janelaSeveridade(janela: string): Severidade {
    return JANELA_SEVERIDADE[janela] ?? 'secondary';
  }

  protected statusRotulo(status: string): string {
    return STATUS_ROTULO[status] ?? status;
  }

  protected documentoRotulo(d: DocumentoCartao): string {
    if (d.publicadoEm !== null) {
      return 'Publicado';
    }
    if (d.arquivoEnviadoEm === null) {
      return 'Upload incompleto';
    }
    return d.achadoAlterado && !d.comunicadoPresencialmente ? 'Achado a comunicar' : 'Rascunho';
  }

  protected async carregar(): Promise<void> {
    this.erro.set(null);

    const [paciente, gestacoes, vinculos] = await Promise.all([
      this.cartao.paciente(this.pacienteId),
      this.cartao.gestacoes(this.pacienteId),
      this.cartao.vinculos(this.pacienteId),
    ]);

    if (!paciente.ok) {
      this.erro.set(paciente.mensagem);
      return;
    }
    this.paciente.set(paciente.valor);
    this.gestacoes.set(gestacoes.ok ? gestacoes.valor : []);
    this.vinculos.set(vinculos.ok ? vinculos.valor : []);

    const gestacao = this.gestacaoAtual();
    if (gestacao === null) {
      this.consultas.set([]);
      this.checklist.set([]);
      this.documentos.set([]);
      return;
    }

    const [consultas, checklist, documentos] = await Promise.all([
      this.cartao.consultas(gestacao.id),
      this.cartao.checklist(gestacao.id),
      this.cartao.documentos(gestacao.id),
    ]);

    this.consultas.set(consultas.ok ? consultas.valor : []);
    this.checklist.set(checklist.ok ? checklist.valor : []);
    this.documentos.set(documentos.ok ? documentos.valor : []);
  }

  protected abrirMarcacao(item: ItemChecklist): void {
    this.marcacao.setValue({
      status: item.status,
      data: deDataIso(item.data),
      observacao: item.observacao ?? '',
    });
    this.aMarcar.set(item);
  }

  protected async confirmarMarcacao(): Promise<void> {
    const item = this.aMarcar();
    const gestacao = this.gestacaoAtual();
    if (item === null || gestacao === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const bruto = this.marcacao.getRawValue();
      const resultado = await this.cartao.marcarChecklist({
        gestacaoId: gestacao.id,
        protocoloItemId: item.protocolo_item_id,
        status: bruto.status,
        data: paraDataIso(bruto.data),
        observacao: bruto.observacao.trim() === '' ? null : bruto.observacao.trim(),
      });
      this.aMarcar.set(null);
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

`cartao-gestante.html`:

```html
<section class="pagina">
  <header class="cabecalho">
    <div>
      <p class="eyebrow">
        <a routerLink="/mesa">Minhas pacientes</a>
      </p>
      <h1>{{ paciente()?.nome || 'Carregando…' }}</h1>
    </div>
    <p-button
      label="Atualizar"
      icon="pi pi-refresh"
      severity="secondary"
      [loading]="carregando()"
      (onClick)="carregar()"
    />
  </header>

  @if (erro()) {
  <p-message severity="error" [text]="erro()!" />
  } @if (!carregando() && paciente()) {
  <div class="grade">
    <section class="bloco">
      <h2>Dados</h2>
      <dl>
        <dt>CPF</dt>
        <dd>{{ formatarCpf(paciente()!.cpf) || '—' }}</dd>
        <dt>Nascimento</dt>
        <dd>{{ formatarData(paciente()!.dataNascimento) || '—' }}</dd>
        <dt>Contato de emergência</dt>
        <dd>{{ paciente()!.contatoEmergencia || '—' }}</dd>
      </dl>
    </section>

    <section class="bloco">
      <h2>Equipe</h2>
      @if (vinculos().length === 0) {
      <p class="vazio">Nenhum vínculo registrado.</p>
      } @else {
      <ul class="lista">
        @for (v of vinculos(); track v.vinculo_id) {
        <li>
          <span>{{ v.medica_nome }}</span>
          <p-tag
            [value]="v.papel === 'obstetra' ? 'Obstetra' : 'Medicina fetal'"
            [severity]="v.ativo ? 'success' : 'secondary'"
          />
        </li>
        }
      </ul>
      }
    </section>
  </div>

  <section class="bloco">
    <h2>Gestações</h2>
    @if (gestacoes().length === 0) {
    <p class="vazio">Nenhuma gestação cadastrada.</p>
    } @else {
    <p-table [value]="gestacoes()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>DPP</th>
          <th>Origem</th>
          <th>Tipo</th>
          <th>Situação</th>
          <th>Desfecho</th>
        </tr>
      </ng-template>
      <ng-template #body let-g>
        <tr>
          <td>{{ formatarData(g.dppFinal) }}</td>
          <td>{{ g.dppOrigem === 'dum' ? 'DUM' : 'USG' }}</td>
          <td>{{ g.tipo === 'unica' ? 'Única' : 'Gemelar' }}</td>
          <td>
            <p-tag
              [value]="g.status === 'ativa' ? 'Ativa' : 'Encerrada'"
              [severity]="g.status === 'ativa' ? 'success' : 'secondary'"
            />
          </td>
          <td>{{ g.desfecho || '—' }}</td>
        </tr>
      </ng-template>
    </p-table>
    }
  </section>

  @if (gestacaoAtual()) {
  <section class="bloco">
    <h2>Consultas</h2>
    @if (consultas().length === 0) {
    <p class="vazio">Nenhuma consulta registrada.</p>
    } @else {
    <p-table [value]="consultas()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Quando</th>
          <th>Tipo</th>
          <th>Local</th>
          <th>Situação</th>
        </tr>
      </ng-template>
      <ng-template #body let-c>
        <tr>
          <td>{{ formatarDataHora(c.dataHora) }}</td>
          <td>{{ c.tipo }}</td>
          <td>{{ c.local || '—' }}</td>
          <td>{{ c.status }}</td>
        </tr>
      </ng-template>
    </p-table>
    }
  </section>

  <section class="bloco">
    <h2>Checklist do protocolo</h2>
    <p class="dica">{{ pendentes() }} item(ns) vencido(s) ou vencendo.</p>
    <p-table [value]="checklist()" dataKey="protocolo_item_id">
      <ng-template #header>
        <tr>
          <th>Item</th>
          <th>Janela</th>
          <th>Situação</th>
          <th>Status</th>
          <th>Data</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template #body let-i>
        <tr>
          <td>{{ i.nome }}</td>
          <td>{{ i.semana_ini }}–{{ i.semana_fim }} sem</td>
          <td>
            <p-tag [value]="janelaRotulo(i.janela)" [severity]="janelaSeveridade(i.janela)" />
          </td>
          <td>{{ statusRotulo(i.status) }}</td>
          <td>{{ formatarData(i.data) || '—' }}</td>
          <td class="acoes">
            @if (gestacaoAtiva()) {
            <p-button
              label="Marcar"
              icon="pi pi-check"
              severity="secondary"
              [text]="true"
              [disabled]="agindo()"
              (onClick)="abrirMarcacao(i)"
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

  <section class="bloco">
    <h2>Documentos</h2>
    <p class="dica">Publicar e enviar arquivo chegam na próxima fatia da W4.</p>
    @if (documentos().length === 0) {
    <p class="vazio">Nenhum documento nesta gestação.</p>
    } @else {
    <p-table [value]="documentos()" dataKey="id">
      <ng-template #header>
        <tr>
          <th>Título</th>
          <th>Tipo</th>
          <th>Data do exame</th>
          <th>Situação</th>
        </tr>
      </ng-template>
      <ng-template #body let-d>
        <tr>
          <td>{{ d.titulo }}</td>
          <td>{{ d.tipo }}</td>
          <td>{{ formatarData(d.dataExame) || '—' }}</td>
          <td>
            <p-tag [value]="documentoRotulo(d)" [severity]="d.publicadoEm ? 'success' : 'warn'" />
          </td>
        </tr>
      </ng-template>
    </p-table>
    }
  </section>
  } @else {
  <section class="bloco">
    <p class="vazio">
      Sem gestação cadastrada: consultas, checklist e documentos aparecem quando houver uma.
    </p>
  </section>
  } }
</section>

<p-dialog
  header="Marcar item do checklist"
  [visible]="aMarcar() !== null"
  (visibleChange)="aMarcar.set(null)"
  [modal]="true"
  [style]="{ width: '30rem' }"
>
  <p class="quem">{{ aMarcar()?.nome }}</p>

  <form class="formulario" [formGroup]="marcacao" (ngSubmit)="confirmarMarcacao()">
    <label for="status">Status</label>
    <p-select
      inputId="status"
      formControlName="status"
      [options]="statusOpcoes"
      optionLabel="rotulo"
      optionValue="valor"
    />

    <label for="data">Data (opcional)</label>
    <p-datepicker inputId="data" formControlName="data" dateFormat="dd/mm/yy" [showIcon]="true" />

    <label for="obs">Observação (opcional)</label>
    <input id="obs" type="text" pInputText formControlName="observacao" />
  </form>

  <ng-template #footer>
    <p-button label="Cancelar" severity="secondary" (onClick)="aMarcar.set(null)" />
    <p-button label="Salvar" [loading]="agindo()" (onClick)="confirmarMarcacao()" />
  </ng-template>
</p-dialog>
```

`cartao-gestante.scss`:

```scss
.pagina {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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

  a {
    color: var(--aconchego-link);
    text-decoration: none;
  }
}

h1 {
  margin: 0.25rem 0 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--aconchego-texto-primario);
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.0625rem;
  font-weight: 800;
  color: var(--aconchego-texto-primario);
}

.grade {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1.25rem;
}

.bloco {
  padding: 1.25rem;
  border-radius: 16px;
  background: rgb(255 255 255 / 55%);
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.375rem 1rem;
  margin: 0;
}

dt {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--aconchego-texto-secundario);
}

dd {
  margin: 0;
  font-weight: 600;
  color: var(--aconchego-texto-primario);
}

.lista {
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
    font-weight: 600;
  }
}

.dica {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.acoes {
  text-align: right;
  white-space: nowrap;
}

.vazio {
  margin: 0;
  padding: 1rem 0;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.quem {
  margin: 0 0 0.75rem;
  font-weight: 800;
  color: var(--aconchego-texto-primario);
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
```

**Validação:** coberta pela Etapa 9.

---

### Etapa 9 — Rota e acesso a partir de `/mesa`

**Depende de:** Etapa 8
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/pages/mesa/lista/mesa-lista.html` (editar)

Em `src/app/app.routes.ts`, substitua o objeto do path `'mesa'` por um com filhos:

```ts
      {
        path: 'mesa',
        canActivate: [papelGuard('medica')],
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/mesa/lista/mesa-lista').then((m) => m.MesaLista),
          },
          {
            path: ':pacienteId',
            loadComponent: () =>
              import('./pages/mesa/cartao/cartao-gestante').then((m) => m.CartaoGestante),
          },
        ],
      },
```

Em `src/app/pages/mesa/lista/mesa-lista.html`, acrescente uma coluna de ação. No `ng-template
#header`, depois de `<th>Acesso</th>`:

```html
<th></th>
```

e no `ng-template #body`, depois do `<td>{{ statusAcesso(p) }}</td>`:

```html
<td class="acoes">
  <p-button
    label="Abrir"
    icon="pi pi-arrow-right"
    severity="secondary"
    [text]="true"
    [routerLink]="['/mesa', p.paciente_id]"
  />
</td>
```

Ajuste o `colspan` do `#emptymessage` de `5` para `6`.

`RouterLink` precisa entrar no componente: em `src/app/pages/mesa/lista/mesa-lista.ts`, acrescente
o import

```ts
import { RouterLink } from '@angular/router';
```

e inclua `RouterLink` no array `imports` do decorator, mantendo a ordem alfabética (entre
`ReactiveFormsModule` e `SelectModule`).

**Validação:**

```bash
npm run lint && npm run typecheck && npm run build
```

Os três sem erro; o build gera um chunk `cartao-gestante`.

---

### Etapa 10 — Testes do web e documentação

**Depende de:** Etapas 7, 9
**Arquivos:** `src/app/core/cartao/cartao.service.spec.ts`,
`src/app/pages/mesa/cartao/cartao-gestante.spec.ts` (criar), `docs/roadmap-web.md` (editar)

`cartao.service.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { CartaoService } from './cartao.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  const retorno = { data: resposta.data ?? null, error: resposta.error ?? null };
  const order = vi.fn().mockResolvedValue(retorno);
  const maybeSingle = vi.fn().mockResolvedValue(retorno);
  return {
    rpc: vi.fn().mockResolvedValue(retorno),
    order,
    maybeSingle,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order, maybeSingle }),
      }),
    }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): CartaoService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(CartaoService);
}

describe('CartaoService', () => {
  it('mapeia a paciente para camelCase', async () => {
    const cliente = clienteFalso({
      data: {
        id: 'p1',
        nome: 'Ana',
        data_nascimento: '1995-04-10',
        cpf: '12345678900',
        contato_emergencia: null,
      },
    });
    const service = criar(cliente);

    const resultado = await service.paciente('p1');

    expect(resultado).toEqual({
      ok: true,
      valor: {
        id: 'p1',
        nome: 'Ana',
        dataNascimento: '1995-04-10',
        cpf: '12345678900',
        contatoEmergencia: null,
      },
    });
  });

  it('avisa quando a paciente não existe', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.paciente('inexistente');

    expect(resultado).toEqual({ ok: false, mensagem: 'Paciente não encontrada.' });
  });

  it('busca os vínculos pela RPC', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.vinculos('p1');

    expect(cliente.rpc).toHaveBeenCalledWith('vinculos_da_paciente', { p_paciente_id: 'p1' });
  });

  it('omite data e observação nulas ao marcar', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    await service.marcarChecklist({
      gestacaoId: 'g1',
      protocoloItemId: 'i1',
      status: 'solicitado',
      data: null,
      observacao: null,
    });

    expect(cliente.rpc).toHaveBeenCalledWith('marcar_checklist_item', {
      p_gestacao_id: 'g1',
      p_protocolo_item_id: 'i1',
      p_status: 'solicitado',
      p_data: undefined,
      p_observacao: undefined,
    });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Gestação não está ativa' },
    });
    const service = criar(cliente);

    const resultado = await service.marcarChecklist({
      gestacaoId: 'g1',
      protocoloItemId: 'i1',
      status: 'realizado',
      data: '2026-08-10',
      observacao: null,
    });

    expect(resultado).toEqual({ ok: false, mensagem: 'Gestação não está ativa' });
  });
});
```

`cartao-gestante.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { CartaoService, ItemChecklist } from '../../../core/cartao/cartao.service';
import { CartaoGestante } from './cartao-gestante';

const paciente = {
  id: 'p1',
  nome: 'Ana Célia',
  dataNascimento: '1995-04-10',
  cpf: '12345678900',
  contatoEmergencia: 'José',
};

const gestacaoAtiva = {
  id: 'g1',
  dppFinal: '2026-12-01',
  dppOrigem: 'dum',
  tipo: 'unica',
  status: 'ativa',
  desfecho: null,
  desfechoObservacao: null,
  createdAt: '2026-05-01T12:00:00Z',
};

const itemVencido = {
  protocolo_item_id: 'i1',
  nome: 'Hemograma completo',
  trimestre: 1,
  semana_ini: 6,
  semana_fim: 12,
  obrigatorio: true,
  ordem: 20,
  status: 'pendente',
  data: null,
  observacao: null,
  janela: 'vencido',
} as ItemChecklist;

function montar(servico: Partial<CartaoService>) {
  TestBed.configureTestingModule({
    imports: [CartaoGestante],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: CartaoService, useValue: servico },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
      },
    ],
  });
  return TestBed.createComponent(CartaoGestante);
}

const servicoCompleto = () => ({
  paciente: vi.fn().mockResolvedValue({ ok: true, valor: paciente }),
  gestacoes: vi.fn().mockResolvedValue({ ok: true, valor: [gestacaoAtiva] }),
  vinculos: vi.fn().mockResolvedValue({
    ok: true,
    valor: [
      {
        vinculo_id: 'v1',
        medica_id: 'm1',
        medica_nome: 'Dra A',
        papel: 'obstetra',
        ativo: true,
        created_at: '2026-05-01T12:00:00Z',
      },
    ],
  }),
  consultas: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
  checklist: vi.fn().mockResolvedValue({ ok: true, valor: [itemVencido] }),
  documentos: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
});

interface Interno {
  abrirMarcacao(item: unknown): void;
  confirmarMarcacao(): Promise<void>;
  pendentes(): number;
}

describe('CartaoGestante', () => {
  it('mostra dados, equipe e checklist com a janela do banco', async () => {
    const fixture = montar(servicoCompleto());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Ana Célia');
    expect(texto).toContain('123.456.789-00');
    expect(texto).toContain('Dra A');
    expect(texto).toContain('Hemograma completo');
    expect(texto).toContain('Vencido');
  });

  it('conta os itens vencidos e vencendo', async () => {
    const fixture = montar(servicoCompleto());
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(componente.pendentes()).toBe(1);
  });

  it('só marca depois de confirmar o diálogo', async () => {
    const marcarChecklist = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ ...servicoCompleto(), marcarChecklist });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(marcarChecklist).not.toHaveBeenCalled();

    componente.abrirMarcacao(itemVencido);
    await componente.confirmarMarcacao();

    expect(marcarChecklist).toHaveBeenCalledWith(
      expect.objectContaining({ gestacaoId: 'g1', protocoloItemId: 'i1' }),
    );
  });

  it('sem gestação, avisa em vez de mostrar seções vazias', async () => {
    const fixture = montar({
      ...servicoCompleto(),
      gestacoes: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem gestação cadastrada');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      ...servicoCompleto(),
      paciente: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Paciente não encontrada.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Paciente não encontrada.',
    );
  });
});
```

Em `docs/roadmap-web.md`, substitua a linha do cartão na seção W4 por:

```markdown
- [x] Cartão da gestante em `/mesa/:pacienteId`: dados, gestações, vínculos, consultas, checklist com janela classificada no Postgres e documentos em leitura; marcar item do checklist pela tela
- [x] `checklist_da_gestacao` devolve a coluna `janela` e `janelaPara` deixou de existir no Dart
- [x] Cenários 50–52 no `supabase/tests/rls_smoke.sql`
```

**Validação:**

```bash
npm test && npm run format:check
```

Todos passam (84 existentes + 10 novos) e a formatação está limpa.

## 7. Testes

| Arquivo                          | Caso                                    | O que assegura                                                                                                                             |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rls_smoke.sql` 50               | janela                                  | Item do 3º trimestre é `futuro`, hemograma fora da janela é `vencido`, e `nao_aplicavel` vira `resolvido`                                  |
| `rls_smoke.sql` 51               | vínculos                                | Médica vinculada lê; médica sem vínculo é recusada com a mensagem nova; secretaria continua lendo                                          |
| `rls_smoke.sql` 52               | acesso ao checklist                     | Gestante lê o próprio com `janela` preenchida em todos os itens; médica sem vínculo é recusada                                             |
| `test/fase4_checklist_test.dart` | parser                                  | `JanelaChecklist.fromDb` cobre os cinco valores; `alerta` só em vencendo e vencido                                                         |
| `test/fase4_checklist_test.dart` | widget                                  | `'1 vencido · 2 na janela'` continua verdadeiro com a fixture demo nova                                                                    |
| `cartao.service.spec.ts`         | mapeamento e erros                      | camelCase da paciente, paciente inexistente, RPC de vínculos, `undefined` em data/observação nulas, `P0001` repassado                      |
| `cartao-gestante.spec.ts`        | render, contagem, marcação, vazio, erro | Dados/equipe/checklist na tela com a janela do banco; contagem de vencidos; nada é marcado sem confirmar; sem gestação avisa; erro aparece |

Cenários 1–49, o restante do Flutter e os 84 do web devem continuar verdes. **Exceções
declaradas:** o cenário 41 do smoke e `test/fase4_checklist_test.dart` são editados, porque o gate
e o modelo mudaram.

## 8. Riscos e casos de borda

- **A RPC do checklist ganhou coluna, e o mobile consome.** `ChecklistItem.fromMap` passa a exigir
  `janela`; se a Etapa 4 for aplicada sem a Etapa 1, o app quebra em runtime com
  `type 'Null' is not a subtype of type 'String'`. O `flutter test` da Etapa 5 é o que prova a
  ordem correta.
- **Fixture demo com janela fixa.** Os cinco itens de `_seedDemo()` carregam a janela como
  constante, escolhida para reproduzir o que a gestação demo de 24 semanas produziria. Se alguém
  mudar as semanas de um item demo sem mudar a janela, o demo passa a mentir — e nenhum teste
  pega, porque o demo não fala com o banco.
- **Marcar item some com ele da lista de pendentes.** `marcar_checklist_item` só aceita gestação
  **ativa** e item **ativo**; o botão só aparece quando `gestacaoAtiva()` é verdadeiro, mas uma
  gestação encerrada entre o carregamento e o clique devolve `'Gestação não está ativa'` — a
  mensagem cai no `p-message` da tela.
- **Item aposentado no cartão.** Continua aparecendo se a gestação já o marcou (regra da W3), mas
  `marcar_checklist_item` recusa com `'Item do protocolo inexistente ou aposentado'`. A tela ainda
  mostra o botão nesse caso; o erro é claro, mas é um clique perdido.
- **Seis leituras por abertura de cartão.** Três em paralelo, depois três em paralelo. Numa clínica
  é irrelevante; se virar problema, o caminho é uma RPC agregadora, deliberadamente fora desta
  fatia.
- **Falha parcial no carregamento.** Se `gestacoes` ou `vinculos` falharem mas `paciente` der
  certo, a tela abre com as seções vazias e sem mensagem — só o erro de `paciente` sobe para o
  `p-message`. É simplificação consciente; o caso comum de erro (sem vínculo) derruba as três.
- **O cenário 41 muda de significado.** Antes provava "só secretaria"; agora prova "médica sem
  vínculo não passa". A cobertura de "médica **com** vínculo passa" é nova, no cenário 51.
- **Duas migrations no repo do mobile** exigem commit lá junto das mudanças em Dart; o web depende
  do `database.types.ts` regenerado.

## 9. Rollback

- **Frontend web:** reverter o commit no `prenatalweb`.
- **Mobile:** reverter o commit no `prenatalapp` restaura `janelaPara` e o `ChecklistItem` antigo.
  Precisa ser revertido **junto** com a Etapa 1 — o modelo antigo não envia `janela`, mas também
  não a espera, então a ordem segura é reverter o Dart primeiro e a RPC depois.
- **Backend:** migration nova restaurando o corpo de `checklist_da_gestacao` que está em
  `20260821120100_checklist_por_raiz.sql` (dez colunas, sem `janela`), e o gate de
  `vinculos_da_paciente` que está em `20260820120900_vinculos_secretaria.sql`. Nenhuma tabela,
  coluna ou policy é criada nesta fatia, então não há dado a migrar de volta.

## 10. Checklist final

- [ ] `20260823120000_checklist_com_janela.sql` criada; `checklist_da_gestacao` com 11 colunas
- [ ] `20260823120100_vinculos_para_medica.sql` criada; gate aceita secretaria e médica vinculada
- [ ] Cenário 41 do smoke ajustado para a mensagem nova
- [ ] `rls_smoke.sql` roda com exit 0 e 53 blocos `DO`
- [ ] `janelaPara` **não existe mais** em `lib/`
- [ ] `ChecklistItem.janela` é campo, não método; `proximosItens` não recebe mais `igSemanas`
- [ ] `flutter analyze` limpo e `flutter test` verde, com `'1 vencido · 2 na janela'` passando
- [ ] `src/types/database.types.ts` regenerado com a coluna `janela`
- [ ] `CartaoService` criado, sem lançar exceção para o componente
- [ ] `/mesa/:pacienteId` registrada como filha de `/mesa`, herdando `papelGuard('medica')`
- [ ] Botão "Abrir" na linha de `/mesa` leva ao cartão
- [ ] Documentos aparecem só em leitura, com o aviso de que publicar vem na próxima fatia
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run format:check` todos verdes
- [ ] Roteiro manual como `medica`: `/mesa` → "Abrir" numa paciente → cartão mostra dados, equipe, gestações, consultas, checklist com as tags de janela e documentos → marcar um item como realizado com data → a tag vira "Resolvido" e o contador de vencidos cai
- [ ] Roteiro manual: abrir `/mesa/<id-de-paciente-nao-vinculada>` na URL mostra "Paciente não encontrada."
- [ ] `docs/roadmap-web.md` atualizado
- [ ] Este plano salvo como `docs/plano-w4-cartao-gestante.md`, **com os blocos de código**
