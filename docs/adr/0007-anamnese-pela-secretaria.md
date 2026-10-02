# ADR 0007 — Anamnese também pela secretaria

## Status

Aceito — 2026-10-02, junto com a fase W12 (migration `20261002120000_anamnese_risco.sql` no
`prenatalapp`, cenários 105–116 do `supabase/tests/rls_smoke.sql`). Ver
[plano-w12-anamnese-risco.md](../plano-w12-anamnese-risco.md).

## Contexto

A W12 trouxe para o prontuário obstétrico ([ADR 0006](0006-prontuario-obstetrico.md)) a ficha de
anamnese: tipagem, alergias, medicações em uso, comorbidades, antecedentes obstétricos, familiares e
hábitos. Boa parte desses dados chega pela recepção — a paciente preenche a ficha antes da
consulta, e quem a digita é a secretaria.

O [ADR 0003](0003-escopo-de-leitura-da-equipe.md) mantém a secretaria fora do conteúdo clínico,
com uma única exceção pontual (a DUM, [ADR 0004](0004-cadastro-da-gestacao-pela-secretaria.md)). A
decisão do produto foi que médica e secretaria cadastram a anamnese — o que exige uma nova exceção,
registrada aqui.

## Decisão

A secretaria **lê e grava a anamnese inteira** de qualquer paciente da clínica, sempre por RPC
`security definer`:

- `registrar_anamnese` aceita médica vinculada **ou** secretaria (`pode_acessar_anamnese`); cada
  gravação insere uma versão nova e imutável, com `autor_id` e `papel_autor`. Concorrência por
  `p_versao_base`: quem salva sobre uma versão que outra pessoa já substituiu recebe
  `'Anamnese alterada por outra pessoa'` e precisa recarregar.
- `anamnese_da_paciente` devolve o histórico com o mesmo gate e grava `anamnese.aberta` na
  auditoria (uma vez a cada 10 minutos por pessoa e paciente), para que a leitura de dado clínico
  pela secretaria fique rastreada.
- As tabelas `anamneses` e `riscos_gestacionais` não têm policy nem grant; um trigger recusa
  qualquer update ou delete, inclusive vindo das RPCs.

O que **não** muda: a secretaria continua sem acesso a evolução, laudo, checklist, desfecho da
gestação e à **classificação de risco**, que é ato clínico da médica vinculada
(`registrar_risco_gestacional`, `riscos_da_gestacao` e `fatores_risco_sugeridos`). O admin não
alcança nenhuma das RPCs da anamnese. A gestante lê só tipagem, Rh e alergias da versão vigente
(`minha_ficha_essencial`).

## Alternativas consideradas

- **Anamnese só da médica**: descartada por decisão do produto — a ficha chega pela recepção e
  redigitá-la na consulta é retrabalho.
- **Secretaria grava um rascunho que a médica confirma**: descartada porque acrescenta um passo
  sem ganho real — toda versão já é rastreável por autor e papel, e a médica vê quem preencheu no
  cartão da gestante.
- **Secretaria só com dados de recepção** (tipagem, alergias e medicações): descartada por decisão
  do produto; a ficha inteira é preenchida na recepção.

## Consequências

**Positivas**

- A ficha nasce na recepção e a médica já a encontra preenchida no cartão, com a faixa de alertas
  (alergia, Rh negativo, ficha não preenchida, risco).
- Histórico completo: cada versão diz quem gravou, em que papel e quando.

**Negativas / trade-offs**

- A secretaria passa a ler dado clínico sensível (comorbidades, HIV, transtorno mental, uso de
  substâncias) de qualquer paciente da clínica. Mitigado pela leitura auditada; se a clínica quiser
  restringir, o caminho é recortar a RPC por vínculo ou separar os campos de recepção.
- Duas pessoas editando a mesma ficha podem esbarrar no conflito de versão; a tela explica e
  recarrega, mas o que foi digitado na tela recusada se perde.
