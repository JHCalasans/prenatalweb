import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type Funcoes = Database['public']['Functions'];
export type TipoDocumento = Database['public']['Enums']['tipo_documento'];

// O gerador não sabe a nulabilidade de coluna de retorno de função: `data_exame`
// e `local` são colunas anuláveis, `publicado_por_nome` sai de um LEFT JOIN e o
// CPF pode não ter sido cadastrado. `medicas` e `ig_semanas` ficam como vieram —
// aquele tem coalesce na RPC e este depende de `dpp_final`, que é not null.
export type DocumentoPublicado = Omit<
  Funcoes['relatorio_documentos_publicados']['Returns'][number],
  'data_exame' | 'publicado_por_nome'
> & {
  data_exame: string | null;
  publicado_por_nome: string | null;
};

export type Falta = Omit<Funcoes['relatorio_faltas']['Returns'][number], 'local'> & {
  local: string | null;
};

export type ChecklistVencido = Funcoes['relatorio_checklist_vencidos']['Returns'][number];

export type ConvitePendente = Omit<
  Funcoes['relatorio_convites_pendentes']['Returns'][number],
  'cpf'
> & {
  cpf: string | null;
};

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

function opcional<T extends string>(valor: T | null): T | undefined {
  return valor === null ? undefined : valor;
}

@Injectable({ providedIn: 'root' })
export class RelatoriosService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async documentosPublicados(
    desde: string,
    ate: string,
    tipo: TipoDocumento | null,
  ): Promise<Resultado<DocumentoPublicado[]>> {
    const { data, error } = await this.supabase.rpc('relatorio_documentos_publicados', {
      p_desde: desde,
      p_ate: ate,
      p_tipo: opcional(tipo),
    });
    return error ? { ok: false, mensagem: mensagemDeErro(error) } : { ok: true, valor: data ?? [] };
  }

  async faltas(desde: string, ate: string, medicaId: string | null): Promise<Resultado<Falta[]>> {
    const { data, error } = await this.supabase.rpc('relatorio_faltas', {
      p_desde: desde,
      p_ate: ate,
      p_medica_id: opcional(medicaId),
    });
    return error ? { ok: false, mensagem: mensagemDeErro(error) } : { ok: true, valor: data ?? [] };
  }

  // Retrato de agora: sem período, porque item vencido não é evento datado.
  async checklistVencidos(incluirVencendo: boolean): Promise<Resultado<ChecklistVencido[]>> {
    const { data, error } = await this.supabase.rpc('relatorio_checklist_vencidos', {
      p_incluir_vencendo: incluirVencendo,
    });
    return error ? { ok: false, mensagem: mensagemDeErro(error) } : { ok: true, valor: data ?? [] };
  }

  async convitesPendentes(incluirExpirados: boolean): Promise<Resultado<ConvitePendente[]>> {
    const { data, error } = await this.supabase.rpc('relatorio_convites_pendentes', {
      p_incluir_expirados: incluirExpirados,
    });
    return error ? { ok: false, mensagem: mensagemDeErro(error) } : { ok: true, valor: data ?? [] };
  }
}
