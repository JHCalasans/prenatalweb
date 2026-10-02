import { inject, Injectable } from '@angular/core';
import { PapelEquipe } from '../auth/papel';
import { ERRO_GENERICO, ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

export interface MembroEquipe {
  id: string;
  nome: string;
  papel: PapelEquipe;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  crm: string | null;
  crmUf: string | null;
}

// A Edge Function devolve as colunas de CRM como estão no banco.
type MembroBruto = Omit<MembroEquipe, 'crm' | 'crmUf'> & {
  crm?: string | null;
  crm_uf?: string | null;
};

export interface DadosNovoMembro {
  nome: string;
  email: string;
  papel: PapelEquipe;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

@Injectable({ providedIn: 'root' })
export class EquipeService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  private async chamar<T>(corpo: Record<string, unknown>): Promise<Resultado<T>> {
    const { data, error } = await this.supabase.functions.invoke('gerir-equipe', {
      body: corpo,
    });

    if (error) {
      return { ok: false, mensagem: await this.mensagemDoErro(error) };
    }
    return { ok: true, valor: data as T };
  }

  // A mensagem de erro da função chega no Response armazenado em error.context.
  private async mensagemDoErro(erro: unknown): Promise<string> {
    const contexto = (erro as { context?: Response }).context;
    if (contexto && typeof contexto.json === 'function') {
      try {
        const corpo = (await contexto.json()) as { error?: string };
        if (corpo?.error) {
          return corpo.error;
        }
      } catch {
        return ERRO_GENERICO;
      }
    }
    return ERRO_GENERICO;
  }

  async listar(): Promise<Resultado<MembroEquipe[]>> {
    const resultado = await this.chamar<{ membros: MembroBruto[] }>({ acao: 'listar' });
    if (!resultado.ok) {
      return resultado;
    }
    return {
      ok: true,
      valor: resultado.valor.membros.map(({ crm, crm_uf, ...membro }) => ({
        ...membro,
        crm: crm ?? null,
        crmUf: crm_uf ?? null,
      })),
    };
  }

  // CRM não passa pela Edge Function: a RPC já tem o gate de admin e audita.
  async definirCrm(
    medicaId: string,
    crm: string | null,
    crmUf: string | null,
  ): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('definir_crm', {
      p_medica_id: medicaId,
      p_crm: crm ?? undefined,
      p_crm_uf: crmUf ?? undefined,
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async criar(dados: DadosNovoMembro): Promise<Resultado<string>> {
    const resultado = await this.chamar<{ usuario_id: string; senha: string }>({
      acao: 'criar',
      nome: dados.nome,
      email: dados.email,
      papel: dados.papel,
    });
    return resultado.ok ? { ok: true, valor: resultado.valor.senha } : resultado;
  }

  async alterarPapel(usuarioId: string, papel: PapelEquipe): Promise<Resultado<null>> {
    const resultado = await this.chamar<unknown>({
      acao: 'alterar_papel',
      usuario_id: usuarioId,
      papel,
    });
    return resultado.ok ? { ok: true, valor: null } : resultado;
  }

  async redefinirSenha(usuarioId: string): Promise<Resultado<string>> {
    const resultado = await this.chamar<{ senha: string }>({
      acao: 'redefinir_senha',
      usuario_id: usuarioId,
    });
    return resultado.ok ? { ok: true, valor: resultado.valor.senha } : resultado;
  }

  async desativar(usuarioId: string): Promise<Resultado<null>> {
    const resultado = await this.chamar<unknown>({ acao: 'desativar', usuario_id: usuarioId });
    return resultado.ok ? { ok: true, valor: null } : resultado;
  }

  async reativar(usuarioId: string): Promise<Resultado<null>> {
    const resultado = await this.chamar<unknown>({ acao: 'reativar', usuario_id: usuarioId });
    return resultado.ok ? { ok: true, valor: null } : resultado;
  }
}
