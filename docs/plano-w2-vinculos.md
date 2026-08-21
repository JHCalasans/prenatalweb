# Plano de Implementação: W2 (fatia 3) — Vínculos

## Objetivo

Na edição de uma paciente (`/pacientes/:id`), a secretaria pode consultar o histórico de
vínculos, atribuir uma médica com papel de obstetra ou medicina fetal, transferir um vínculo
ativo e encerrar um vínculo sem deixar a paciente sem médica responsável.

## Escopo

- RPCs de atribuição, inativação, transferência e listagem de vínculos.
- Cenários 38–41 no smoke de RLS.
- Tipos do banco regenerados no web.
- `VinculosService` com retorno discriminado e tratamento de erros das RPCs.
- Painel `PacienteVinculos` standalone dentro do formulário de edição.
- Testes do serviço e do painel.
- Roadmap web atualizado.

## Decisões

- A escrita continua fechada diretamente na tabela `public.vinculos`.
- Todas as mutações usam RPCs `security definer` com gate interno de secretaria e auditoria.
- Atribuir o mesmo trio reativa o vínculo existente por `on conflict`.
- O último vínculo ativo não pode ser encerrado.
- Transferência é atômica e preserva o papel do vínculo.
- A listagem inclui vínculos inativos, com ativos primeiro.
- Não há rota própria de vínculos; o painel vive em `/pacientes/:id`.

## Arquivos

### `prenatalapp`

- `supabase/migrations/20260820120900_vinculos_secretaria.sql`
- `supabase/tests/rls_smoke.sql`

### `prenatalweb`

- `src/types/database.types.ts`
- `src/app/core/vinculos/vinculos.service.ts`
- `src/app/core/vinculos/vinculos.service.spec.ts`
- `src/app/pages/pacientes/vinculos/paciente-vinculos.ts`
- `src/app/pages/pacientes/vinculos/paciente-vinculos.html`
- `src/app/pages/pacientes/vinculos/paciente-vinculos.scss`
- `src/app/pages/pacientes/vinculos/paciente-vinculos.spec.ts`
- `src/app/pages/pacientes/formulario/paciente-formulario.ts`
- `src/app/pages/pacientes/formulario/paciente-formulario.html`
- `src/app/pages/pacientes/formulario/paciente-formulario.spec.ts`
- `docs/roadmap-web.md`

## Verificação

- `npx supabase db reset`
- `psql ... -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke.sql`
- `npm run typecheck`
- `npm test -- --watch=false`
- `npm run lint`
- `npm run build`
- `npm run format:check`

## Fora do escopo

- Rota própria de vínculos.
- Policies de escrita para `authenticated`.
- Alterações nas RPCs existentes de pacientes ou convites.
- Gestão de equipe, convites, protocolo e agenda.
- Dependências npm novas.
