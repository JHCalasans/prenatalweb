import { inject, Injectable } from '@angular/core';
import { Database } from '../../../types/database.types';
import { ERRO_GENERICO, ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

type LinhaChecklist = Database['public']['Functions']['checklist_da_gestacao']['Returns'][number];
type LinhaVinculo = Database['public']['Functions']['vinculos_da_paciente']['Returns'][number];
type StatusChecklist = Database['public']['Enums']['status_checklist'];
type TipoDocumento = Database['public']['Enums']['tipo_documento'];

// O gerador não sabe a nulabilidade das colunas de retorno de função.
export type ItemChecklist = Omit<LinhaChecklist, 'data' | 'observacao'> & {
  data: string | null;
  observacao: string | null;
};

export type VinculoCartao = LinhaVinculo;
export type { StatusChecklist, TipoDocumento };

// Limites do bucket `documentos`; validar aqui evita criar rascunho que o
// upload vai recusar.
export const EXTENSOES_DOCUMENTO = ['pdf', 'jpg', 'jpeg', 'png'];
export const TAMANHO_MAXIMO_DOCUMENTO = 20 * 1024 * 1024;
export const ERRO_EXTENSAO_DOCUMENTO = 'Extensão não suportada. Envie PDF, JPG ou PNG.';
export const ERRO_TAMANHO_DOCUMENTO = 'Arquivo acima de 20 MB.';

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
  storagePath: string;
}

export interface DadosRascunho {
  gestacaoId: string;
  tipo: TipoDocumento;
  titulo: string;
  dataExame: string | null;
  achadoAlterado: boolean;
  arquivo: File;
}

export interface DadosMarcacao {
  gestacaoId: string;
  protocoloItemId: string;
  status: StatusChecklist;
  data: string | null;
  observacao: string | null;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

// Os Args gerados usam `p_x?: string`; undefined omite a chave e a RPC aplica
// o `default null` do banco.
function opcional(valor: string | null): string | undefined {
  return valor === null ? undefined : valor;
}

// Última extensão em minúsculas, só se o bucket aceita.
function extensaoDe(nome: string): string | null {
  const partes = nome.split('.');
  if (partes.length < 2) {
    return null;
  }
  const extensao = partes[partes.length - 1].toLowerCase();
  return EXTENSOES_DOCUMENTO.includes(extensao) ? extensao : null;
}

function mimeDe(extensao: string): string {
  if (extensao === 'pdf') {
    return 'application/pdf';
  }
  return extensao === 'png' ? 'image/png' : 'image/jpeg';
}

@Injectable({ providedIn: 'root' })
export class CartaoService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async paciente(pacienteId: string): Promise<Resultado<PacienteCartao>> {
    const { data, error } = await this.supabase
      .from('pacientes')
      .select('id, nome, data_nascimento, cpf, contato_emergencia')
      .eq('id', pacienteId)
      .maybeSingle();
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
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
      return { ok: false, mensagem: this.erros.mensagem(error) };
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
      return { ok: false, mensagem: this.erros.mensagem(error) };
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
      return { ok: false, mensagem: this.erros.mensagem(error) };
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
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: (data ?? []) as ItemChecklist[] };
  }

  async documentos(gestacaoId: string): Promise<Resultado<DocumentoCartao[]>> {
    const { data, error } = await this.supabase
      .from('documentos')
      .select(
        'id, tipo, titulo, data_exame, achado_alterado, comunicado_presencialmente, publicado_em, arquivo_enviado_em, storage_path',
      )
      .eq('gestacao_id', gestacaoId)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
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
        storagePath: d.storage_path,
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
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async criarRascunho(dados: DadosRascunho): Promise<Resultado<string>> {
    const extensao = extensaoDe(dados.arquivo.name);
    if (extensao === null) {
      return { ok: false, mensagem: ERRO_EXTENSAO_DOCUMENTO };
    }
    if (dados.arquivo.size > TAMANHO_MAXIMO_DOCUMENTO) {
      return { ok: false, mensagem: ERRO_TAMANHO_DOCUMENTO };
    }

    const { data, error } = await this.supabase.rpc('criar_documento_rascunho', {
      p_gestacao_id: dados.gestacaoId,
      p_tipo: dados.tipo,
      p_titulo: dados.titulo,
      p_extensao: extensao,
      p_data_exame: opcional(dados.dataExame),
      p_achado_alterado: dados.achadoAlterado,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    const linha = (data ?? [])[0];
    if (linha === undefined) {
      return { ok: false, mensagem: ERRO_GENERICO };
    }

    // A policy do storage casa objeto e documento pelo `storage_path`, então
    // a ordem aqui é fixa: rascunho, upload, confirmação.
    const { error: erroUpload } = await this.supabase.storage
      .from('documentos')
      .upload(linha.storage_path, dados.arquivo, { contentType: mimeDe(extensao) });
    if (erroUpload !== null) {
      await this.excluirRascunho(linha.documento_id);
      return { ok: false, mensagem: ERRO_GENERICO };
    }

    const { error: erroConfirmacao } = await this.supabase.rpc('confirmar_upload_documento', {
      p_documento_id: linha.documento_id,
    });
    if (erroConfirmacao !== null) {
      await this.excluirRascunho(linha.documento_id);
      return { ok: false, mensagem: this.erros.mensagem(erroConfirmacao) };
    }
    return { ok: true, valor: linha.documento_id };
  }

  async publicar(documentoId: string, confirmarComunicado: boolean): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('publicar_documento', {
      p_documento_id: documentoId,
      p_confirmar_comunicado: confirmarComunicado,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async excluirRascunho(documentoId: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('excluir_documento_rascunho', {
      p_documento_id: documentoId,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async abrirArquivo(storagePath: string): Promise<Resultado<Blob>> {
    const { data, error } = await this.supabase.storage.from('documentos').download(storagePath);
    // Erro do Storage não é PostgrestError; não há mensagem útil nele.
    if (error !== null || data === null) {
      return { ok: false, mensagem: ERRO_GENERICO };
    }
    return { ok: true, valor: data };
  }

  async registrarLeitura(documentoId: string): Promise<void> {
    try {
      await this.supabase.rpc('log_documento_acesso', { p_documento_id: documentoId });
    } catch {
      // Auditoria: falha aqui não pode impedir a leitura.
    }
  }
}
