import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type Enums = Database['public']['Enums'];
type LinhaCatalogo = Database['public']['Functions']['catalogo_exames']['Returns'][number];
type LinhaExame = Database['public']['Functions']['exames_da_gestacao']['Returns'][number];
type LinhaVacina = Database['public']['Functions']['vacinas_da_gestacao']['Returns'][number];

export type NaturezaComponente = Enums['natureza_componente'];
export type ResultadoQualitativo = Enums['resultado_qualitativo'];
export type Vacina = Enums['vacina'];
export type SituacaoVacina = Enums['situacao_vacina'];
export type PapelUsuario = Enums['papel_usuario'];
export type SituacaoCalendario =
  'em_dia' | 'pendente' | 'recusada' | 'contraindicada' | 'dispensada';

// Record trava a compilação quando um enum ganha valor sem rótulo.
export const ROTULO_VACINA: Record<Vacina, string> = {
  dtpa: 'dTpa',
  influenza: 'Influenza',
  hepatite_b: 'Hepatite B',
  covid_19: 'COVID-19',
};

export const ROTULO_SITUACAO_VACINA: Record<SituacaoVacina, string> = {
  aplicada: 'Aplicada',
  recusada: 'Recusada',
  contraindicada: 'Contraindicada',
  dispensada: 'Dispensada',
};

export const ROTULO_CALENDARIO: Record<SituacaoCalendario, string> = {
  em_dia: 'Em dia',
  pendente: 'Pendente',
  recusada: 'Recusada',
  contraindicada: 'Contraindicada',
  dispensada: 'Dispensada',
};

export const ROTULO_PAPEL_AUTOR: Record<PapelUsuario, string> = {
  medica: 'médica',
  secretaria: 'secretaria',
  admin: 'administração',
  paciente: 'paciente',
};

export const ERRO_CONFIRMACAO_ALTERADO =
  'Resultado alterado: confirme a comunicação presencial antes de liberar';

export interface ComponenteCatalogo {
  codigo: string;
  nome: string;
  natureza: NaturezaComponente;
  unidade: string | null;
  refMin: number | null;
  refMax: number | null;
  rotuloNegativo: string | null;
  rotuloPositivo: string | null;
  obrigatorio: boolean;
}

export interface TipoExameCatalogo {
  codigo: string;
  nome: string;
  componentes: ComponenteCatalogo[];
}

export interface ResultadoComponente {
  componente: string;
  nome: string;
  natureza: NaturezaComponente;
  valorNumerico: number | null;
  valorQualitativo: ResultadoQualitativo | null;
  rotulo: string | null;
  unidade: string | null;
  refMin: number | null;
  refMax: number | null;
  // Só a equipe recebe; a gestante nunca (a RPC dela não envia).
  alterado: boolean;
}

export interface Exame {
  id: string;
  tipoExame: string;
  tipoNome: string;
  coletadoEm: string;
  observacao: string | null;
  alterado: boolean;
  documentoId: string | null;
  protocoloItemId: string | null;
  registradoPorNome: string;
  papelAutor: PapelUsuario;
  registradoEm: string;
  liberadoEm: string | null;
  comunicadoPresencialmente: boolean;
  resultados: ResultadoComponente[];
}

export interface ValorComponente {
  componente: string;
  valorNumerico: number | null;
  valorQualitativo: ResultadoQualitativo | null;
}

export interface RegistroVacina {
  id: string;
  dose: number;
  situacao: SituacaoVacina;
  aplicadaEm: string | null;
  lote: string | null;
  local: string | null;
  observacao: string | null;
}

export interface VacinaGestacao {
  vacina: Vacina;
  dosesEsperadas: number;
  situacaoCalendario: SituacaoCalendario;
  registros: RegistroVacina[];
}

export interface DadosVacina {
  vacina: Vacina;
  dose: number;
  situacao: SituacaoVacina;
  aplicadaEm: string | null;
  lote: string | null;
  local: string | null;
  observacao: string | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

interface ResultadoBruto {
  componente: string;
  nome: string;
  natureza: NaturezaComponente;
  valor_numerico: number | null;
  valor_qualitativo: ResultadoQualitativo | null;
  rotulo: string | null;
  unidade: string | null;
  ref_min: number | null;
  ref_max: number | null;
  alterado?: boolean;
}

interface RegistroBruto {
  id: string;
  dose: number;
  situacao: SituacaoVacina;
  aplicada_em: string | null;
  lote: string | null;
  local: string | null;
  observacao?: string | null;
}

function opcional<T>(valor: T | null): T | undefined {
  return valor === null ? undefined : valor;
}

function deResultado(r: ResultadoBruto): ResultadoComponente {
  return {
    componente: r.componente,
    nome: r.nome,
    natureza: r.natureza,
    valorNumerico: r.valor_numerico ?? null,
    valorQualitativo: r.valor_qualitativo ?? null,
    rotulo: r.rotulo ?? null,
    unidade: r.unidade ?? null,
    refMin: r.ref_min ?? null,
    refMax: r.ref_max ?? null,
    alterado: r.alterado ?? false,
  };
}

function deExame(l: LinhaExame): Exame {
  return {
    id: l.id,
    tipoExame: l.tipo_exame,
    tipoNome: l.tipo_nome,
    coletadoEm: l.coletado_em,
    observacao: l.observacao ?? null,
    alterado: l.alterado,
    documentoId: l.documento_id ?? null,
    protocoloItemId: l.protocolo_item_id ?? null,
    registradoPorNome: l.registrado_por_nome,
    papelAutor: l.papel_autor,
    registradoEm: l.registrado_em,
    liberadoEm: l.liberado_em ?? null,
    comunicadoPresencialmente: l.comunicado_presencialmente,
    resultados: ((l.resultados as unknown as ResultadoBruto[] | null) ?? []).map(deResultado),
  };
}

function deVacina(l: LinhaVacina): VacinaGestacao {
  return {
    vacina: l.vacina,
    dosesEsperadas: l.doses_esperadas,
    situacaoCalendario: l.situacao_calendario as SituacaoCalendario,
    registros: ((l.registros as unknown as RegistroBruto[] | null) ?? []).map((r) => ({
      id: r.id,
      dose: r.dose,
      situacao: r.situacao,
      aplicadaEm: r.aplicada_em ?? null,
      lote: r.lote ?? null,
      local: r.local ?? null,
      observacao: r.observacao ?? null,
    })),
  };
}

/** Linhas planas do catálogo viram tipos com seus componentes, na ordem da RPC. */
function agruparCatalogo(linhas: LinhaCatalogo[]): TipoExameCatalogo[] {
  const tipos = new Map<string, TipoExameCatalogo>();
  for (const l of linhas) {
    let tipo = tipos.get(l.tipo_exame);
    if (tipo === undefined) {
      tipo = { codigo: l.tipo_exame, nome: l.tipo_nome, componentes: [] };
      tipos.set(l.tipo_exame, tipo);
    }
    tipo.componentes.push({
      codigo: l.componente,
      nome: l.componente_nome,
      natureza: l.natureza,
      unidade: l.unidade ?? null,
      refMin: l.ref_min ?? null,
      refMax: l.ref_max ?? null,
      rotuloNegativo: l.rotulo_negativo ?? null,
      rotuloPositivo: l.rotulo_positivo ?? null,
      obrigatorio: l.obrigatorio,
    });
  }
  return [...tipos.values()];
}

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** "10,2 g/dL" ou o rótulo do resultado qualitativo ("Reagente"). */
export function formatarValor(r: ResultadoComponente): string {
  if (r.natureza === 'qualitativo') {
    return r.rotulo ?? '—';
  }
  if (r.valorNumerico === null) {
    return '—';
  }
  const numero = NUMERO.format(r.valorNumerico);
  return r.unidade ? `${numero} ${r.unidade}` : numero;
}

/** "≥ 11 g/dL", "150–450 mil/mm³" ou vazio quando o componente não tem referência. */
export function formatarReferencia(r: ResultadoComponente): string {
  const unidade = r.unidade ? ` ${r.unidade}` : '';
  if (r.refMin !== null && r.refMax !== null) {
    return `${NUMERO.format(r.refMin)}–${NUMERO.format(r.refMax)}${unidade}`;
  }
  if (r.refMin !== null) {
    return `≥ ${NUMERO.format(r.refMin)}${unidade}`;
  }
  if (r.refMax !== null) {
    return `≤ ${NUMERO.format(r.refMax)}${unidade}`;
  }
  return '';
}

@Injectable({ providedIn: 'root' })
export class ExamesService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async catalogo(): Promise<Resultado<TipoExameCatalogo[]>> {
    const { data, error } = await this.supabase.rpc('catalogo_exames');
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: agruparCatalogo(data ?? []) };
  }

  async exames(gestacaoId: string): Promise<Resultado<Exame[]>> {
    const { data, error } = await this.supabase.rpc('exames_da_gestacao', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []).map(deExame) };
  }

  /** Devolve se o exame ficou alterado, calculado pelo Postgres. */
  async registrarResultado(
    id: string,
    gestacaoId: string,
    tipoExame: string,
    coletadoEm: string,
    resultados: ValorComponente[],
    observacao: string | null,
    documentoId: string | null,
  ): Promise<Resultado<boolean>> {
    const { data, error } = await this.supabase.rpc('registrar_resultado_exame', {
      p_id: id,
      p_gestacao_id: gestacaoId,
      p_tipo_exame: tipoExame,
      p_coletado_em: coletadoEm,
      p_resultados: resultados.map((r) => ({
        componente: r.componente,
        valor_numerico: r.valorNumerico,
        valor_qualitativo: r.valorQualitativo,
      })),
      p_observacao: opcional(observacao),
      p_documento_id: opcional(documentoId),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: data };
  }

  async excluirResultado(id: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('excluir_resultado_exame', { p_id: id });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async liberar(id: string, confirmarComunicado: boolean): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('liberar_exame', {
      p_id: id,
      p_confirmar_comunicado: confirmarComunicado,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async vacinas(gestacaoId: string): Promise<Resultado<VacinaGestacao[]>> {
    const { data, error } = await this.supabase.rpc('vacinas_da_gestacao', {
      p_gestacao_id: gestacaoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []).map(deVacina) };
  }

  async registrarVacina(
    id: string,
    gestacaoId: string,
    dados: DadosVacina,
  ): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('registrar_vacina', {
      p_id: id,
      p_gestacao_id: gestacaoId,
      p_vacina: dados.vacina,
      p_dose: dados.dose,
      p_situacao: dados.situacao,
      p_aplicada_em: opcional(dados.aplicadaEm),
      p_lote: opcional(dados.lote),
      p_local: opcional(dados.local),
      p_observacao: opcional(dados.observacao),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async excluirVacina(id: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('excluir_vacina', { p_id: id });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async vincularProtocolo(raizId: string, tipoExame: string | null): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('vincular_exame_protocolo', {
      p_raiz_id: raizId,
      p_tipo_exame: opcional(tipoExame),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }
}
