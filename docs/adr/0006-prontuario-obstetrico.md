# ADR 0006 — Prontuário obstétrico

## Status

Aceito — 2026-10-01, junto com a W11 (migration `20261001120000_prontuario_evolucao.sql` no
`prenatalapp`, cenários 93–104 do `supabase/tests/rls_smoke.sql`). Proposto no mesmo dia; ver
[plano-w11-evolucao-prenatal.md](../plano-w11-evolucao-prenatal.md).

## Contexto

Até a W10 o sistema guarda a **logística** da gestação — agenda, checklist do protocolo, laudos em
PDF, urgência — mas nenhum **conteúdo clínico**: `consultas` tem só `data_hora`, `status`, `tipo` e
`local`. O que a médica observou, mediu e decidiu em cada consulta não tem onde morar, e a curva da
caderneta (peso, PA, AU, BCF) não existe em lugar nenhum.

O roadmap do mobile tinha isso como fora de escopo deliberado ("o app é espelho, não prontuário").
A decisão agora é outra: o sistema passa a ser também o **prontuário obstétrico** da clínica, com
evolução registrada **no web e no mobile**. Isso revoga aquela linha do roadmap do app e precisa
caber na fronteira de leitura do [ADR 0003](0003-escopo-de-leitura-da-equipe.md) sem afrouxá-la.

Este ADR fixa as decisões de modelo, acesso, assinatura e sincronização antes de qualquer
migration, para que as fases W11 em diante não as reabram uma a uma.

## Decisão

### 1. Escopo obstétrico

Toda evolução pertence a uma gestação: `gestacao_id` é obrigatório. `consulta_id` é opcional — a
evolução de uma consulta da agenda a referencia; intercorrência e consulta puerperal (gestação já
encerrada, sem consulta agendável) não. Atendimento ginecológico fora de gestação continua fora do
sistema.

### 2. Estruturado onde vira curva, texto onde é julgamento

As medidas da caderneta ficam em **colunas tipadas** — peso, PA sistólica e diastólica, altura
uterina, BCF, movimentação fetal, edema e apresentação —, nunca em `jsonb`: elas alimentam curvas,
validação de faixa no servidor e a projeção da gestante. O texto clínico livre fica em colunas de
texto.

A IG em dias é **congelada na assinatura**, calculada no servidor a partir da gestação. Uma
correção posterior de DUM (inclusive pela secretaria, [ADR 0004](0004-cadastro-da-gestacao-pela-secretaria.md))
não reescreve o histórico do que foi registrado.

### 3. Rascunho → assinada; assinada é imutável

Mesmo molde dos documentos (rascunho → publicar). O rascunho é da autora: só ela edita e só ela
exclui — ainda não é prontuário. Evolução assinada não tem update nem delete, nem por grant nem por
RPC; um trigger recusa update em linha assinada como defesa em profundidade, no mesmo espírito do
revoke de `truncate` da W7.

### 4. Retificação por versão (padrão `raiz_id`)

Corrigir uma evolução assinada cria uma **nova versão completa** na mesma `raiz_id`, com
`retifica_id` apontando para a anterior e `motivo_retificacao` obrigatório. A versão anterior
continua legível e marcada como retificada; a **vigente** é a última assinada da raiz. É o mesmo
raciocínio do versionamento de `protocolo_itens` (W3). Não existe adendo de texto solto: um
mecanismo só para corrigir.

Só a autora original retifica. Outra médica que discorde registra a própria evolução.

### 5. Assinatura eletrônica agora, ICP-Brasil depois

Assinar = sessão autenticada + CRM/UF da autora + `assinada_em` do relógio do servidor +
`conteudo_hash` (SHA-256 do conteúdo canônico, calculado no Postgres). `profiles` ganha `crm` e
`crm_uf`; assinatura sem CRM preenchido é recusada.

A assinatura ICP-Brasil (Res. CFM 1.821/2007) entra como fase própria e se anexa ao mesmo
`conteudo_hash` — o modelo não muda.

### 6. Assinar exige rede

Hash e hora vêm do servidor. Não existe assinatura offline.

### 7. Mobile: rascunho local cifrado + sincronização

Só o **rascunho** vive no aparelho:

- cifrado em repouso, com a chave no Keychain/Keystore;
- apagado no logout e na troca de usuário, e removido localmente depois de assinado;
- `id` da evolução é UUID gerado no cliente, para que salvar seja um upsert idempotente;
- concorrência otimista por `revisao` (inteiro): a RPC de salvar rascunho recusa revisão defasada,
  o app guarda a cópia local como "versão do aparelho" e a médica escolhe entre ela e a do servidor.

O web não guarda nada localmente: autosave direto no rascunho do servidor. A biblioteca de banco
local do Flutter é decidida no plano da W11.

### 8. Assinar a evolução de uma consulta fecha a consulta

Se `consulta_id` aponta para consulta `agendada`, a assinatura a marca `realizada` na mesma
transação, com as guardas de `marcar_consulta`. Consulta `faltou` ou `cancelada` recusa evolução.

### 9. Quem lê e quem escreve

Estende a fronteira do [ADR 0003](0003-escopo-de-leitura-da-equipe.md) sem alterá-la:

| Papel                                                               | Prontuário                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Médica com vínculo ativo (`obstetra` ou `medicina_fetal`)           | Lê o histórico inteiro da paciente, de qualquer autora; escreve e retifica as próprias evoluções; o papel do vínculo é gravado na evolução |
| Médica sem vínculo ativo (inclusive a anterior, após transferência) | Nada — mesma regra de `medica_vinculada_ao_paciente`                                                                                       |
| Secretaria                                                          | Nada                                                                                                                                       |
| Admin                                                               | Nada clínico; vê os eventos em `/auditoria`                                                                                                |
| Gestante                                                            | Só a projeção de medidas (item 10)                                                                                                         |

Escrita sempre por RPC `security definer` com gate de papel + vínculo; a tabela não tem grant de
escrita para `authenticated`.

### 10. A gestante vê as medidas, nunca o texto

Uma RPC de projeção devolve, por evolução vigente assinada: data, IG congelada e as medidas da
caderneta. Texto clínico, conduta e risco nunca saem para o papel `paciente`. A assinatura faz o
papel do `publicado_em` para as medidas (regra 1 do app): medida em rascunho nunca aparece. Push
continua sem conteúdo clínico (regra 3).

### 11. Leitura auditada

Abrir o prontuário de uma paciente grava `prontuario.aberto` — um evento por abertura, não por
linha. A escrita grava `evolucao.rascunho_criado`, `evolucao.assinada` e `evolucao.retificada`.
Todas aparecem em `/auditoria` como as ações existentes.

### 12. Guarda de 20 anos

Evolução assinada nunca é apagada (Lei 13.787/2018). Isso resolve, para o prontuário, a pendência
de retenção da Fase 0 do mobile. `pacientes` e `gestacoes` já não têm delete desde a W7.

## Alternativas consideradas

- **Prontuário geral, com atendimento pendurado em `paciente_id`**: descartada porque está fora do
  produto e quebraria a premissa de que tudo deriva da gestação (IG, checklist, urgência).
- **Medidas em `jsonb`**: descartada porque inviabiliza curvas, validação de faixa e uma projeção
  tipada para a gestante.
- **Evolução editável com o histórico no `audit_log`**: descartada porque prontuário editável não
  tem valor probatório; o original precisa continuar íntegro na própria tabela.
- **Adendo de texto separado da retificação**: descartada porque seriam dois mecanismos para o
  mesmo problema.
- **ICP-Brasil desde a W11**: descartada porque a integração com certificado nos dois clientes
  atrasaria o valor clínico; o `conteudo_hash` deixa a porta aberta.
- **Mobile só online**: descartada porque, em consultório com sinal ruim, a médica perderia o texto
  digitado.

## Consequências

**Positivas**

- Histórico clínico íntegro e rastreável: quem escreveu, quando, o que mudou e por quê.
- As curvas da caderneta passam a ser possíveis a partir de dado estruturado.
- A gestante ganha a caderneta no app sem expor julgamento clínico.
- Transferência de médica funciona sem cópia de dados: a nova médica vinculada vê o histórico.

**Negativas / trade-offs**

- Banco local cifrado e sincronização no Flutter: dependência nova e superfície LGPD no aparelho.
  Biometria e logout por inatividade (Fase 7 do mobile) passam a ser pré-requisito da W11 no
  mobile.
- Assinatura eletrônica simples fica abaixo do NGS2 até a fase ICP-Brasil.
- A médica anterior perde o acesso ao que ela mesma escreveu depois da transferência — coerente com
  a regra de vínculo ativo, mas precisa ser comunicado à clínica.

## Fases decorrentes

- **W11** — Evolução de pré-natal: schema, RPCs, cenários no `supabase/tests/rls_smoke.sql`, tela
  no web e no mobile com rascunho local.
- **W12** — Anamnese, antecedentes e classificação de risco gestacional (entregue; ver
  [ADR 0007](0007-anamnese-pela-secretaria.md) e [plano-w12-anamnese-risco.md](../plano-w12-anamnese-risco.md)).
- **W13** — Exames estruturados e vacinas (entregue; ver
  [ADR 0008](0008-exames-e-vacinas-pela-secretaria.md) e [plano-w13-exames-vacinas.md](../plano-w13-exames-vacinas.md)).
- **W14** — Linha do tempo e curvas AU × IG e peso × IMC.
- **W15** — Prescrição e atestado.
- **W16** — Assinatura ICP-Brasil.
