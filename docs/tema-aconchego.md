# Tema Aconchego — mapa mobile → web

Fonte da verdade da paleta (mobile):
`prenatalapp/lib/core/theme/aconchego_colors.dart` e `app_theme.dart`.
No web, ela vive em dois lugares:

1. **`src/app/core/theme/aconchego.preset.ts`** — design tokens do PrimeNG
   (`definePreset` sobre o Aura), registrados em `src/app/app.config.ts`.
2. **`src/styles.scss`** — variáveis CSS `--aconchego-*` para o que o PrimeNG
   não cobre (fundo de página, blobs, cartão de vidro) + fonte global.

Tipografia: **Nunito** self-hosted via `@fontsource-variable/nunito`
(peso variável 200–1000; mobile usa 600–800), carregada em `angular.json`.

A página inicial é um **showcase vivo** do tema (botões, formulários, seleção,
tags). Ao alterar tokens, confira lá antes de abrir PR.

## Mapa de cores

| Papel (mobile)         | Hex         | Web                                                                 |
| ---------------------- | ----------- | ------------------------------------------------------------------- |
| `gradientStart`        | `#FDEEE4`   | `--aconchego-gradiente-inicio` (fundo, 0%)                          |
| `gradientMid`          | `#FBD9C8`   | `--aconchego-gradiente-meio` (fundo, 55%; `theme-color`)            |
| `gradientEnd`          | `#F5C4AE`   | `--aconchego-gradiente-fim` (fundo, 100%)                           |
| `blobPrimary`          | `#F9B79C`   | `--aconchego-blob-primario` (reservado p/ decoração)                |
| `blobSecondary`        | `#F7CFAE`   | `--aconchego-blob-secundario` (reservado p/ decoração)              |
| `ctaStart`             | `#E8835F`   | `primary.400` (início do gradiente do botão; foco de campo)         |
| `ctaEnd`               | `#D96A48`   | `primary.500` — cor de marca (fundo do botão primário)              |
| `link`                 | `#C15B3A`   | `primary.600` / `--aconchego-link` (links e hover do primário)      |
| `textPrimary`          | `#4A2C22`   | `surface.900` (texto principal) e `primary.950`                     |
| `textLabel`            | `#7C4B39`   | `surface.700`                                                       |
| `textField`            | `#5A3A2E`   | `surface.800` (texto de input)                                      |
| `textSecondary`        | `#9A6550`   | `surface.600` / `--aconchego-texto-secundario`                      |
| `textTertiary`         | `#B3816C`   | `surface.500` (texto mudo/placeholder)                              |
| `surface` (branco 75%) | `#BFFFFFFF` | classe `.cartao-vidro` (hero/marketing; componentes usam `#FFFDFA`) |
| erro                   | `#B3261E`   | `formField.invalidBorderColor` / `--aconchego-erro`                 |

Superfícies neutras quentes (`surface.0` `#FFFDFA` → `surface.950` `#362019`)
são derivações web da mesma família de cor — no mobile só existem os tons de
texto; a rampa completa existe aqui porque os tokens do PrimeNG (bordas, hover,
fundo de tabela) precisam de uma escala.

## Sombras e raios

| Papel (mobile) | Valor                                  | Web                                              |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| `inputShadow`  | `0 2px 8px rgba(214,120,84,.12)`       | `formField.shadow`                               |
| `ctaShadow`    | `0 10px 24px -6px rgba(217,106,72,.5)` | `overlay.modal.shadow` (diálogos)                |
| `brandShadow`  | `0 8px 20px rgba(214,120,84,.25)`      | `overlay.*.shadow` e `.cartao-vidro`             |
| raio input     | `16px`                                 | `formField.borderRadius`, `button.borderRadius`  |
| raio CTA       | `18px`                                 | 16px na web (densidade; diferença imperceptível) |
| raio cartão    | `20px`                                 | `overlay.modal.borderRadius`, `.cartao-vidro`    |

## Regras para evoluir

- Mudou cor no mobile? Atualize `aconchego_colors.dart` **e** os dois arquivos
  web acima no mesmo PR (o contrato visual é compartilhado, igual ao schema do
  Postgres).
- Cores novas para componentes específicos entram como token do PrimeNG
  (`components.<nome>` no preset), nunca como CSS ad hoc no componente.
- Modo escuro não existe no Aconchego; `darkModeSelector` fica em `.app-dark`
  (reservado) e nada deve depender de `prefers-color-scheme`.
