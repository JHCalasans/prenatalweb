import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { ERRO_GENERICO, ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaLista = Database['public']['Functions']['pacientes_da_secretaria']['Returns'][number];
export type PapelVinculo = Database['public']['Enums']['papel_vinculo'];
export type DppOrigem = Database['public']['Enums']['dpp_origem'];
export type TipoGestacao = Database['public']['Enums']['tipo_gestacao'];

export type PacienteLista = LinhaLista;

export interface Medica {
  id: string;
  nome: string;
}

export interface PacienteDetalhe {
  id: string;
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  contatoEmergencia: string | null;
}

export interface DadosPaciente {
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  contatoEmergencia: string | null;
}

export interface DadosNovaPaciente extends DadosPaciente {
  medicaId: string;
  papelVinculo: PapelVinculo;
}

// Cadastro pela própria médica: a RPC cria paciente, vínculo com auth.uid()
// e convite numa transação, e devolve o código em texto uma única vez.
export interface DadosPacienteMedica extends DadosPaciente {
  papelVinculo: PapelVinculo;
}

// Projeção da RPC gestacao_ativa_da_paciente: sem desfecho, que é clínico.
export interface GestacaoAtiva {
  id: string;
  dppOrigem: DppOrigem;
  dum: string | null;
  dppUsg: string | null;
  dppFinal: string;
  tipo: TipoGestacao;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

// Os Args gerados usam `p_x?: string`; undefined omite a chave do payload e a
// RPC aplica o `default null` no banco.
function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  // Códigos próprios do cadastro antes de delegar o resto ao ErroSupabase.
  private mensagem(erro: PostgrestError): string {
    if (erro.code === '23505') {
      return 'Já existe uma paciente cadastrada com este CPF.';
    }
    if (erro.code === '23514') {
      return 'CPF deve ter 11 dígitos.';
    }
    return this.erros.mensagem(erro);
  }

  async listar(busca: string): Promise<Resultado<PacienteLista[]>> {
    const termo = busca.trim();
    const { data, error } = await this.supabase.rpc('pacientes_da_secretaria', {
      p_busca: termo === '' ? undefined : termo,
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async listarMedicas(): Promise<Resultado<Medica[]>> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, nome')
      .eq('papel', 'medica')
      .order('nome');
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async buscarPorId(id: string): Promise<Resultado<PacienteDetalhe>> {
    const { data, error } = await this.supabase
      .from('pacientes')
      .select('id, nome, data_nascimento, cpf, contato_emergencia')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
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

  async criar(dados: DadosNovaPaciente): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('criar_paciente_pela_secretaria', {
      p_nome: dados.nome,
      p_medica_id: dados.medicaId,
      p_papel_vinculo: dados.papelVinculo,
      p_data_nascimento: opcional(dados.dataNascimento),
      p_cpf: opcional(dados.cpf),
      p_contato_emergencia: opcional(dados.contatoEmergencia),
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async atualizar(id: string, dados: DadosPaciente): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('atualizar_paciente_pela_secretaria', {
      p_paciente_id: id,
      p_nome: dados.nome,
      p_data_nascimento: opcional(dados.dataNascimento),
      p_cpf: opcional(dados.cpf),
      p_contato_emergencia: opcional(dados.contatoEmergencia),
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async criarComConvite(
    dados: DadosPacienteMedica,
  ): Promise<Resultado<{ pacienteId: string; codigo: string }>> {
    const { data, error } = await this.supabase.rpc('criar_paciente_com_convite', {
      p_nome: dados.nome,
      p_papel_vinculo: dados.papelVinculo,
      p_data_nascimento: opcional(dados.dataNascimento),
      p_cpf: opcional(dados.cpf),
      p_contato_emergencia: opcional(dados.contatoEmergencia),
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    const linha = (data ?? [])[0];
    if (linha === undefined) {
      return { ok: false, mensagem: ERRO_GENERICO };
    }
    return { ok: true, valor: { pacienteId: linha.paciente_id, codigo: linha.codigo } };
  }

  async reemitirConvite(pacienteId: string): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('reemitir_convite', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async gestacaoAtiva(pacienteId: string): Promise<Resultado<GestacaoAtiva | null>> {
    const { data, error } = await this.supabase.rpc('gestacao_ativa_da_paciente', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    const linha = (data ?? [])[0];
    if (linha === undefined) {
      return { ok: true, valor: null };
    }
    return {
      ok: true,
      valor: {
        id: linha.gestacao_id,
        dppOrigem: linha.dpp_origem,
        dum: linha.dum,
        dppUsg: linha.dpp_usg,
        dppFinal: linha.dpp_final,
        tipo: linha.tipo,
      },
    };
  }

  async criarGestacao(pacienteId: string, dum: string): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('criar_gestacao_pela_secretaria', {
      p_paciente_id: pacienteId,
      p_dum: dum,
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async corrigirDum(gestacaoId: string, dum: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('atualizar_dum_pela_secretaria', {
      p_gestacao_id: gestacaoId,
      p_dum: dum,
    });
    if (error) {
      return { ok: false, mensagem: this.mensagem(error) };
    }
    return { ok: true, valor: null };
  }
}
