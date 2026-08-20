# ADR 0001 — Decisão de stack do web (pré-natal)

## Status

Aceito — antecipa a decisão da W0, a ser ratificada ao iniciar a fundação.

## Contexto

- O web é um app autenticado e denso (tabelas, formulários, upload); SEO/SSR são irrelevantes.
- O backend é o Supabase compartilhado com o app Flutter (Auth, Postgres com RLS, Storage, RPCs). O contrato é o banco, não um backend próprio — não há espaço para Java/.NET no servidor.
- O time domina Java/.NET, sem histórico forte em React/Vue.
- Critérios da W0: qualidade de componentes de tabela/formulário, client Supabase maduro, produtividade, hiring; SSR não é requisito.

## Decisão

**Angular (standalone + signals) com PrimeNG** como biblioteca de componentes.

Stack de frontend:

| Camada | Escolha |
|---|---|
| Framework | Angular 22+ standalone + signals |
| UI | PrimeNG + PrimeIcons |
| Estilo | Design tokens do PrimeNG adaptando o tema Aconchego |
| Formulários | Reactive Forms |
| Estado | Signals + serviços por feature (sem NgRx) |
| Dados | `@supabase/supabase-js` encapsulado em serviços por domínio; tipos gerados do Postgres (`database.types.ts`) |
| Rotas/auth | Guards por papel (`secretaria`/`medica`) |
| Testes | Vitest/Testing Library (unit) + Playwright (E2E) |
| Qualidade | ESLint + Prettier + TypeScript strict |
| Deploy | Build estático (sem SSR) |

## Alternativas consideradas

- **Next.js (React) + shadcn/ui + TanStack Table**: maior ecossistema e hiring, mas exige aprender React e montar a stack de tabelas/formulários peça por peça; produtividade inicial menor para este time.
- **Nuxt (Vue)**: bom equilíbrio, mas hiring menor que React/Angular no Brasil e ganho pouco claro para um app CRUD denso.
- **SvelteKit**: kit excelente, mas ecossistema de componentes enterprise (tabela densa, upload, agenda) imaturo.

## Consequências

**Positivas**

- Curva de aprendizado menor vindo de .NET/Java: DI, TypeScript forte, arquitetura opinativa.
- PrimeNG cobre W2–W6 pronto (tabelas densas, upload, calendário/agenda, formulários).
- Guards por papel triviais com Angular Router.
- Bundle inicial pesado é irrelevante num app autenticado sem SSR/SEO.

**Negativas / trade-offs**

- Hiring menor que React.
- Dependência forte de terceiros (PrimeNG) para quase toda a UI.
- Migração futura é cara; este ADR só deve ser revisitado se o contexto mudar materialmente (ex.: exigência de SSR).
