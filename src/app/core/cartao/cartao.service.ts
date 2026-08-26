import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaChecklist = Database['public']['Functions']['checklist_da_gestacao']['Returns'][number];
type LinhaVinculo = Database['public']['Functions']['vinculos_da_paciente']['Returns'][number];
type StatusChecklist = Database['public']['Enums']['status_checklist'];

// O gerador não sabe a nulabilidade das colunas de retorno de função.
export type ItemChecklist = Omit<LinhaChecklist, 'data' | 'observacao'> & {
  data: string | null;
  observacao: string | null;
};

export type VinculoCartao = LinhaVinculo;
export type { StatusChecklist };

export interface PacienteCartao {
  id: string;
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  contatoEmergencia: string | null;
}

export interface GestacaoCartao {
  id: string;
  dppFinal: string;
  dppOrigem: string;
  tipo: string;
  status: string;
  desfecho: string | null;
  desfechoObservacao: string | null;
  createdAt: string;
}

export interface ConsultaCartao {
  id: string;
  dataHora: string;
  tipo: string;
  local: string | null;
  status: string;
}

export interface DocumentoCartao {
  id: string;
  tipo: string;
  titulo: string;
  dataExame: string | null;
  achadoAlterado: boolean;
  comunicadoPresencialmente: boolean;
  publicadoEm: string | null;
  arquivoEnviadoEm: string | null;
}

export interface DadosMarcacao {
  gestacaoId: string;
  protocoloItemId: string;
  status: StatusChecklist;
  data: string | null;
  observacao: string | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

// Os Args gerados usam `p_x?: string`; undefined omite a chave e a RPC aplica
// o `default null` do banco.
function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

@Injectable({ providedIn: 'root' })
export class CartaoService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async paciente(pacienteId: string): Promise<Resultado<PacienteCartao>> {
    const { data, error } = await this.supabase
      .from('pacientes')
      .select('id, nome, data_nascimento, cpf, contato_emergencia')
      .eq('id', pacienteId)
      .maybeSingle();
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    if (!data) {
      return { ok: false, mensagem: 'Paciente não encontrada.' };
    }
    return {
      ok: true,
      valor: {
        id: data.id,
        nome: data.nome,
        dataNascimento: data.data_nascimento,
        cpf: data.cpf,
        contatoEmergencia: data.contato_emergencia,
      },
    };
  }

  async gestacoes(pacienteId: string): Promise<Resultado<GestacaoCartao[]>> {
    const { data, error } = await this.supabase
      .from('gestacoes')
      .select('id, dpp_final, dpp_origem, tipo, status, desfecho, desfecho_observacao, created_at')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((g) => ({
        id: g.id,
        dppFinal: g.dpp_final,
        dppOrigem: g.dpp_origem,
        tipo: g.tipo,
        status: g.status,
        desfecho: g.desfecho,
        desfechoObservacao: g.desfecho_observacao,
        createdAt: g.created_at,
      })),
    };
  }

  async vinculos(pacienteId: string): Promise<Resultado<VinculoCartao[]>> {
    const { data, error } = await this.supabase.rpc('vinculos_da_paciente', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async consultas(gestacaoId: string): Promise<Resultado<ConsultaCartao[]>> {
    const { data, error } = await this.supabase
      .from('consultas')
      .select('id, data_hora, tipo, local, status')
      .eq('gestacao_id', gestacaoId)
      .order('data_hora', { ascending: false });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((c) => ({
        id: c.id,
        dataHora: c.data_hora,
        tipo: c.tipo,
        local: c.local,
        status: c.status,
      })),
    };
  }

  async checklist(gestacaoId: string): Promise<Resultado<ItemChecklist[]>> {
    const { data, error } = await this.supabase.rpc('checklist_da_gestacao', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: (data ?? []) as ItemChecklist[] };
  }

  async documentos(gestacaoId: string): Promise<Resultado<DocumentoCartao[]>> {
    const { data, error } = await this.supabase
      .from('documentos')
      .select(
        'id, tipo, titulo, data_exame, achado_alterado, comunicado_presencialmente, publicado_em, arquivo_enviado_em',
      )
      .eq('gestacao_id', gestacaoId)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((d) => ({
        id: d.id,
        tipo: d.tipo,
        titulo: d.titulo,
        dataExame: d.data_exame,
        achadoAlterado: d.achado_alterado,
        comunicadoPresencialmente: d.comunicado_presencialmente,
        publicadoEm: d.publicado_em,
        arquivoEnviadoEm: d.arquivo_enviado_em,
      })),
    };
  }

  async marcarChecklist(dados: DadosMarcacao): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('marcar_checklist_item', {
      p_gestacao_id: dados.gestacaoId,
      p_protocolo_item_id: dados.protocoloItemId,
      p_status: dados.status,
      p_data: opcional(dados.data),
      p_observacao: opcional(dados.observacao),
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }
}
