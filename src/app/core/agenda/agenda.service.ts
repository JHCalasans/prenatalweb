import { inject, Injectable } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { AuthService } from '../auth/auth.service';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaAgenda = Database['public']['Functions']['agenda_da_clinica']['Returns'][number];

export type StatusConsulta = Database['public']['Enums']['status_consulta'];

// O gerador não sabe a nulabilidade de colunas de retorno de função; `local`
// é nullable na tabela.
export type ConsultaAgenda = Omit<LinhaAgenda, 'local'> & { local: string | null };

export interface PacienteAgendavel {
  pacienteId: string;
  nome: string;
}

export interface DadosNovaConsulta {
  pacienteId: string;
  medicaId: string;
  dataHora: Date;
  tipo: string;
  local: string | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

const ERRO_GENERICO = 'Não foi possível concluir. Tente novamente.';

// `raise exception` de plpgsql chega como P0001 com a mensagem em português
// já escrita na RPC.
function mensagemDeErro(erro: PostgrestError): string {
  return erro.code === 'P0001' ? erro.message : ERRO_GENERICO;
}

@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly auth = inject(AuthService);

  // A RPC já devolve ordenado por data_hora e restrito ao papel do chamador.
  async listar(de: Date, ate: Date, medicaId: string | null): Promise<Resultado<ConsultaAgenda[]>> {
    const { data, error } = await this.supabase.rpc('agenda_da_clinica', {
      p_de: de.toISOString(),
      p_ate: ate.toISOString(),
      p_medica_id: medicaId ?? undefined,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async agendar(dados: DadosNovaConsulta): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('agendar_consulta', {
      p_paciente_id: dados.pacienteId,
      p_medica_id: dados.medicaId,
      p_data_hora: dados.dataHora.toISOString(),
      p_tipo: dados.tipo.trim() === '' ? undefined : dados.tipo.trim(),
      p_local: dados.local === null || dados.local.trim() === '' ? undefined : dados.local.trim(),
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: data };
  }

  async reagendar(consultaId: string, dataHora: Date): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('reagendar_consulta', {
      p_consulta_id: consultaId,
      p_data_hora: dataHora.toISOString(),
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  async cancelar(consultaId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('cancelar_consulta', {
      p_consulta_id: consultaId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  async marcarFalta(consultaId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('marcar_falta', {
      p_consulta_id: consultaId,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return { ok: true, valor: null };
  }

  // A paciente do agendamento precisa de gestação ativa: a secretaria parte
  // do cadastro da clínica; a médica, do próprio painel.
  async pacientesAgendaveis(busca: string): Promise<Resultado<PacienteAgendavel[]>> {
    if (this.auth.papel() === 'medica') {
      const { data, error } = await this.supabase.rpc('painel_da_medica');
      if (error) {
        return { ok: false, mensagem: mensagemDeErro(error) };
      }
      return {
        ok: true,
        valor: (data ?? []).map((p) => ({ pacienteId: p.paciente_id, nome: p.nome })),
      };
    }

    const termo = busca.trim();
    const { data, error } = await this.supabase.rpc('pacientes_da_secretaria', {
      p_busca: termo === '' ? undefined : termo,
    });
    if (error) {
      return { ok: false, mensagem: mensagemDeErro(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((p) => ({ pacienteId: p.paciente_id, nome: p.nome })),
    };
  }
}
