import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaProntuario = Database['public']['Functions']['prontuario_da_paciente']['Returns'][number];
type LinhaMedida = Database['public']['Functions']['medidas_da_gestacao']['Returns'][number];
export type MovimentacaoFetal = Database['public']['Enums']['movimentacao_fetal'];
export type GrauEdema = Database['public']['Enums']['grau_edema'];
export type ApresentacaoFetal = Database['public']['Enums']['apresentacao_fetal'];
export type StatusEvolucao = Database['public']['Enums']['status_evolucao'];
export type PapelVinculo = Database['public']['Enums']['papel_vinculo'];

// Mensagem fixa da RPC; o editor trata o conflito pelo texto.
export const CONFLITO_RASCUNHO = 'Rascunho alterado em outro aparelho';

export interface MedidasEvolucao {
  pesoKg: number | null;
  paSistolica: number | null;
  paDiastolica: number | null;
  alturaUterinaCm: number | null;
  bcfBpm: number | null;
  movimentacaoFetal: MovimentacaoFetal | null;
  edema: GrauEdema | null;
  apresentacao: ApresentacaoFetal | null;
}

// O que o editor envia a cada autosave: a RPC substitui todos os campos.
export interface DadosEvolucao extends MedidasEvolucao {
  atendidaEm: string;
  queixa: string | null;
  exameFisico: string | null;
  avaliacao: string | null;
  conduta: string | null;
}

export interface EvolucaoProntuario extends DadosEvolucao {
  id: string;
  raizId: string;
  retificaId: string | null;
  motivoRetificacao: string | null;
  gestacaoId: string;
  consultaId: string | null;
  autoraId: string;
  autoraNome: string;
  papelVinculo: PapelVinculo;
  status: StatusEvolucao;
  revisao: number;
  igDias: number | null;
  assinadaEm: string | null;
  crm: string | null;
  crmUf: string | null;
  vigente: boolean;
  retificada: boolean;
  atualizadoEm: string;
}

export interface MedidaCaderneta extends MedidasEvolucao {
  evolucaoId: string;
  atendidaEm: string;
  igDias: number | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

// Os Args gerados usam `p_x?: T`; undefined omite a chave e a RPC aplica o
// `default null` do banco.
function opcional<T>(valor: T | null): T | undefined {
  return valor === null ? undefined : valor;
}

// O gerador não sabe a nulabilidade das colunas de retorno de função.
function deMedidas(linha: LinhaProntuario | LinhaMedida): MedidasEvolucao {
  return {
    pesoKg: linha.peso_kg ?? null,
    paSistolica: linha.pa_sistolica ?? null,
    paDiastolica: linha.pa_diastolica ?? null,
    alturaUterinaCm: linha.altura_uterina_cm ?? null,
    bcfBpm: linha.bcf_bpm ?? null,
    movimentacaoFetal: linha.movimentacao_fetal ?? null,
    edema: linha.edema ?? null,
    apresentacao: linha.apresentacao ?? null,
  };
}

function deLinha(linha: LinhaProntuario): EvolucaoProntuario {
  return {
    ...deMedidas(linha),
    id: linha.id,
    raizId: linha.raiz_id,
    retificaId: linha.retifica_id ?? null,
    motivoRetificacao: linha.motivo_retificacao ?? null,
    gestacaoId: linha.gestacao_id,
    consultaId: linha.consulta_id ?? null,
    autoraId: linha.autora_id,
    autoraNome: linha.autora_nome,
    papelVinculo: linha.papel_vinculo,
    status: linha.status,
    revisao: linha.revisao,
    atendidaEm: linha.atendida_em,
    queixa: linha.queixa ?? null,
    exameFisico: linha.exame_fisico ?? null,
    avaliacao: linha.avaliacao ?? null,
    conduta: linha.conduta ?? null,
    igDias: linha.ig_dias ?? null,
    assinadaEm: linha.assinada_em ?? null,
    crm: linha.crm ?? null,
    crmUf: linha.crm_uf ?? null,
    vigente: linha.vigente,
    retificada: linha.retificada,
    atualizadoEm: linha.atualizado_em,
  };
}

@Injectable({ providedIn: 'root' })
export class ProntuarioService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async prontuario(pacienteId: string): Promise<Resultado<EvolucaoProntuario[]>> {
    const { data, error } = await this.supabase.rpc('prontuario_da_paciente', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []).map(deLinha) };
  }

  async salvarRascunho(
    id: string,
    gestacaoId: string,
    consultaId: string | null,
    revisaoBase: number,
    dados: DadosEvolucao,
  ): Promise<Resultado<number>> {
    const { data, error } = await this.supabase.rpc('salvar_rascunho_evolucao', {
      p_id: id,
      p_gestacao_id: gestacaoId,
      p_consulta_id: opcional(consultaId),
      p_revisao_base: revisaoBase,
      p_atendida_em: dados.atendidaEm,
      p_queixa: opcional(dados.queixa),
      p_exame_fisico: opcional(dados.exameFisico),
      p_avaliacao: opcional(dados.avaliacao),
      p_conduta: opcional(dados.conduta),
      p_peso_kg: opcional(dados.pesoKg),
      p_pa_sistolica: opcional(dados.paSistolica),
      p_pa_diastolica: opcional(dados.paDiastolica),
      p_altura_uterina_cm: opcional(dados.alturaUterinaCm),
      p_bcf_bpm: opcional(dados.bcfBpm),
      p_movimentacao_fetal: opcional(dados.movimentacaoFetal),
      p_edema: opcional(dados.edema),
      p_apresentacao: opcional(dados.apresentacao),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async iniciarRetificacao(novoId: string, evolucaoId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('iniciar_retificacao', {
      p_id: novoId,
      p_evolucao_id: evolucaoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async excluirRascunho(id: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('excluir_rascunho_evolucao', { p_id: id });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async assinar(
    id: string,
    revisaoBase: number,
    motivo: string | null,
  ): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('assinar_evolucao', {
      p_id: id,
      p_revisao_base: revisaoBase,
      p_motivo_retificacao: opcional(motivo),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async medidas(gestacaoId: string): Promise<Resultado<MedidaCaderneta[]>> {
    const { data, error } = await this.supabase.rpc('medidas_da_gestacao', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return {
      ok: true,
      valor: (data ?? []).map((linha) => ({
        ...deMedidas(linha),
        evolucaoId: linha.evolucao_id,
        atendidaEm: linha.atendida_em,
        igDias: linha.ig_dias ?? null,
      })),
    };
  }
}
