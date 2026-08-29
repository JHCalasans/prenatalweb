# Plano: W7 — Hardening

## Contexto

As W2–W6 entregaram funcionalidade em cima de um modelo de segurança que foi crescendo por
fatias. Uma auditoria do estado consolidado — 26 migrations, 35 funções `security definer`,
11 tabelas com RLS — mostrou que o fundo está bem feito (`search_path` em 35/35, vínculo exigido
em **toda** escrita clínica, anti-enumeração, `codigo_hash` fora do grant, rate limit por IP na
ativação de convite), mas encontrou cinco furos reais e um bloqueio de operação.

Os furos têm uma origem comum: em três tabelas o `grant` a `authenticated` ficou mais largo que
a RPC que deveria ser o único caminho de escrita. O resultado é que as guardas escritas com
cuidado dentro das RPCs — "o arquivo ainda não terminou de subir", "só rascunho não publicado
pode ser excluído", e a auditoria que cada uma grava — podem ser puladas com um `PATCH` direto no
PostgREST. O padrão certo já existe no repo e foi aplicado duas vezes (`gestacao_checklist` na
fase 4, `consultas` na fase 5); faltou aplicá-lo em `documentos`, `gestacoes` e `pacientes`.

Além disso, `log_documento_acesso` é a única função `security definer` do projeto **sem gate
nenhum** — e como o projeto não usa `revoke execute` (por causa do segfault documentado no
PG17/ARM64), o gate interno é a única defesa que existe. Hoje qualquer um, inclusive sem sessão,
planta linhas no `audit_log` — justamente a tabela que a W6 acabou de expor como trilha
probatória.

Cada achado abaixo foi conferido lendo o SQL, não inferido.

## Objetivo

Ao final, toda escrita clínica passa obrigatoriamente pelas RPCs — o `PATCH` direto deixa de ser
uma porta lateral —, `log_documento_acesso` só aceita quem pode ler o documento, os dois
relatórios clínicos passam a respeitar vínculo, as Edge Functions respondem ao preflight do
navegador, e uma sessão que expira no meio do uso diz isso à médica em vez de "Tente novamente".
O smoke prova cada bypass fechado.

## Escopo

**Dentro:**

- Migration de hardening: gate em `log_documento_acesso`, revogação dos grants amplos em
  `documentos`, `gestacoes` e `pacientes`, e filtro de vínculo nos dois relatórios clínicos.
- Cenários 67–70 em `supabase/tests/rls_smoke.sql`.
- CORS nas duas Edge Functions.
- Módulo único de erro do Supabase no web, com sessão expirada tratada.
- `npm test` no CI.
- ADR registrando por que a auditoria é da clínica e os relatórios não.
- Marcar o item de RLS da W7 no `docs/roadmap-web.md`, deixando o piloto aberto.

**Fora:**

- Runbook de produção, staging, CSP e ajuste de auth no dashboard — dependem do projeto
  hospedado, que não existe. Ficam registrados como pendência da W7 no roadmap.
- Telemetria/Sentry: acrescenta dependência e serviço externo; decidir junto com o piloto.
- Endurecer `handle_new_user` contra `raw_user_meta_data.paciente_id` forjado. Está contido por
  `enable_signup = false` e por a Edge Function ser o único caller, e a correção óbvia
  (`and profile_id is null`) **quebraria** a troca de celular, que reemite convite para uma
  paciente que já tem `profile_id`. Precisa de desenho próprio — anotar no roadmap.
- Não mexer em `agenda_da_clinica` nem em `relatorio_faltas`: a secretaria ver consulta da
  clínica é o desenho da W5/W6, não um furo.
- Não tocar em `auditoria_da_clinica`. Decisão do usuário: continua da clínica inteira.
- Não adicionar `revoke execute` em função nenhuma — ver o comentário do `init_schema` sobre o
  segfault no PG17/ARM64.

## Decisões técnicas

| Decisão                        | Escolha                                                                                                                       | Motivo                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate de `log_documento_acesso` | Exigir que o chamador possa ler o documento: médica vinculada à gestação, **ou** paciente dona com `publicado_em is not null` | É exatamente a condição da policy `storage_documentos_read`. Uma definição só de "quem pode ver este laudo"                                                                                                                                                                      |
| Erro do gate                   | `raise exception 'Sem acesso a este documento'`                                                                               | Mesma frase-única de `checklist_da_gestacao`: não distingue "não existe" de "sem acesso", para não virar enumerador                                                                                                                                                              |
| `documentos`                   | `revoke insert, update, delete` e **dropar** `documentos_write_medica`                                                        | Nenhum dos dois clientes escreve direto (conferido: web só `.select()`, Flutter não referencia a tabela). Fecha o bypass de `publicar_documento` e `excluir_documento_rascunho` — e a publicação por `PATCH` que não gravava auditoria                                           |
| `gestacoes`                    | `revoke update, delete`, **manter `insert`**, e trocar `gestacoes_write_medica` (`for all`) por uma policy só de `insert`     | `gestacao_repository.dart:220` insere direto — revogar `insert` quebraria o mobile. Mesmo movimento que a fase 5 fez em `consultas` (`consultas_write_medica` → `consultas_insert_medica`)                                                                                       |
| `pacientes`                    | `revoke update, delete`; `grant update (nome, data_nascimento, cpf, contato_emergencia)`                                      | Cópia do remédio já aplicado em `profiles` na `20260820120300`. Tira `profile_id` da mão da médica: hoje ela pode apontar o prontuário da paciente dela para outra conta. O `delete` não tem nenhum caller nos dois clientes e derruba gestação, documento e consulta em cascata |
| Relatórios clínicos            | `relatorio_documentos_publicados` e `relatorio_checklist_vencidos` passam a exigir `public.medica_vinculada_a_gestacao(g.id)` | Decisão do usuário. Alinha com `documentos_select_medica`, que já exige vínculo — hoje o relatório contorna a própria policy da tabela                                                                                                                                           |
| Como filtrar                   | Pelo helper `medica_vinculada_a_gestacao`, não por `join vinculos`                                                            | É o vocabulário do projeto e evita a duplicação de linha que o join traria quando a médica tem dois vínculos (obstetra + medicina fetal) com a mesma paciente                                                                                                                    |
| Auditoria                      | Sem mudança                                                                                                                   | Decisão do usuário: o rastro de "quem leu qual laudo" perde o sentido recortado por vínculo. Fica registrado em ADR e fixado por cenário de smoke                                                                                                                                |
| Assinatura das RPCs            | `create or replace` sem `drop`                                                                                                | Só o corpo muda; o `returns table` continua igual. `drop` só é necessário quando a forma muda                                                                                                                                                                                    |
| CORS                           | `Access-Control-Allow-Origin: *` num `_shared/cors.ts`, com `OPTIONS` respondido antes de tudo                                | CORS não é a fronteira de autorização aqui: `gerir-equipe` exige JWT válido e reconfere o papel no banco, e o JWT mora no `localStorage`, não em cookie — não há CSRF a impedir. Fixar a origem quando a URL de produção existir                                                 |
| Erro no web                    | Um `ErroSupabase` injetável em `src/app/core/erro/`, substituindo as 10 cópias de `mensagemDeErro`                            | O mesmo `ERRO_GENERICO` está copiado em 10 serviços; centralizar é o que permite tratar `PGRST301` uma vez só                                                                                                                                                                    |
| Sessão expirada                | `PGRST301` devolve "Sua sessão expirou…" **e** dispara `AuthService.encerrarPorExpiracao()`                                   | O caminho atual só reage quando o supabase-js emite `SIGNED_OUT`; com laptop suspenso ou refresh rotacionado em outra aba, a RPC volta 401 e a médica vê "Tente novamente" para sempre                                                                                           |
| `42501`                        | Mensagem própria: "Você não tem acesso a este dado."                                                                          | Depois desta migration, violação de RLS vira um retorno esperado; dizer isso ajuda a diagnosticar em vez de esconder                                                                                                                                                             |
| Asserção de grant no smoke     | `exception when insufficient_privilege`, nunca comparando texto                                                               | `permission denied for table` vem do Postgres e é localizável; o SQLSTATE 42501 não muda                                                                                                                                                                                         |

## Etapas

### 1 — Migration de hardening

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260830120000_hardening_w7.sql` (criar)

Quatro blocos, nesta ordem.

**Gate em `log_documento_acesso(p_documento_id uuid)`** — `create or replace`, mantendo a
assinatura e o corpo do insert. Antes do insert, recusar quem não puder ler o documento, com a
condição descrita nas Decisões e a mensagem `'Sem acesso a este documento'`.

**Fechar `documentos`:** `drop policy documentos_write_medica on public.documentos;` e
`revoke insert, update, delete on public.documentos from anon, authenticated;`.
A policy `documentos_select_paciente` e `documentos_select_medica` continuam.

**Fechar `gestacoes`:** `revoke update, delete on public.gestacoes from anon, authenticated;`,
`drop policy gestacoes_write_medica on public.gestacoes;` e criar
`gestacoes_insert_medica for insert to authenticated with check (public.current_papel() = 'medica'
and public.medica_vinculada_ao_paciente(paciente_id))` — o mesmo `with check` que a policy antiga
já usava, agora sem carregar junto o update e o delete.

**Fechar `pacientes`:** `revoke update, delete on public.pacientes from anon, authenticated;` e
`grant update (nome, data_nascimento, cpf, contato_emergencia) on public.pacientes to
authenticated;`. Dropar `pacientes_delete_medica` (fica sem grant que a sustente) e **manter**
`pacientes_update_medica`, que segue valendo para as quatro colunas concedidas.

**Vínculo nos dois relatórios:** `create or replace` em
`public.relatorio_documentos_publicados` e `public.relatorio_checklist_vencidos`, acrescentando
`and public.medica_vinculada_a_gestacao(g.id)` ao `where`. No de checklist, o filtro entra na
subconsulta interna do `distinct on`, junto de `g.status = 'ativa'` — se entrar só no `where`
externo, o `distinct on` já terá escolhido a versão do item antes de descartar a gestação, o que
funciona mas varre a clínica inteira à toa.

**Validação:** `supabase db reset` conclui e `\dp public.documentos` mostra `authenticated` só
com `r` (select).

### 2 — Cenários 67–70 no smoke

**Depende de:** Etapa 1
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/tests/rls_smoke.sql` (editar)

Inserir antes do `rollback;` final, na forma dos cenários 63–66. Crie fixture próprio onde
precisar de estado limpo — os cenários anteriores já mexeram no `paciente_row` e nas gestações
da agenda.

**67 — gate de `log_documento_acesso`.** A médica vinculada registra a leitura e grava uma linha
em `audit_log`. Recusam com `'Sem acesso a este documento'`: médica sem vínculo, secretaria, e a
gestante sobre documento de **outra** paciente. A gestante dona **passa** no documento publicado
e é recusada no rascunho — é a mesma assimetria de `documentos_select_paciente`. Por último,
sem sessão (`pg_temp.back_to_postgres()` não serve aqui; use um `as_user` com uuid que não existe
em `profiles`) também é recusado.

**68 — `documentos` fechada para escrita direta.** Como médica vinculada: `update
public.documentos set publicado_em = now()` e `delete from public.documentos` levantam
`insufficient_privilege`. Em seguida, prove que o caminho legítimo continua: `criar_documento_rascunho`
→ `confirmar_upload_documento` → `publicar_documento` funciona e grava `documento.publicado` no
`audit_log`, e `publicar_documento` sem `confirmar_upload_documento` ainda recusa com
`'O arquivo ainda não terminou de subir'`.

**69 — `gestacoes` e `pacientes`.** `insert into public.gestacoes` como médica vinculada
**continua funcionando** (é o caminho do mobile); `update` e `delete` diretos levantam
`insufficient_privilege`. Em `pacientes`: `update … set nome` funciona,
`update … set profile_id` levanta `insufficient_privilege`, e `delete from public.pacientes`
também. `atualizar_paciente_pela_secretaria` continua funcionando.

**70 — vínculo nos relatórios, auditoria intacta.** Com uma paciente vinculada só à `medica_a`:
`medica_b` recebe zero linhas dessa paciente em `relatorio_documentos_publicados` e em
`relatorio_checklist_vencidos`, enquanto `medica_a` recebe as dela. E `medica_b` **continua**
enxergando a paciente em `auditoria_da_clinica` — é este cenário que fixa a decisão do usuário e
impede que alguém "uniformize" isso depois sem perceber.

**Validação:** `supabase db reset`, depois o smoke com exit 0 e **72 blocos `DO`**.

> Acrescentado durante a execução, fora do plano original: o cenário **71** e o bloco 6 da
> migration. A verificação dos grants revelou que `truncate`, `trigger` e `references` seguiam
> concedidos a `anon`/`authenticated` em todas as tabelas — sobra do `grant all` do setup padrão
> do Supabase que os revokes das fases anteriores não alcançaram. `truncate` não passa por RLS.

### 3 — CORS nas Edge Functions

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/functions/_shared/cors.ts` (criar),
`gerir-equipe/index.ts` e `ativar-convite/index.ts` (editar)

Exporte de `_shared/cors.ts` um `CORS` com `Access-Control-Allow-Origin: *`,
`Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type` e
`Access-Control-Allow-Methods: POST, OPTIONS`.

Nas duas funções: responder `OPTIONS` com 204 e o `CORS` **antes** da checagem de método — hoje
`gerir-equipe` devolve 405 ao preflight, o que derruba a tela `/equipe` inteira no navegador.
Espalhar o `CORS` em todas as respostas, inclusive as de erro: sem ele o navegador esconde o
corpo e `equipe.service.ts` cai no genérico, deixando a secretária sem pista nenhuma.

**Validação:** com `supabase functions serve`, um `curl -X OPTIONS` devolve 204 com o cabeçalho.

### 4 — Módulo de erro e sessão expirada no web

**Depende de:** nenhuma
**Arquivos:** `src/app/core/erro/supabase-erro.ts` e `supabase-erro.spec.ts` (criar),
`src/app/core/auth/auth.service.ts` (editar), os 10 serviços de `src/app/core/*/` (editar)

Em `supabase-erro.ts`: exporte `ERRO_GENERICO` (mesmo texto de hoje), `SESSAO_EXPIRADA`
(`'Sua sessão expirou. Entre novamente para continuar.'`) e `SEM_ACESSO`
(`'Você não tem acesso a este dado.'`), mais um `@Injectable({providedIn:'root'}) ErroSupabase`
com `mensagem(erro: PostgrestError): string` mapeando `PGRST301` → `SESSAO_EXPIRADA` (chamando
também `AuthService.encerrarPorExpiracao()`), `42501` → `SEM_ACESSO`, `P0001` → `erro.message`,
e o resto → `ERRO_GENERICO`.

Em `AuthService`: `async encerrarPorExpiracao(): Promise<void>` que faz `signOut()` **sem** ligar
`saidaIntencional` — é justamente esse flag que faz o listener existente navegar para
`/login?expirada=1`.

Nos 10 serviços (`agenda`, `auditoria`, `cartao`, `convites`, `equipe`, `mesa`, `pacientes`,
`protocolo`, `relatorios`, `vinculos`): apagar a `mensagemDeErro` local e o `ERRO_GENERICO`
duplicado, injetar `ErroSupabase` e chamar `this.erros.mensagem(error)`. Onde o serviço trata
código próprio antes do genérico — `pacientes` faz isso com `23505` e `23514` — manter esse
tratamento e delegar só o resto.

Atenção: `cartao.service.ts` exporta `ERRO_GENERICO` e é usado por `cartao-documentos.ts`; troque
o import para o módulo novo em vez de deixar dois nomes iguais vivos.

### 5 — Testes no CI

**Depende de:** Etapa 4
**Arquivos:** `.github/workflows/ci.yml` (editar)

Acrescentar um passo `npm test` entre o typecheck e o build. Os ~30 arquivos de spec já existem e
passam localmente, mas o CI nunca os rodou. Confirme que o passo falha o workflow quando um teste
quebra — o runner do Angular precisa sair em modo single-run, não em watch.

### 6 — ADR, roadmap e fechamento

**Depende de:** Etapas 1 e 2
**Arquivos:** `docs/adr/0003-escopo-de-leitura-da-equipe.md` (criar),
`docs/roadmap-web.md` (editar)

O ADR registra a fronteira que esta fatia desenhou: escrita clínica sempre por RPC e sempre com
vínculo; leitura clínica por vínculo; **auditoria** da clínica inteira, de propósito, porque o
rastro de quem leu qual laudo não funciona recortado; e a secretaria com a agenda da clínica mas
sem laudo, checklist ou gestação. Cite os cenários de smoke que fixam cada uma.

No roadmap, marque o item de revisão de RLS da W7 como concluído citando os grants fechados e os
cenários 67–70. **Deixe o item do piloto aberto** e acrescente, abaixo dele, o que ficou pendente
por não haver projeto hospedado: runbook de produção (criar a primeira conta, publicar migrations
e functions, recuperar acesso da secretária — hoje sem SMTP e sem signup isso é lockout da
clínica), staging separado de `main`, telemetria, `handle_new_user`, e os ajustes de auth
(`minimum_password_length = 6`, sem `inactivity_timeout`, `site_url` em localhost).

## Testes

| Caso                                                                                         | Arquivo                     |
| -------------------------------------------------------------------------------------------- | --------------------------- |
| `log_documento_acesso` aceita médica vinculada e gestante dona de documento publicado        | `rls_smoke.sql` cenário 67  |
| `log_documento_acesso` recusa médica sem vínculo, secretaria, gestante de outra e sem sessão | `rls_smoke.sql` cenário 67  |
| `update`/`delete` direto em `documentos` levanta `insufficient_privilege`                    | `rls_smoke.sql` cenário 68  |
| Rascunho → upload → publicar continua funcionando e auditando                                | `rls_smoke.sql` cenário 68  |
| `insert` em `gestacoes` continua; `update`/`delete` não                                      | `rls_smoke.sql` cenário 69  |
| `pacientes.nome` gravável, `profile_id` não, `delete` não                                    | `rls_smoke.sql` cenário 69  |
| Médica sem vínculo não vê a paciente nos dois relatórios clínicos                            | `rls_smoke.sql` cenário 70  |
| Médica sem vínculo **continua** vendo a paciente na auditoria                                | `rls_smoke.sql` cenário 70  |
| `PGRST301` vira mensagem de sessão expirada e chama `encerrarPorExpiracao`                   | `supabase-erro.spec.ts`     |
| `42501` vira mensagem de sem acesso; `P0001` repassa; resto vira genérica                    | `supabase-erro.spec.ts`     |
| Códigos próprios de `pacientes` (`23505`, `23514`) continuam tratados                        | `pacientes.service.spec.ts` |

Os cenários 1–66 e os 161 testes do web continuam verdes. Os specs dos 10 serviços vão precisar
passar `ErroSupabase` no `TestBed` — mudança mecânica, mas conte com ela.

## Validação final

```bash
cd ~/Documents/VoidSans/prenatalapp && supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql
```

Código de saída 0, 72 blocos `DO`, terminando em `ROLLBACK`.

```bash
cd ~/Documents/VoidSans/prenatalweb && npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
```

Tudo verde.

```bash
cd ~/Documents/VoidSans/prenatalapp && flutter analyze
```

Sem novos avisos — a migration mantém o `insert` em `gestacoes` de que o mobile depende.

Roteiro manual, como médica no web: abrir o cartão de uma gestante e um laudo publicado — a
leitura continua sendo registrada e aparece em `/auditoria`. Abrir `/relatorios` →
**Checklists vencidos** traz só as pacientes com vínculo. Em `/auditoria`, uma ação sobre paciente
de outra médica **continua** aparecendo. Por fim, apagar o token no `localStorage` e clicar
Filtrar: a tela precisa dizer que a sessão expirou e cair no login, não repetir "Tente novamente".
