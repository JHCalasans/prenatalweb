import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaLista = Database['public']['Functions']['pacientes_da_secretaria']['Returns'][number];
type PapelVinculo = Database['public']['Enums']['papel_vinculo'];

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

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// Os Args gerados usam `p_x?: string`; undefined omite a chave do payload e a
// RPC aplica o `default null` no banco.
function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC; os demais códigos viram texto legível aqui.
function mensagemDeErro(erro: PostgrestError): string {
  if (erro.code === '23505') {
    return 'Já existe uma paciente cadastrada com este CPF.';
  }
  if (erro.code === '23514') {
    return 'CPF deve ter 11 dígitos.';
  }
  if (erro.code === 'P0001') {
    return erro.message;
  }
  return ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async listar(busca: string): Promise<Resultado<PacienteLista[]>> {
    const termo = busca.trim();
    const { data, error } = await this.supabase.rpc('pacientes_da_secretaria', {
      p_busca: termo === '' ? undefined : termo,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
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
      return { ok: false, mensagem: mensagemDeErro(error) };
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
      return { ok: false, mensagem: mensagemDeErro(error) };
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
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }
}
