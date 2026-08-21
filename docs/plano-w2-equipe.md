# Plano de Implementação: W2 (fatia 4) — Equipe

## Objetivo

Em `/equipe`, a secretaria pode listar contas de `medica` e `secretaria`, criar contas com senha
provisória mostrada uma única vez, trocar papéis, redefinir senhas e desativar ou reativar contas.

## Escopo

- Edge Function `gerir-equipe` com as ações `listar`, `criar`, `alterar_papel`, `redefinir_senha`,
  `desativar` e `reativar`.
- Verificação explícita de sessão e de `profiles.papel = 'secretaria'` no servidor.
- Criação e promoção de contas usando a service role apenas na Edge Function.
- `EquipeService` sobre `supabase.functions.invoke`, com mensagem de erro do corpo da resposta.
- Tela `/equipe` com listagem, criação, troca de papel, redefinição de senha e ativação/desativação.
- Rota protegida por `papelGuard('secretaria')` e item condicional na sidebar.
- Testes unitários do serviço e da tela.
- Roadmap web atualizado.

## Decisões

- A service role nunca chega ao navegador; operações administrativas rodam na Edge Function.
- `verify_jwt = true` é explícito, e o papel de secretaria é conferido dentro da função.
- Senhas provisórias têm 24 caracteres base64url derivados de 18 bytes aleatórios e são devolvidas
  somente na resposta de criação ou redefinição.
- A última secretaria ativa não pode ser rebaixada ou desativada.
- A própria conta não pode ter o papel alterado nem ser desativada.
- Contas desativadas usam `ban_duration`, sem coluna nova em `profiles`.
- São aceitos somente os papéis `medica` e `secretaria`.

## Arquivos

### `prenatalapp`

- `supabase/functions/gerir-equipe/index.ts`
- `supabase/config.toml`

### `prenatalweb`

- `src/app/core/equipe/equipe.service.ts`
- `src/app/core/equipe/equipe.service.spec.ts`
- `src/app/pages/equipe/lista/equipe-lista.ts`
- `src/app/pages/equipe/lista/equipe-lista.html`
- `src/app/pages/equipe/lista/equipe-lista.scss`
- `src/app/pages/equipe/lista/equipe-lista.spec.ts`
- `src/app/app.routes.ts`
- `src/app/layout/shell/shell.html`
- `docs/roadmap-web.md`

## Verificação

- `deno check supabase/functions/gerir-equipe/index.ts`
- Chamada sem token à função, esperando 401.
- `npm run typecheck`
- `npm run lint`
- `npm test -- --watch=false`
- `npm run build`
- `npm run format:check`
- Verificação manual com secretaria e médica no stack local, quando houver credenciais de teste.

## Fora do escopo

- Troca de senha pelo próprio usuário e fluxo de recuperação, previstos para W7.
- SMTP e `inviteUserByEmail`.
- Alterações em `handle_new_user`, RPCs de promoção ou policies existentes.
- Contas com papel `paciente`.
- Coluna `ativo` em `profiles`.
- Dependências npm novas.
