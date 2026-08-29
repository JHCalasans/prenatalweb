import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaAuditoria = Database['public']['Functions']['auditoria_da_clinica']['Returns'][number];

// O gerador não sabe a nulabilidade de colunas de retorno de função; os LEFT
// JOINs da RPC deixam o alvo e o identificador do ator nulos quando a linha
// aponta para algo que sumiu ou foi gravada pelo backend.
export type RegistroAuditoria = Omit<
  LinhaAuditoria,
  'ator_id' | 'ator_nome' | 'entidade_id' | 'alvo'
> & {
  ator_id: string | null;
  ator_nome: string | null;
  entidade_id: string | null;
  alvo: string | null;
};

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  // A RPC já devolve ordenado por data decrescente e limitado a 500 linhas.
  async listar(
    desde: string,
    ate: string,
    acao: string | null,
    entidade: string | null,
  ): Promise<Resultado<RegistroAuditoria[]>> {
    const { data, error } = await this.supabase.rpc('auditoria_da_clinica', {
      p_desde: desde,
      p_ate: ate,
      p_acao: opcional(acao),
      p_entidade: opcional(entidade),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  // Alimenta o filtro da tela; vem do banco para a lista não divergir das
  // ações que migrations e Edge Functions passarem a gravar.
  async acoes(): Promise<Resultado<string[]>> {
    const { data, error } = await this.supabase.rpc('acoes_auditadas');
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []).map((linha) => linha.acao) };
  }
}
