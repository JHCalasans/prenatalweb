import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session } from '@supabase/supabase-js';
import { Database } from '../../../types/database.types';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ehPapelEquipe, PapelEquipe } from './papel';

type PerfilRow = Database['public']['Tables']['profiles']['Row'];

export type Perfil = Pick<PerfilRow, 'id' | 'nome'> & { papel: PapelEquipe };

export type MotivoFalha = 'credenciais' | 'sem_perfil' | 'papel_negado';

export type ResultadoLogin = { ok: true } | { ok: false; motivo: MotivoFalha; mensagem: string };

const MENSAGENS: Record<MotivoFalha, string> = {
  credenciais: 'E-mail ou senha inválidos.',
  sem_perfil: 'Esta conta não tem perfil na clínica. Procure a administração.',
  papel_negado: 'Acesso restrito à equipe da clínica. Gestantes usam o aplicativo.',
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly router = inject(Router);

  private readonly sessaoSig = signal<Session | null>(null);
  private readonly perfilSig = signal<Perfil | null>(null);
  private saidaIntencional = false;

  readonly sessao = this.sessaoSig.asReadonly();
  readonly perfil = this.perfilSig.asReadonly();
  readonly autenticado = computed(() => this.sessaoSig() !== null && this.perfilSig() !== null);
  readonly papel = computed<PapelEquipe | null>(() => this.perfilSig()?.papel ?? null);

  async inicializar(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    if (data.session) {
      const resultado = await this.carregarPerfil(data.session.user.id);
      if (resultado.ok) {
        this.sessaoSig.set(data.session);
        this.perfilSig.set(resultado.perfil);
      } else {
        this.saidaIntencional = true;
        await this.supabase.auth.signOut();
      }
    }

    // Callback síncrono de propósito: chamar o supabase-js aqui trava o cliente.
    this.supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) {
        this.sessaoSig.set(sessao);
        return;
      }
      const tinhaSessao = this.sessaoSig() !== null;
      this.sessaoSig.set(null);
      this.perfilSig.set(null);
      if (tinhaSessao && !this.saidaIntencional) {
        void this.router.navigate(['/login'], { queryParams: { expirada: 1 } });
      }
      this.saidaIntencional = false;
    });
  }

  async entrar(email: string, senha: string): Promise<ResultadoLogin> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error || !data.session) {
      return { ok: false, motivo: 'credenciais', mensagem: MENSAGENS.credenciais };
    }

    const resultado = await this.carregarPerfil(data.session.user.id);
    if (!resultado.ok) {
      await this.descartarSessao();
      return { ok: false, motivo: resultado.motivo, mensagem: MENSAGENS[resultado.motivo] };
    }

    this.sessaoSig.set(data.session);
    this.perfilSig.set(resultado.perfil);
    return { ok: true };
  }

  async sair(): Promise<void> {
    this.saidaIntencional = true;
    await this.supabase.auth.signOut();
    this.sessaoSig.set(null);
    this.perfilSig.set(null);
    await this.router.navigate(['/login']);
  }

  // Perfil de `paciente` é tratado como ausência de acesso: a sessão é
  // descartada antes de qualquer navegação para não sobrar token válido.
  private async carregarPerfil(
    userId: string,
  ): Promise<{ ok: true; perfil: Perfil } | { ok: false; motivo: MotivoFalha }> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, nome, papel')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, motivo: 'sem_perfil' };
    }
    if (!ehPapelEquipe(data.papel)) {
      return { ok: false, motivo: 'papel_negado' };
    }
    return { ok: true, perfil: { id: data.id, nome: data.nome, papel: data.papel } };
  }

  private async descartarSessao(): Promise<void> {
    this.saidaIntencional = true;
    await this.supabase.auth.signOut();
    this.sessaoSig.set(null);
    this.perfilSig.set(null);
  }
}
