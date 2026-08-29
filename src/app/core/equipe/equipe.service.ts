import { inject, Injectable } from '@angular/core';
import { PapelEquipe } from '../auth/papel';
import { ERRO_GENERICO } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

export interface MembroEquipe {
  id: string;
  nome: string;
  papel: PapelEquipe;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
}

export interface DadosNovoMembro {
  nome: string;
  email: string;
  papel: PapelEquipe;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

@Injectable({ providedIn: 'root' })
export class EquipeService {
  private readonly supabase = inject(SUPABASE_CLIENT);

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
    const resultado = await this.chamar<{ membros: MembroEquipe[] }>({ acao: 'listar' });
    return resultado.ok ? { ok: true, valor: resultado.valor.membros } : resultado;
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
