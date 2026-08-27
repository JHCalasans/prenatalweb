# Plano: W4 (fatia 3) — Upload de PDF e publicação de documentos

> Ao aprovar, salve como `docs/plano-w4-documentos.md` no repo `prenatalweb`.
>
> Terceira e última fatia da W4. Fecha a fase.

## Objetivo

Ao final, na seção Documentos do cartão (`/mesa/:pacienteId`), a médica envia um PDF ou imagem de
laudo escolhendo tipo, título e data do exame, marca se há achado alterado, e o arquivo sobe para
o bucket privado `documentos`. Ela publica um rascunho — e quando o documento tem achado alterado
o sistema exige a confirmação de que houve comunicação presencial antes de liberar. Ela também
exclui um rascunho e abre qualquer documento da gestação para conferir. A gestante continua vendo
só o que está publicado, e o app Flutter não muda.

## Escopo

**Dentro:**

- `CartaoService` ganha `criarRascunho`, `publicar`, `excluirRascunho`, `abrirArquivo` e
  `registrarLeitura`; `documentos()` passa a trazer também `storage_path`.
- Componente `CartaoDocumentos`, que assume a seção Documentos do cartão e passa a carregar a
  própria lista.
- Envio de arquivo, publicação com o gate de achado alterado, exclusão de rascunho e abertura do
  arquivo em nova aba.
- Testes do serviço e do componente.
- `docs/roadmap-web.md` com a W4 fechada.

**Fora:**

- Nenhuma migration, RPC ou policy nova — o backend da Fase 3 já entrega tudo. Se aparecer
  vontade de mexer em SQL nesta fatia, é sinal de que algo foi mal entendido.
- Não agendar/registrar consulta nem encerrar gestação: não estão na W4 do roadmap (consultas são
  a W5).
- Não editar documento já publicado, nem despublicar. `publicado_em` é um caminho só de ida, e
  `documentos_write_medica` permitir o update não muda isso.
- Não usar `p-fileupload` do PrimeNG.
- Não gerar URL assinada de Storage em lugar nenhum.
- Não adicionar dependência npm.

## Decisões técnicas

| Decisão                 | Escolha                                                                                                 | Motivo                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordem do envio          | `criar_documento_rascunho` → `storage.upload` → `confirmar_upload_documento`                            | A policy `storage_documentos_write` exige que já exista um `documentos` com aquele `storage_path`; inverter a ordem faz o upload ser negado                              |
| Falha no upload         | `excluir_documento_rascunho` no `catch`, e só então propagar o erro                                     | Sem isso sobra rascunho fantasma apontando para objeto inexistente — é o motivo pelo qual `arquivo_enviado_em` existe                                                    |
| Caminho do arquivo      | Sempre o `storage_path` que a RPC devolve, nunca montado no cliente                                     | Está escrito no `init_schema`: o banco é a autoridade do caminho, e a policy casa objeto e documento por ele                                                             |
| Abrir o arquivo         | `storage.download()` → `Blob` → `URL.createObjectURL` → `window.open` → `revokeObjectURL`               | Escolha do usuário. Espelha a decisão registrada no mobile ("o arquivo nunca toca o disco nem vira URL"); blob URL é de mesma origem e efêmera                           |
| Registrar leitura       | Chamar `log_documento_acesso` ao abrir, sem bloquear a abertura                                         | É o que `documento_viewer_screen.dart` já faz no mobile; a auditoria não deve impedir a médica de ver o laudo se falhar                                                  |
| Componente de arquivo   | `<input type="file">` puro, com `accept=".pdf,.jpg,.jpeg,.png"`                                         | O upload é feito pelo supabase-js, não por HTTP do PrimeNG; `p-fileupload` só acrescentaria configuração para desligar o que ele faz sozinho                             |
| Validação no cliente    | Extensão em `pdf/jpg/jpeg/png` e tamanho ≤ 20 MB, antes de chamar a RPC                                 | São exatamente os limites do bucket (`allowed_mime_types` e `file_size_limit`); barrar antes evita criar rascunho que o upload vai recusar                               |
| `contentType` no upload | Derivado da extensão (`application/pdf`, `image/jpeg`, `image/png`)                                     | O bucket restringe por MIME; deixar o browser adivinhar falha para arquivo sem extensão reconhecida                                                                      |
| Gate do achado alterado | Diálogo próprio com checkbox obrigatório, que só então chama `publicar` com `confirmarComunicado: true` | A RPC recusa sem a confirmação; pedir no diálogo transforma o erro em decisão consciente, e é a regra 2 do README                                                        |
| Publicar sem achado     | Direto, sem diálogo                                                                                     | Não há gate a cumprir; um diálogo aqui seria fricção sem propósito                                                                                                       |
| Onde vive a seção       | Componente filho `CartaoDocumentos`, dono da própria lista                                              | O cartão já passa de 200 linhas; a seção ganha dois diálogos, input de arquivo e quatro ações. O pai deixa de buscar documentos e fica com cinco chamadas em vez de seis |
| Excluir rascunho        | Incluído, com confirmação                                                                               | É o desfazer do envio e a RPC já existe; sem ele um título errado vira lixo permanente na lista                                                                          |
| Documento publicado     | Só leitura: sem excluir, sem republicar                                                                 | `excluir_documento_rascunho` recusa publicado, e a tela não deve oferecer o que o banco nega                                                                             |

## Etapas

### 1 — Estender o `CartaoService` com as operações de documento

**Depende de:** nenhuma
**Arquivos:** `src/app/core/cartao/cartao.service.ts` (editar)

Acrescente `storagePath: string` a `DocumentoCartao` e inclua `storage_path` no `select` de
`documentos()` — sem ele não há como abrir o arquivo.

Exporte `TipoDocumento` a partir de `Database['public']['Enums']['tipo_documento']`, no mesmo
estilo em que `StatusChecklist` já é exportado.

Crie a interface `DadosRascunho` com `gestacaoId`, `tipo: TipoDocumento`, `titulo`,
`dataExame: string | null`, `achadoAlterado: boolean` e `arquivo: File`.

Métodos novos, todos devolvendo o `Resultado<T>` que o serviço já usa:

- `criarRascunho(dados: DadosRascunho): Promise<Resultado<string>>` — chama
  `criar_documento_rascunho` (`p_gestacao_id`, `p_tipo`, `p_titulo`, `p_extensao`,
  `p_data_exame`, `p_achado_alterado`), lê `documento_id` e `storage_path` da primeira linha do
  retorno, faz `storage.from('documentos').upload(storagePath, arquivo, { contentType })` e então
  `confirmar_upload_documento`. Se o upload ou a confirmação falharem, chama
  `excluir_documento_rascunho` e devolve `{ ok: false }` com a mensagem do erro original.
  Devolve o `documento_id` no sucesso. Reaproveite o helper `opcional()` para `p_data_exame`.
- `publicar(documentoId: string, confirmarComunicado: boolean): Promise<Resultado<null>>` —
  chama `publicar_documento`.
- `excluirRascunho(documentoId: string): Promise<Resultado<null>>` — chama
  `excluir_documento_rascunho`.
- `abrirArquivo(storagePath: string): Promise<Resultado<Blob>>` — `storage.from('documentos')
.download(storagePath)`. O `error` do Storage não é `PostgrestError`; devolva a mensagem
  genérica que o arquivo já define.
- `registrarLeitura(documentoId: string): Promise<void>` — chama `log_documento_acesso` e engole
  o erro. É auditoria, não pode impedir a leitura.

Duas funções privadas no arquivo: `extensaoDe(nome: string): string | null` (última extensão em
minúsculas, só se estiver na lista permitida) e `mimeDe(extensao: string): string`.

### 2 — Criar o componente `CartaoDocumentos`

**Depende de:** Etapa 1
**Arquivos:** `src/app/pages/mesa/cartao/cartao-documentos.ts`, `cartao-documentos.html`,
`cartao-documentos.scss` (criar)

Standalone, seguindo o padrão de `paciente-vinculos.ts` (fatia 3 da W2): dois inputs obrigatórios
via `input.required<string>()` para `gestacaoId` e `input.required<boolean>()` para
`gestacaoAtiva`, e carregamento próprio no `ngOnInit`.

Estado em signals: `documentos`, `carregando`, `agindo`, `erro`, mais `enviando` (diálogo de
envio aberto), `aPublicar` e `aExcluir`.

Formulário reativo de envio com `tipo` (`p-select` sobre os cinco valores de `tipo_documento`:
laudo_usg, exame_lab, receita, atestado, outro), `titulo` (obrigatório, mínimo 3),
`dataExame` (`p-datepicker`, opcional) e `achadoAlterado` (`p-checkbox`). O arquivo fica fora do
formulário, num signal alimentado pelo `(change)` do `<input type="file">`.

Ao enviar: valida arquivo escolhido, extensão e tamanho (mensagens no `erro`), chama
`criarRascunho` e recarrega a lista. O botão de envio só aparece quando `gestacaoAtiva()`.

Ao publicar: se `achadoAlterado && !comunicadoPresencialmente`, abre o diálogo de confirmação com
checkbox "Comuniquei o achado presencialmente à gestante" — o botão de confirmar fica desabilitado
enquanto não marcado. Caso contrário publica direto.

Mova `documentoRotulo` do `cartao-gestante.ts` para cá, junto do mapa de severidade da tag.

Ao abrir: `abrirArquivo`, `URL.createObjectURL`, `window.open(url, '_blank')`,
`URL.revokeObjectURL` no `finally`, e `registrarLeitura` em paralelo. Se `window.open` devolver
`null` (pop-up bloqueado), escreva no `erro` que o navegador bloqueou a janela.

Ações por linha: **Abrir** sempre; **Publicar** e **Excluir** apenas quando `publicadoEm` é nulo
e `gestacaoAtiva()`.

### 3 — Trocar a seção de documentos do cartão pelo componente

**Depende de:** Etapa 2
**Arquivos:** `src/app/pages/mesa/cartao/cartao-gestante.ts` (editar),
`cartao-gestante.html` (editar)

No `.ts`: remova o signal `documentos`, a chamada a `this.cartao.documentos()` do `Promise.all`
(fica com duas chamadas no segundo lote) e o método `documentoRotulo`. Importe `CartaoDocumentos`.

No `.html`: substitua a `<section class="bloco">` de Documentos inteira — incluindo a `<p class="dica">`
que fala da "próxima fatia da W4", que deixa de ser verdade — por
`<app-cartao-documentos [gestacaoId]="gestacaoAtual()!.id" [gestacaoAtiva]="gestacaoAtiva()" />`.

### 4 — Testes do serviço

**Depende de:** Etapa 1
**Arquivos:** `src/app/core/cartao/cartao.service.spec.ts` (editar)

O dublê atual de `SUPABASE_CLIENT` não tem `storage`; acrescente `storage.from()` devolvendo
`upload` e `download`.

Casos: a ordem das três chamadas no caminho feliz (`criar_documento_rascunho`, depois `upload`,
depois `confirmar_upload_documento`); `excluir_documento_rascunho` chamado quando o `upload`
rejeita; extensão não suportada e arquivo acima de 20 MB recusados **sem** chamar a RPC;
`publicar` repassando `p_confirmar_comunicado`; `registrarLeitura` não propagando erro.

### 5 — Testes do componente

**Depende de:** Etapas 2 e 3
**Arquivos:** `src/app/pages/mesa/cartao/cartao-documentos.spec.ts` (criar),
`src/app/pages/mesa/cartao/cartao-gestante.spec.ts` (editar)

Em `cartao-documentos.spec.ts`, monte com `CartaoService` dublê e `componentRef.setInput` para os
dois inputs. Casos: lista renderiza título e a tag de situação de cada estado (publicado,
rascunho, achado a comunicar); publicar documento sem achado chama o serviço direto; publicar com
achado **não** chama o serviço até a confirmação; excluir exige confirmação; mensagem de erro do
serviço aparece; arquivo com extensão inválida não chama `criarRascunho`.

Use o mesmo padrão de espera de `paciente-vinculos.spec.ts` — `await fixture.whenStable()`
repetido — porque o carregamento é assíncrono.

Em `cartao-gestante.spec.ts`, remova `documentos` do dublê do serviço (o pai não chama mais) e
acrescente o provider de `CartaoService` que o filho vai injetar, senão o `TestBed` do pai quebra
ao renderizar `<app-cartao-documentos>`.

### 6 — Fechar a W4 no roadmap

**Depende de:** Etapa 5
**Arquivos:** `docs/roadmap-web.md` (editar)

Marque o item de upload como concluído, citando o fluxo rascunho → publicar e o gate de
`comunicado_presencialmente`. Com isso a seção W4 fica inteira em `[x]`.

## Testes

| Caso                                                          | Arquivo                     |
| ------------------------------------------------------------- | --------------------------- |
| Ordem criar → upload → confirmar                              | `cartao.service.spec.ts`    |
| Upload falho dispara `excluir_documento_rascunho`             | `cartao.service.spec.ts`    |
| Extensão inválida e arquivo > 20 MB recusados sem tocar a RPC | `cartao.service.spec.ts`    |
| `publicar` repassa `p_confirmar_comunicado`                   | `cartao.service.spec.ts`    |
| `registrarLeitura` engole erro                                | `cartao.service.spec.ts`    |
| Tags de situação: publicado, rascunho, achado a comunicar     | `cartao-documentos.spec.ts` |
| Publicar sem achado vai direto                                | `cartao-documentos.spec.ts` |
| Publicar com achado só depois do checkbox                     | `cartao-documentos.spec.ts` |
| Excluir exige confirmação                                     | `cartao-documentos.spec.ts` |
| Erro do serviço aparece na tela                               | `cartao-documentos.spec.ts` |
| Cartão renderiza com o filho embutido                         | `cartao-gestante.spec.ts`   |

Os 94 testes existentes e os cenários 1–52 do smoke continuam verdes sem edição — esta fatia não
toca SQL.

## Validação final

```bash
cd ~/Documents/VoidSans/prenatalweb && npm run lint && npm run typecheck && npm test && npm run build && npm run format:check
```

Tudo verde, com 94 + os novos passando e um chunk `cartao-documentos` no build.

Roteiro manual, com o stack local no ar e logada como médica: abrir `/mesa` → **Abrir** numa
paciente com gestação ativa → enviar um PDF marcando "achado alterado" → o documento aparece como
"Achado a comunicar" → **Publicar** exige o checkbox de comunicação → após confirmar vira
"Publicado" → **Abrir** baixa e mostra o arquivo em outra aba → enviar um segundo arquivo e
**Excluir** o rascunho → tentar enviar um `.docx` mostra a mensagem de extensão não suportada.
