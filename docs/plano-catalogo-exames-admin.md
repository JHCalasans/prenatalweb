# Plano: Catálogo de exames editável pelo admin

## Objetivo

O admin cadastra, edita e exclui tipos de exame com seus componentes (natureza, unidade, referências e rótulos) pela tela `/catalogo`, restrita a `papelGuard('admin')`. As escritas passam por RPCs com gate `is_admin()` e auditoria, sem policies diretas nas tabelas. Ao final, um tipo novo criado pela tela já aparece no seletor do painel de exames e no vínculo de `/protocolo` sem restart nem migration.

Isto reverte a decisão W13 ("catálogo fixo, muda por migration") registrada em `docs/plano-w13-exames-vacinas.md` — a emenda documentada no [ADR 0008](adr/0008-exames-e-vacinas-pela-secretaria.md) cobre isso.

## Escopo

**Dentro**

- Migration no `prenatalapp`: RPCs `salvar_tipo_exame` / `excluir_tipo_exame`, `catalogo_exames` devolvendo `positivo_alterado`, ações de auditoria `exame.tipo_*`.
- Cenários 131–137 no `supabase/tests/rls_smoke.sql`.
- Web: `CatalogoExamesService`, extensão de `TipoExameCatalogo`/`ComponenteCatalogo`, página `/catalogo`, rota, menu do shell, rótulos de auditoria.
- Docs: este plano, emenda no roadmap e no ADR 0008.

**Fora**

- Mobile: nenhuma mudança (o catálogo continua sendo lido pela mesma RPC `catalogo_exames`).
- Reordenação drag-and-drop (a ordem do tipo é campo numérico; a do componente é a posição no diálogo).
- Desativação/soft-delete de tipo (existe só excluir-com-guarda).
- Mudar regras de `alterado`, liberação ou marcação de checklist (W13 intacta).
- Editar o `codigo` do tipo ou de um componente após criado (FKs em `exames` e `protocolo_itens`; `exame_resultados.componente` é texto solto).

## Decisões técnicas

| Decisão                         | Escolha                                                                                                                                                                                                                                                                                                 | Motivo                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Escopo do cadastro              | Tipo + componentes na mesma tela, um diálogo                                                                                                                                                                                                                                                            | Decisão do usuário; tipo sem componente não recebe resultado                                                             |
| Exclusão                        | `excluir_tipo_exame` recusa com mensagem clara se há `exames`, `protocolo_itens.tipo_exame` ou componente com `exame_resultados`; remoção de componente dentro do salvar segue a mesma regra                                                                                                            | Decisão do usuário; `exames_da_gestacao` faz join com o catálogo — componente removido com resultado sumiria da exibição |
| Camada de escrita               | 2 RPCs `security definer` com gate `if not public.is_admin()`; sem policies nem grants em `tipos_exame`/`componentes_exame`                                                                                                                                                                             | Padrão W13/W10: RLS ligada sem policy + revoke, escrita fechada em RPC com auditoria                                     |
| Atomicidade                     | `salvar_tipo_exame(p_criando, p_codigo, p_nome, p_ordem, p_componentes jsonb)` faz upsert do tipo e substitui a lista de componentes na mesma transação                                                                                                                                                 | O diálogo salva tipo e componentes juntos; valida tudo antes de gravar                                                   |
| Chaves imutáveis                | `tipos_exame.codigo` e `componentes_exame.codigo` só no momento da criação; edição trava os campos                                                                                                                                                                                                      | Código é PK/FK referenciada; renomear quebraria histórico                                                                |
| Efeito da edição de referências | Vale para resultados futuros **e** já registrados (a leitura junta o catálogo atual; valor e flag `alterado` gravados não mudam)                                                                                                                                                                        | Como a migration W13 já funcionava; aviso fixo no diálogo                                                                |
| Auditoria                       | Ações `exame.tipo_criado`, `exame.tipo_editado`, `exame.tipo_excluido` em `audit_log` (entidade `tipos_exame`, `entidade_id` null porque a coluna é uuid), meta com código/nome/contagem de componentes                                                                                                 | Padrão `audit_log` do projeto; sem valores clínicos no meta                                                              |
| Validação de componente         | `quantitativo`: refs opcionais (sem ref = nunca alterado); `qualitativo`: rótulos de negativo e positivo obrigatórios (espelha a check `componentes_qualitativo_com_rotulos`), `positivo_alterado` default true, `obrigatorio` default true; códigos únicos no payload; código em slug (`^[a-z0-9_]+$`) | Espelha o seed W13 e a exibição do painel                                                                                |
| Ordem do componente             | A RPC atribui pela posição no array (`v_i + 1`); o payload não envia                                                                                                                                                                                                                                    | Uma fonte da verdade; abre caminho para reordenação drag-and-drop no futuro                                              |
| Rota/UX                         | Rota `catalogo`, menu "Catálogo de exames" (`pi-database`) só para admin, página em `pages/exames/catalogo` seguindo `equipe-lista` (signals + `NonNullableFormBuilder` + `p-table` + `p-dialog`, FormArray para componentes com campos condicionais por natureza)                                      | Mesma linguagem das telas de admin/protocolo                                                                             |
| Fonte da lista                  | Página usa `ExamesService.catalogo()` estendido com `ordem`/`positivoAlterado`                                                                                                                                                                                                                          | Evita segunda RPC de leitura; só a escrita é nova                                                                        |

## Pré-requisitos

- Stack local da Supabase em `/Users/joaohenrique/Documents/VoidSans/prenatalapp`.
- Regenerar `prenatalweb/src/types/database.types.ts` depois da migration (`supabase gen types typescript --local`; o arquivo é ignorado pelo Prettier e formatado à parte com `--no-semi --print-width 100`).

## Etapas

### 1 — Migration de RPCs do catálogo

**Depende de:** nenhuma
**Arquivo:** `prenatalapp/supabase/migrations/20261005120000_catalogo_exames_admin.sql`
**O que fazer:** drop + recreate de `catalogo_exames` (troca de retorno exige drop) com `positivo_alterado`; `salvar_tipo_exame` e `excluir_tipo_exame` `security definer` com gate admin, validações em português e auditoria; grants `execute` para `authenticated` (sem `revoke`, seguindo o padrão do projeto).

### 2 — Smoke de RLS

**Depende de:** Etapa 1
**Arquivo:** `prenatalapp/supabase/tests/rls_smoke.sql`
**O que fazer:** cenários 131–137: criação com componentes e auditoria (incluindo recusa de código duplicado); edição de nome/refs; equipe recusada nas RPCs e sem leitura direta das tabelas; exclusão de tipo sem uso; exclusão recusada com resultado; remoção de componente com resultado recusada; catálogo legível pela equipe com `positivo_alterado`.

### 3 — Regenerar tipos

**Depende de:** Etapa 1
**Arquivo:** `prenatalweb/src/types/database.types.ts`

### 4 — Estender o catálogo no ExamesService

**Depende de:** Etapa 3
**Arquivos:** `prenatalweb/src/app/core/exames/exames.service.ts`, `exames.service.spec.ts`
**O que fazer:** `ComponenteCatalogo` ganha `ordem` e `positivoAlterado`; `TipoExameCatalogo` ganha `ordem`; `agruparCatalogo` preenche a partir de `ordem_tipo`/`ordem_componente`/`positivo_alterado`.

### 5 — CatalogoExamesService

**Depende de:** Etapa 3
**Arquivos:** `prenatalweb/src/app/core/exames/catalogo-exames.service.ts`, `catalogo-exames.service.spec.ts`
**O que fazer:** `salvar(dados: DadosTipoExame)` mapeando `p_componentes` para snake_case e `excluir(codigo)`, no padrão `Resultado<T>` + `ErroSupabase`.

### 6 — Página `/catalogo` + rota + menu

**Depende de:** Etapas 4 e 5
**Arquivos:** `prenatalweb/src/app/pages/exames/catalogo/exames-catalogo.{ts,html,scss,spec.ts}`, `app.routes.ts`, `layout/shell/shell.ts` (+ `shell.spec.ts`)
**O que fazer:** tabela de tipos (nome, código, ordem, componentes), diálogo de criação/edição com FormArray de componentes (código travado ao editar existente, campos condicionais por natureza, validadores `rotulosDoQualitativo` e `codigosUnicos`, `Validators.required` no array — `minLength` não dispara para array vazio), diálogo de confirmação de exclusão; rota `catalogo` com `papelGuard('admin')` e item de menu do shell.

### 7 — Rótulos de auditoria

**Depende de:** Etapa 1
**Arquivo:** `prenatalweb/src/app/pages/auditoria/lista/auditoria-lista.ts`
**O que fazer:** `exame.tipo_criado` / `exame.tipo_editado` / `exame.tipo_excluido` em `ROTULO_ACAO` (44 → 47 ações).

### 8 — Docs (emenda W13)

**Depende de:** Etapas 1–7
**Arquivos:** este plano, `docs/roadmap-web.md`, `docs/adr/0008-exames-e-vacinas-pela-secretaria.md`

## Testes

- `exames.service.spec.ts`: agrupamento com `ordem_tipo`/`ordem_componente`/`positivo_alterado`.
- `catalogo-exames.service.spec.ts`: payload de `salvar`, recusa P0001 propagada, `excluir` pelo código.
- `exames-catalogo.spec.ts`: lista renderizada, payload de criação, código travado na edição (`criando: false`), inválidos (sem nome, sem componente), recusas de exclusão e de salvar.
- `rls_smoke.sql`: cenários 131–137.

## Validação final

No `prenatalapp`: migration aplicada e smoke até "OK 137" com `rollback` no fim. No `prenatalweb`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — todos verdes. Manual: como admin, criar um tipo com componente quantitativo e conferir que ele aparece no seletor de "Registrar resultado" e nas opções de vínculo de `/protocolo`; como médica, confirmar que `/catalogo` redireciona para `/sem-acesso`.
