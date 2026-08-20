# Roadmap web — Pré-Natal (administrativo + equipe médica)

## Premissas

- Repo próprio (este), app autenticado denso (tabelas/formulários/upload); **SSR/SEO irrelevantes**.
- Papéis: `secretaria` e `medica`; gestante **não** acessa o web.
- Backend = Supabase compartilhado com o mobile (Auth, Postgres, RLS, Storage) — policies existentes já valem para o web.
- Stack decidida: Angular + PrimeNG — ver [ADR 0001](adr/0001-decisao-de-stack-web.md).
- Regras compartilhadas (ex.: urgência) vivem **no Postgres**, nunca duplicadas em Dart/TS.
- Mobile continua sendo a ferramenta do dia a dia da médica; o web é para administração e trabalho profundo (tela grande).

## Fases

### W0 — Fundação _(parcial)_

- ~~Decisão de stack~~ — resolvida pelo ADR 0001.
- [x] Repo + scaffold Angular strict
- [x] Cliente Supabase + `database.types.ts` versionado (local em Docker, espelhando `prenatalapp`)
- [x] CI, lint (ESLint/Prettier) — workflow GitHub Actions com lint, typecheck, formatação e build em push/PR para `main`
- [ ] Tokens do tema Aconchego adaptados para web (PrimeNG design tokens)
- [ ] Deploy de preview (build estático) + env de produção

### W1 — Auth + shell

- Login Supabase, sessão persistente, guard por papel, layout base (sidebar), tratamento de sessão expirada.

### W2 — Administração da clínica (secretaria)

- Pacientes: cadastro/edição, busca.
- Convites: emitir (inclusive em lote), reemitir, revogar, acompanhar status sobre `convites_status`.
- Vínculos: atribuir obstetra/medicina fetal, transferir, inativar.
- Equipe: gerenciar usuários `medica`/`secretaria`.

### W3 — Protocolo

- CRUD de `protocolo_itens` (janela `semana_ini`/`semana_fim`, trimestre, obrigatório, ordem).
- Edição não retroage sobre checklists já gerados — vale para gestações novas (ou versionamento simples).

### W4 — Mesa de trabalho da médica (web)

- Lista densa de pacientes com filtros (trimestre, vínculo, status) e ordenação por urgência.
- **Pré-requisito de backend**: regra de urgência no Postgres (view/função) compartilhada com o mobile.
- Cartão da gestante completo (dados, gestações, vínculos, consultas, checklist, documentos).
- Upload de PDF (laudos recebidos por e-mail) + fluxo rascunho → publicar com os mesmos gates (`publicado_em`, `comunicado_presencialmente`).

### W5 — Agenda da clínica

- Visão semanal/mensal, criar/reagendar/cancelar, marcar falta, filtro por médica. Faltas alimentam pendências.

### W6 — Auditoria + relatórios

- Viewer do `audit_log` (quem publicou/leu o quê).
- Relatórios operacionais: documentos publicados, faltas, checklists vencidos, convites pendentes; exportação CSV/PDF.

### W7 — Hardening + piloto web

- Revisão de RLS para os novos fluxos (sobretudo escopo `secretaria`); estender `supabase/tests/rls_smoke.sql`.
- Piloto: secretária + 1 médica usando o web em paralelo ao mobile.

## Sequenciamento vs. roadmap mobile

- W0 pode começar a qualquer momento; ideal sincronizar após a **Fase 3 mobile** (documentos estáveis).
- W2 destrava onboarding em volume → prioridade alta.
- W4 é a única com dependência externa (regra de urgência no Postgres, Fases 0/5 mobile).
- Toda mudança de schema exige migration compatível com **os dois clientes**.
