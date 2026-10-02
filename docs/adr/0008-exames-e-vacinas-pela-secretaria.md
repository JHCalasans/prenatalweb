# ADR 0008 — Exames e vacinas também pela secretaria

## Status

Aceito — 2026-10-03, junto com a fase W13 (migration `20261003120000_exames_vacinas.sql` no
`prenatalapp`, cenários 117–130 do `supabase/tests/rls_smoke.sql`). Ver
[plano-w13-exames-vacinas.md](../plano-w13-exames-vacinas.md).

## Contexto

Até a W12, exame era só um item do checklist marcado "realizado" e um laudo em PDF em
`documentos`: nenhum valor era consultável e nada avisava que um resultado veio alterado. Vacina não
existia no sistema. A W13 ([ADR 0006](0006-prontuario-obstetrico.md)) passa a guardar o resultado
como dado estruturado e as vacinas da gestação.

Quem digita o resultado costuma ser a recepção: o laudo do laboratório e a carteira de vacinação
chegam em papel, trazidos pela gestante. Pela decisão do produto, médica e secretaria registram os
dois; liberar o resultado para a gestante continua sendo ato clínico. Isso abre a terceira exceção
da secretaria ao [ADR 0003](0003-escopo-de-leitura-da-equipe.md), depois da DUM
([ADR 0004](0004-cadastro-da-gestacao-pela-secretaria.md)) e da anamnese
([ADR 0007](0007-anamnese-pela-secretaria.md)).

## Decisão

A secretaria **registra e lê resultados de exame e vacinas** de qualquer gestação ativa da clínica,
sempre por RPC `security definer` (`pode_registrar_exame`: secretaria ou médica vinculada):

- `registrar_resultado_exame` grava o resultado de um tipo do catálogo. Quem decide se o resultado
  está alterado é o Postgres, componente a componente, pela referência do catálogo; o cliente nunca
  envia esse dado. Enquanto o exame não for liberado, pode ser corrigido ou excluído por quem tem
  acesso.
- `exames_da_gestacao` e `vacinas_da_gestacao` devolvem o conteúdo com o mesmo gate; a leitura de
  exames grava `exames.abertos` na auditoria (uma vez a cada 10 minutos por pessoa e gestação).
- `registrar_vacina` e `excluir_vacina` mantêm o calendário (dTpa, influenza, hepatite B em três
  doses e COVID-19); a situação de cada vacina é calculada no Postgres.

**Liberar é só da médica vinculada** (`liberar_exame`). Resultado alterado só é liberado com a
confirmação de comunicação presencial, como no `publicar_documento`. Depois de liberado, um trigger
impede qualquer alteração, inclusive vinda de RPC: o que a gestante viu não muda.

**Catálogo fixo.** Tipos e componentes de exame, com unidade e referência, vivem em tabelas do
Postgres alimentadas por migration; não há tela de edição. As referências são **provisórias** (OMS e
IADPSG) e devem ser validadas com as médicas. Cada item do protocolo pode apontar para um tipo
(`protocolo_itens.tipo_exame`, editado em `/protocolo` por `vincular_exame_protocolo`); o vínculo
vale para todas as versões da raiz e é herdado pela versão que `atualizar_protocolo_item` cria.

**O resultado marca o checklist.** Registrar um resultado marca como realizado o item do protocolo
ligado ao tipo, escolhendo a ocorrência cuja janela contém a IG da coleta. Quando o item já estava
realizado à mão, o exame não assume a marcação e excluí-lo não a desfaz.

**A gestante** lê os exames liberados da própria gestação ativa (`meus_exames`), com valor e
referência e **sem o rótulo de alterado**, e o calendário das próprias vacinas (`minhas_vacinas`).

O que **não** muda: a secretaria não libera exame, não classifica risco e não alcança evolução,
laudo, checklist nem desfecho da gestação. O admin não alcança nenhuma RPC de exame ou vacina. As
tabelas novas não têm policy nem grant.

## Alternativas consideradas

- **Resultado só da médica**: descartada por decisão do produto; o laudo chega à recepção e
  redigitá-lo na consulta é retrabalho.
- **Exame e checklist independentes**: descartada porque a mesma informação seria marcada duas
  vezes; o item "realizado" sem resultado seria a regra, não a exceção.
- **Catálogo derivado só dos `protocolo_itens`**: descartada porque o item do protocolo não diz
  quais componentes o exame tem nem qual a referência; sem isso não há "alterado" calculado.
- **Mostrar tudo que não for alterado à gestante, automaticamente**: descartada; a liberação
  explícita pela médica é a mesma regra dos documentos e cobre também o resultado normal.

## Consequências

**Positivas**

- Resultado vira dado consultável, com alerta de alterado vindo de uma regra única.
- O checklist deixa de depender de marcação manual para os exames do catálogo.
- A gestante passa a ver exames e vacinas sem receber alarme clínico.

**Negativas / trade-offs**

- A secretaria passa a ler resultados de exame de qualquer gestação da clínica (HIV, sífilis,
  hepatite B), com leitura auditada. Se a clínica quiser restringir, o caminho é recortar a RPC por
  vínculo ou separar sorologias.
- As referências provisórias podem classificar mal um resultado até serem validadas; a correção é
  uma migration que muda o catálogo, sem tocar nas telas.
- O vínculo do exame com o protocolo é por tipo: itens criados depois ou não listados no seed ficam
  sem marcação automática até a médica escolher o exame em `/protocolo`.
