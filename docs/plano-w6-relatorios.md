# Plano: W6 (fatia 2) — Relatórios operacionais

> Ao aprovar, salve como `docs/plano-w6-relatorios.md` no repo `prenatalweb`.
>
> Segunda e última fatia da W6. Fecha o item de relatórios do roadmap.

## Contexto

A W6 fatia 1 entregou o viewer da auditoria: o rastro de **ações**, registro a registro. O que
falta é o outro lado — o **estado** da clínica em números que a equipe usa para cobrar trabalho:
quais laudos saíram no mês, quem faltou e não remarcou, quais checklists passaram da janela, quais
convites vão expirar sem ninguém ter ativado.

Hoje esses dados existem, mas espalhados e sempre por paciente: `/mesa` mostra pendência de uma
gestante por vez, `/convites` e `/agenda` filtram por situação mas sem recorte de período nem
exportação. Ninguém consegue responder "quantos achados alterados foram comunicados em agosto" ou
levar para a reunião a lista de quem faltou. É essa lacuna — visão da clínica inteira, recortada
por período e levável para fora da tela — que esta fatia fecha.

## Objetivo

Ao final, secretaria e médica acessam `/relatorios`, escolhem um relatório num seletor, ajustam o
recorte e veem a tabela pronta. Cada relatório exporta em CSV que o Excel pt-BR abre sem
ajuste, e imprime em papel limpo — sem sidebar, sem filtros, sem botões.

A secretaria enxerga **Faltas** e **Convites pendentes**; a médica enxerga esses dois mais
**Documentos publicados** e **Checklists vencidos**.

## Escopo

**Dentro:**

- Migration com quatro RPCs `security definer`, uma por relatório.
- Cenários 63–66 em `supabase/tests/rls_smoke.sql`.
- Regeneração de `src/types/database.types.ts`.
- `RelatoriosService`, helper `csv.ts`, tela `/relatorios`, item na sidebar.
- Bloco `@media print` em `src/styles.scss`.
- Testes do helper, do serviço e da tela.
- Fechar o item de relatórios em `docs/roadmap-web.md`, encerrando a W6.

**Fora:**

- Biblioteca de PDF. Decisão do usuário: CSV + impressão do navegador, sem dependência nova.
- Gráficos, agregações e totalizadores. São listas de linhas, não dashboard.
- Paginação server-side: teto fixo de 500, como na auditoria.
- Pacientes **sem convite nenhum** no relatório de convites: é outra lacuna, e `/convites` já a
  mostra como situação `sem_convite`.
- Não criar policy nova em tabela alguma: a leitura ampla passa só pelas RPCs.
- Não mexer em RPC existente nem em nada do app Flutter.
- Não alterar `painel_da_medica`, mesmo tendo ele um bug conhecido de contagem (ver Decisões).

## Decisões técnicas

| Decisão                     | Escolha                                                                                                        | Motivo                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota                        | `/relatorios` única, com `p-select` escolhendo o relatório                                                     | Quatro rotas para quatro listas com os mesmos filtros e a mesma exportação multiplicaria o mesmo código                                                                                                          |
| Acesso                      | `papelGuard('secretaria', 'medica')`; a lista do seletor filtra por papel                                      | Decisão do usuário. Convites e faltas são trabalho da secretaria; documentos e checklist são clínicos e ficam com a médica, coerente com o gate da auditoria                                                     |
| Gate das RPCs               | Cada RPC repete o próprio gate: duas exigem `medica`, duas aceitam `medica` ou `secretaria`                    | A tela esconder a opção não é segurança. Quem chamar a RPC direto tem que bater no mesmo muro                                                                                                                    |
| Escopo do que a médica vê   | Clínica inteira, sem filtrar por vínculo                                                                       | Mesmo critério da auditoria: o gate é de papel. Relatório de clínica que muda conforme quem abre não fecha com o da colega                                                                                       |
| Colunas                     | Descritor `{ rotulo, valor: (linha) => string }` por relatório; tabela, CSV e impressão consomem o mesmo array | Uma fonte só para as três saídas. Sem isso, uma coluna nova exige três edições e elas divergem                                                                                                                   |
| Apagamento de tipo          | Um helper `definir<T>(...)` faz o cast; fora dele tudo é tipado                                                | Concentra num ponto o `unknown` que a união de quatro formatos de linha exige                                                                                                                                    |
| Sem `p-tag` nas tabelas     | Texto puro em toda célula                                                                                      | É o mesmo texto que vai para o CSV e para o papel; tag colorida não sobrevive a nenhum dos dois                                                                                                                  |
| Período                     | Obrigatório em Documentos e Faltas; ausente em Checklists e Convites                                           | Os dois primeiros são eventos datados; os dois últimos são retrato de agora — filtrar "convite que expira" por data passada não quer dizer nada. Os campos de data ficam desabilitados nos relatórios de retrato |
| Recorte extra               | Um único `p-checkbox` `ampliar`, com rótulo trocado por relatório                                              | Checklists: "incluir os que vencem esta semana". Convites: "incluir expirados". Mesmo controle, mesmo lugar                                                                                                      |
| Filtro por médica           | Só em Faltas e só para a secretaria                                                                            | `listarMedicas()` lê `profiles` direto por RLS e a médica não enxerga as colegas. É por isso que `/agenda` já esconde esse select fora da secretaria                                                             |
| `reagendou` em Faltas       | Coluna booleana calculada na RPC                                                                               | Falta sem remarcação é a linha acionável. O usuário pediu as quatro listas inteiras, então a coluna separa as duas sem cortar linhas                                                                             |
| Versão do item no checklist | `distinct on (g.id, pi.raiz_id)`, como em `checklist_da_gestacao`                                              | `painel_da_medica` conta por linha de `protocolo_itens` e infla quando um item foi versionado. Não repita o erro aqui — e não conserte o painel nesta fatia                                                      |
| Situação do convite         | Mesmo `case` de `convites_da_secretaria`, sobre o convite mais recente por paciente                            | Duas definições de "pendente" no mesmo banco divergem na primeira mudança                                                                                                                                        |
| Separador do CSV            | `;`, com BOM UTF-8 e quebra CRLF                                                                               | Excel em pt-BR abre `,` numa coluna só e come o acento sem BOM                                                                                                                                                   |
| Download                    | `Blob` + `URL.createObjectURL` + `<a download>` sintético                                                      | `window.open`, usado em `cartao-documentos.ts` para abrir laudo, esbarra em bloqueio de pop-up; download por âncora não                                                                                          |
| Impressão                   | `window.print()` + `@media print` global escondendo `.sem-impressao`                                           | Classe utilitária serve qualquer tela futura; nenhuma regra de impressão dentro do componente                                                                                                                    |
| Teto                        | `limit 500` em todas, com o mesmo `p-message` de truncamento da auditoria                                      | Consistência com a fatia 1                                                                                                                                                                                       |

## Etapas

### 1 — RPCs dos quatro relatórios

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260829120000_relatorios_operacionais.sql` (criar)

Quatro funções, todas `language plpgsql`, `stable`, `security definer`, `set search_path = public`,
`order by` definido e `limit 500`. Nenhuma delas cria índice ou policy.

Mensagens de gate, exatamente estas duas:
`'Apenas médicas abrem este relatório'` e `'Apenas a equipe abre este relatório'`.

**`public.relatorio_documentos_publicados(p_desde timestamptz, p_ate timestamptz, p_tipo public.tipo_documento default null)`**
— gate `medica`. Retorna `documento_id uuid, publicado_em timestamptz, paciente_nome text,
tipo public.tipo_documento, titulo text, data_exame date, achado_alterado boolean,
comunicado_presencialmente boolean, publicado_por_nome text`.
Percorre `documentos` → `gestacoes` → `pacientes`, com `left join profiles` em `publicado_por`.
Filtra `publicado_em >= p_desde and publicado_em < p_ate` e `p_tipo` quando não nulo.
Ordena `publicado_em desc`.

**`public.relatorio_faltas(p_desde timestamptz, p_ate timestamptz, p_medica_id uuid default null)`**
— gate `medica` ou `secretaria`. Retorna `consulta_id uuid, data_hora timestamptz,
paciente_id uuid, paciente_nome text, medica_nome text, tipo text, local text, reagendou boolean`.
Filtra `status = 'faltou'` na janela por `data_hora`, mais `p_medica_id` quando não nulo.
`reagendou` é o `exists` de consulta `agendada` com `data_hora > now()` na mesma gestação — a mesma
condição que `painel_da_medica` usa em `faltou_sem_reagendar`, invertida. Ordena `data_hora desc`.

**`public.relatorio_checklist_vencidos(p_incluir_vencendo boolean default false)`**
— gate `medica`. Retorna `gestacao_id uuid, paciente_id uuid, paciente_nome text, medicas text,
ig_semanas integer, protocolo_item_id uuid, item_nome text, semana_ini smallint,
semana_fim smallint, obrigatorio boolean, status public.status_checklist, janela text`.
Só gestações `status = 'ativa'`. Uma linha por raiz de item, com o mesmo
`distinct on (g.id, pi.raiz_id)` e o mesmo `order by` de desempate de `checklist_da_gestacao`.
Descarta item resolvido (`status in ('realizado','nao_aplicavel')`).
Classifica com `public.janela_checklist(public.ig_semanas(g.dpp_final), pi.semana_ini, pi.semana_fim)`
e mantém `'vencido'`, ou `'vencido'`/`'vencendo'` quando `p_incluir_vencendo`.
`medicas` é o `string_agg` das médicas com vínculo ativo, igual ao de `pacientes_da_secretaria`.
Ordena `paciente_nome, semana_ini`.

**`public.relatorio_convites_pendentes(p_incluir_expirados boolean default false)`**
— gate `medica` ou `secretaria`. Retorna `paciente_id uuid, paciente_nome text, cpf text,
medicas text, convite_id uuid, criado_em timestamptz, expira_em timestamptz,
dias_para_expirar integer, situacao text`.
Reaproveita de `convites_da_secretaria` o `left join lateral` que pega o convite mais recente
(`order by criado_em desc, id desc limit 1`) e o `case` de situação, sem alterar nenhum dos dois.
Mantém `'pendente'`, ou `'pendente'`/`'expirado'` quando `p_incluir_expirados`.
`dias_para_expirar` é `expira_em::date - current_date` — negativo em convite expirado.
Ordena `expira_em`.

**Validação:** `supabase db reset` conclui sem erro e `\df public.relatorio_*` lista as quatro.

### 2 — Cenários 63–66 no smoke

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

Insira antes do `rollback;` final (hoje linha 3216), seguindo a forma dos cenários 60–62: ids
resolvidos ainda como `postgres`, `pg_temp.as_user(...)`, asserção negativa comparando `sqlerrm`
com a mensagem exata, `pg_temp.back_to_postgres()` e `raise notice 'OK N: ...'`.

**63** — gates: a gestante é recusada nas quatro; a secretaria passa em faltas e convites e é
recusada em documentos e checklist, com a mensagem certa em cada caso; a médica passa nas quatro.

**64** — documentos publicados: a janela pega o `smoke/publicado.pdf` do fixture e o rascunho
**não** aparece; `p_tipo` filtra; janela no futuro devolve zero linhas.

**65** — faltas: use a `consulta_vencida` que o cenário da W5 marcou como falta. Confirme
`reagendou = false`; agende uma consulta futura para a mesma gestação, chame de novo e confirme
`reagendou = true`. Confirme também que `p_medica_id` de outra médica devolve zero linhas.

**66** — checklist e convites: com `p_incluir_vencendo = false` toda linha volta com
`janela = 'vencido'`, e ligando a flag aparece ao menos uma `'vencendo'`; marcar um item como
`realizado` o tira da lista. Nos convites, o fixture `SMOKEVALIDO1234` aparece como `'pendente'`,
o `SMOKEEXPIRADO123` só aparece com `p_incluir_expirados = true`, e o ativado e o revogado nunca
aparecem.

A gestação do fixture está em 24 semanas (`dpp_final = current_date + 112`) — escolha os itens de
protocolo por `semana_fim < 24` e `semana_fim = 24` em vez de fixar nome de item.

**Validação:** `supabase db reset`, depois o smoke com exit 0 e **67 blocos `DO`**.

### 3 — Regerar os tipos

**Depende de:** Etapa 2
**Arquivos:** `~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` (regerar)

`supabase gen types typescript --local`. Confirme as quatro `relatorio_*` em `Functions`.

### 4 — Helper de CSV

**Depende de:** nenhuma
**Arquivos:** `src/app/core/formato/csv.ts`, `src/app/core/formato/csv.spec.ts` (criar)

Duas funções, a pura separada da que toca o DOM — é a pureza que deixa a primeira testável, como
em `data.ts` e `cpf.ts`:

- `export function paraCsv(cabecalhos: readonly string[], linhas: readonly (readonly string[])[]): string`
  — junta com `;` e `\r\n`, prefixa `﻿`, e envolve em aspas dobrando as internas sempre que o
  valor contiver `;`, `"`, `\n` ou `\r`.
- `export function baixarCsv(nomeArquivo: string, cabecalhos: readonly string[], linhas: readonly (readonly string[])[]): void`
  — `Blob` com `type: 'text/csv;charset=utf-8'`, âncora sintética com `download`, `click()`, e
  `URL.revokeObjectURL` em `finally`.

### 5 — `RelatoriosService`

**Depende de:** Etapa 3
**Arquivos:** `src/app/core/relatorios/relatorios.service.ts` (criar)

Siga `src/app/core/auditoria/auditoria.service.ts`: `Resultado<T>`, `mensagemDeErro` local
mapeando `P0001`, helper `opcional()` para os parâmetros anuláveis, e o `Omit` que corrige a
nulabilidade que o gerador erra em retorno de função — aqui `publicado_por_nome`, `local`,
`medicas`, `cpf` e `ig_semanas`.

Quatro métodos e quatro tipos exportados (`DocumentoPublicado`, `Falta`, `ChecklistVencido`,
`ConvitePendente`):

- `documentosPublicados(desde: string, ate: string, tipo: string | null)`
- `faltas(desde: string, ate: string, medicaId: string | null)`
- `checklistVencidos(incluirVencendo: boolean)`
- `convitesPendentes(incluirExpirados: boolean)`

### 6 — Tela `/relatorios`

**Depende de:** Etapas 4 e 5
**Arquivos:** `src/app/pages/relatorios/relatorios.ts`, `.html`, `.scss` (criar)

Modelo: `src/app/pages/auditoria/lista/auditoria-lista.ts` — signals `linhas`/`carregando`/`erro`,
formulário de filtros com botão **Filtrar**, `TETO = 500` e `truncado` computed.

Um array de definições no topo do arquivo, uma entrada por relatório, cada uma com `chave`,
`rotulo`, `papeis`, `periodo: boolean`, `rotuloAmpliar: string | null`, as `colunas` e o
`carregar`. O helper `definir<T>(...)` recebe a definição tipada em `T` e devolve a versão
apagada que a tela guarda — é o único ponto do arquivo onde aparece um cast.

Filtros, todos no mesmo `<form class="filtros sem-impressao">`: `relatorio` (`p-select`, opções
vindas de um computed que cruza as definições com `auth.papel()`), `desde` e `ate`
(`p-datepicker`, últimos 30 dias, `[disabled]` quando a definição não tem período), `tipo`
(`p-select` de `tipo_documento`, só em Documentos), `medicaId` (`p-select`, só em Faltas e só sob
`ehSecretaria()`, alimentado por `PacientesService.listarMedicas()`) e `ampliar`
(`p-checkbox` `[binary]="true"`, só quando `rotuloAmpliar` não for nulo).

Trocar de relatório zera `linhas`, ajusta os campos visíveis e recarrega.

A tabela é genérica: `@for (c of colunas(); track c.rotulo)` no `#header` e no `#body`, chamando
`c.valor(linha)` em cada célula. Ao lado do botão Atualizar, dois botões `sem-impressao`:
**Exportar CSV** — monta cabeçalhos e linhas a partir das mesmas `colunas()` e chama `baixarCsv`
com nome `<chave>-<data de hoje>.csv` — e **Imprimir**, que chama `window.print()`.

Datas e horas passam por `formatarData`/`formatarDataHora` de `src/app/core/formato/data.ts`;
CPF por `formatarCpf`. Booleano vira `'Sim'`/`'Não'`; nulo vira `'—'`.

### 7 — Rota, sidebar e folha de impressão

**Depende de:** Etapa 6
**Arquivos:** `src/app/app.routes.ts`, `src/app/layout/shell/shell.html`, `src/styles.scss` (editar)

Rota `relatorios` sob `papelGuard('secretaria', 'medica')`, irmã de `agenda`. Na sidebar, item
fora dos dois `@if` de papel, logo depois de "Agenda", com ícone `pi pi-chart-bar` — os dois
papéis o veem, como acontece com Agenda.

Em `src/styles.scss`, ao lado das outras utilitárias globais, um bloco `@media print` que esconde
`.barra`, `.topo` e `.sem-impressao`, zera margem e sombra de `.conteudo` e força fundo branco.

### 8 — Testes e roadmap

**Depende de:** Etapas 4, 5 e 6
**Arquivos:** `src/app/core/relatorios/relatorios.service.spec.ts`,
`src/app/pages/relatorios/relatorios.spec.ts` (criar), `docs/roadmap-web.md` (editar)

No roadmap, marque o item de relatórios como concluído citando `/relatorios`, os quatro relatórios,
a divisão por papel e a exportação CSV/impressão. Com ele, a **W6 fecha inteira**.

## Testes

| Caso                                                                            | Arquivo                      |
| ------------------------------------------------------------------------------- | ---------------------------- |
| `paraCsv` separa com `;`, abre com BOM e fecha linha com CRLF                   | `csv.spec.ts`                |
| Valor com `;`, com aspas e com quebra sai entre aspas, com as internas dobradas | `csv.spec.ts`                |
| Cada um dos quatro métodos monta os parâmetros certos, omitindo os nulos        | `relatorios.service.spec.ts` |
| `P0001` repassa a mensagem da RPC; código desconhecido vira genérica            | `relatorios.service.spec.ts` |
| Secretaria vê duas opções no seletor; médica vê quatro                          | `relatorios.spec.ts`         |
| Trocar de relatório troca as colunas da tabela e recarrega                      | `relatorios.spec.ts`         |
| Relatório de retrato desabilita os campos de período                            | `relatorios.spec.ts`         |
| Booleano vira Sim/Não e nulo vira travessão                                     | `relatorios.spec.ts`         |
| 500 linhas disparam o aviso de truncamento                                      | `relatorios.spec.ts`         |
| Erro do serviço aparece na tela                                                 | `relatorios.spec.ts`         |

Testes de tela seguem o padrão do repo: `provideZonelessChangeDetection()`, serviço trocado por
objeto com `vi.fn()`, `AuthService` com `papel` sendo um `signal` real, e `interface Interno` para
alcançar os membros `protected`. Sem `provideRouter` — a tela não usa `routerLink`.

Os cenários 1–62 do smoke e os 144 testes existentes do web continuam verdes sem edição.

## Validação final

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Código de saída 0, 67 blocos `DO`, terminando em `ROLLBACK`.

```bash
cd ~/Documents/VoidSans/prenatalweb && npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
```

Tudo verde, com um chunk `relatorios` no build.

Roteiro manual, como médica: abrir `/relatorios` → o seletor traz os quatro → **Documentos
publicados** nos últimos 30 dias lista o laudo publicado com o nome da paciente e quem publicou →
**Exportar CSV** baixa o arquivo e o Excel abre em colunas, com acento certo → **Checklists
vencidos** ignora os campos de data e lista item vencido; ligar "incluir os que vencem esta semana"
aumenta a lista → **Imprimir** abre a prévia sem sidebar, sem filtros e sem botões. Depois, como
secretaria: o seletor traz só Faltas e Convites pendentes, e Faltas mostra o filtro por médica.
