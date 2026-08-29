import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaVinculo = Database['public']['Functions']['vinculos_da_paciente']['Returns'][number];

export type Vinculo = LinhaVinculo;
export type PapelVinculo = Database['public']['Enums']['papel_vinculo'];

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

@Injectable({ providedIn: 'root' })
export class VinculosService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async listar(pacienteId: string): Promise<Resultado<Vinculo[]>> {
    const { data, error } = await this.supabase.rpc('vinculos_da_paciente', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async atribuir(
    pacienteId: string,
    medicaId: string,
    papel: PapelVinculo,
  ): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('atribuir_vinculo_pela_secretaria', {
      p_paciente_id: pacienteId,
      p_medica_id: medicaId,
      p_papel: papel,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async inativar(vinculoId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('inativar_vinculo_pela_secretaria', {
      p_vinculo_id: vinculoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async transferir(vinculoId: string, novaMedicaId: string): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('transferir_vinculo_pela_secretaria', {
      p_vinculo_id: vinculoId,
      p_nova_medica_id: novaMedicaId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }
}
