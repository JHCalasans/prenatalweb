# Plano de Implementação: W1 — Auth + shell

## 1. Objetivo

Ao final, a equipe da clínica entra no web com e-mail e senha do Supabase, a sessão sobrevive a recarregamentos da página, rotas internas são inacessíveis sem sessão válida, e o usuário navega dentro de um layout com sidebar e botão de sair. Gestantes (papel `paciente`) são barradas no login com mensagem explícita. Sessão expirada devolve o usuário ao login com aviso, preservando a rota que ele tentava acessar.

## 2. Contexto atual

O repo está no fim da W0. O que existe hoje:

| Arquivo                                  | Estado                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/app.routes.ts`                  | Só `login`; `''` e `**` redirecionam para `login`                                                                                 |
| `src/app/app.ts` / `app.html`            | Casca com `<router-outlet />` apenas                                                                                              |
| `src/app/app.config.ts`                  | `provideRouter` + `providePrimeNG` com o preset Aconchego                                                                         |
| `src/app/core/supabase-client.ts`        | `InjectionToken` `SUPABASE_CLIENT` com `createClient<Database>`                                                                   |
| `src/app/pages/login/login.ts`           | Chama `signInWithPassword`, guarda `erro`/`enviando` em signals, **não redireciona** (comentário na linha 32 aponta para esta W1) |
| `src/app/core/theme/aconchego.preset.ts` | Design tokens PrimeNG                                                                                                             |
| `src/styles.scss`                        | Variáveis `--aconchego-*`, gradiente de fundo, `.cartao-vidro`                                                                    |
| `src/types/database.types.ts`            | Tipos gerados; `profiles.papel` é `Database['public']['Enums']['papel_usuario']`                                                  |

Backend (repo separado `~/Documents/VoidSans/prenatalapp/supabase/`):

- `migrations/20260808193116_init_schema.sql:16` — `create type public.papel_usuario as enum ('paciente', 'medica');` e o comentário da linha 9: _"Não existem os papéis secretaria/admin."_
- `profiles` (linha 34): `id uuid pk references auth.users`, `nome`, `papel`, `telefone`, timestamps.
- Policy `profiles_select_own_or_linked` (linha 532): sempre permite `id = auth.uid()` — **ler o próprio perfil já funciona para qualquer papel**, sem policy nova.
- `public.promover_para_medica(uuid, text)` (linha ~465): gate interno por `request.jwt.claims ->> 'role' = 'service_role'`.
- Postgres 17 (`config.toml:36`).

Três defeitos reais encontrados na investigação, corrigidos por este plano:

1. `src/app/pages/login/login.scss` usa `var(--aconchego-perigo)`, que **não existe**; `src/styles.scss` define `--aconchego-erro`. A mensagem de erro do login herda a cor do texto em vez de vermelho.
2. `tsconfig.json` **não** tem `"strict": true` nem `strictTemplates`, apesar do roadmap marcar "scaffold Angular strict" como concluído.
3. `README.md` afirma que "A home é um showcase vivo do tema", mas não existe rota de home.

## 3. Escopo

**Dentro:**

- Migration adicionando `secretaria` ao enum `papel_usuario` + função `promover_para_secretaria`, no repo `prenatalapp`.
- Regeneração de `src/types/database.types.ts`.
- `AuthService` com signals de sessão e perfil, restauração no boot, logout e detecção de expiração.
- Guards `sessaoGuard`, `deslogadoGuard` e fábrica `papelGuard(...)`.
- Shell com sidebar, cabeçalho e logout; página `/inicio` placeholder; página `/sem-acesso`.
- Login migrado para Reactive Forms, com redirecionamento e mensagens de erro por motivo.
- Ligar `strict` no TypeScript; corrigir o token de cor quebrado.
- Testes unitários de service, guards e login.

**Fora:**

- Policies de RLS para o escopo `secretaria` (fica na W2/W7). Nesta W1 uma secretaria loga e vê apenas o próprio perfil — comportamento esperado, não bug.
- Qualquer CRUD de pacientes, convites, vínculos ou equipe (W2).
- Recuperação de senha, cadastro de usuário, MFA.
- Testes E2E com Playwright.

## 4. Decisões técnicas

| Decisão                               | Escolha                                                     | Motivo                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Papel `secretaria`                    | Migration agora no `prenatalapp`                            | Roadmap e ADR 0001 exigem guard por `secretaria`/`medica`; sem o valor no enum o guard seria ficção                                  |
| Enum + função em migrations separadas | Dois arquivos                                               | `ALTER TYPE ... ADD VALUE` não permite **usar** o valor novo na mesma transação; a CLI roda cada arquivo em transação                |
| Gate da função de promoção            | Checagem interna do JWT, **sem `revoke execute`**           | `init_schema.sql:386-389` documenta que `revoke execute` causa segfault no PG17/ARM64 da imagem local e vira vetor de DoS via `/rpc` |
| Restauração de sessão                 | `provideAppInitializer` que aguarda `getSession()` + perfil | Torna os guards síncronos (lêem signal) em vez de assíncronos com race no primeiro load                                              |
| Callback do `onAuthStateChange`       | Síncrono, só escreve signals                                | Chamar métodos do supabase-js dentro do callback causa deadlock conhecido; o perfil é buscado em `inicializar()`/`entrar()`          |
| Bloqueio de `paciente`                | `signOut()` imediato no login + mensagem                    | Web é ferramenta de equipe; deixar a sessão viva daria acesso via API mesmo sem UI                                                   |
| Estado de auth                        | `signal` + `computed` em serviço `providedIn: 'root'`       | ADR 0001: "Signals + serviços por feature (sem NgRx)"                                                                                |
| Formulário de login                   | Reactive Forms (`NonNullableFormBuilder`)                   | ADR 0001 define Reactive Forms; padroniza antes das telas densas da W2                                                               |
| Redirecionamento pós-login            | Query param `retorno`, **validado**                         | `retorno` vindo da URL é vetor de open redirect; só caminhos internos são aceitos                                                    |
| Navegação da sidebar                  | `<nav>` + `routerLink` + `p-button`                         | Menos superfície que `p-menu` para um shell com um item só; troca por `p-menu` cabe na W2                                            |
| `strict` do TypeScript                | Ligar nesta W1                                              | Código de auth vive de `Session                                                                                                      | null`e`Perfil | null`; sem `strictNullChecks` os bugs aparecem só em runtime |

## 5. Pré-requisitos

- Docker rodando, com o stack local do Supabase do `prenatalapp` disponível.
- Supabase CLI via `npx supabase` (já usado no projeto).
- Nenhuma dependência npm nova: `@angular/forms`, `@angular/router`, `primeng` e `@supabase/supabase-js` já estão no `package.json`.

## 6. Etapas

### Etapa 1 — Ligar `strict` no TypeScript

**Depende de:** nenhuma
**Arquivos:** `tsconfig.json` (editar)
**O que fazer:** adicionar `"strict": true` em `compilerOptions` e `"strictTemplates": true` em `angularCompilerOptions`.

```jsonc
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
```

```jsonc
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  },
```

**Validação:**

```bash
npm run typecheck
```

Espera-se saída vazia e código 0. Se aparecer erro, ele estará em `src/app/pages/login/login.ts`, `src/app/app.ts` ou `src/app/core/supabase-client.ts` — corrija tipando explicitamente, sem desligar a flag.

---

### Etapa 2 — Adicionar `secretaria` ao enum `papel_usuario`

**Depende de:** nenhuma
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120000_papel_secretaria.sql` (criar)
**O que fazer:** criar a migration contendo apenas o `ALTER TYPE`. Não referencie o valor novo neste arquivo.

```sql
-- W1 do web: papel da equipe administrativa. O enum nasceu só com
-- paciente/medica; a secretaria administra pacientes, convites e vínculos.
-- O valor novo não pode ser USADO na mesma transação que o adiciona, por isso
-- a função de promoção vive na migration seguinte.
alter type public.papel_usuario add value if not exists 'secretaria';
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset
```

Espera-se que o reset conclua sem erro. Confirme o enum:

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select unnest(enum_range(null::public.papel_usuario));"
```

Saída esperada: três linhas — `paciente`, `medica`, `secretaria`.

---

### Etapa 3 — Função `promover_para_secretaria`

**Depende de:** Etapa 2
**Arquivos:** `~/Documents/VoidSans/prenatalapp/supabase/migrations/20260820120100_promover_secretaria.sql` (criar)
**O que fazer:** espelhar `promover_para_medica`, trocando o papel. O gate é a checagem interna do JWT — **não** adicione `revoke execute`, pelo motivo documentado em `init_schema.sql:386-389`.

```sql
-- Espelha public.promover_para_medica. O acesso é restringido pelo gate
-- interno (role do JWT), NÃO por `revoke execute` — ver comentário em
-- 20260808193116_init_schema.sql sobre o segfault do PG17/ARM64.
create or replace function public.promover_para_secretaria(
  p_user_id uuid,
  p_nome text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb ->> 'role';

  if v_role is distinct from 'service_role' then
    raise exception 'Promoção a secretaria é exclusiva do backend';
  end if;

  update public.profiles
     set papel = 'secretaria',
         nome = coalesce(nullif(btrim(p_nome), ''), nome),
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'Profile % não encontrado', p_user_id;
  end if;

  delete from public.pacientes where profile_id = p_user_id;
end;
$$;
```

**Validação:**

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select proname from pg_proc where proname = 'promover_para_secretaria';"
```

Saída esperada: uma linha com `promover_para_secretaria`.

---

### Etapa 4 — Regenerar os tipos do banco

**Depende de:** Etapa 3
**Arquivos:** `src/types/database.types.ts` (regerar)
**O que fazer:** com o stack local de pé, regerar o arquivo de tipos do web.

```bash
cd ~/Documents/VoidSans/prenatalapp && npx supabase start && npx supabase gen types typescript --local > ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

**Validação:**

```bash
grep -n 'papel_usuario' ~/Documents/VoidSans/prenatalweb/src/types/database.types.ts
```

Espera-se encontrar `papel_usuario: "paciente" | "medica" | "secretaria"` na seção `Enums` e `papel_usuario: ["paciente", "medica", "secretaria"]` na constante do fim do arquivo.

---

### Etapa 5 — Tipos e helpers de papel

**Depende de:** Etapa 4
**Arquivos:** `src/app/core/auth/papel.ts` (criar)

```ts
import { Database } from '../../../types/database.types';

export type PapelUsuario = Database['public']['Enums']['papel_usuario'];

// Papéis com acesso ao web. `paciente` usa o app mobile.
export type PapelEquipe = Extract<PapelUsuario, 'medica' | 'secretaria'>;

export const PAPEIS_EQUIPE: readonly PapelEquipe[] = ['medica', 'secretaria'];

export function ehPapelEquipe(papel: PapelUsuario): papel is PapelEquipe {
  return (PAPEIS_EQUIPE as readonly PapelUsuario[]).includes(papel);
}

export function rotuloPapel(papel: PapelEquipe): string {
  return papel === 'medica' ? 'Médica' : 'Secretaria';
}
```

**Validação:**

```bash
npm run typecheck
```

Saída vazia, código 0. Se `Extract<...>` resolver para `never`, a Etapa 4 não foi aplicada.

---

### Etapa 6 — `AuthService`

**Depende de:** Etapa 5
**Arquivos:** `src/app/core/auth/auth.service.ts` (criar)
**O que fazer:** serviço root com sessão e perfil em signals, restauração no boot, login com validação de papel, logout e detecção de expiração.

```ts
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ehPapelEquipe, PapelEquipe } from './papel';

type PerfilRow = Database['public']['Tables']['profiles']['Row'];

export type Perfil = Pick<PerfilRow, 'id' | 'nome'> & { papel: PapelEquipe };

export type MotivoFalha = 'credenciais' | 'sem_perfil' | 'papel_negado';

export type ResultadoLogin = { ok: true } | { ok: false; motivo: MotivoFalha; mensagem: string };

const MENSAGENS: Record<MotivoFalha, string> = {
  credenciais: 'E-mail ou senha inválidos.',
  sem_perfil: 'Esta conta não tem perfil na clínica. Procure a administração.',
  papel_negado: 'Acesso restrito à equipe da clínica. Gestantes usam o aplicativo.',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly router = inject(Router);

  private readonly sessaoSig = signal<Session | null>(null);
  private readonly perfilSig = signal<Perfil | null>(null);
  private saidaIntencional = false;

  readonly sessao = this.sessaoSig.asReadonly();
  readonly perfil = this.perfilSig.asReadonly();
  readonly autenticado = computed(() => this.sessaoSig() !== null && this.perfilSig() !== null);
  readonly papel = computed<PapelEquipe | null>(() => this.perfilSig()?.papel ?? null);

  async inicializar(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    if (data.session) {
      const perfil = await this.carregarPerfil(data.session.user.id);
      if (perfil) {
        this.sessaoSig.set(data.session);
        this.perfilSig.set(perfil);
      } else {
        await this.supabase.auth.signOut();
      }
    }

    // Callback síncrono de propósito: chamar o supabase-js aqui trava o cliente.
    this.supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) {
        this.sessaoSig.set(sessao);
        return;
      }
      const tinhaSessao = this.sessaoSig() !== null;
      this.sessaoSig.set(null);
      this.perfilSig.set(null);
      if (tinhaSessao && !this.saidaIntencional) {
        void this.router.navigate(['/login'], { queryParams: { expirada: 1 } });
      }
      this.saidaIntencional = false;
    });
  }

  async entrar(email: string, senha: string): Promise<ResultadoLogin> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error || !data.session) {
      return { ok: false, motivo: 'credenciais', mensagem: MENSAGENS.credenciais };
    }

    const perfil = await this.carregarPerfil(data.session.user.id);
    if (!perfil) {
      await this.descartarSessao();
      const motivo: MotivoFalha = 'sem_perfil';
      return { ok: false, motivo, mensagem: MENSAGENS.sem_perfil };
    }

    this.sessaoSig.set(data.session);
    this.perfilSig.set(perfil);
    return { ok: true };
  }

  async sair(): Promise<void> {
    this.saidaIntencional = true;
    await this.supabase.auth.signOut();
    this.sessaoSig.set(null);
    this.perfilSig.set(null);
    await this.router.navigate(['/login']);
  }

  // Perfil de `paciente` é tratado como ausência de acesso: a sessão é
  // descartada antes de qualquer navegação para não sobrar token válido.
  private async carregarPerfil(userId: string): Promise<Perfil | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, nome, papel')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data || !ehPapelEquipe(data.papel)) {
      return null;
    }
    return { id: data.id, nome: data.nome, papel: data.papel };
  }

  private async descartarSessao(): Promise<void> {
    this.saidaIntencional = true;
    await this.supabase.auth.signOut();
    this.sessaoSig.set(null);
    this.perfilSig.set(null);
  }
}
```

Nota sobre a mensagem de `papel_negado`: `carregarPerfil` colapsa "sem perfil" e "papel não-equipe" em `null`. Para distinguir os dois no login, a Etapa 6b ajusta isso.

**Validação:**

```bash
npm run typecheck
```

---

### Etapa 6b — Distinguir "sem perfil" de "papel negado"

**Depende de:** Etapa 6
**Arquivos:** `src/app/core/auth/auth.service.ts` (editar)
**O que fazer:** trocar `carregarPerfil` por uma versão que devolve o motivo, e ajustar os dois chamadores.

Substitua o método `carregarPerfil` por:

```ts
  private async carregarPerfil(
    userId: string,
  ): Promise<{ ok: true; perfil: Perfil } | { ok: false; motivo: MotivoFalha }> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, nome, papel')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, motivo: 'sem_perfil' };
    }
    if (!ehPapelEquipe(data.papel)) {
      return { ok: false, motivo: 'papel_negado' };
    }
    return { ok: true, perfil: { id: data.id, nome: data.nome, papel: data.papel } };
  }
```

Em `inicializar`, substitua o bloco `if (data.session) { ... }` por:

```ts
if (data.session) {
  const resultado = await this.carregarPerfil(data.session.user.id);
  if (resultado.ok) {
    this.sessaoSig.set(data.session);
    this.perfilSig.set(resultado.perfil);
  } else {
    this.saidaIntencional = true;
    await this.supabase.auth.signOut();
  }
}
```

Em `entrar`, substitua o bloco do perfil por:

```ts
const resultado = await this.carregarPerfil(data.session.user.id);
if (!resultado.ok) {
  await this.descartarSessao();
  return { ok: false, motivo: resultado.motivo, mensagem: MENSAGENS[resultado.motivo] };
}

this.sessaoSig.set(data.session);
this.perfilSig.set(resultado.perfil);
return { ok: true };
```

**Validação:**

```bash
npm run typecheck && npm run lint
```

Ambos sem erro.

---

### Etapa 7 — Guards

**Depende de:** Etapa 6b
**Arquivos:** `src/app/core/auth/auth.guard.ts` (criar)

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PapelEquipe } from './papel';

export const sessaoGuard: CanActivateFn = (_rota, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { retorno: estado.url } });
};

export const deslogadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.autenticado() ? router.createUrlTree(['/inicio']) : true;
};

export function papelGuard(...papeis: readonly PapelEquipe[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const papel = auth.papel();
    if (papel !== null && papeis.includes(papel)) {
      return true;
    }
    return router.createUrlTree(['/sem-acesso']);
  };
}
```

`papelGuard` não é aplicado a nenhuma rota nesta W1 (não há tela específica de papel ainda) — fica coberto por teste e pronto para a W2.

**Validação:**

```bash
npm run typecheck
```

---

### Etapa 8 — Registrar a inicialização da sessão

**Depende de:** Etapa 6b
**Arquivos:** `src/app/app.config.ts` (editar)
**O que fazer:** adicionar `provideAppInitializer` que aguarda `AuthService.inicializar()`, garantindo que os guards já leiam o estado resolvido no primeiro load.

Adicione aos imports:

```ts
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { AuthService } from './core/auth/auth.service';
```

E inclua no array `providers`, logo depois de `provideRouter(routes)`:

```ts
    provideAppInitializer(() => inject(AuthService).inicializar()),
```

**Validação:**

```bash
npm run typecheck && npm run build
```

Build conclui sem erro.

---

### Etapa 9 — Página `/sem-acesso`

**Depende de:** Etapa 1
**Arquivos:** `src/app/pages/sem-acesso/sem-acesso.ts`, `sem-acesso.html`, `sem-acesso.scss` (criar)

`sem-acesso.ts`:

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  imports: [ButtonModule, RouterLink],
  selector: 'app-sem-acesso',
  styleUrl: './sem-acesso.scss',
  templateUrl: './sem-acesso.html',
})
export class SemAcesso {}
```

`sem-acesso.html`:

```html
<main class="sem-acesso">
  <section class="cartao-vidro cartao">
    <h1>Sem acesso</h1>
    <p>Seu perfil não tem permissão para esta área do sistema.</p>
    <p-button label="Voltar ao início" routerLink="/inicio" />
  </section>
</main>
```

`sem-acesso.scss`:

```scss
.sem-acesso {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.cartao {
  width: min(100%, 28rem);
  padding: 2.25rem 2rem;
  text-align: center;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--aconchego-texto-primario);
}

p {
  margin: 0 0 1.25rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}
```

**Validação:** coberta pela Etapa 12.

---

### Etapa 10 — Shell com sidebar

**Depende de:** Etapa 6b
**Arquivos:** `src/app/layout/shell/shell.ts`, `shell.html`, `shell.scss` (criar)

`shell.ts`:

```ts
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { rotuloPapel } from '../../core/auth/papel';

@Component({
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-shell',
  styleUrl: './shell.scss',
  templateUrl: './shell.html',
})
export class Shell {
  private readonly auth = inject(AuthService);

  protected readonly perfil = this.auth.perfil;
  protected readonly papelRotulo = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? '' : rotuloPapel(papel);
  });

  protected async sair(): Promise<void> {
    await this.auth.sair();
  }
}
```

`shell.html`:

```html
<div class="shell">
  <aside class="barra">
    <p class="marca">Pré-Natal</p>
    <nav>
      <a routerLink="/inicio" routerLinkActive="ativo">
        <i class="pi pi-home" aria-hidden="true"></i>
        <span>Início</span>
      </a>
    </nav>
  </aside>

  <div class="area">
    <header class="topo">
      <div class="usuario">
        <strong>{{ perfil()?.nome }}</strong>
        <small>{{ papelRotulo() }}</small>
      </div>
      <p-button label="Sair" icon="pi pi-sign-out" severity="secondary" (onClick)="sair()" />
    </header>

    <main class="conteudo">
      <router-outlet />
    </main>
  </div>
</div>
```

`shell.scss`:

```scss
:host {
  display: block;
  min-height: 100dvh;
}

.shell {
  display: grid;
  grid-template-columns: 15rem 1fr;
  min-height: 100dvh;
}

.barra {
  padding: 1.5rem 1rem;
  background: rgb(255 255 255 / 65%);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgb(255 255 255 / 60%);
}

.marca {
  margin: 0 0 1.5rem;
  padding-left: 0.75rem;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--aconchego-link);
}

nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  a {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border-radius: 12px;
    font-weight: 700;
    text-decoration: none;
    color: var(--aconchego-texto-secundario);

    &:hover {
      background: rgb(255 255 255 / 70%);
    }

    &.ativo {
      background: rgb(255 255 255 / 90%);
      color: var(--aconchego-texto-primario);
    }
  }
}

.area {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem;
}

.usuario {
  display: flex;
  flex-direction: column;
  line-height: 1.2;

  strong {
    font-weight: 800;
    color: var(--aconchego-texto-primario);
  }

  small {
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--aconchego-texto-secundario);
  }
}

.conteudo {
  flex: 1;
  padding: 0 1.5rem 1.5rem;
  min-width: 0;
}

@media (width <= 60rem) {
  .shell {
    grid-template-columns: 1fr;
  }

  .barra {
    border-right: none;
    border-bottom: 1px solid rgb(255 255 255 / 60%);
  }
}
```

**Validação:** coberta pela Etapa 12.

---

### Etapa 11 — Página `/inicio`

**Depende de:** Etapa 6b
**Arquivos:** `src/app/pages/inicio/inicio.ts`, `inicio.html`, `inicio.scss` (criar)

`inicio.ts`:

```ts
import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { rotuloPapel } from '../../core/auth/papel';

@Component({
  imports: [],
  selector: 'app-inicio',
  styleUrl: './inicio.scss',
  templateUrl: './inicio.html',
})
export class Inicio {
  private readonly auth = inject(AuthService);

  protected readonly perfil = this.auth.perfil;
  protected readonly papelRotulo = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? '' : rotuloPapel(papel);
  });
}
```

`inicio.html`:

```html
<section class="cartao-vidro cartao">
  <p class="eyebrow">Início</p>
  <h1>Olá, {{ perfil()?.nome }}</h1>
  <p class="subtitulo">Você está conectada como {{ papelRotulo() }}.</p>
  <p class="aviso">As telas de pacientes, convites e vínculos chegam na próxima fase do roadmap.</p>
</section>
```

`inicio.scss`:

```scss
.cartao {
  padding: 2rem;
  max-width: 44rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--aconchego-link);
}

h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--aconchego-texto-primario);
}

.subtitulo,
.aviso {
  margin: 0 0 0.5rem;
  font-weight: 600;
  color: var(--aconchego-texto-secundario);
}
```

**Validação:** coberta pela Etapa 12.

---

### Etapa 12 — Rotas

**Depende de:** Etapas 7, 9, 10, 11
**Arquivos:** `src/app/app.routes.ts` (substituir conteúdo)

```ts
import { Routes } from '@angular/router';
import { deslogadoGuard, sessaoGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [deslogadoGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'sem-acesso',
    loadComponent: () => import('./pages/sem-acesso/sem-acesso').then((m) => m.SemAcesso),
  },
  {
    path: '',
    canActivate: [sessaoGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./pages/inicio/inicio').then((m) => m.Inicio),
      },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

**Validação:**

```bash
npm run build
```

Build conclui sem erro e gera chunks separados para `login`, `shell`, `inicio` e `sem-acesso`.

---

### Etapa 13 — Login em Reactive Forms

**Depende de:** Etapas 6b, 12
**Arquivos:** `src/app/pages/login/login.ts`, `login.html`, `login.scss` (editar)

`login.ts` (conteúdo final):

```ts
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../core/auth/auth.service';

// Só caminho interno: `retorno` vem da URL e viraria open redirect.
function rotaInternaSegura(valor: string | null): string | null {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//')) {
    return null;
  }
  return valor;
}

@Component({
  imports: [ButtonModule, InputTextModule, ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly expirada = signal(this.rota.snapshot.queryParamMap.get('expirada') === '1');

  protected readonly formulario = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected async entrar(): Promise<void> {
    if (this.formulario.invalid || this.enviando()) {
      return;
    }
    this.erro.set(null);
    this.expirada.set(false);
    this.enviando.set(true);
    try {
      const { email, senha } = this.formulario.getRawValue();
      const resultado = await this.auth.entrar(email, senha);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      const retorno = rotaInternaSegura(this.rota.snapshot.queryParamMap.get('retorno'));
      await this.router.navigateByUrl(retorno ?? '/inicio');
    } finally {
      this.enviando.set(false);
    }
  }
}
```

`login.html` (conteúdo final):

```html
<main class="login">
  <section class="cartao-vidro cartao">
    <p class="eyebrow">Pré-Natal Web</p>
    <h1>Entrar</h1>
    <p class="subtitulo">Acesso restrito à equipe (secretaria e médica).</p>

    <form class="formulario" [formGroup]="formulario" (ngSubmit)="entrar()">
      <label for="email">E-mail</label>
      <input id="email" type="email" pInputText autocomplete="email" formControlName="email" />

      <label for="senha">Senha</label>
      <input
        id="senha"
        type="password"
        pInputText
        autocomplete="current-password"
        formControlName="senha"
      />

      @if (expirada()) {
      <p class="aviso" role="status">Sua sessão expirou. Entre novamente.</p>
      } @if (erro()) {
      <p class="erro" role="alert">{{ erro() }}</p>
      }

      <p-button
        type="submit"
        label="Entrar"
        [loading]="enviando()"
        [disabled]="formulario.invalid || enviando()"
      />
    </form>
  </section>
</main>
```

Em `login.scss`, corrija o token inexistente e acrescente o estilo do aviso. Substitua o bloco `.erro` por:

```scss
.erro {
  margin: 0.75rem 0 0;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--aconchego-erro);
}

.aviso {
  margin: 0.75rem 0 0;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--aconchego-texto-secundario);
}
```

**Validação:**

```bash
npm run lint && npm run typecheck && npm run build
```

Os três sem erro. Confirme que não sobrou referência ao token quebrado:

```bash
grep -rn "aconchego-perigo" src/
```

Saída esperada: vazia.

---

### Etapa 14 — Testes

**Depende de:** Etapas 6b, 7, 13
**Arquivos:** `src/app/core/auth/auth.service.spec.ts`, `src/app/core/auth/auth.guard.spec.ts`, `src/app/pages/login/login.spec.ts` (criar)

Padrão do projeto (ver `src/app/app.spec.ts`): `TestBed` com `provideZonelessChangeDetection()` e globals do Vitest (`describe`/`it`/`expect` sem import, via `types: ["vitest/globals"]`).

`auth.service.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SUPABASE_CLIENT } from '../supabase-client';
import { AuthService } from './auth.service';

function clienteFalso(opcoes: {
  sessao?: unknown;
  erroLogin?: boolean;
  perfil?: { id: string; nome: string; papel: string } | null;
}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  return {
    signOut,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: opcoes.sessao ?? null } }),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi
        .fn()
        .mockResolvedValue(
          opcoes.erroLogin
            ? { data: { session: null }, error: { message: 'invalid' } }
            : { data: { session: opcoes.sessao ?? null }, error: null },
        ),
      signOut,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: opcoes.perfil ?? null, error: null }),
        }),
      }),
    }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): AuthService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: SUPABASE_CLIENT, useValue: cliente },
    ],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  const sessao = { user: { id: 'u1' } };

  it('autentica uma médica e expõe o papel', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Ana', papel: 'medica' },
    });
    const auth = criar(cliente);

    const resultado = await auth.entrar('ana@clinica.com', 'segredo');

    expect(resultado.ok).toBe(true);
    expect(auth.autenticado()).toBe(true);
    expect(auth.papel()).toBe('medica');
  });

  it('autentica uma secretaria', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Bia', papel: 'secretaria' },
    });
    const auth = criar(cliente);

    await auth.entrar('bia@clinica.com', 'segredo');

    expect(auth.papel()).toBe('secretaria');
  });

  it('recusa paciente e descarta a sessão', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Carla', papel: 'paciente' },
    });
    const auth = criar(cliente);

    const resultado = await auth.entrar('carla@x.com', 'segredo');

    expect(resultado).toMatchObject({ ok: false, motivo: 'papel_negado' });
    expect(auth.autenticado()).toBe(false);
    expect(cliente.auth.signOut).toHaveBeenCalled();
  });

  it('recusa conta sem perfil', async () => {
    const cliente = clienteFalso({ sessao, perfil: null });
    const auth = criar(cliente);

    const resultado = await auth.entrar('x@x.com', 'segredo');

    expect(resultado).toMatchObject({ ok: false, motivo: 'sem_perfil' });
  });

  it('devolve erro de credenciais sem consultar perfil', async () => {
    const cliente = clienteFalso({ erroLogin: true });
    const auth = criar(cliente);

    const resultado = await auth.entrar('x@x.com', 'errada');

    expect(resultado).toMatchObject({ ok: false, motivo: 'credenciais' });
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it('restaura a sessão persistida no boot', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Ana', papel: 'medica' },
    });
    const auth = criar(cliente);

    await auth.inicializar();

    expect(auth.autenticado()).toBe(true);
    expect(auth.perfil()?.nome).toBe('Ana');
  });
});
```

`auth.guard.spec.ts` — cobre os três guards com um `AuthService` dublê:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from './auth.service';
import { deslogadoGuard, papelGuard, sessaoGuard } from './auth.guard';

function configurar(autenticado: boolean, papel: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { autenticado: signal(autenticado), papel: signal(papel) },
      },
    ],
  });
}

const rota = {} as ActivatedRouteSnapshot;
const estado = { url: '/inicio' } as RouterStateSnapshot;

describe('guards de autenticação', () => {
  it('sessaoGuard libera quem está autenticado', () => {
    configurar(true, 'medica');
    expect(TestBed.runInInjectionContext(() => sessaoGuard(rota, estado))).toBe(true);
  });

  it('sessaoGuard manda para o login preservando a rota', () => {
    configurar(false, null);
    const resultado = TestBed.runInInjectionContext(() => sessaoGuard(rota, estado));
    expect(resultado).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toContain(
      'retorno=%2Finicio',
    );
  });

  it('deslogadoGuard tira do login quem já entrou', () => {
    configurar(true, 'secretaria');
    expect(TestBed.runInInjectionContext(() => deslogadoGuard(rota, estado))).toBeInstanceOf(
      UrlTree,
    );
  });

  it('papelGuard libera o papel permitido', () => {
    configurar(true, 'secretaria');
    const guard = papelGuard('secretaria');
    expect(TestBed.runInInjectionContext(() => guard(rota, estado))).toBe(true);
  });

  it('papelGuard barra papel fora da lista', () => {
    configurar(true, 'medica');
    const guard = papelGuard('secretaria');
    expect(TestBed.runInInjectionContext(() => guard(rota, estado))).toBeInstanceOf(UrlTree);
  });
});
```

`login.spec.ts` — valida formulário e mensagem de erro:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  function montar(entrar: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { entrar } },
      ],
    });
    return TestBed.createComponent(Login);
  }

  it('desabilita o envio com formulário vazio', async () => {
    const fixture = montar(vi.fn());
    await fixture.whenStable();
    const botao = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
  });

  it('mostra a mensagem devolvida pelo serviço', async () => {
    const entrar = vi.fn().mockResolvedValue({
      ok: false,
      motivo: 'papel_negado',
      mensagem: 'Acesso restrito à equipe da clínica. Gestantes usam o aplicativo.',
    });
    const fixture = montar(entrar);
    const componente = fixture.componentInstance as unknown as {
      formulario: { setValue(v: { email: string; senha: string }): void };
      entrar(): Promise<void>;
    };
    componente.formulario.setValue({ email: 'a@b.com', senha: 'segredo' });

    await componente.entrar();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Acesso restrito');
  });
});
```

**Validação:**

```bash
npm test
```

Todos os testes passam, incluindo os dois já existentes em `src/app/app.spec.ts`.

---

### Etapa 15 — Atualizar documentação

**Depende de:** Etapa 14
**Arquivos:** `docs/roadmap-web.md`, `README.md` (editar)

Em `docs/roadmap-web.md`, substitua a seção W1 por:

```markdown
### W1 — Auth + shell

- [x] Login Supabase com Reactive Forms e mensagens por motivo (credenciais, sem perfil, papel negado)
- [x] Sessão persistente restaurada no boot (`provideAppInitializer` → `AuthService.inicializar`)
- [x] Guards `sessaoGuard`/`deslogadoGuard` + fábrica `papelGuard(...)` (aplicada a partir da W2)
- [x] Layout base com sidebar, cabeçalho e logout
- [x] Sessão expirada devolve ao login com aviso e preserva a rota de retorno
- [x] Papel `secretaria` adicionado ao enum `papel_usuario` (migration no `prenatalapp`)
```

Em `README.md`, substitua a linha "A home é um showcase vivo do tema — confira ali ao mexer nos tokens." por:

```markdown
A rota `/inicio` (dentro do shell autenticado) é o ponto de conferência do tema.
```

E acrescente ao fim do README:

```markdown
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
```

**Validação:**

```bash
npm run format:check
```

Sem erro de formatação.

## 7. Testes

| Arquivo                                  | Casos                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/core/auth/auth.service.spec.ts` | médica autentica; secretaria autentica; paciente é recusado com `signOut`; conta sem perfil recusada; credencial inválida não consulta `profiles`; sessão persistida é restaurada no boot            |
| `src/app/core/auth/auth.guard.spec.ts`   | `sessaoGuard` libera autenticado; `sessaoGuard` redireciona com `retorno`; `deslogadoGuard` tira do login quem já entrou; `papelGuard` libera papel da lista; `papelGuard` barra papel fora da lista |
| `src/app/pages/login/login.spec.ts`      | botão desabilitado com formulário vazio; mensagem de erro do serviço aparece na tela                                                                                                                 |
| `src/app/app.spec.ts`                    | já existe — não deve quebrar                                                                                                                                                                         |

## 8. Riscos e casos de borda

- **`ALTER TYPE ... ADD VALUE` em transação.** Se o executor juntar as Etapas 2 e 3 num arquivo só, o `db reset` falha com "unsafe use of new value of enum type". Manter dois arquivos.
- **`revoke execute`.** Não adicionar em `promover_para_secretaria`: segfault documentado no PG17/ARM64 da imagem local (`init_schema.sql:386-389`).
- **Deadlock no `onAuthStateChange`.** O callback precisa continuar síncrono; qualquer `await` de método do supabase-js dentro dele trava o cliente.
- **Secretaria sem RLS.** Após a migration, uma secretaria loga e não enxerga pacientes, convites nem vínculos — só o próprio perfil, via `profiles_select_own_or_linked`. É o esperado nesta W1; as policies entram na W2.
- **`strict: true` na Etapa 1** pode revelar erros no código existente. São três arquivos pequenos; corrigir tipando, não relaxando a flag.
- **Open redirect** via `?retorno=`: tratado por `rotaInternaSegura`, que rejeita URL absoluta e `//host`.
- **Mobile.** Adicionar valor a enum é retrocompatível: o Flutter continua lendo `paciente`/`medica`. Nenhum código do `prenatalapp` compara papel de forma exaustiva com `secretaria` hoje.
- **Duas migrations no repo do mobile** exigem commit lá também; o web só depende do `database.types.ts` regenerado.

## 9. Rollback

- **Frontend:** reverter o commit da W1 no `prenatalweb`. Nada persiste fora do bundle.
- **Banco:** `ALTER TYPE ... ADD VALUE` não tem `DROP VALUE` no Postgres. O rollback prático é uma migration nova que (a) faz `drop function public.promover_para_secretaria(uuid, text);` e (b) reatribui qualquer profile com `papel = 'secretaria'` para o papel correto. O valor órfão no enum é inofensivo. Se o rollback ocorrer antes de qualquer profile usar `secretaria`, basta o `drop function`.

## 10. Checklist final

- [ ] `tsconfig.json` com `strict: true` e `strictTemplates: true`; `npm run typecheck` limpo
- [ ] Migration `20260820120000_papel_secretaria.sql` criada e `npx supabase db reset` conclui
- [ ] Migration `20260820120100_promover_secretaria.sql` criada; função existe em `pg_proc`
- [ ] `src/types/database.types.ts` regenerado contendo `secretaria`
- [ ] `AuthService` com `sessao`, `perfil`, `autenticado`, `papel`, `inicializar`, `entrar`, `sair`
- [ ] `provideAppInitializer` registrado em `app.config.ts`
- [ ] Guards criados e aplicados nas rotas
- [ ] Shell, `/inicio` e `/sem-acesso` criados
- [ ] Login em Reactive Forms, com `retorno` validado e aviso de sessão expirada
- [ ] `grep -rn "aconchego-perigo" src/` sem resultado
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` todos verdes
- [ ] Roteiro manual: entrar como médica → cai em `/inicio`; F5 → continua logado; abrir `/login` logado → volta para `/inicio`; sair → volta ao login; abrir `/inicio` deslogado → login com `?retorno=%2Finicio`; entrar com conta `paciente` → mensagem de acesso restrito e sem sessão
- [ ] `docs/roadmap-web.md` com a W1 marcada e `README.md` atualizado
