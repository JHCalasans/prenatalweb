# Prenatalweb

Web administrativo e de equipe médica do pré-natal (a gestante usa o app
`prenatalapp`). App autenticado e denso — tabelas, formulários, upload — sobre
Angular standalone/signals + PrimeNG, com backend Supabase compartilhado com o
mobile.

- Decisões: [ADR 0001 — stack](docs/adr/0001-decisao-de-stack-web.md) ·
  [ADR 0002 — PrimeNG 21 MIT](docs/adr/0002-licenca-primeng.md)
- Plano: [roadmap-web](docs/roadmap-web.md)
- Tema: [mapa Aconchego mobile → web](docs/tema-aconchego.md)

## Desenvolvimento

```bash
npm install
npm start          # http://localhost:4200 — usa Supabase local (Docker, 127.0.0.1:54321)
```

Ambientes ficam em `src/environments/`:

| Arquivo                      | Uso                                              |
| ---------------------------- | ------------------------------------------------ |
| `environment.development.ts` | `ng serve` — Supabase local                      |
| `environment.ts`             | Fallback de produção (placeholders)              |
| `environment.production.ts`  | **Gerado em build**, não versionado — ver abaixo |

Outros comandos: `npm test` (Vitest), `npm run lint`, `npm run typecheck`,
`npm run format`, `npm run build`.

## Tema Aconchego

Paleta do app mobile traduzida para design tokens do PrimeNG:

- `src/app/core/theme/aconchego.preset.ts` — tokens (cores, raios, sombras);
- `src/styles.scss` — fundo em gradiente, variáveis `--aconchego-*`,
  utilitário `.cartao-vidro`;
- fonte Nunito self-hosted (`@fontsource-variable/nunito`).

A rota `/inicio` (dentro do shell autenticado) é o ponto de conferência do tema.

## Deploy de preview (GitHub Pages)

Todo push em `main` publica o build estático no GitHub Pages
(workflow [`deploy-preview.yml`](.github/workflows/deploy-preview.yml)):
`https://jhcalasans.github.io/prenatalweb/`.

Configuração única, manual: **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

## Environment de produção

`npm run build` roda antes o `scripts/write-env.mjs` (hook `prebuild`), que
gera `src/environments/environment.production.ts` a partir das variáveis:

- `SUPABASE_URL` — URL do projeto Supabase de produção
- `SUPABASE_ANON_KEY` — publishable/anon key (chave pública; a proteção é a RLS)

Sem as variáveis (build local), o script grava placeholders e o build segue. No
workflow de deploy, defina-as como **secrets do repositório** quando o projeto
de produção existir. O arquivo gerado está no `.gitignore`.

## Acesso

O web é só para a equipe: papéis `medica` e `secretaria`. Contas com papel
`paciente` são recusadas no login e têm a sessão descartada — gestantes usam o
app `prenatalapp`.

Papel é atribuído pelo backend, nunca pelo cliente:

- `select public.promover_para_medica('<uuid>', 'Nome');`
- `select public.promover_para_secretaria('<uuid>', 'Nome');`

Ambas exigem service role. Para criar uma conta de teste local, crie o usuário
pelo Studio (`http://127.0.0.1:54323`) e rode a função correspondente no SQL
editor.
