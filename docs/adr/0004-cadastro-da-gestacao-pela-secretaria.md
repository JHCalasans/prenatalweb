# ADR 0004 — Cadastro da gestação pela secretaria

## Status

Aceito — 2026-08-30, junto com a fase W9 (migration
`20260901120000_gestacao_pela_secretaria.sql` no `prenatalapp`).

## Contexto

A consulta é filha da gestação: `agendar_consulta` resolve a gestação ativa da paciente e levanta
`'Paciente não tem gestação ativa'` quando não há. Só a médica vinculada criava gestação — as RPCs
clínicas têm gate de papel + vínculo, a tabela `gestacoes` não tem policy de select para a
secretaria e o único formulário vivia em `/mesa` (papel `medica`).

O efeito prático era um beco sem saída operacional: a secretária cadastra a paciente em
`/pacientes/nova`, a paciente aparece na lista de agendáveis e o agendamento falha — sem meio de
resolver e sem enxergar a causa antes de submeter. A secretária tem a DUM na ficha que a própria
paciente preenche na recepção; a médica, não.

## Decisão

A fronteira do [ADR 0003](0003-escopo-de-leitura-da-equipe.md) é revista **num ponto e só nele**:
a secretaria passa a **escrever a DUM** e a **ler uma projeção da gestação ativa sem desfecho**.
Ambos sempre por RPC `security definer` com gate interno (`is_secretaria`):

- `criar_gestacao_pela_secretaria(p_paciente_id, p_dum)` — exige vínculo ativo com alguma médica
  (mesma exigência de `agendar_consulta`), fixa `dpp_origem = 'dum'` e `tipo = 'unica'` no
  servidor e audita `gestacao.criada` com `por: 'secretaria'` no meta.
- `atualizar_dum_pela_secretaria(p_gestacao_id, p_dum)` — só em gestação `ativa` com
  `dpp_origem = 'dum'`; se a médica definiu a DPP por ultrassom, a correção é recusada.
- `gestacao_ativa_da_paciente(p_paciente_id)` — leitura para secretaria e médica vinculada,
  devolvendo apenas `gestacao_id, dpp_origem, dum, dpp_usg, dpp_final, tipo`.

O que **não** muda: a tabela `gestacoes` continua sem policy de select e sem grant de escrita para
a secretaria (a fronteira do ADR 0003 vale para a tabela); desfecho (`encerrar_gestacao`), DPP por
ultrassom e tipo gemelar continuam exclusivos da médica via `criar_gestacao` / `atualizar_gestacao`.
A validação de datas foi extraída para `validar_dados_gestacao` e é compartilhada pelas quatro RPCs.

Cenários **78–83** do `supabase/tests/rls_smoke.sql` fixam cada travessa: criação e correção pela
secretaria, o destravamento do agendamento, a recusa após troca de origem para `usg`, os gates
cruzados e a projeção sem desfecho com o insert direto ainda fechado.

## Alternativas consideradas

- **Policy de select em `gestacoes` para a secretaria**: descartada porque a linha inteira inclui
  `desfecho` e `desfecho_observacao`, que são clínicos; a RPC entrega só a projeção necessária.
- **Alargar o gate de `criar_gestacao` para aceitar secretaria**: descartada porque daria à
  secretaria a origem `usg` e o tipo gemelar de graça — o payload clínico continuaria aberto onde
  o objetivo era só a DUM.
- **Criar a gestação implicitamente dentro de `agendar_consulta`**: descartada porque faria dado
  clínico nascer como efeito colateral de um agendamento, sem autoria explícita na auditoria — a
  pergunta "quem cadastrou essa gestação" ficaria sem resposta honesta.

## Consequências

**Positivas**

- O fluxo da recepção fecha na mesma tela: DUM na ficha ou no diálogo da consulta, sem escalar
  para a médica.
- A auditoria responde "quem cadastrou" (`ator_id` + `por: 'secretaria'`), e a tela `/auditoria`
  já conhece as ações `gestacao.criada` / `gestacao.atualizada`.
- A validação de datas em um único lugar acaba com a quarta cópia das mesmas mensagens.

**Negativas / trade-offs**

- A secretaria agora escreve um dado que alimenta cálculo clínico (IG, checklist, DPP); o dado de
  entrada é administrativo, mas a consequência é clínica — mitigado pela validação de intervalo no
  servidor e pela correção da DUM continuar rastreável.
- Duas portas de escrita para a mesma tabela (`*_pela_secretaria` e as clínicas) é mais superfície
  para manter; os cenários 82 e 83 são a trava de que cada uma continua com o seu papel.
