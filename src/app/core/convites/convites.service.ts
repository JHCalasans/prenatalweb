import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaConvite = Database['public']['Functions']['convites_da_secretaria']['Returns'][number];
type LinhaLote = Database['public']['Functions']['emitir_convites_em_lote']['Returns'][number];

export type ConviteLista = LinhaConvite;
export type ConviteEmitido = LinhaLote;

export type SituacaoConvite = 'sem_convite' | 'pendente' | 'ativo' | 'expirado' | 'revogado';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

// Os Args gerados usam `p_x?: string`; undefined omite a chave e a RPC aplica
// o `default null` do banco.
function opcional(valor: string): string | undefined {
  return valor.trim() === '' ? undefined : valor.trim();
}

@Injectable({ providedIn: 'root' })
export class ConvitesService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async listar(busca: string, situacao: string): Promise<Resultado<ConviteLista[]>> {
    const { data, error } = await this.supabase.rpc('convites_da_secretaria', {
      p_busca: opcional(busca),
      p_situacao: opcional(situacao),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async emitir(pacienteId: string): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('emitir_convite_pela_secretaria', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async revogar(pacienteId: string): Promise<Resultado<number>> {
    const { data, error } = await this.supabase.rpc('revogar_convite_pela_secretaria', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async emitirEmLote(pacienteIds: readonly string[]): Promise<Resultado<ConviteEmitido[]>> {
    const { data, error } = await this.supabase.rpc('emitir_convites_em_lote', {
      p_paciente_ids: [...pacienteIds],
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }
}
