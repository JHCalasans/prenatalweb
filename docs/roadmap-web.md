# Roadmap web — Pré-Natal (administrativo + equipe médica)

## Premissas

- Repo próprio (este), app autenticado denso (tabelas/formulários/upload); **SSR/SEO irrelevantes**.
- Papéis: `secretaria`, `medica` e, desde a W10, `admin`; gestante **não** acessa o web.
- Backend = Supabase compartilhado com o mobile (Auth, Postgres, RLS, Storage) — policies existentes já valem para o web.
- Stack decidida: Angular 21 + PrimeNG 21 (última linha MIT) — ver [ADR 0001](adr/0001-decisao-de-stack-web.md) e [ADR 0002](adr/0002-licenca-primeng.md).
- Regras compartilhadas (ex.: urgência) vivem **no Postgres**, nunca duplicadas em Dart/TS.
- Mobile continua sendo a ferramenta do dia a dia da médica; o web é para administração e trabalho profundo (tela grande). Desde o [ADR 0006](adr/0006-prontuario-obstetrico.md), a evolução clínica é registrada nos dois clientes.

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
- [x] Relatórios operacionais em `/relatorios`: documentos publicados e faltas por período, checklists vencidos e convites pendentes como retrato de agora — uma RPC `security definer` por relatório, com a secretaria vendo faltas e convites e a médica vendo os quatro; exportação CSV (separador `;` e BOM, para o Excel pt-BR) e impressão do navegador com folha `@media print`, sem dependência nova. Cenários 63–66 no `supabase/tests/rls_smoke.sql` — ver [plano-w6-relatorios.md](plano-w6-relatorios.md)

### W7 — Hardening + piloto web

- [x] Revisão de RLS para os novos fluxos (sobretudo escopo `secretaria`) — migration `20260830120000_hardening_w7.sql` no `prenatalapp`: grants de escrita fechados em `documentos` (escrita só por RPC), `gestacoes` (insert do mobile mantido, update/delete fechados) e `pacientes` (update nas quatro colunas de cadastro, delete fechado); gate em `log_documento_acesso`; vínculo nos relatórios clínicos; e `truncate`/`trigger`/`references` revogados de `anon`/`authenticated` em todo o schema (sobra do `grant all` do setup padrão — `truncate` não passa por RLS). Cenários 67–71 no `supabase/tests/rls_smoke.sql` + CORS nas Edge Functions + módulo único de erro do web com sessão expirada — ver [plano-w7-hardening.md](plano-w7-hardening.md) e [ADR 0003](adr/0003-escopo-de-leitura-da-equipe.md)
- Piloto: secretária + 1 médica usando o web em paralelo ao mobile. Depende de um projeto Supabase hospedado, que ainda não existe. Pendências que o bloqueiam:
  - Runbook de produção: criar a primeira conta, publicar migrations e Edge Functions, recuperar acesso da secretária — hoje sem SMTP e sem signup isso é lockout da clínica.
  - Staging separado de `main`.
  - Telemetria/Sentry (decidir junto com o piloto).
  - Endurecer `handle_new_user` contra `raw_user_meta_data.paciente_id` forjado (contido hoje por `enable_signup = false`; a correção óbvia quebraria a troca de celular — precisa de desenho próprio).
  - Ajustes de auth no projeto hospedado: `minimum_password_length = 6`, sem `inactivity_timeout`, `site_url` em localhost.

### W8 — Paridade da médica no web

- [x] RPCs `criar_gestacao` e `atualizar_gestacao` no Postgres (migration `20260831120000_gestacao_web.sql` no `prenatalapp`): gate de papel + vínculo, validações de origem/intervalo com mensagem própria (DUM até 300 dias atrás; DPP USG entre −60 e +300 dias), segunda gestação ativa recusada antes do índice único, auditoria `gestacao.criada`/`gestacao.atualizada` com `de`/`para`; insert direto em `gestacoes` revogado e policy `gestacoes_insert_medica` derrubada — ver [plano-w8-paridade-medica.md](plano-w8-paridade-medica.md) e [ADR 0003](adr/0003-escopo-de-leitura-da-equipe.md)
- [x] Cenários 69 (reescrito) e 72–77 no `supabase/tests/rls_smoke.sql`; `GestacaoRepository.criarGestacao` do Flutter migrado para a RPC (nenhuma tela muda)
- [x] Cartão da gestante: painel de gestações com **Nova gestação**, **Editar** (corrige DUM/DPP/tipo; `dpp_final` e o checklist se recalculam no banco) e **Encerrar** com desfecho tipado; **Registrar** consulta realizada/faltou/cancelada na tabela de consultas
- [x] Agenda: ação **Realizada** em consulta agendada vencida, visível apenas à médica (`marcar_consulta`; faltou/cancelar seguem como estavam)
- [x] Cadastro de paciente pela médica em `/mesa/nova` via `criar_paciente_com_convite`, com componente `CodigoConvite` (código exibido uma única vez, com cópia) e **Reemitir convite** no cartão

### W9 — Gestação pela secretaria

- [x] RPCs no Postgres (migration `20260901120000_gestacao_pela_secretaria.sql` no `prenatalapp`): `criar_gestacao_pela_secretaria` (exige vínculo ativo, fixa origem `dum` e tipo `unica` no servidor), `atualizar_dum_pela_secretaria` (só em gestação ativa com origem `dum`) e `gestacao_ativa_da_paciente` (projeção sem desfecho, para secretaria e médica vinculada); validação de datas extraída para `validar_dados_gestacao` e reusada pelas quatro RPCs; auditoria reusa `gestacao.criada`/`gestacao.atualizada` com `por: 'secretaria'` — ver [plano-w9-gestacao-pela-secretaria.md](plano-w9-gestacao-pela-secretaria.md) e [ADR 0004](adr/0004-cadastro-da-gestacao-pela-secretaria.md)
- [x] Cenários 78–83 no `supabase/tests/rls_smoke.sql` (incluindo o destravamento do `agendar_consulta`, a recusa após DPP por ultrassom e o insert direto em `gestacoes` seguindo fechado)
- [x] Bloco de gestação na ficha da paciente (`/pacientes/:id`, componente `PacienteGestacao`): cadastrar por DUM quando não há gestação ativa, ver DUM/DPP prevista e corrigir a DUM quando a origem é `dum`, modo leitura quando a origem é `usg`
- [x] Cadastro inline no diálogo de nova consulta da `/agenda`: quando a paciente escolhida não tem gestação ativa, a secretaria informa a DUM e a gestação é criada antes de agendar; a médica recebe aviso com link para o cartão

### W10 — Perfil de administração

- [x] Papel `admin` no enum `papel_usuario` (migration `20260902120000_papel_admin.sql` no `prenatalapp`), helper `is_admin()`, `promover_para_admin` com gate de service role e runbook no README, e policy `profiles_select_admin` (a única policy nova) — migration `20260902120100_perfil_admin.sql`
- [x] Gates alargados para o admin nas RPCs de convite (`convites_da_secretaria`, `emitir_convite_pela_secretaria`, `revogar_convite_pela_secretaria`, `emitir_convites_em_lote`), na auditoria (`acoes_auditadas`, `auditoria_da_clinica`) e nos dois relatórios operacionais; `relatorio_faltas` e `relatorio_convites_pendentes` **saem da secretaria** no gate, não só no menu
- [x] Edge Function `gerir-equipe`: ator passa a ser o admin, papel `admin` criável, trava de lockout muda de "última secretaria" para "último admin"
- [x] Cenários 84–92 no `supabase/tests/rls_smoke.sql` (o que o admin lê e o que **não** alcança: agenda, relatório clínico e escrita da secretaria; cenários 60/63/65/66 atualizados para a nova fronteira)
- [x] Front: `PapelEquipe` com três valores e `rotuloPapel` como `Record` (trava de compilação), guards das rotas, menu do shell orientado a dados, home do admin sem agenda/mesa com atalhos administrativos, relatórios por papel (filtro por médica agora é do admin) e seletor de papel de `/equipe` com os três papéis — ver [ADR 0005](adr/0005-perfil-admin.md) e a emenda da W10 no [ADR 0003](adr/0003-escopo-de-leitura-da-equipe.md)

### W11+ — Prontuário obstétrico

Decisões em [ADR 0006](adr/0006-prontuario-obstetrico.md): evolução sempre ligada à gestação, rascunho → assinada imutável, retificação por versão na mesma `raiz_id`, assinatura eletrônica com CRM e `conteudo_hash`, rascunho local cifrado no mobile e gestante vendo só as medidas da caderneta.

- [x] W11 — Evolução de pré-natal: tabela `evolucoes` sem policy (leitura e escrita só por RPC), trava de imutabilidade, retificação por versão na mesma `raiz_id`, assinatura com CRM/UF, IG congelada e `conteudo_hash`, `prontuario.aberto` auditado com janela de 10 min e `definir_crm` exclusivo do admin (migration `20261001120000_prontuario_evolucao.sql` no `prenatalapp`, cenários 93–104); bloco **Prontuário** no cartão `/mesa/:pacienteId` com autosave, conflito entre aparelhos, assinatura e retificação; CRM em `/equipe`; no app, editor com rascunho cifrado no aparelho e sincronização, e **Minha caderneta** para a gestante — ver [plano-w11-evolucao-prenatal.md](plano-w11-evolucao-prenatal.md). O mobile só vai ao piloto depois da biometria (Fase 7 do app)
- [x] W12 — Anamnese, antecedentes e classificação de risco gestacional: tabelas `anamneses` (na paciente) e `riscos_gestacionais` (na gestação) append-only, sem policy e com trigger de imutabilidade; ficha versionada com concorrência por versão, gravada pela médica vinculada **e pela secretaria** com leitura auditada (`anamnese.aberta`); risco só da médica, com motivo obrigatório no alto risco e fatores sugeridos pelo Postgres (`fatores_risco_sugeridos`, regras provisórias a validar com as médicas) congelados na classificação; gestante vê tipagem e alergias na caderneta (`minha_ficha_essencial`). Migration `20261002120000_anamnese_risco.sql` no `prenatalapp`, cenários 105–116. No web: bloco **Anamnese** em `/pacientes/:id` e bloco **Anamnese e risco** no cartão com faixa de alertas; no app: card no cartão da paciente, ficha e classificação de risco — ver [ADR 0007](adr/0007-anamnese-pela-secretaria.md) e [plano-w12-anamnese-risco.md](plano-w12-anamnese-risco.md)
  - Pendência: alto risco na regra de urgência (`urgencia_score`/`painel_da_medica`) — validar o peso com as médicas
- [ ] W13 — Exames estruturados e vacinas
- [ ] W14 — Linha do tempo e curvas AU × IG e peso × IMC
- [ ] W15 — Prescrição e atestado
- [ ] W16 — Assinatura ICP-Brasil

## Sequenciamento vs. roadmap mobile

- W0 pode começar a qualquer momento; ideal sincronizar após a **Fase 3 mobile** (documentos estáveis).
- W2 destrava onboarding em volume → prioridade alta.
- W4 é a única com dependência externa (regra de urgência no Postgres, Fases 0/5 mobile).
- Toda mudança de schema exige migration compatível com **os dois clientes**.
