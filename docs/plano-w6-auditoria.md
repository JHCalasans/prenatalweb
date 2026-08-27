# Plano: W6 (fatia 1) — Viewer da auditoria

> Ao aprovar, salve como `docs/plano-w6-auditoria.md` no repo `prenatalweb`.
>
> Primeira de duas fatias da W6. A fatia 2, fora deste plano: relatórios operacionais
> (documentos publicados, faltas, checklists vencidos, convites pendentes) com exportação.

## Objetivo

Ao final, a médica acessa `/auditoria` e vê o histórico de ações da clínica num período que ela
escolhe: quem fez, o quê, sobre qual paciente ou item, e quando. Filtra por ação e por entidade no
servidor, e por texto (nome de quem agiu ou do alvo) na tela. É o rastro que responde "quem
publicou e quem leu qual laudo" — hoje o `audit_log` já registra tudo isso, mas ninguém consegue
ler o que os outros fizeram.

## Escopo

**Dentro:**

- Migration com índice de leitura por data e duas RPCs: `auditoria_da_clinica` e `acoes_auditadas`.
- Cenários 60–62 em `supabase/tests/rls_smoke.sql`.
- Regeneração de `src/types/database.types.ts`.
- `AuditoriaService` e a tela `/auditoria` sob `papelGuard('medica')`, com item na sidebar.
- Testes do serviço e da tela.
- Marcar o item do viewer em `docs/roadmap-web.md` (o de relatórios continua aberto).

**Fora:**

- Relatórios operacionais e exportação CSV/impressão — é a fatia 2.
- Não criar policy nova em `public.audit_log`: leitura ampla passa só pela RPC `security definer`.
  `audit_select_proprio` continua valendo para acesso direto à tabela.
- Não dar acesso à secretaria. Decisão do usuário: o rastro de leitura de laudo fica com a médica.
- Não acrescentar ação nova ao `audit_log` nem mexer em RPC existente que escreve nele.
- Não paginar com `onLazyLoad`: teto fixo, como `pacientes_da_secretaria` e `convites_da_secretaria`.
- Não expor `meta` cru na tabela principal.
- Não adicionar dependência npm.

## Decisões técnicas

| Decisão                           | Escolha                                                                                                                                      | Motivo                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Quem lê                           | Gate `current_papel() = 'medica'` dentro da RPC                                                                                              | Escolha do usuário; a médica é a responsável clínica pelos dados. Mantém o log fora do alcance da secretaria                            |
| Como lê                           | RPC `security definer`, sem policy nova                                                                                                      | Mesmo padrão de `convites`: a tabela segue fechada e a exceção fica documentada num só lugar                                            |
| Período                           | Obrigatório, com `p_desde` e `p_ate`; a tela abre nos últimos 7 dias                                                                         | `audit_log` cresce sem limite e a tabela não tem índice por data hoje; varrer tudo por engano seria o caminho fácil                     |
| Índice                            | `audit_log_em_idx on public.audit_log (em desc)`                                                                                             | O único índice hoje é `(entidade, entidade_id)`, inútil para a consulta principal, que é por janela de tempo                            |
| Teto                              | `limit 500`, e a tela avisa quando bate o teto                                                                                               | Consistente com o `limit 200` das outras listagens; evita a primeira paginação server-side do projeto                                   |
| Rótulo do alvo                    | Coluna `alvo` resolvida no SQL, com `case` por `entidade`                                                                                    | `entidade_id` sozinho é um uuid ilegível. Resolver no cliente exigiria N consultas ou expor tabelas que a médica não lê                 |
| `convites` e `gestacao_checklist` | `entidade_id` é `paciente_id` e `gestacao_id`, não o id da própria linha (exceção: `convite.ativado`, da Edge Function, usa o id do convite) | É como as RPCs existentes gravam; o `case` do `alvo` tem que respeitar isso ou casa com o registro errado                               |
| Ator nulo                         | `ator_nome` volta `'Sistema'`                                                                                                                | `convite.ativado` é gravado pela Edge Function com service role, sem `auth.uid()`, e `ator_id` é `on delete set null`                   |
| Lista de ações do filtro          | RPC `acoes_auditadas()` com `select distinct acao`                                                                                           | São 29 ações espalhadas por migrations e pela Edge Function `gerir-equipe`; repetir a lista em TypeScript vira desatualização garantida |
| Filtro por pessoa                 | No cliente, sobre as linhas carregadas, usando `normalizarBusca` de `src/app/core/formato/texto.ts`                                          | A médica não enxerga `profiles` das colegas por policy; os nomes já vêm resolvidos na resposta da RPC                                   |
| `meta`                            | Fora da tabela; aparece só num diálogo de detalhe da linha                                                                                   | É `jsonb` de forma variável por ação; numa coluna viraria ruído ilegível                                                                |
| Rota                              | `/auditoria`, `papelGuard('medica')`                                                                                                         | Mesmo tratamento de `/protocolo` e `/mesa`                                                                                              |

## Etapas

### 1 — Índice e RPCs de auditoria

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260828120000_auditoria_da_clinica.sql` (criar)

Crie o índice `audit_log_em_idx on public.audit_log (em desc)`.

`public.acoes_auditadas()` — `returns table (acao text)`, `stable`, `security definer`,
`set search_path = public`. Gate `current_papel() = 'medica'` com a mensagem
`'Apenas médicas consultam a auditoria'`. Corpo: `select distinct acao from public.audit_log
order by 1`.

`public.auditoria_da_clinica(p_desde timestamptz, p_ate timestamptz, p_acao text default null,
p_entidade text default null)` — `returns table (registro_id bigint, em timestamptz, ator_id uuid,
ator_nome text, acao text, entidade text, entidade_id uuid, alvo text, meta jsonb)`, `stable`,
`security definer`, `set search_path = public`, mesmo gate e mesma mensagem.

Filtra `a.em >= p_desde and a.em < p_ate`, mais `p_acao` e `p_entidade` quando não nulos.
Ordena `a.em desc, a.id desc`, `limit 500`.

`ator_nome` sai de um `left join public.profiles` por `ator_id`, com
`coalesce(pr.nome, 'Sistema')`.

`alvo` é um `case a.entidade` resolvido por `left join lateral`, um por entidade:

| `entidade`           | O que `entidade_id` guarda                                                                              | `alvo`                            |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `pacientes`          | id da paciente                                                                                          | nome da paciente                  |
| `convites`           | **id da paciente** nas ações gravadas pelas RPCs; **id do próprio convite** no `convite.ativado` (Edge) | nome da paciente, nos dois casos  |
| `vinculos`           | id do vínculo                                                                                           | nome da paciente do vínculo       |
| `gestacoes`          | id da gestação                                                                                          | nome da paciente                  |
| `gestacao_checklist` | **id da gestação**                                                                                      | nome da paciente                  |
| `consultas`          | id da consulta                                                                                          | nome da paciente, via `gestacoes` |
| `documentos`         | id do documento                                                                                         | `titulo` do documento             |
| `protocolo_itens`    | id do item                                                                                              | `nome` do item                    |
| `profiles`           | id da conta de equipe                                                                                   | `nome` do profile                 |

Onde não resolver, devolva `null` — a tela mostra travessão. Para `convites`, o `case` tenta
paciente por `entidade_id` e cai para convite → paciente: cobre os dois caminhos sem casar com o
registro errado.

**Validação:** `supabase db reset` conclui e `\df public.auditoria_da_clinica` mostra a função.

### 2 — Cenários 60–62 no smoke

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

Insira antes do `rollback;` final (hoje linha 3033). Os 59 cenários existentes já encheram o
`audit_log` de registros reais de quase todas as ações — use isso em vez de fabricar linhas.

**60** — gate: secretaria e gestante recebem `'Apenas médicas consultam a auditoria'` nas duas
RPCs; a médica recebe linhas.

**61** — resolução do `alvo`: buscando `acao = 'paciente.criado'` o `alvo` traz o nome da
paciente; `'documento.publicado'` traz o título do documento; `'protocolo.item_criado'` traz o
nome do item. Confirme também que `convite.emitido` resolve para nome de paciente — é o caso em
que `entidade_id` não é o id da própria entidade.

**62** — filtros e janela: um `p_desde`/`p_ate` no futuro devolve zero linhas; filtrar por
`p_entidade = 'documentos'` só traz linhas dessa entidade; `acoes_auditadas()` devolve mais de
uma ação e todas aparecem em `audit_log`.

Atenção ao rodar como médica: use `medica_a` ou `medica_b` conforme o vínculo vigente naquele
ponto do arquivo — o cenário 40 transferiu o vínculo de `paciente_row` para `medica_b`. Aqui o
gate é só de papel, não de vínculo, então qualquer uma das duas serve.

**Validação:** `supabase db reset` seguido do smoke sai com código 0 e 63 blocos `DO`.

### 3 — Regerar os tipos

**Depende de:** Etapa 2
**Arquivos:** `~/Documents/VoidSans/prenatalweb/src/types/database.types.ts` (regerar)

`supabase gen types typescript --local`. Confirme que `auditoria_da_clinica` e `acoes_auditadas`
aparecem em `Functions`.

### 4 — `AuditoriaService`

**Depende de:** Etapa 3
**Arquivos:** `src/app/core/auditoria/auditoria.service.ts` (criar)

Siga `src/app/core/mesa/mesa.service.ts`: `Resultado<T>`, `mensagemDeErro` local mapeando
`P0001`, e o `Omit` que corrige a nulabilidade que o gerador erra em retorno de função — aqui
`ator_id`, `entidade_id`, `alvo` e `ator_nome` podem vir nulos.

- `listar(desde: string, ate: string, acao: string | null, entidade: string | null):
Promise<Resultado<RegistroAuditoria[]>>`
- `acoes(): Promise<Resultado<string[]>>` — desembrulha a coluna `acao` das linhas.

Reaproveite o helper `opcional()` do padrão dos outros serviços para `p_acao` e `p_entidade`.

### 5 — Tela `/auditoria`

**Depende de:** Etapa 4
**Arquivos:** `src/app/pages/auditoria/lista/auditoria-lista.ts`, `auditoria-lista.html`,
`auditoria-lista.scss` (criar)

Modelo: `src/app/pages/mesa/lista/mesa-lista.ts` — signals `todas`/`carregando`/`erro`, formulário
de filtros e um `computed` que aplica a busca de texto sobre as linhas carregadas.

Filtros: `desde` e `ate` (`p-datepicker`, default últimos 7 dias, usando `paraDataIso` de
`src/app/core/formato/data.ts`), `acao` (`p-select` alimentado por `acoes()`, com opção "Todas"),
`entidade` (`p-select` com as nove entidades e rótulos em português) e `busca` (texto livre,
filtrando `ator_nome` e `alvo` com `normalizarBusca`).

Tabela: Quando (`formatarDataHora`), Quem (`ator_nome`), Ação (rótulo em português a partir de um
mapa local — as 29 chaves seguem o formato `entidade.verbo`), Alvo, e um botão **Detalhe** por
linha que abre `p-dialog` com o `meta` formatado via `JSON.stringify(meta, null, 2)` dentro de
`<pre>`.

Quando vierem exatamente 500 linhas, mostre um `p-message` de aviso dizendo que o período foi
truncado e que vale estreitar o intervalo.

### 6 — Rota e sidebar

**Depende de:** Etapa 5
**Arquivos:** `src/app/app.routes.ts` (editar), `src/app/layout/shell/shell.html` (editar)

Rota `auditoria` sob `papelGuard('medica')`, irmã de `protocolo` e `mesa`. Item na sidebar dentro
do `@if (papel() === 'medica')`, depois de "Protocolo", com ícone `pi pi-history`.

### 7 — Testes e roadmap

**Depende de:** Etapas 4 e 6
**Arquivos:** `src/app/core/auditoria/auditoria.service.spec.ts`,
`src/app/pages/auditoria/lista/auditoria-lista.spec.ts` (criar), `docs/roadmap-web.md` (editar)

No roadmap, marque o item do viewer como concluído citando `/auditoria` e a restrição a `medica`;
deixe o item de relatórios aberto.

## Testes

| Caso                                                                 | Arquivo                     |
| -------------------------------------------------------------------- | --------------------------- |
| `listar` monta os quatro parâmetros e omite ação/entidade nulas      | `auditoria.service.spec.ts` |
| `acoes` desembrulha a coluna em `string[]`                           | `auditoria.service.spec.ts` |
| `P0001` repassa a mensagem da RPC; código desconhecido vira genérica | `auditoria.service.spec.ts` |
| Renderiza quem, ação em português e alvo                             | `auditoria-lista.spec.ts`   |
| Busca por texto filtra por `ator_nome` e por `alvo`, sem acento      | `auditoria-lista.spec.ts`   |
| Ator nulo aparece como "Sistema"                                     | `auditoria-lista.spec.ts`   |
| 500 linhas dispara o aviso de truncamento                            | `auditoria-lista.spec.ts`   |
| Diálogo de detalhe mostra o `meta`                                   | `auditoria-lista.spec.ts`   |
| Erro do serviço aparece na tela                                      | `auditoria-lista.spec.ts`   |

Os cenários 1–59 do smoke e os testes existentes do web continuam verdes sem edição.

## Validação final

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Código de saída 0, 63 blocos `DO`, terminando em `ROLLBACK`.

```bash
cd ~/Documents/VoidSans/prenatalweb && npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
```

Tudo verde, com um chunk `auditoria-lista` no build.

Roteiro manual como médica: abrir `/auditoria` → o período padrão já traz as ações da semana →
filtrar por entidade "Documentos" → publicar um laudo em outra aba e recarregar: a linha
`documento.publicado` aparece no topo com o título do documento em Alvo → abrir o **Detalhe** e
conferir o `meta` com `achado_alterado` → entrar como secretaria e abrir `/auditoria` na URL: cai
em `/sem-acesso`.
