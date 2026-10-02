import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type Enums = Database['public']['Enums'];
type LinhaAnamnese = Database['public']['Functions']['anamnese_da_paciente']['Returns'][number];
type LinhaRisco = Database['public']['Functions']['riscos_da_gestacao']['Returns'][number];

export type TipoSanguineo = Enums['tipo_sanguineo'];
export type FatorRh = Enums['fator_rh'];
export type Consumo = Enums['consumo'];
export type Comorbidade = Enums['comorbidade'];
export type IntercorrenciaObstetrica = Enums['intercorrencia_obstetrica'];
export type AntecedenteFamiliar = Enums['antecedente_familiar'];
export type ClassificacaoRisco = Enums['classificacao_risco'];
export type PapelUsuario = Enums['papel_usuario'];

// Mensagem fixa da RPC; as telas tratam o conflito pelo texto.
export const CONFLITO_ANAMNESE = 'Anamnese alterada por outra pessoa';

// Record trava a compilação quando um enum ganha valor sem rótulo.
export const ROTULO_COMORBIDADE: Record<Comorbidade, string> = {
  hipertensao_cronica: 'Hipertensão crônica',
  diabetes_previo: 'Diabetes prévio',
  hipotireoidismo: 'Hipotireoidismo',
  hipertireoidismo: 'Hipertireoidismo',
  epilepsia: 'Epilepsia',
  cardiopatia: 'Cardiopatia',
  doenca_renal: 'Doença renal',
  doenca_autoimune: 'Doença autoimune',
  trombofilia: 'Trombofilia',
  hiv: 'HIV',
  anemia_falciforme: 'Anemia falciforme',
  asma: 'Asma',
  transtorno_mental: 'Transtorno mental',
};

export const ROTULO_INTERCORRENCIA: Record<IntercorrenciaObstetrica, string> = {
  pre_eclampsia: 'Pré-eclâmpsia',
  eclampsia: 'Eclâmpsia',
  diabetes_gestacional: 'Diabetes gestacional',
  parto_prematuro: 'Parto prematuro',
  restricao_crescimento: 'Restrição de crescimento fetal',
  hemorragia_pos_parto: 'Hemorragia pós-parto',
  descolamento_placenta: 'Descolamento de placenta',
  isoimunizacao_rh: 'Isoimunização Rh',
};

export const ROTULO_ANTECEDENTE_FAMILIAR: Record<AntecedenteFamiliar, string> = {
  hipertensao: 'Hipertensão',
  diabetes: 'Diabetes',
  gemelaridade: 'Gemelaridade',
  malformacao: 'Malformação',
  trombofilia: 'Trombofilia',
  cancer_mama_ovario: 'Câncer de mama ou ovário',
};

export const ROTULO_CONSUMO: Record<Consumo, string> = {
  nunca: 'Nunca',
  parou: 'Parou',
  atual: 'Atual',
};

export const ROTULO_PAPEL_AUTOR: Record<PapelUsuario, string> = {
  medica: 'médica',
  secretaria: 'secretaria',
  admin: 'administração',
  paciente: 'paciente',
};

export interface DadosAnamnese {
  tipoSanguineo: TipoSanguineo | null;
  fatorRh: FatorRh | null;
  alergias: string | null;
  semAlergiasConhecidas: boolean;
  medicacoesEmUso: string | null;
  comorbidades: Comorbidade[];
  comorbidadesOutras: string | null;
  cirurgiasPrevias: string | null;
  gestacoesAnteriores: number;
  partosNormais: number;
  cesareas: number;
  abortos: number;
  natimortos: number;
  dataUltimoParto: string | null;
  intercorrenciasPrevias: IntercorrenciaObstetrica[];
  intercorrenciasOutras: string | null;
  antecedentesFamiliares: AntecedenteFamiliar[];
  familiaresOutros: string | null;
  tabagismo: Consumo | null;
  alcool: Consumo | null;
  outrasDrogas: Consumo | null;
}

export interface Anamnese extends DadosAnamnese {
  id: string;
  versao: number;
  autorId: string;
  autorNome: string;
  papelAutor: PapelUsuario;
  registradaEm: string;
}

export interface FatorRisco {
  codigo: string;
  descricao: string;
}

export interface RiscoGestacional {
  id: string;
  classificacao: ClassificacaoRisco;
  motivo: string | null;
  fatoresSugeridos: string[];
  autoraId: string;
  autoraNome: string;
  registradoEm: string;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

function opcional<T>(valor: T | null): T | undefined {
  return valor === null ? undefined : valor;
}

// O gerador não sabe a nulabilidade das colunas de retorno de função.
function deLinha(l: LinhaAnamnese): Anamnese {
  return {
    id: l.id,
    versao: l.versao,
    autorId: l.autor_id,
    autorNome: l.autor_nome,
    papelAutor: l.papel_autor,
    registradaEm: l.registrada_em,
    tipoSanguineo: l.tipo_sanguineo ?? null,
    fatorRh: l.fator_rh ?? null,
    alergias: l.alergias ?? null,
    semAlergiasConhecidas: l.sem_alergias_conhecidas,
    medicacoesEmUso: l.medicacoes_em_uso ?? null,
    comorbidades: l.comorbidades ?? [],
    comorbidadesOutras: l.comorbidades_outras ?? null,
    cirurgiasPrevias: l.cirurgias_previas ?? null,
    gestacoesAnteriores: l.gestacoes_anteriores,
    partosNormais: l.partos_normais,
    cesareas: l.cesareas,
    abortos: l.abortos,
    natimortos: l.natimortos,
    dataUltimoParto: l.data_ultimo_parto ?? null,
    intercorrenciasPrevias: l.intercorrencias_previas ?? [],
    intercorrenciasOutras: l.intercorrencias_outras ?? null,
    antecedentesFamiliares: l.antecedentes_familiares ?? [],
    familiaresOutros: l.familiares_outros ?? null,
    tabagismo: l.tabagismo ?? null,
    alcool: l.alcool ?? null,
    outrasDrogas: l.outras_drogas ?? null,
  };
}

function deRisco(l: LinhaRisco): RiscoGestacional {
  return {
    id: l.id,
    classificacao: l.classificacao,
    motivo: l.motivo ?? null,
    fatoresSugeridos: l.fatores_sugeridos ?? [],
    autoraId: l.autora_id,
    autoraNome: l.autora_nome,
    registradoEm: l.registrado_em,
  };
}

/** "G3 P1 A1": gestações contando a atual, partos (normais + cesáreas) e abortos. */
export function formatarGpa(
  a: Pick<DadosAnamnese, 'gestacoesAnteriores' | 'partosNormais' | 'cesareas' | 'abortos'>,
): string {
  return `G${a.gestacoesAnteriores + 1} P${a.partosNormais + a.cesareas} A${a.abortos}`;
}

/** "O negativo"; null sem tipagem. */
export function formatarTipagem(
  a: Pick<DadosAnamnese, 'tipoSanguineo' | 'fatorRh'>,
): string | null {
  return a.tipoSanguineo === null || a.fatorRh === null ? null : `${a.tipoSanguineo} ${a.fatorRh}`;
}

@Injectable({ providedIn: 'root' })
export class AnamneseService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async historico(pacienteId: string): Promise<Resultado<Anamnese[]>> {
    const { data, error } = await this.supabase.rpc('anamnese_da_paciente', {
      p_paciente_id: pacienteId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []).map(deLinha) };
  }

  async registrar(
    pacienteId: string,
    versaoBase: number,
    dados: DadosAnamnese,
  ): Promise<Resultado<number>> {
    const { data, error } = await this.supabase.rpc('registrar_anamnese', {
      p_paciente_id: pacienteId,
      p_versao_base: versaoBase,
      p_tipo_sanguineo: opcional(dados.tipoSanguineo),
      p_fator_rh: opcional(dados.fatorRh),
      p_alergias: opcional(dados.alergias),
      p_sem_alergias_conhecidas: dados.semAlergiasConhecidas,
      p_medicacoes_em_uso: opcional(dados.medicacoesEmUso),
      p_comorbidades: dados.comorbidades,
      p_comorbidades_outras: opcional(dados.comorbidadesOutras),
      p_cirurgias_previas: opcional(dados.cirurgiasPrevias),
      p_gestacoes_anteriores: dados.gestacoesAnteriores,
      p_partos_normais: dados.partosNormais,
      p_cesareas: dados.cesareas,
      p_abortos: dados.abortos,
      p_natimortos: dados.natimortos,
      p_data_ultimo_parto: opcional(dados.dataUltimoParto),
      p_intercorrencias_previas: dados.intercorrenciasPrevias,
      p_intercorrencias_outras: opcional(dados.intercorrenciasOutras),
      p_antecedentes_familiares: dados.antecedentesFamiliares,
      p_familiares_outros: opcional(dados.familiaresOutros),
      p_tabagismo: opcional(dados.tabagismo),
      p_alcool: opcional(dados.alcool),
      p_outras_drogas: opcional(dados.outrasDrogas),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async fatoresSugeridos(gestacaoId: string): Promise<Resultado<FatorRisco[]>> {
    const { data, error } = await this.supabase.rpc('fatores_risco_sugeridos', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data ?? [] };
  }

  async riscos(gestacaoId: string): Promise<Resultado<RiscoGestacional[]>> {
    const { data, error } = await this.supabase.rpc('riscos_da_gestacao', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []).map(deRisco) };
  }

  async classificarRisco(
    gestacaoId: string,
    classificacao: ClassificacaoRisco,
    motivo: string | null,
  ): Promise<Resultado<string>> {
    const { data, error } = await this.supabase.rpc('registrar_risco_gestacional', {
      p_gestacao_id: gestacaoId,
      p_classificacao: classificacao,
      p_motivo: opcional(motivo),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }
}
