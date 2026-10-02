# ADR 0005 — Perfil de administração

## Status

Aceito — 2026-08-30, junto com a fase W10 (migrations `20260902120000_papel_admin.sql` e
`20260902120100_perfil_admin.sql` no `prenatalapp`, Edge Function `gerir-equipe` atualizada).

## Contexto

O enum `papel_usuario` tinha três valores (`paciente`, `medica`, `secretaria`) e a secretaria
acumulava dois trabalhos sem relação entre si: administrar a clínica no dia a dia (pacientes,
convites, vínculos, agenda) e administrar as **contas de acesso** — a tela `/equipe`, que fala com
a Edge Function `gerir-equipe` e tem a service role atrás dela. A mesma pessoa que agenda uma
consulta também cria e desativa conta de médica.

Além disso, a auditoria (`auditoria_da_clinica`) era exclusiva da médica, de propósito (ver
[ADR 0003](0003-escopo-de-leitura-da-equipe.md): o rastro `documento.lido` não deve chegar à
secretaria). Não existia ninguém na clínica que visse o rastro **e** administre as contas —
justamente o par que caracteriza um perfil administrativo.

## Decisão

O papel `admin` entra no enum e recebe um perfil próprio, definido pelo que administra e pelo que
lê — não pelo que clinicamente faz:

| Superfície              | Médica    | Secretaria (depois da W10) | Admin                       |
| ----------------------- | --------- | -------------------------- | --------------------------- |
| `/equipe` (contas)      | não       | **não**                    | **sim**                     |
| `/auditoria`            | sim       | não                        | **sim**                     |
| `/relatorios`           | os quatro | **nenhum**                 | faltas e convites pendentes |
| `/convites`             | não       | sim                        | **sim**                     |
| `/agenda`, `/pacientes` | agenda    | sim                        | **não**                     |
| `/mesa`, `/protocolo`   | sim       | não                        | não                         |

No banco:

- `is_admin()` espelha `is_secretaria()`; `promover_para_admin` espelha `promover_para_secretaria`
  (gate por service role e `delete from pacientes` para não sobrar paciente órfã), com runbook
  manual no README — o primeiro admin nasce por chamada de service role; os demais nascem em
  `/equipe`.
- As quatro RPCs de convite passam a aceitar `is_secretaria() or is_admin()`; `acoes_auditadas` e
  `auditoria_da_clinica` passam a aceitar `medica` e `admin`; `relatorio_faltas` e
  `relatorio_convites_pendentes` trocam `secretaria` por `admin` no gate — a secretaria perde os
  relatórios no gate, não só no menu (doutrina do projeto: esconder a opção na tela não é
  segurança).
- A Edge Function `gerir-equipe` passa a exigir `admin` como ator, cria contas dos três papéis e a
  trava de lockout muda de "última secretaria ativa" para "último admin ativo".
- A única policy nova é `profiles_select_admin` (leitura de `profiles`), necessária porque o filtro
  por médica do relatório de faltas lê `profiles` direto. Toda outra leitura do admin passa por
  `security definer`. Nenhuma policy de select em `pacientes`, `gestacoes`, `consultas`,
  `documentos` ou `audit_log`.

No web: `PapelEquipe` ganha o terceiro valor; `rotuloPapel` vira `Record<PapelEquipe, string>`
(quebra em compilação quando um quarto papel entrar); o menu do shell vira um array `MENU` com
`papeis` por item; a home do admin não chama agenda nem mesa (o gate da RPC o rejeitaria);
`/equipe` oferece os três papéis na criação e na troca.

## Alternativas consideradas

- **Alargar `is_secretaria()` para incluir o admin**: descartada porque daria ao admin, de graça,
  toda a escrita clínica da secretaria — `criar_paciente_pela_secretaria`, os três RPCs de vínculo,
  `criar_gestacao_pela_secretaria`, `atualizar_dum_pela_secretaria`. O admin administra contas, não
  cadastro clínico; cada RPC continua dizendo explicitamente quem entra.
- **Dar os dois relatórios clínicos ao admin**: descartada porque `relatorio_documentos_publicados`
  e `relatorio_checklist_vencidos` filtram por vínculo desde a W7, e o admin não tem vínculo com
  paciente nenhuma — abrir para ele exigiria remover o filtro e vazaria título de laudo da clínica
  inteira. Os dois relatórios operacionais (faltas, convites pendentes) não têm dado clínico e por
  isso mudam de dono.
- **Helper único "equipe administrativa"**: descartado porque esconde quem entra em cada RPC;
  condições `is_secretaria() or is_admin()` mantêm a lista de papéis explícita em cada gate.
- **Migrar contas existentes para admin**: descartada — nenhuma conta vira admin sozinha; a
  promoção é sempre um ato explícito (service role ou `/equipe`).

## Consequências

**Positivas**

- Administração de contas e leitura do rastro ficam num perfil só, e a secretaria volta ao seu
  escopo original (dia a dia da clínica).
- O typecheck vira trava de papel: `Record<PapelEquipe, string>` e o `papeis` de cada relatório
  quebram a compilação se um papel ficar de fora de algum lugar.
- Cenários **84–92** do `supabase/tests/rls_smoke.sql` fixam a nova fronteira (inclusive o que o
  admin **não** alcança: agenda, relatório clínico e escrita da secretaria).

**Negativas / trade-offs**

- Entre publicar a Edge Function nova e promover o primeiro admin, ninguém administra contas
  (lockout): em produção o primeiro admin precisa ser promovido **antes** do deploy.
- `promover_para_admin` apaga a paciente do uuid promovido (mesmo comportamento das outras
  promoções); o runbook manda conferir o perfil do uuid antes de chamar.
- O valor `admin` não sai mais do enum (`alter type ... drop value` não existe); rollback prático
  é reverter gates e republicar a Edge Function anterior, depois de rebaixar os admins existentes.
