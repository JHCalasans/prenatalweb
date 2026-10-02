import { inject, Injectable } from '@angular/core';
import { NaturezaComponente } from './exames.service';
import { ErroSupabase } from '../erro/supabase-erro';
import { SUPABASE_CLIENT } from '../supabase-client';

export interface DadosComponente {
  codigo: string;
  nome: string;
  natureza: NaturezaComponente;
  unidade: string | null;
  refMin: number | null;
  refMax: number | null;
  rotuloNegativo: string | null;
  rotuloPositivo: string | null;
  positivoAlterado: boolean;
  obrigatorio: boolean;
}

export interface DadosTipoExame {
  criando: boolean;
  codigo: string;
  nome: string;
  ordem: number;
  componentes: DadosComponente[];
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; mensagem: string };

// Escrita do catálogo: a RPC valida, grava tipo e componentes numa transação
// só e audita; o cliente só monta o payload.
@Injectable({ providedIn: 'root' })
export class CatalogoExamesService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly erros = inject(ErroSupabase);

  async salvar(dados: DadosTipoExame): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('salvar_tipo_exame', {
      p_criando: dados.criando,
      p_codigo: dados.codigo,
      p_nome: dados.nome,
      p_ordem: dados.ordem,
      p_componentes: dados.componentes.map((c) => ({
        codigo: c.codigo,
        nome: c.nome,
        natureza: c.natureza,
        unidade: c.unidade,
        ref_min: c.refMin,
        ref_max: c.refMax,
        rotulo_negativo: c.rotuloNegativo,
        rotulo_positivo: c.rotuloPositivo,
        positivo_alterado: c.positivoAlterado,
        obrigatorio: c.obrigatorio,
      })),
    });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }

  async excluir(codigo: string): Promise<Resultado<null>> {
    const { error } = await this.supabase.rpc('excluir_tipo_exame', { p_codigo: codigo });
    if (error) {
      return { ok: false, mensagem: this.erros.mensagem(error) };
    }
    return { ok: true, valor: null };
  }
}
