import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';

export const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';
export const SESSAO_EXPIRADA = 'Sua sessão expirou. Entre novamente para continuar.';
export const SEM_ACESSO = 'Você não tem acesso a este dado.';

// O supabase-js v2 guarda a sessão em `sb-<ref>-auth-token`. Se o acessor não
// estiver disponível (janela privada, dados de site bloqueados), assume que o
// token está lá: melhor repassar a mensagem do que deslogar por engano.
function temTokenLocal(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.includes('auth-token'));
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class ErroSupabase {
  private readonly auth = inject(AuthService);

  mensagem(erro: PostgrestError): string {
    if (erro.code === 'PGRST301') {
      // A RPC pode falhar com o token vencido antes de o supabase-js perceber;
      // o sign-out aqui dispara o redirecionamento do listener de auth.
      void this.auth.encerrarPorExpiracao();
      return SESSAO_EXPIRADA;
    }
    if (erro.code === '42501') {
      return SEM_ACESSO;
    }
    // `raise exception` de plpgsql chega como P0001 com a mensagem em português
    // já escrita na RPC.
    if (erro.code === 'P0001') {
      // Tela ainda aberta mas o token sumiu do dispositivo: a RPC volta com o
      // erro de gate (a requisição sai sem JWT) e o problema real é a sessão
      // morta — dizer isso e deslogar, não repetir "Tente novamente".
      if (this.auth.autenticado() && !temTokenLocal()) {
        void this.auth.encerrarPorExpiracao();
        return SESSAO_EXPIRADA;
      }
      return erro.message;
    }
    return ERRO_GENERICO;
  }
}
