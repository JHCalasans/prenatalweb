# ADR 0003 — Escopo de leitura da equipe (vínculo vs. clínica)

## Status

Aceito — 2026-08-29, junto com o hardening da W7 (migration `20260830120000_hardening_w7.sql`).

## Contexto

As W2–W6 cresceram o modelo de acesso por fatias e deixaram uma pergunta sem resposta única:
**o que cada papel da equipe pode ler?** O hardening da W7 fechou as portas laterais de escrita
(grants largos em `documentos`, `gestacoes` e `pacientes`) e, ao fazê-lo, precisou decidir onde o
vínculo se aplica e onde ele deliberadamente não se aplica. Este ADR fixa essa fronteira para que
ela não seja "uniformizada" depois por acidente.

## Decisão

A fronteira é assimétrica de propósito:

| Superfície                  | Escopo                                                       |
| --------------------------- | ------------------------------------------------------------ |
| **Escrita clínica**         | Sempre por RPC `security definer`, e sempre exigindo vínculo |
| **Leitura clínica**         | Por vínculo (médica só vê a própria paciente)                |
| **Auditoria (`audit_log`)** | Da clínica inteira, para toda médica                         |
| **Agenda da clínica**       | Visível à secretaria; laudo, checklist e gestação não        |

- **Escrita clínica sempre por RPC e sempre com vínculo.** `documentos` perdeu o grant de escrita
  direto (só `criar_documento_rascunho` → `confirmar_upload_documento` → `publicar_documento` /
  `excluir_documento_rascunho`); `gestacoes` guarda o insert direto do mobile mas fecha
  update/delete; `pacientes` só aceita as quatro colunas de cadastro. Cenários **68** e **69** do
  `supabase/tests/rls_smoke.sql` provam cada bypass fechado e o caminho legítimo ainda aberto.
- **Leitura clínica por vínculo.** Os relatórios `relatorio_documentos_publicados` e
  `relatorio_checklist_vencidos` passaram a exigir `medica_vinculada_a_gestacao`, alinhando com a
  policy `documentos_select_medica`. Cenário **70** garante que médica sem vínculo recebe zero
  linhas dessa paciente nos dois relatórios.
- **Auditoria da clínica inteira, de propósito.** O rastro de "quem leu qual laudo" e "quem
  publicou o quê" não funciona recortado por vínculo: a graça é justamente uma médica ver a ação da
  outra. `auditoria_da_clinica` mantém o gate só de papel (medica), e o trecho final do cenário
  **70** fixa que médica sem vínculo **continua** enxergando a leitura feita pela colega.
- **Privilégio de tabela é parte da fronteira, não só a policy.** `truncate` não passa por RLS —
  a policy filtra linha, e `truncate` não olha linha nenhuma. O setup padrão do Supabase concede
  `truncate`, `trigger` e `references` a `anon`/`authenticated` em todo o schema, e os revokes das
  fases anteriores miraram só insert/update/delete. A W7 revoga os três em todas as tabelas e na
  view. Não havia caminho do cliente até lá (o PostgREST nunca emite `truncate`), então é
  profundidade de defesa; o cenário **71** impede que volte.
- **Secretaria com a agenda, sem o prontuário.** A secretaria agenda e vê a agenda da clínica
  inteira (desenho da W5/W6), mas não alcança laudo, checklist nem gestação — o cenário **28**
  já fixava essa separação e segue verde.

## Alternativas consideradas

- **Uniformizar tudo por vínculo** (auditoria também recortada): descartada porque esvazia o
  propósito probatório da auditoria; o rastro clínico interessa à clínica, não só à dupla
  médica-paciente.
- **Abrir os relatórios clínicos para a clínica inteira** (como a auditoria): descartada porque
  laudo e checklist são dados sensíveis; o relatório clínico contornaria a policy de vínculo da
  própria tabela.

## Consequências

**Positivas**

- Uma definição única de "quem lê o quê", testada por cenário de smoke (não só por leitura de SQL).
- O cenário 70 funciona como trava: quem tentar recortar a auditoria por vínculo sem perceber
  quebra um teste, não só uma intenção.

**Negativas / trade-offs**

- A assimetria (clínico por vínculo, auditoria inteira) precisa ser explicada; este ADR é a
  explicação.
- `relatorio_faltas` e `relatorio_convites_pendentes` seguem sem filtro de vínculo (são
  operacionais, da secretaria); se um dia ganharem dado clínico, a fronteira precisa ser reavaliada.
