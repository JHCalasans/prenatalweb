# Plano de Implementação: W4 (fatia 1) — Urgência no Postgres + mesa da médica

## 1. Objetivo

Ao final, a regra de urgência deixa de ser código Dart provisório e passa a viver no Postgres:
`painel_da_medica()` devolve `checklist_vencidos`, `checklist_vencendo`, `ig_semanas`,
`trimestre` e `urgencia_score` já calculados, e a lista já vem ordenada por urgência. O app
Flutter apaga `lib/features/medica/data/urgencia.dart` e passa a ler esses valores do banco, sem
mudança visível na home da médica. No web, uma médica acessa `/mesa`, vê a lista densa das suas
pacientes vinculadas ordenada por urgência, com busca por nome e filtros de trimestre e de
pendência.

## 2. Contexto atual

### A regra de urgência hoje é Dart — e é isso que esta fatia corrige

`lib/features/medica/data/urgencia.dart` diz explicitamente que é provisória:

```dart
/// Regra de urgência PROVISÓRIA — a Fase 0 ainda vai validá-la com as médicas.
const int pesoAchadoParaComunicar = 100;
const int pesoChecklistVencido = 40;
const int pesoFaltaSemReagendamento = 30;
const int pesoLaudoParaPublicar = 10;
const int pesoChecklistVencendo = 5;
```

`urgenciaScore(p)` soma `achados*100 + vencidos*40 + (faltou?30:0) + laudos*10 + vencendo*5`, e
`ordenarPorUrgencia` ordena por: quem tem gestação primeiro, depois score decrescente, depois
nome. **A Fase 0 está considerada validada**, então esses pesos e essa ordem são definitivos e
devem migrar para o banco — a premissa do `docs/roadmap-web.md` é explícita: "Regras
compartilhadas (ex.: urgência) vivem **no Postgres**, nunca duplicadas em Dart/TS".

Quem depende disso hoje:

| Arquivo                                                                        | Uso                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/features/medica/data/paciente_resumo.dart:50-81`                          | Getters `idadeGestacional`, `igSemanas`, `trimestre`, `checklistVencidos`, `checklistVencendo`, `temPendencia`, todos derivados de `checklistJanelas` + `dppFinal` |
| `lib/features/medica/data/filtros_painel.dart:17,72,77`                        | `FiltroPendencia.checklist` usa os contadores; `filtrarPacientes` filtra por `p.trimestre` e chama `ordenarPorUrgencia` no fim                                     |
| `lib/features/medica/presentation/screens/medica_home_screen.dart:517,534-549` | Renderiza `${paciente.igSemanas} semanas` e os chips de vencido/vencendo                                                                                           |
| `lib/features/medica/data/pacientes_repository.dart:84`                        | Modo demo monta `PacienteResumo` no cliente com `ChecklistRepository.demoJanelasPendentes(gestacaoId)`                                                             |
| `test/fase5_painel_test.dart:14,84-153`                                        | Importa `urgencia.dart`, monta `_paciente(janelas: [...])` e testa trimestre, contadores e `ordenarPorUrgencia`                                                    |

As regras a portar, exatamente como estão no Dart:

- `IdadeGestacional.fromDpp` (`lib/core/utils/idade_gestacional.dart:28`):
  `diasRestantes = dpp - hoje`; `diasTotais = 280 - diasRestantes`; `semanas = diasTotais ~/ 7`
  (truncamento para zero).
- `IdadeGestacional.trimestre` (W3): `semanas < 14 → 1`, `< 28 → 2`, senão `3`.
- `janelaPara(ig, ini, fim)` (`lib/features/checklist/data/checklist_item.dart:96`):
  `ig < ini → futuro`; `ig > fim → vencido`; `ig == fim → vencendo`; senão `naJanela`.

### `painel_da_medica()` hoje

`supabase/migrations/20260819120000_fase5_painel_medica.sql:67` devolve:

```
paciente_id, nome, data_nascimento, convite_ativado_em, convite_revogado_em,
gestacao_id, dpp_final, proxima_consulta_em, consulta_a_registrar_id,
consulta_a_registrar_em, laudos_para_publicar, achados_para_comunicar,
faltou_sem_reagendar, checklist_janelas jsonb
```

Gate `current_papel() = 'medica'`, `order by p.nome`. O lateral `chk` (linha 172) devolve as
janelas cruas em `jsonb` justamente porque a Fase 4 decidiu deixar a classificação no cliente —
decisão que esta fatia reverte. O lateral `doc` conta laudos e achados; o `falta` resolve
"faltou sem reagendar".

### Frontend web — `~/Documents/VoidSans/prenatalweb/` (commit `b8dc2fb`)

| Arquivo                                            | Papel                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/app/core/protocolo/protocolo.service.ts`      | Modelo do serviço: `Resultado<T>`, `mensagemDeErro` local mapeando `P0001`           |
| `src/app/pages/protocolo/lista/protocolo-lista.ts` | Modelo de tela: `p-table`, `p-tag`, `p-select`, signals `carregando`/`agindo`/`erro` |
| `src/app/app.routes.ts`                            | `/protocolo` sob `papelGuard('medica')`, ao lado das rotas de secretaria             |
| `src/app/layout/shell/shell.html:20-25`            | Bloco `@if (papel() === 'medica')` com um único item, `/protocolo`                   |
| `src/app/core/formato/data.ts`                     | `formatarData`, `paraDataIso`, `deDataIso`                                           |
| `src/app/core/formato/cpf.ts`                      | `formatarCpf`, `somenteDigitos`                                                      |

Não existe helper de busca sem acento no web; o Dart tem `normalizarBusca` em
`lib/core/utils/texto.dart`.

PrimeNG 21.1.9; testes com Vitest + `TestBed` e `provideZonelessChangeDetection()` — hoje 74
testes em 17 arquivos. O smoke tem 2177 linhas, cenários **1 a 46**, `rollback;` na linha 2175.

## 3. Escopo

**Dentro:**

- Funções SQL `ig_semanas`, `trimestre_ig`, `janela_checklist` e `urgencia_score`.
- Reescrita de `painel_da_medica()` com as colunas novas e ordenação por urgência.
- Cenários 47–49 em `supabase/tests/rls_smoke.sql`.
- Mobile: apagar `urgencia.dart`, converter `PacienteResumo` para campos vindos da RPC, ajustar
  `filtros_painel.dart`, o modo demo e `test/fase5_painel_test.dart`.
- Regeneração de `src/types/database.types.ts`.
- Web: helper `normalizarBusca`, `MesaService` e a tela `/mesa` sob `papelGuard('medica')`.
- Testes do serviço e da tela no web.
- Atualização de `docs/roadmap-web.md`.

**Fora — não fazer nesta tarefa:**

- Não implementar o cartão da gestante no web nem o upload de PDF — são as fatias 2 e 3 da W4.
- Não alterar `janelaPara` nem `ChecklistItem.janela` no Dart: a classificação **por item** na
  tela de checklist continua no cliente. Ver Riscos.
- Não alterar `checklist_da_gestacao`, `marcar_checklist_item`, `marcar_consulta` nem qualquer
  policy existente.
- Não mudar a aparência da home da médica no mobile — a migração é de origem do dado, não de UI.
- Não criar tabela de pesos editáveis: os pesos ficam como constantes na função SQL.
- Não mexer em telas de `secretaria` no web.
- Não adicionar dependência npm ou pub nova.

## 4. Decisões técnicas

| Decisão                                   | Escolha                                                                                                       | Motivo                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde vive a regra                         | Quatro funções SQL, e `painel_da_medica` as consome                                                           | Cumpre a premissa do roadmap; o web passa a ler o mesmo número que o mobile, sem reimplementar nada em TypeScript                                    |
| Granularidade das funções                 | `ig_semanas`, `trimestre_ig`, `janela_checklist` e `urgencia_score` separadas, em vez de tudo embutido na RPC | Cada uma é testável isoladamente pelo smoke e reutilizável pelas fatias 2 e 3 da W4                                                                  |
| Volatilidade                              | `ig_semanas` e `trimestre_ig` são `stable`; `janela_checklist` e `urgencia_score` são `immutable`             | `ig_semanas` lê `current_date`, que é `stable` — declarar `immutable` faria o planner cachear o valor entre dias                                     |
| Truncamento da IG                         | `div(280 - (dpp - current_date), 7)`                                                                          | `div()` trunca para zero igual ao `~/` do Dart; `/` com inteiros no Postgres também trunca, mas `div()` deixa a intenção explícita                   |
| Ordenação                                 | Dentro da RPC: `(gestacao_id is null), urgencia_score desc, nome`                                             | Espelha `ordenarPorUrgencia`. Com a ordem vindo pronta, os dois clientes só filtram — e filtro preserva ordem                                        |
| `checklist_janelas`                       | **Removida** da RPC, substituída por `checklist_vencidos` e `checklist_vencendo`                              | Devolver as janelas cruas só existia para o cliente classificar; manter as duas coisas seria carregar dado morto                                     |
| `ig_semanas` e `trimestre` na RPC         | Adicionados                                                                                                   | O filtro de trimestre existe nos dois clientes; sem isso ambos recalculariam a IG a partir de `dpp_final`                                            |
| Pesos                                     | Constantes no corpo de `urgencia_score`                                                                       | Fase 0 validada: os pesos são definitivos. Tabela editável só se passarem a mudar com frequência                                                     |
| Modo demo do mobile                       | Passa a carregar `checklistVencidos`, `checklistVencendo` e `urgenciaScore` como **constantes** na fixture    | Demo roda sem banco. Recalcular no Dart reintroduziria a regra que estamos removendo; a fixture é dado canned, então o valor pode ser fixo           |
| `JanelaPendente` e `demoJanelasPendentes` | Removidos                                                                                                     | Ficam sem nenhum chamador depois da migração                                                                                                         |
| `test/fase5_painel_test.dart`             | **Será editado** — está no escopo                                                                             | O modelo de `PacienteResumo` muda; não editá-lo deixaria a suíte quebrada. Diferente das fatias anteriores, aqui a edição é planejada, não acidental |
| Filtro e busca no web                     | No cliente, sobre as linhas que a RPC devolveu                                                                | A RPC já limita às pacientes vinculadas da médica — dezenas, não milhares. Espelha `filtrarPacientes` do mobile                                      |
| Busca sem acento no web                   | Helper `normalizarBusca` novo em `src/app/core/formato/texto.ts`                                              | O Dart tem o equivalente em `lib/core/utils/texto.dart`; é normalização de entrada, não regra de negócio                                             |
| Rota                                      | `/mesa`, `papelGuard('medica')`                                                                               | "Mesa de trabalho da médica" é o nome no roadmap; `/pacientes` já é a tela administrativa da secretaria                                              |
| Ações na tela                             | Só leitura e navegação nesta fatia                                                                            | Registrar consulta, publicar laudo e marcar checklist dependem do cartão da gestante, que é a fatia 2                                                |

## 5. Pré-requisitos

- Docker rodando com o stack local do Supabase do `prenatalapp`; `psql` no PATH.
- `flutter` no PATH.
- W3 aplicada (commits `976c909` no `prenatalapp` e `b8dc2fb` no `prenatalweb`).
- Nenhuma dependência npm ou pub nova.

## 6. Etapas

Etapas 1–5 no repo `~/Documents/VoidSans/prenatalapp`. Etapas 6–10 no `~/Documents/VoidSans/prenatalweb`.

---

### Etapa 1 — Funções de IG, janela e urgência

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260822120000_urgencia_no_postgres.sql` (criar)

**O que fazer:** portar para SQL as quatro regras que hoje vivem no Dart, com os mesmos números.

**Código:**

```sql
-- W4: a regra de urgência sai do Dart e passa a viver aqui. Os pesos foram
-- validados na Fase 0 e espelham lib/features/medica/data/urgencia.dart, que
-- é apagado na mesma entrega — a premissa do roadmap é que regra compartilhada
-- não pode existir em dois lugares.

-- Espelha IdadeGestacional.fromDpp: diasTotais = 280 - (dpp - hoje), e as
-- semanas completas truncam para zero. `stable`, não `immutable`: lê current_date.
create or replace function public.ig_semanas(p_dpp_final date)
returns integer
language sql
stable
as $$
  select case
    when p_dpp_final is null then null
    else div(280 - (p_dpp_final - current_date), 7)
  end;
$$;

-- Espelha IdadeGestacional.trimestre.
create or replace function public.trimestre_ig(p_ig_semanas integer)
returns integer
language sql
immutable
as $$
  select case
    when p_ig_semanas is null then null
    when p_ig_semanas < 14 then 1
    when p_ig_semanas < 28 then 2
    else 3
  end;
$$;

-- Espelha janelaPara() de checklist_item.dart.
create or replace function public.janela_checklist(
  p_ig_semanas integer,
  p_semana_ini smallint,
  p_semana_fim smallint
)
returns text
language sql
immutable
as $$
  select case
    when p_ig_semanas is null then 'futuro'
    when p_ig_semanas < p_semana_ini then 'futuro'
    when p_ig_semanas > p_semana_fim then 'vencido'
    when p_ig_semanas = p_semana_fim then 'vencendo'
    else 'na_janela'
  end;
$$;

-- Ordem do dano clínico: achado alterado parado (regra 2 do README) > exame
-- vencido > paciente que sumiu > laudo atrasado > exame vencendo.
create or replace function public.urgencia_score(
  p_achados_para_comunicar integer,
  p_checklist_vencidos integer,
  p_faltou_sem_reagendar boolean,
  p_laudos_para_publicar integer,
  p_checklist_vencendo integer
)
returns integer
language sql
immutable
as $$
  select coalesce(p_achados_para_comunicar, 0) * 100
       + coalesce(p_checklist_vencidos, 0) * 40
       + case when coalesce(p_faltou_sem_reagendar, false) then 30 else 0 end
       + coalesce(p_laudos_para_publicar, 0) * 10
       + coalesce(p_checklist_vencendo, 0) * 5;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset
```

Conclui sem erro. Depois confira que a IG bate com o Dart (24 semanas para DPP em +112 dias, que
é a gestação demo) e que os pesos somam certo:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select public.ig_semanas(current_date + 112) as ig, public.trimestre_ig(24) as tri, public.janela_checklist(24, 20::smallint, 24::smallint) as janela, public.urgencia_score(1, 2, true, 3, 4) as score;"
```

Saída esperada: `ig = 24`, `tri = 2`, `janela = vencendo`, `score = 260`
(100 + 80 + 30 + 30 + 20).

---

### Etapa 2 — Reescrever `painel_da_medica`

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260822120100_painel_com_urgencia.sql` (criar)

**O que fazer:** substituir a função inteira. `checklist_janelas jsonb` sai; entram
`ig_semanas`, `trimestre`, `checklist_vencidos`, `checklist_vencendo` e `urgencia_score`, e a
ordenação passa a ser por urgência.

**Código:**

```sql
-- A RPC passa a devolver a classificação pronta e já ordenada. Antes devolvia
-- as janelas cruas em jsonb para o cliente classificar (decisão da Fase 4);
-- com a Fase 0 validada, a regra é do banco. O app Flutter é migrado na mesma
-- entrega e urgencia.dart deixa de existir.

create or replace function public.painel_da_medica()
returns table (
  paciente_id uuid,
  nome text,
  data_nascimento date,
  convite_ativado_em timestamptz,
  convite_revogado_em timestamptz,
  gestacao_id uuid,
  dpp_final date,
  ig_semanas integer,
  trimestre integer,
  proxima_consulta_em timestamptz,
  consulta_a_registrar_id uuid,
  consulta_a_registrar_em timestamptz,
  laudos_para_publicar integer,
  achados_para_comunicar integer,
  faltou_sem_reagendar boolean,
  checklist_vencidos integer,
  checklist_vencendo integer,
  urgencia_score integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_papel() <> 'medica' then
    raise exception 'Apenas médicas abrem o painel';
  end if;

  return query
    select
      linhas.paciente_id,
      linhas.nome,
      linhas.data_nascimento,
      linhas.convite_ativado_em,
      linhas.convite_revogado_em,
      linhas.gestacao_id,
      linhas.dpp_final,
      linhas.ig_semanas,
      linhas.trimestre,
      linhas.proxima_consulta_em,
      linhas.consulta_a_registrar_id,
      linhas.consulta_a_registrar_em,
      linhas.laudos_para_publicar,
      linhas.achados_para_comunicar,
      linhas.faltou_sem_reagendar,
      linhas.checklist_vencidos,
      linhas.checklist_vencendo,
      linhas.urgencia_score
    from (
      select
        p.id as paciente_id,
        p.nome as nome,
        p.data_nascimento as data_nascimento,
        conv.ativado_em as convite_ativado_em,
        conv.revogado_em as convite_revogado_em,
        g.id as gestacao_id,
        g.dpp_final as dpp_final,
        public.ig_semanas(g.dpp_final) as ig_semanas,
        public.trimestre_ig(public.ig_semanas(g.dpp_final)) as trimestre,
        prox.data_hora as proxima_consulta_em,
        reg.id as consulta_a_registrar_id,
        reg.data_hora as consulta_a_registrar_em,
        coalesce(doc.laudos, 0)::integer as laudos_para_publicar,
        coalesce(doc.achados, 0)::integer as achados_para_comunicar,
        coalesce(falta.tem, false) as faltou_sem_reagendar,
        coalesce(chk.vencidos, 0)::integer as checklist_vencidos,
        coalesce(chk.vencendo, 0)::integer as checklist_vencendo,
        public.urgencia_score(
          coalesce(doc.achados, 0)::integer,
          coalesce(chk.vencidos, 0)::integer,
          coalesce(falta.tem, false),
          coalesce(doc.laudos, 0)::integer,
          coalesce(chk.vencendo, 0)::integer
        ) as urgencia_score
      from (
        -- Vínculo é único por (paciente, médica, papel): sem o distinct, a médica
        -- que é obstetra e medicina fetal da mesma paciente a veria duas vezes.
        select distinct v.paciente_id
        from public.vinculos v
        where v.medica_id = auth.uid()
          and v.ativo
      ) vin
      join public.pacientes p on p.id = vin.paciente_id
      left join public.gestacoes g
        on g.paciente_id = p.id
       and g.status = 'ativa'
      left join lateral (
        select c.ativado_em, c.revogado_em
        from public.convites c
        where c.paciente_id = p.id
        order by c.criado_em desc, c.id desc
        limit 1
      ) conv on true
      left join lateral (
        select
          count(*) filter (
            where not (d.achado_alterado and not d.comunicado_presencialmente)
          ) as laudos,
          count(*) filter (
            where d.achado_alterado and not d.comunicado_presencialmente
          ) as achados
        from public.documentos d
        where d.gestacao_id = g.id
          and d.publicado_em is null
          and d.arquivo_enviado_em is not null
      ) doc on true
      left join lateral (
        select min(c.data_hora) as data_hora
        from public.consultas c
        where c.gestacao_id = g.id
          and c.status = 'agendada'
          and c.data_hora > now()
      ) prox on true
      left join lateral (
        select c.id, c.data_hora
        from public.consultas c
        where c.gestacao_id = g.id
          and c.status = 'agendada'
          and c.data_hora <= now()
        order by c.data_hora desc
        limit 1
      ) reg on true
      left join lateral (
        select (
          exists (
            select 1 from public.consultas c
            where c.gestacao_id = g.id and c.status = 'faltou'
          )
          and not exists (
            select 1 from public.consultas c
            where c.gestacao_id = g.id
              and c.status = 'agendada'
              and c.data_hora > now()
          )
        ) as tem
      ) falta on true
      left join lateral (
        select
          count(*) filter (
            where public.janela_checklist(
              public.ig_semanas(g.dpp_final), pi.semana_ini, pi.semana_fim
            ) = 'vencido'
          ) as vencidos,
          count(*) filter (
            where public.janela_checklist(
              public.ig_semanas(g.dpp_final), pi.semana_ini, pi.semana_fim
            ) = 'vencendo'
          ) as vencendo
        from public.protocolo_itens pi
        left join public.gestacao_checklist gc
          on gc.protocolo_item_id = pi.id
         and gc.gestacao_id = g.id
        where pi.ativo
          and coalesce(gc.status, 'pendente'::public.status_checklist)
              not in ('realizado', 'nao_aplicavel')
      ) chk on true
    ) linhas
    -- Espelha ordenarPorUrgencia: quem tem gestação primeiro, score desc, nome.
    order by
      (linhas.gestacao_id is null),
      linhas.urgencia_score desc,
      linhas.nome;
end;
$$;
```

O lateral `conv` ganhou `, c.id desc` no desempate, alinhando com o que a W2 fatia 2 já fez em
`convites_da_secretaria` — convites criados na mesma transação compartilham `criado_em`.

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.painel_da_medica"
```

A função existe. As colunas novas são conferidas pelo cenário 47 na Etapa 3.

---

### Etapa 3 — Cenários 47–49 no smoke

**Depende de:** Etapa 2
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

**O que fazer:** inserir o bloco abaixo **imediatamente antes** da linha `rollback;` (hoje linha
2175). Não altere fixtures nem cenários existentes.

Atenção ao estado acumulado: o cenário 40 transferiu o vínculo de obstetra de `paciente_row` para
`medica_b`, e o cenário 44 marcou "Hemograma completo" como `solicitado` nessa gestação. Os
cenários novos usam `medica_b` para enxergar `paciente_row`.

**Código:**

```sql
-- ---------------------------------------------------------------------------
-- 47) Funções de IG, trimestre, janela e score espelham o Dart
-- ---------------------------------------------------------------------------
do $$
declare
  v_score integer;
begin
  if public.ig_semanas(null) is not null then
    raise exception 'FAIL: ig_semanas(null) deveria ser null';
  end if;
  if public.ig_semanas(current_date + 112) <> 24 then
    raise exception 'FAIL: DPP em +112 dias deveria dar 24 semanas';
  end if;
  if public.ig_semanas(current_date) <> 40 then
    raise exception 'FAIL: DPP hoje deveria dar 40 semanas';
  end if;

  if public.trimestre_ig(13) <> 1 or public.trimestre_ig(14) <> 2
     or public.trimestre_ig(27) <> 2 or public.trimestre_ig(28) <> 3 then
    raise exception 'FAIL: bordas do trimestre não batem com o Dart';
  end if;
  if public.trimestre_ig(null) is not null then
    raise exception 'FAIL: trimestre_ig(null) deveria ser null';
  end if;

  if public.janela_checklist(10, 20::smallint, 24::smallint) <> 'futuro'
     or public.janela_checklist(22, 20::smallint, 24::smallint) <> 'na_janela'
     or public.janela_checklist(24, 20::smallint, 24::smallint) <> 'vencendo'
     or public.janela_checklist(25, 20::smallint, 24::smallint) <> 'vencido' then
    raise exception 'FAIL: janela_checklist não espelha janelaPara';
  end if;
  if public.janela_checklist(null, 20::smallint, 24::smallint) <> 'futuro' then
    raise exception 'FAIL: sem gestação a janela deveria ser futuro';
  end if;

  v_score := public.urgencia_score(1, 2, true, 3, 4);
  if v_score <> 260 then
    raise exception 'FAIL: score deveria ser 260 (veio %)', v_score;
  end if;
  if public.urgencia_score(0, 0, false, 0, 0) <> 0 then
    raise exception 'FAIL: sem pendência o score deveria ser 0';
  end if;
  if public.urgencia_score(null, null, null, null, null) <> 0 then
    raise exception 'FAIL: nulos deveriam somar 0';
  end if;

  raise notice 'OK 47: IG, trimestre, janela e score espelham o Dart';
end $$;

-- ---------------------------------------------------------------------------
-- 48) O painel devolve a classificação pronta e segue o vínculo
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_medica_b uuid := (select value from smoke_ids where key = 'medica_b');
  v_paciente uuid := (select value from smoke_ids where key = 'paciente_row');
  v_ig integer;
  v_tri integer;
  v_score integer;
  v_count int;
begin
  perform pg_temp.as_user(v_medica_b);

  select ig_semanas, trimestre, urgencia_score
    into v_ig, v_tri, v_score
  from public.painel_da_medica()
  where paciente_id = v_paciente;

  if v_ig is null then
    raise exception 'FAIL: a paciente com gestação ativa deveria ter ig_semanas';
  end if;
  if v_tri <> public.trimestre_ig(v_ig) then
    raise exception 'FAIL: trimestre da RPC não bate com trimestre_ig';
  end if;
  if v_score is null then
    raise exception 'FAIL: urgencia_score não deveria ser null';
  end if;

  select count(*) into v_count from public.painel_da_medica();
  if v_count = 0 then
    raise exception 'FAIL: medica_b deveria ver ao menos a paciente transferida';
  end if;

  perform pg_temp.back_to_postgres();

  perform pg_temp.as_user(v_medica_a);
  select count(*) into v_count
  from public.painel_da_medica()
  where paciente_id = v_paciente;
  perform pg_temp.back_to_postgres();

  if v_count <> 0 then
    raise exception 'FAIL: medica_a perdeu o vínculo no cenário 40 e não deveria ver a paciente';
  end if;

  raise notice 'OK 48: painel classifica IG/trimestre/score e respeita o vínculo';
end $$;

-- ---------------------------------------------------------------------------
-- 49) Ordenação por urgência: gestação primeiro, score desc, nome
-- ---------------------------------------------------------------------------
do $$
declare
  v_medica_a uuid := (select value from smoke_ids where key = 'medica_a');
  v_urgente uuid;
  v_calma uuid;
  v_sem_gestacao uuid;
  v_gestacao uuid;
  v_doc uuid;
  v_primeira uuid;
  v_ultima uuid;
begin
  insert into public.pacientes (nome) values ('Zilda Urgente') returning id into v_urgente;
  insert into public.pacientes (nome) values ('Ana Calma') returning id into v_calma;
  insert into public.pacientes (nome) values ('Beatriz Sem Gestacao')
    returning id into v_sem_gestacao;

  insert into public.vinculos (paciente_id, medica_id, papel) values
    (v_urgente, v_medica_a, 'obstetra'),
    (v_calma, v_medica_a, 'obstetra'),
    (v_sem_gestacao, v_medica_a, 'obstetra');

  insert into public.gestacoes (paciente_id, dum, dpp_final, dpp_origem)
  values (v_urgente, current_date - 168, current_date + 112, 'dum')
  returning id into v_gestacao;

  insert into public.gestacoes (paciente_id, dum, dpp_final, dpp_origem)
  values (v_calma, current_date - 168, current_date + 112, 'dum');

  -- Achado alterado não comunicado pesa 100 e deve levar Zilda ao topo, apesar
  -- do nome vir por último no alfabeto.
  insert into public.documentos
    (gestacao_id, tipo, titulo, storage_path, achado_alterado, arquivo_enviado_em)
  values
    (v_gestacao, 'laudo_usg', 'USG com achado', 'smoke/w4-achado.pdf', true, now())
  returning id into v_doc;

  perform pg_temp.as_user(v_medica_a);

  select paciente_id into v_primeira from public.painel_da_medica() limit 1;

  select paciente_id into v_ultima
  from public.painel_da_medica()
  order by row_number() over () desc
  limit 1;

  perform pg_temp.back_to_postgres();

  if v_primeira <> v_urgente then
    raise exception 'FAIL: a paciente com achado alterado deveria vir primeiro';
  end if;
  if v_ultima <> v_sem_gestacao then
    raise exception 'FAIL: paciente sem gestação deveria vir por último';
  end if;

  raise notice 'OK 49: painel ordena por gestação, urgência e nome';
end $$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql > /tmp/smoke.out 2>&1; echo "exit=$?"; grep -c "^DO" /tmp/smoke.out
```

Saída esperada: `exit=0` e `50` blocos `DO` (1 de fixtures + 49 cenários), com `ROLLBACK` no fim.

---

### Etapa 4 — Migrar o modelo do mobile

**Depende de:** Etapa 2
**Arquivos:** `lib/features/medica/data/urgencia.dart` (remover),
`lib/features/medica/data/paciente_resumo.dart` (editar),
`lib/features/medica/data/filtros_painel.dart` (editar),
`lib/features/medica/data/pacientes_repository.dart` (editar),
`lib/features/checklist/data/checklist_item.dart` (editar),
`lib/features/checklist/data/checklist_repository.dart` (editar)

**O que fazer:** os contadores e o score passam a ser campos vindos da RPC.

Primeiro, apague o arquivo da regra:

```bash
cd ~/Documents/VoidSans/prenatalapp && rm lib/features/medica/data/urgencia.dart
```

Substitua `lib/features/medica/data/paciente_resumo.dart` inteiro por:

```dart
import '../../../core/utils/idade_gestacional.dart';

class PacienteResumo {
  const PacienteResumo({
    required this.id,
    required this.nome,
    this.dataNascimento,
    this.conviteAtivadoEm,
    this.conviteRevogadoEm,
    this.gestacaoId,
    this.dppFinal,
    this.igSemanas,
    this.trimestre,
    this.proximaConsultaEm,
    this.consultaARegistrarId,
    this.consultaARegistrarEm,
    this.laudosParaPublicar = 0,
    this.achadosParaComunicar = 0,
    this.faltouSemReagendar = false,
    this.checklistVencidos = 0,
    this.checklistVencendo = 0,
    this.urgenciaScore = 0,
  });

  final String id;
  final String nome;
  final DateTime? dataNascimento;
  final DateTime? conviteAtivadoEm;
  final DateTime? conviteRevogadoEm;
  final String? gestacaoId;
  final DateTime? dppFinal;

  /// Derivados no Postgres desde a W4: ig_semanas / trimestre_ig.
  final int? igSemanas;
  final int? trimestre;

  final DateTime? proximaConsultaEm;

  /// Consulta que já passou e ninguém fechou — a única que vira `faltou`.
  final String? consultaARegistrarId;
  final DateTime? consultaARegistrarEm;

  final int laudosParaPublicar;
  final int achadosParaComunicar;
  final bool faltouSemReagendar;

  /// Classificados por janela_checklist no Postgres.
  final int checklistVencidos;
  final int checklistVencendo;

  /// urgencia_score do Postgres. A regra não existe mais no cliente.
  final int urgenciaScore;

  bool get acessoAtivo => conviteAtivadoEm != null && conviteRevogadoEm == null;

  String get statusLabel {
    if (acessoAtivo) return 'Acesso ativo';
    if (conviteRevogadoEm != null) return 'Código revogado';
    return 'Aguardando primeiro acesso';
  }

  bool get temGestacao => gestacaoId != null;

  IdadeGestacional? get idadeGestacional =>
      dppFinal == null ? null : IdadeGestacional.fromDpp(dppFinal!);

  bool get temPendencia =>
      laudosParaPublicar > 0 ||
      achadosParaComunicar > 0 ||
      faltouSemReagendar ||
      checklistVencidos > 0 ||
      checklistVencendo > 0;

  static DateTime? _dataHora(Object? valor) =>
      valor == null ? null : DateTime.parse(valor as String).toLocal();

  static DateTime? _data(Object? valor) =>
      valor == null ? null : DateTime.parse(valor as String);

  factory PacienteResumo.fromPainel(Map<String, dynamic> map) {
    return PacienteResumo(
      id: map['paciente_id'] as String,
      nome: map['nome'] as String,
      dataNascimento: _data(map['data_nascimento']),
      conviteAtivadoEm: _dataHora(map['convite_ativado_em']),
      conviteRevogadoEm: _dataHora(map['convite_revogado_em']),
      gestacaoId: map['gestacao_id'] as String?,
      dppFinal: _data(map['dpp_final']),
      igSemanas: map['ig_semanas'] as int?,
      trimestre: map['trimestre'] as int?,
      proximaConsultaEm: _dataHora(map['proxima_consulta_em']),
      consultaARegistrarId: map['consulta_a_registrar_id'] as String?,
      consultaARegistrarEm: _dataHora(map['consulta_a_registrar_em']),
      laudosParaPublicar: map['laudos_para_publicar'] as int,
      achadosParaComunicar: map['achados_para_comunicar'] as int,
      faltouSemReagendar: map['faltou_sem_reagendar'] as bool,
      checklistVencidos: map['checklist_vencidos'] as int,
      checklistVencendo: map['checklist_vencendo'] as int,
      urgenciaScore: map['urgencia_score'] as int,
    );
  }
}
```

Em `lib/features/medica/data/filtros_painel.dart`, remova o import da regra apagada:

```dart
import '../../../core/utils/texto.dart';
import 'paciente_resumo.dart';
```

e substitua o fim de `filtrarPacientes` — a RPC já devolve ordenado, então só o filtro sobra:

```dart
  return pacientes.where((p) {
    if (termo.isNotEmpty && !normalizarBusca(p.nome).contains(termo)) {
      return false;
    }
    if (trimestre != null && p.trimestre != trimestre) return false;
    if (pendencia != null && !pendencia.aplica(p)) return false;
    return true;
  }).toList();
}
```

Em `lib/features/medica/data/pacientes_repository.dart`, no `_comPainelDemo`, troque a linha

```dart
      checklistJanelas: ChecklistRepository.demoJanelasPendentes(gestacaoId),
```

por

```dart
      igSemanas: gestacao?.idadeGestacional.semanas,
      trimestre: gestacao == null
          ? null
          : ChecklistRepository.demoTrimestre(gestacao.idadeGestacional.semanas),
      checklistVencidos: ChecklistRepository.demoVencidos(gestacaoId),
      checklistVencendo: ChecklistRepository.demoVencendo(gestacaoId),
      urgenciaScore: ChecklistRepository.demoUrgencia(gestacaoId),
```

Em `lib/features/checklist/data/checklist_repository.dart`, substitua o método
`demoJanelasPendentes` (linha 79) por estes quatro, que devolvem constantes: o modo demo roda sem
banco e recalcular aqui reintroduziria a regra que acabou de sair do cliente.

```dart
  /// Valores fixos do modo demo. O cálculo real vive no Postgres (W4); aqui é
  /// fixture, não regra — por isso constante, não derivação.
  static int demoVencidos(String? gestacaoId) => gestacaoId == null ? 0 : 1;

  static int demoVencendo(String? gestacaoId) => gestacaoId == null ? 0 : 1;

  static int demoUrgencia(String? gestacaoId) => gestacaoId == null ? 0 : 45;

  static int demoTrimestre(int igSemanas) {
    if (igSemanas < 14) return 1;
    if (igSemanas < 28) return 2;
    return 3;
  }
```

Em `lib/features/checklist/data/checklist_item.dart`, apague a classe `JanelaPendente` inteira —
ela some junto com o campo `checklistJanelas`. Localize e remova o bloco:

```dart
class JanelaPendente {
  const JanelaPendente(this.semanaIni, this.semanaFim);

  final int semanaIni;
  final int semanaFim;
}
```

`janelaPara`, `JanelaChecklist` e `ChecklistItem.janela` **continuam** — a tela de checklist
classifica item a item e não passa por esta fatia.

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && flutter analyze
```

Espera-se erro apenas em `test/fase5_painel_test.dart`, que a Etapa 5 corrige. Nenhum erro em
`lib/`.

---

### Etapa 5 — Atualizar os testes da Fase 5 no mobile

**Depende de:** Etapa 4
**Arquivos:** `~/Documents/VoidSans/prenatalapp/test/fase5_painel_test.dart` (editar)

**O que fazer:** o helper `_paciente` monta o modelo antigo. Trocar `janelas` por contadores
diretos e substituir os testes que exercitavam a regra agora removida.

Remova o import da regra apagada (linha 14):

```dart
import 'package:prenatal_app/features/medica/data/urgencia.dart';
```

Ajuste a assinatura do helper `_paciente` para receber os contadores em vez das janelas —
troque o parâmetro `List<JanelaPendente> janelas = const []` por:

```dart
  int vencidos = 0,
  int vencendo = 0,
  int urgencia = 0,
```

e, na construção do `PacienteResumo` dentro do helper, troque `checklistJanelas: janelas` por:

```dart
    igSemanas: comGestacao ? igSemanas : null,
    trimestre: comGestacao ? _trimestreDe(igSemanas) : null,
    checklistVencidos: vencidos,
    checklistVencendo: vencendo,
    urgenciaScore: urgencia,
```

Acrescente o helper local, logo antes de `_paciente`:

```dart
int _trimestreDe(int igSemanas) {
  if (igSemanas < 14) return 1;
  if (igSemanas < 28) return 2;
  return 3;
}
```

Os testes de trimestre (linhas 84–94) continuam válidos sem alteração. Substitua o `group` que
testava os contadores derivados e `ordenarPorUrgencia` (linhas ~98–150) por:

```dart
  group('PacienteResumo', () {
    test('contadores vêm prontos do painel', () {
      final p = _paciente(igSemanas: 24, vencidos: 1, vencendo: 1);

      expect(p.checklistVencidos, 1);
      expect(p.checklistVencendo, 1);
      expect(p.temPendencia, isTrue);
    });

    test('sem gestação não tem pendência de checklist', () {
      final semGestacao = _paciente(comGestacao: false);

      expect(semGestacao.checklistVencidos, 0);
      expect(semGestacao.checklistVencendo, 0);
      expect(semGestacao.temPendencia, isFalse);
    });

    test('fromPainel lê os campos derivados no Postgres', () {
      final p = PacienteResumo.fromPainel(const {
        'paciente_id': 'p1',
        'nome': 'Ana',
        'data_nascimento': null,
        'convite_ativado_em': null,
        'convite_revogado_em': null,
        'gestacao_id': 'g1',
        'dpp_final': null,
        'ig_semanas': 24,
        'trimestre': 2,
        'proxima_consulta_em': null,
        'consulta_a_registrar_id': null,
        'consulta_a_registrar_em': null,
        'laudos_para_publicar': 2,
        'achados_para_comunicar': 1,
        'faltou_sem_reagendar': true,
        'checklist_vencidos': 3,
        'checklist_vencendo': 4,
        'urgencia_score': 290,
      });

      expect(p.igSemanas, 24);
      expect(p.trimestre, 2);
      expect(p.checklistVencidos, 3);
      expect(p.urgenciaScore, 290);
    });
  });

  group('filtrarPacientes', () {
    test('preserva a ordem que o painel devolveu', () {
      final ordenada = filtrarPacientes([
        _paciente(nome: 'Urgente', urgencia: 140),
        _paciente(nome: 'Calma', urgencia: 0),
      ]);

      expect(ordenada.map((p) => p.nome), ['Urgente', 'Calma']);
    });

    test('filtro de pendência usa os contadores do painel', () {
      final filtradas = filtrarPacientes([
        _paciente(nome: 'Com vencido', vencidos: 1),
        _paciente(nome: 'Sem nada'),
      ], pendencia: FiltroPendencia.checklist);

      expect(filtradas.map((p) => p.nome), ['Com vencido']);
    });
  });
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && flutter analyze && flutter test
```

`No issues found!` e `All tests passed!`. A contagem cai de `+71` para `+70`: os dois testes de
`ordenarPorUrgencia` saem e três entram no lugar dos dois antigos de contadores.

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
grep -n "urgencia_score\|ig_semanas\|janela_checklist\|trimestre_ig" ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

As quatro funções aparecem na seção `Functions`.

---

### Etapa 7 — Helper de busca e `MesaService`

**Depende de:** Etapa 6
**Arquivos:** `src/app/core/formato/texto.ts` (criar), `src/app/core/mesa/mesa.service.ts` (criar)

`texto.ts`:

```ts
// Busca por nome ignora acento e caixa, igual ao normalizarBusca do mobile.
export function normalizarBusca(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
```

`mesa.service.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaPainel = Database['public']['Functions']['painel_da_medica']['Returns'][number];

export type PacienteMesa = LinhaPainel;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class MesaService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  // A RPC já devolve ordenado por urgência e restrito às pacientes vinculadas.
  async listar(): Promise<Resultado<PacienteMesa[]>> {
    const { data, error } = await this.supabase.rpc('painel_da_medica');
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

Sem erro. Se `PacienteMesa` não tiver `urgencia_score`, a Etapa 6 não foi aplicada.

---

### Etapa 8 — Tela `/mesa`

**Depende de:** Etapa 7
**Arquivos:** `src/app/pages/mesa/lista/mesa-lista.ts`, `mesa-lista.html`, `mesa-lista.scss` (criar)

`mesa-lista.ts`:

```ts
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { formatarData } from '../../../core/formato/data';
import { normalizarBusca } from '../../../core/formato/texto';
import { MesaService, PacienteMesa } from '../../../core/mesa/mesa.service';

type Pendencia = 'laudos' | 'achados' | 'checklist' | 'faltas';

@Component({
  imports: [
    ButtonModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    TagModule,
  ],
  selector: 'app-mesa-lista',
  styleUrl: './mesa-lista.scss',
  templateUrl: './mesa-lista.html',
})
export class MesaLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly mesa = inject(MesaService);

  protected readonly todas = signal<PacienteMesa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  private readonly busca = signal('');
  private readonly trimestre = signal<number | null>(null);
  private readonly pendencia = signal<Pendencia | null>(null);

  protected readonly trimestres = [
    { rotulo: 'Todos os trimestres', valor: null },
    { rotulo: '1º trimestre', valor: 1 },
    { rotulo: '2º trimestre', valor: 2 },
    { rotulo: '3º trimestre', valor: 3 },
  ];

  protected readonly pendencias = [
    { rotulo: 'Todas as pendências', valor: null },
    { rotulo: 'Laudos para publicar', valor: 'laudos' },
    { rotulo: 'Achados para comunicar', valor: 'achados' },
    { rotulo: 'Checklist vencido ou vencendo', valor: 'checklist' },
    { rotulo: 'Falta sem reagendamento', valor: 'faltas' },
  ];

  protected readonly formulario = this.fb.group({
    busca: '',
    trimestre: [null as number | null],
    pendencia: [null as Pendencia | null],
  });

  protected readonly formatarData = formatarData;

  // A ordem vem da RPC; filtrar preserva.
  protected readonly linhas = computed(() => {
    const termo = normalizarBusca(this.busca());
    const tri = this.trimestre();
    const pend = this.pendencia();

    return this.todas().filter((p) => {
      if (termo !== '' && !normalizarBusca(p.nome).includes(termo)) {
        return false;
      }
      if (tri !== null && p.trimestre !== tri) {
        return false;
      }
      if (pend !== null && !this.temPendencia(p, pend)) {
        return false;
      }
      return true;
    });
  });

  protected readonly total = computed(() => this.linhas().length);

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.mesa.listar();
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.todas.set([]);
        return;
      }
      this.todas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected aplicar(): void {
    const { busca, trimestre, pendencia } = this.formulario.getRawValue();
    this.busca.set(busca);
    this.trimestre.set(trimestre);
    this.pendencia.set(pendencia);
  }

  protected limpar(): void {
    this.formulario.setValue({ busca: '', trimestre: null, pendencia: null });
    this.aplicar();
  }

  protected statusAcesso(p: PacienteMesa): string {
    if (p.convite_ativado_em !== null && p.convite_revogado_em === null) {
      return 'Acesso ativo';
    }
    if (p.convite_revogado_em !== null) {
      return 'Código revogado';
    }
    return 'Aguardando 1º acesso';
  }

  private temPendencia(p: PacienteMesa, pend: Pendencia): boolean {
    switch (pend) {
      case 'laudos':
        return p.laudos_para_publicar > 0;
      case 'achados':
        return p.achados_para_comunicar > 0;
      case 'checklist':
        return p.checklist_vencidos > 0 || p.checklist_vencendo > 0;
      case 'faltas':
        return p.faltou_sem_reagendar;
    }
  }
}
```

`mesa-lista.html`:

```html
<section class="pagina">
  <header class="cabecalho">
    <div>
      <p class="eyebrow">Clínica</p>
      <h1>Minhas pacientes</h1>
    </div>
    <p-button
      label="Atualizar"
      icon="pi pi-refresh"
      severity="secondary"
      [loading]="carregando()"
      (onClick)="carregar()"
    />
  </header>

  <p class="dica">Ordenadas por urgência: achado alterado parado vem sempre primeiro.</p>

  <form class="filtros" [formGroup]="formulario" (ngSubmit)="aplicar()">
    <input
      pInputText
      type="search"
      formControlName="busca"
      placeholder="Buscar por nome"
      aria-label="Buscar por nome"
    />
    <p-select
      formControlName="trimestre"
      [options]="trimestres"
      optionLabel="rotulo"
      optionValue="valor"
      ariaLabel="Filtrar por trimestre"
    />
    <p-select
      formControlName="pendencia"
      [options]="pendencias"
      optionLabel="rotulo"
      optionValue="valor"
      ariaLabel="Filtrar por pendência"
    />
    <p-button type="submit" label="Filtrar" icon="pi pi-filter" />
    <p-button type="button" label="Limpar" severity="secondary" (onClick)="limpar()" />
  </form>

  @if (erro()) {
  <p-message severity="error" [text]="erro()!" />
  }

  <p-table
    [value]="linhas()"
    [loading]="carregando()"
    dataKey="paciente_id"
    [rows]="25"
    [paginator]="true"
  >
    <ng-template #header>
      <tr>
        <th>Paciente</th>
        <th>IG</th>
        <th>Próxima consulta</th>
        <th>Pendências</th>
        <th>Acesso</th>
      </tr>
    </ng-template>

    <ng-template #body let-p>
      <tr>
        <td>{{ p.nome }}</td>
        <td>
          @if (p.ig_semanas !== null) { {{ p.ig_semanas }} sem · {{ p.trimestre }}º tri } @else {
          <span class="apagado">Sem gestação ativa</span>
          }
        </td>
        <td>{{ formatarData(p.proxima_consulta_em) || '—' }}</td>
        <td class="pendencias">
          @if (p.achados_para_comunicar > 0) {
          <p-tag severity="danger" [value]="p.achados_para_comunicar + ' a comunicar'" />
          } @if (p.checklist_vencidos > 0) {
          <p-tag severity="danger" [value]="p.checklist_vencidos + ' vencidos'" />
          } @if (p.faltou_sem_reagendar) {
          <p-tag severity="warn" value="Faltou" />
          } @if (p.laudos_para_publicar > 0) {
          <p-tag severity="info" [value]="p.laudos_para_publicar + ' a publicar'" />
          } @if (p.checklist_vencendo > 0) {
          <p-tag severity="warn" [value]="p.checklist_vencendo + ' vencendo'" />
          } @if (p.urgencia_score === 0) {
          <span class="apagado">Em dia</span>
          }
        </td>
        <td>{{ statusAcesso(p) }}</td>
      </tr>
    </ng-template>

    <ng-template #emptymessage>
      <tr>
        <td colspan="5" class="vazio">Nenhuma paciente encontrada.</td>
      </tr>
    </ng-template>
  </p-table>
</section>
```

`mesa-lista.scss`:

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

.dica {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.filtros {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;

  input {
    flex: 1;
    min-width: 12rem;
  }
}

.pendencias {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.apagado {
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}

.vazio {
  padding: 1.5rem;
  text-align: center;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}
```

**Validação:** coberta pela Etapa 9.

---

### Etapa 9 — Rota e item na sidebar

**Depende de:** Etapa 8
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.html` (editar)

Em `src/app/app.routes.ts`, insira depois do objeto do path `'protocolo'` e antes de
`{ path: '', pathMatch: 'full', redirectTo: 'inicio' },`:

```ts
      {
        path: 'mesa',
        canActivate: [papelGuard('medica')],
        loadComponent: () => import('./pages/mesa/lista/mesa-lista').then((m) => m.MesaLista),
      },
```

Em `src/app/layout/shell/shell.html`, dentro do `@if (papel() === 'medica')`, **antes** do link de
`/protocolo`, acrescente:

```html
<a routerLink="/mesa" routerLinkActive="ativo">
  <i class="pi pi-users" aria-hidden="true"></i>
  <span>Minhas pacientes</span>
</a>
```

**Validação:**

```bash
npm run lint && npm run typecheck && npm run build
```

Os três sem erro; o build gera um chunk `mesa-lista`.

---

### Etapa 10 — Testes do web e documentação

**Depende de:** Etapas 7, 9
**Arquivos:** `src/app/core/mesa/mesa.service.spec.ts`,
`src/app/pages/mesa/lista/mesa-lista.spec.ts` (criar), `docs/roadmap-web.md` (editar)

`mesa.service.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { MesaService } from './mesa.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): MesaService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(MesaService);
}

describe('MesaService', () => {
  it('chama a RPC sem argumentos', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar();

    expect(cliente.rpc).toHaveBeenCalledWith('painel_da_medica');
  });

  it('devolve lista vazia quando a RPC não traz dados', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(resultado).toEqual({ ok: true, valor: [] });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Apenas médicas abrem o painel' },
    });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(resultado).toEqual({ ok: false, mensagem: 'Apenas médicas abrem o painel' });
  });

  it('traduz erro desconhecido em mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: '08006', message: 'connection failure' } });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
```

`mesa-lista.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MesaService, PacienteMesa } from '../../../core/mesa/mesa.service';
import { MesaLista } from './mesa-lista';

const base = {
  paciente_id: 'p1',
  nome: 'Ana Célia',
  data_nascimento: null,
  convite_ativado_em: '2026-08-01T12:00:00Z',
  convite_revogado_em: null,
  gestacao_id: 'g1',
  dpp_final: '2026-12-01',
  ig_semanas: 24,
  trimestre: 2,
  proxima_consulta_em: null,
  consulta_a_registrar_id: null,
  consulta_a_registrar_em: null,
  laudos_para_publicar: 0,
  achados_para_comunicar: 0,
  faltou_sem_reagendar: false,
  checklist_vencidos: 0,
  checklist_vencendo: 0,
  urgencia_score: 0,
} as PacienteMesa;

const urgente = {
  ...base,
  paciente_id: 'p2',
  nome: 'Zilda Souza',
  trimestre: 3,
  ig_semanas: 30,
  achados_para_comunicar: 1,
  urgencia_score: 100,
};

const semGestacao = {
  ...base,
  paciente_id: 'p3',
  nome: 'Beatriz Lima',
  gestacao_id: null,
  ig_semanas: null,
  trimestre: null,
};

function montar(listar: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [MesaLista],
    providers: [provideZonelessChangeDetection(), { provide: MesaService, useValue: { listar } }],
  });
  return TestBed.createComponent(MesaLista);
}

interface Interno {
  formulario: { setValue(v: unknown): void };
  aplicar(): void;
  total(): number;
}

describe('MesaLista', () => {
  it('mostra IG, trimestre e as pendências', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Zilda Souza');
    expect(texto).toContain('30 sem');
    expect(texto).toContain('1 a comunicar');
    expect(texto).toContain('Em dia');
  });

  it('preserva a ordem que a RPC devolveu', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto.indexOf('Zilda Souza')).toBeLessThan(texto.indexOf('Ana Célia'));
  });

  it('busca por nome ignora acento', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base] }));
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({ busca: 'celia', trimestre: null, pendencia: null });
    componente.aplicar();

    expect(componente.total()).toBe(1);
  });

  it('filtra por trimestre e por pendência', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base, semGestacao] }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;

    componente.formulario.setValue({ busca: '', trimestre: 3, pendencia: null });
    componente.aplicar();
    expect(componente.total()).toBe(1);

    componente.formulario.setValue({ busca: '', trimestre: null, pendencia: 'achados' });
    componente.aplicar();
    expect(componente.total()).toBe(1);
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas médicas abrem o painel' }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Apenas médicas abrem o painel',
    );
  });
});
```

Em `docs/roadmap-web.md`, substitua as duas primeiras linhas da seção W4 por:

```markdown
- [x] Regra de urgência no Postgres (`ig_semanas`, `trimestre_ig`, `janela_checklist`, `urgencia_score`); `painel_da_medica` devolve a classificação pronta e ordenada, e `urgencia.dart` deixou de existir no mobile
- [x] Lista densa de pacientes em `/mesa` com busca, filtros de trimestre e pendência, ordenada por urgência
- [x] Cenários 47–49 no `supabase/tests/rls_smoke.sql`
```

**Validação:**

```bash
npm test && npm run format:check
```

Todos passam (74 existentes + 9 novos) e a formatação está limpa.

## 7. Testes

| Arquivo                       | Caso                                | O que assegura                                                                                                      |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `rls_smoke.sql` 47            | funções puras                       | IG de +112 dias = 24 semanas; bordas 13/14 e 27/28 do trimestre; as quatro janelas; score 260 e tratamento de nulos |
| `rls_smoke.sql` 48            | painel                              | `ig_semanas`/`trimestre`/`urgencia_score` vêm preenchidos e coerentes; médica sem vínculo não vê a paciente         |
| `rls_smoke.sql` 49            | ordenação                           | Achado alterado leva ao topo apesar do nome; paciente sem gestação vai para o fim                                   |
| `test/fase5_painel_test.dart` | modelo                              | Contadores vêm prontos; sem gestação não há pendência; `fromPainel` lê os campos novos                              |
| `test/fase5_painel_test.dart` | filtro                              | `filtrarPacientes` preserva a ordem da RPC e filtra por pendência                                                   |
| `mesa.service.spec.ts`        | RPC e erros                         | Chamada sem argumentos, lista vazia, `P0001` repassado, código desconhecido genérico                                |
| `mesa-lista.spec.ts`          | render, ordem, busca, filtros, erro | IG/trimestre/tags na tela; ordem da RPC preservada; busca sem acento; trimestre e pendência filtram                 |

Cenários 1–46, os demais testes do Flutter e os 74 do web devem continuar verdes. **Exceção
declarada:** `test/fase5_painel_test.dart` é editado na Etapa 5, porque o modelo mudou.

## 8. Riscos e casos de borda

- **`janelaPara` continua no Dart.** Esta fatia tira do cliente a _agregação_ (contadores e
  score), mas a classificação **por item** na tela de checklist segue em
  `lib/features/checklist/data/checklist_item.dart`. As duas implementam a mesma regra de quatro
  linhas, agora em lugares diferentes. O cenário 47 trava o comportamento do lado SQL e
  `fase4_checklist_test.dart` trava o do lado Dart, mas o alinhamento é por convenção, não por
  construção. Unificar exige `checklist_da_gestacao` devolver uma coluna `janela` e o Dart passar
  a lê-la — fica para a fatia 2 da W4, junto com o cartão da gestante que consome esse checklist.
- **Modo demo com valores fixos.** `demoVencidos`/`demoVencendo`/`demoUrgencia` devolvem
  constantes, então a home demo da médica mostra sempre "1 vencido, 1 vencendo" e ordena por um
  score fabricado. É fixture, não regra — mas quem olhar o demo esperando ver a ordenação real vai
  se enganar.
- **A RPC mudou de forma.** Qualquer chamador que ainda espere `checklist_janelas` quebra. Os
  únicos são `PacienteResumo.fromPainel` (migrado na Etapa 4) e o web (novo). O `flutter analyze`
  da Etapa 4 e o `flutter test` da Etapa 5 são o que prova que não sobrou nenhum.
- **`ig_semanas` é `stable`, não `immutable`.** Uma gestação atravessa a virada do dia e a IG
  muda: é o comportamento correto, mas significa que o resultado da RPC não pode ser cacheado
  entre dias. Nenhum cache existe hoje.
- **Paciente sem gestação ativa** tem `ig_semanas`, `trimestre` e `dpp_final` nulos, score 0, e vai
  para o fim da lista. O filtro de trimestre a exclui de qualquer seleção — comportamento igual ao
  do mobile hoje.
- **Item de protocolo aposentado** continua fora dos contadores (`where pi.ativo`), inclusive para
  quem o marcou como `solicitado`. É a mesma decisão registrada na W3 e não muda aqui.
- **Contagem de testes do Flutter cai de 71 para 70.** Não é regressão: dois testes de
  `ordenarPorUrgencia` saem com a função, e três entram no lugar de dois. Confira a saída, não só
  o "All tests passed".
- **Duas migrations no repo do mobile** exigem commit lá também, junto das mudanças em Dart; o web
  depende do `database.types.ts` regenerado.

## 9. Rollback

- **Frontend web:** reverter o commit no `prenatalweb`.
- **Mobile:** reverter o commit no `prenatalapp` restaura `urgencia.dart` e o
  `PacienteResumo` antigo. Precisa ser revertido **junto** com a RPC — o modelo antigo espera
  `checklist_janelas`.
- **Backend:** migration nova restaurando o corpo de `painel_da_medica` que está em
  `20260819120000_fase5_painel_medica.sql`, e depois
  `drop function public.urgencia_score(integer, integer, boolean, integer, integer);`,
  `drop function public.janela_checklist(integer, smallint, smallint);`,
  `drop function public.trimestre_ig(integer);` e `drop function public.ig_semanas(date);`.
  Nenhuma tabela, coluna ou policy é criada, então não há dado a migrar de volta.

## 10. Checklist final

- [x] `20260822120000_urgencia_no_postgres.sql` criada; as quatro funções existem e devolvem os valores do cenário 47
- [x] `20260822120100_painel_com_urgencia.sql` criada; `painel_da_medica` sem `checklist_janelas` e com as cinco colunas novas (com `drop function` antes do `create`: `create or replace` não troca o tipo de retorno)
- [x] `rls_smoke.sql` roda com exit 0 e 50 blocos `DO` (cenário 26 adaptado aos contadores novos; ver desvios abaixo)
- [x] `lib/features/medica/data/urgencia.dart` **não existe mais**
- [x] `JanelaPendente` e `demoJanelasPendentes` removidos
- [x] `flutter analyze` limpo em `lib/` e `flutter test` verde, com `+72` (o plano previa +70; a substituição prescrita remove 4 testes e adiciona 5)
- [x] A home da médica no mobile continua mostrando os mesmos chips e a mesma ordem (widget tests passam; seed demo pré-ordenado como a RPC devolveria)
- [x] `src/types/database.types.ts` regenerado com as quatro funções
- [x] `MesaService` e `normalizarBusca` criados (+ `formatarDataHora` em `core/formato/data.ts`: `proxima_consulta_em` é `timestamptz`, e `formatarData` exibira "Invalid Date")
- [x] `/mesa` registrada sob `papelGuard('medica')` e item na sidebar antes de "Protocolo"
- [x] `npm run lint && npm run typecheck && npm test && npm run build && npm run format:check` todos verdes (84 testes: 74 + 10 novos)
- [x] Roteiro manual como `medica`: `/mesa` lista as pacientes vinculadas ordenadas por urgência → buscar por nome sem acento acha a mesma paciente → paciente sem gestação aparece por último. **Parcial:** os dropdowns de trimestre e pendência não foram exercitados no navegador (overlay do PrimeNG inacessível à automação); lógica coberta pelos testes de componente
- [x] Roteiro manual como `secretaria`: sidebar sem "Minhas pacientes"; `/mesa` na URL cai em `/sem-acesso`
- [x] `docs/roadmap-web.md` atualizado
- [x] Este plano salvo como `docs/plano-w4-mesa-urgencia.md`, **com os blocos de código**

### Desvios registrados na execução

- **Etapa 2**: `drop function public.painel_da_medica()` adicionado antes do `create` — Postgres recusa
  `create or replace` com tipo de retorno diferente.
- **Cenário 26**: usava `checklist_janelas` (coluna removida) e não compilaria. Adaptado para os
  contadores novos: avança a DUM da gestação para 24 semanas (está em 4 desde o cenário 15, quando
  tudo é "futuro" e os contadores zeram), testa e **restaura a DUM** ao fim.
- **Cenário 49**: a verificação de "última linha" foi restrita às três pacientes novas — os
  cenários 30 e 45 deixaram outras pacientes sem gestação vinculadas à `medica_a`, e o empate por
  nome mudaria a última linha global. A primeira linha continua verificada globalmente.
- **Demo mobile**: `demoVencidos`/`demoVencendo`/`demoUrgencia` amarrados a `demoGestacaoId`
  (não a qualquer gestação) e `_seedDemo` pré-ordenado — a versão literal daria a Beatriz chips
  que ela nunca teve e quebraria o widget test de ordem, já que o cliente não ordena mais.
- **`PacienteMesa`** declara `| null` nas colunas de LEFT JOIN: o gerador de tipos não emite
  nulabilidade em retorno de função, e o código da tela assume os nulos.
