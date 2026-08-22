import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaProtocolo = Database['public']['Functions']['protocolo_da_clinica']['Returns'][number];

export type ItemProtocolo = LinhaProtocolo;

export interface DadosItem {
  nome: string;
  trimestre: number;
  semanaIni: number;
  semanaFim: number;
  obrigatorio: boolean;
  ordem: number;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC; 23514 é o check da tabela, que só aparece se a validação
// da RPC deixar passar algo.
function mensagemDeErro(erro: PostgrestError): string {
  if (erro.code === '23514') {
    return 'Janela de semanas inválida.';
  }
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class ProtocoloService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listar(incluirAposentados: boolean): Promise<Resultado<ItemProtocolo[]>> {
    const { data, error } = await this.supabase.rpc('protocolo_da_clinica', {
      p_incluir_aposentados: incluirAposentados,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async criar(dados: DadosItem): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('criar_protocolo_item', {
      p_nome: dados.nome,
      p_trimestre: dados.trimestre,
      p_semana_ini: dados.semanaIni,
      p_semana_fim: dados.semanaFim,
      p_obrigatorio: dados.obrigatorio,
      p_ordem: dados.ordem,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async atualizar(itemId: string, dados: DadosItem): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('atualizar_protocolo_item', {
      p_item_id: itemId,
      p_nome: dados.nome,
      p_trimestre: dados.trimestre,
      p_semana_ini: dados.semanaIni,
      p_semana_fim: dados.semanaFim,
      p_obrigatorio: dados.obrigatorio,
      p_ordem: dados.ordem,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async aposentar(itemId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('aposentar_protocolo_item', {
      p_item_id: itemId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  async reativar(itemId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('reativar_protocolo_item', {
      p_item_id: itemId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  async reordenar(ids: readonly string[]): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('reordenar_protocolo', {
      p_ids: [...ids],
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }
}
