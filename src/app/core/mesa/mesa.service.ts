import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaPainel = Database['public']['Functions']['painel_da_medica']['Returns'][number];

// O gerador não sabe a nulabilidade de colunas de retorno de função; os LEFT
// JOINs da RPC deixam estes campos nulos para paciente sem convite/gestação.
export type PacienteMesa = Omit<
  LinhaPainel,
  | 'data_nascimento'
  | 'convite_ativado_em'
  | 'convite_revogado_em'
  | 'gestacao_id'
  | 'dpp_final'
  | 'ig_semanas'
  | 'trimestre'
  | 'proxima_consulta_em'
  | 'consulta_a_registrar_id'
  | 'consulta_a_registrar_em'
> & {
  data_nascimento: string | null;
  convite_ativado_em: string | null;
  convite_revogado_em: string | null;
  gestacao_id: string | null;
  dpp_final: string | null;
  ig_semanas: number | null;
  trimestre: number | null;
  proxima_consulta_em: string | null;
  consulta_a_registrar_id: string | null;
  consulta_a_registrar_em: string | null;
};

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class MesaService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  // A RPC já devolve ordenado por urgência e restrito às pacientes vinculadas.
  async listar(): Promise<Resultado<PacienteMesa[]>> {
    const { data, error } = await this.supabase.rpc('painel_da_medica');
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }
}
