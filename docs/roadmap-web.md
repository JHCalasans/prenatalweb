# Roadmap web — Pré-Natal (administrativo + equipe médica)

## Premissas

- Repo próprio (este), app autenticado denso (tabelas/formulários/upload); **SSR/SEO irrelevantes**.
- Papéis: `secretaria` e `medica`; gestante **não** acessa o web.
- Backend = Supabase compartilhado com o mobile (Auth, Postgres, RLS, Storage) — policies existentes já valem para o web.
- Stack decidida: Angular 21 + PrimeNG 21 (última linha MIT) — ver [ADR 0001](adr/0001-decisao-de-stack-web.md) e [ADR 0002](adr/0002-licenca-primeng.md).
- Regras compartilhadas (ex.: urgência) vivem **no Postgres**, nunca duplicadas em Dart/TS.
- Mobile continua sendo a ferramenta do dia a dia da médica; o web é para administração e trabalho profundo (tela grande).

## Fases

### W0 — Fundação

- ~~Decisão de stack~~ — resolvida pelo ADR 0001.
- [x] Repo + scaffold Angular strict
- [x] Cliente Supabase + `database.types.ts` versionado (local em Docker, espelhando `prenatalapp`)
- [x] CI, lint (ESLint/Prettier) — workflow GitHub Actions com lint, typecheck, formatação e build em push/PR para `main`
- [x] Tokens do tema Aconchego adaptados para web (PrimeNG design tokens) — [docs/tema-aconchego.md](tema-aconchego.md)
- [x] Deploy de preview (build estático no GitHub Pages) + env de produção gerado em build (secrets `SUPABASE_URL`/`SUPABASE_ANON_KEY`)

### W1 — Auth + shell

- [x] Login Supabase com Reactive Forms e mensagens por motivo (credenciais, sem perfil, papel negado)
- [x] Sessão persistente restaurada no boot (`provideAppInitializer` → `AuthService.inicializar`)
- [x] Guards `sessaoGuard`/`deslogadoGuard` + fábrica `papelGuard(...)` (aplicada a partir da W2)
- [x] Layout base com sidebar, cabeçalho e logout
- [x] Sessão expirada devolve ao login com aviso e preserva a rota de retorno
- [x] Papel `secretaria` adicionado ao enum `papel_usuario` (migration no `prenatalapp`)

### W2 — Administração da clínica (secretaria)

- [x] RLS de escopo `secretaria`: `is_secretaria()` + policies de leitura em `pacientes`, `profiles` e `vinculos` (migration no `prenatalapp`)
- [x] Pacientes: lista com busca por nome/CPF, cadastro com médica responsável e edição — escrita fechada nas RPCs `criar_paciente_pela_secretaria` / `atualizar_paciente_pela_secretaria`
- [x] CPF normalizado para 11 dígitos com `check constraint` (migração dos dados existentes + ajuste de `criar_paciente_com_convite`)
- [x] Cenários 28–32 no `supabase/tests/rls_smoke.sql`
- [x] Convites: emitir e reemitir (`emitir_convite_pela_secretaria`), revogar pendente, emissão em lote e painel de situação (`convites_da_secretaria`)
- [x] Cenários 33–37 no `supabase/tests/rls_smoke.sql`
- [x] Vínculos: atribuir, transferir e encerrar no painel de `/pacientes/:id` — RPCs `atribuir_vinculo_pela_secretaria` / `transferir_vinculo_pela_secretaria` / `inativar_vinculo_pela_secretaria`, com o último vínculo ativo protegido
- [x] Cenários 38–41 no `supabase/tests/rls_smoke.sql`
- [x] Equipe: criar conta com senha provisória, trocar papel, redefinir senha e desativar/reativar — Edge Function `gerir-equipe` com verificação de papel no servidor

### W3 — Protocolo

- [x] CRUD de `protocolo_itens` em `/protocolo` (janela `semana_ini`/`semana_fim`, trimestre, obrigatório, ordem), restrito a `medica`
- [x] Versionamento por item: editar item já marcado aposenta a versão antiga e cria substituta na mesma `raiz_id`; `checklist_da_gestacao` escolhe uma versão por raiz
- [x] Cenários 42–46 no `supabase/tests/rls_smoke.sql`

### W4 — Mesa de trabalho da médica (web)

- [x] Regra de urgência no Postgres (`ig_semanas`, `trimestre_ig`, `janela_checklist`, `urgencia_score`); `painel_da_medica` devolve a classificação pronta e ordenada, e `urgencia.dart` deixou de existir no mobile
- [x] Lista densa de pacientes em `/mesa` com busca, filtros de trimestre e pendência, ordenada por urgência
- [x] Cenários 47–49 no `supabase/tests/rls_smoke.sql`
- [x] Cartão da gestante em `/mesa/:pacienteId`: dados, gestações, vínculos, consultas, checklist com janela classificada no Postgres e documentos em leitura; marcar item do checklist pela tela
- [x] `checklist_da_gestacao` devolve a coluna `janela` e `janelaPara` deixou de existir no Dart
- [x] Cenários 50–52 no `supabase/tests/rls_smoke.sql`
- [x] Upload de PDF/imagem de laudo no cartão da gestante: fluxo rascunho → upload → publicar com o gate de achado alterado (publicar exige confirmar `comunicado_presencialmente`); excluir rascunho, abrir arquivo em nova aba e leitura auditada (`log_documento_acesso`). Gestante segue vendo só o publicado; app Flutter inalterado.

### W5 — Agenda da clínica

- [x] RPCs da agenda no Postgres (`agenda_da_clinica`, `agendar_consulta`, `reagendar_consulta`, `cancelar_consulta`, `marcar_falta`) para secretaria e médica; o trigger `consultas_set_medica` passa a forçar o autor só quando quem insere é médica, e a secretaria agenda em nome da médica vinculada — ver [plano-w5-agenda.md](plano-w5-agenda.md)
- [x] Cenários 53–59 no `supabase/tests/rls_smoke.sql` (incluindo falta marcada pela web acendendo `faltou_sem_reagendar` no painel)
- [x] `/agenda`: tabela densa agrupada por dia com visão semanal/mensal, filtro por médica (secretaria) e por situação; criar, reagendar, cancelar e marcar falta. Registrar consulta como realizada continua só no mobile.

### W6 — Auditoria + relatórios

- [x] Viewer do `audit_log` em `/auditoria` — quem fez, o quê e sobre qual paciente ou item, com período obrigatório, filtros de ação/entidade e busca por quem agiu ou alvo; leitura restrita a `medica` via RPC `security definer` (`auditoria_da_clinica` + índice por data), cenários 60–62 no `supabase/tests/rls_smoke.sql` — ver [plano-w6-auditoria.md](plano-w6-auditoria.md)
- Relatórios operacionais: documentos publicados, faltas, checklists vencidos, convites pendentes; exportação CSV/PDF.

### W7 — Hardening + piloto web

- Revisão de RLS para os novos fluxos (sobretudo escopo `secretaria`); estender `supabase/tests/rls_smoke.sql`.
- Piloto: secretária + 1 médica usando o web em paralelo ao mobile.

## Sequenciamento vs. roadmap mobile

- W0 pode começar a qualquer momento; ideal sincronizar após a **Fase 3 mobile** (documentos estáveis).
- W2 destrava onboarding em volume → prioridade alta.
- W4 é a única com dependência externa (regra de urgência no Postgres, Fases 0/5 mobile).
- Toda mudança de schema exige migration compatível com **os dois clientes**.
