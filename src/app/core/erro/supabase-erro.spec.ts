import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PostgrestError } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ERRO_GENERICO, ErroSupabase, SESSAO_EXPIRADA, SEM_ACESSO } from './supabase-erro';

function clienteFalso() {
  return {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

// Sessão de verdade (via entrar) para exercitar os caminhos que consultam o
// estado de autenticação e o token do dispositivo.
function clienteComSessao() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'u1' } } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'u1', nome: 'Ana', papel: 'medica' },
            error: null,
          }),
        }),
      }),
    }),
  };
}

function erro(code: string, message = 'mensagem do banco'): PostgrestError {
  return { code, message, details: '', hint: '' } as PostgrestError;
}

function criar(cliente: unknown): ErroSupabase {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: SUPABASE_CLIENT, useValue: cliente },
    ],
  });
  return TestBed.inject(ErroSupabase);
}

describe('ErroSupabase', () => {
  it('devolve a mensagem de sessão expirada e encerra a sessão no PGRST301', () => {
    const erros = criar(clienteFalso());
    const auth = TestBed.inject(AuthService);
    const encerrar = vi.spyOn(auth, 'encerrarPorExpiracao').mockResolvedValue();

    const mensagem = erros.mensagem(erro('PGRST301', 'JWT expired'));

    expect(mensagem).toBe(SESSAO_EXPIRADA);
    expect(encerrar).toHaveBeenCalledTimes(1);
  });

  it('devolve a mensagem de sem acesso no 42501', () => {
    const erros = criar(clienteFalso());

    const mensagem = erros.mensagem(erro('42501', 'permission denied for table'));

    expect(mensagem).toBe(SEM_ACESSO);
  });

  it('repassa a mensagem das RPCs no P0001', () => {
    const erros = criar(clienteFalso());

    const mensagem = erros.mensagem(erro('P0001', 'Apenas a médica vinculada publica o documento'));

    expect(mensagem).toBe('Apenas a médica vinculada publica o documento');
  });

  it('repassa a mensagem no P0001 com sessão viva e token no dispositivo', async () => {
    const erros = criar(clienteComSessao());
    const auth = TestBed.inject(AuthService);
    const encerrar = vi.spyOn(auth, 'encerrarPorExpiracao').mockResolvedValue();
    await auth.entrar('ana@clinica.com', 'segredo');
    localStorage.setItem('sb-teste-auth-token', 'presente');

    const mensagem = erros.mensagem(erro('P0001', 'Apenas médicas consultam a auditoria'));

    expect(mensagem).toBe('Apenas médicas consultam a auditoria');
    expect(encerrar).not.toHaveBeenCalled();
    localStorage.removeItem('sb-teste-auth-token');
  });

  it('trata como sessão expirada o P0001 que chega com o token sumido do dispositivo', async () => {
    const erros = criar(clienteComSessao());
    const auth = TestBed.inject(AuthService);
    const encerrar = vi.spyOn(auth, 'encerrarPorExpiracao').mockResolvedValue();
    await auth.entrar('ana@clinica.com', 'segredo');

    const mensagem = erros.mensagem(erro('P0001', 'Apenas médicas consultam a auditoria'));

    expect(mensagem).toBe(SESSAO_EXPIRADA);
    expect(encerrar).toHaveBeenCalledTimes(1);
  });

  it('repassa a mensagem quando o localStorage não está acessível', async () => {
    const erros = criar(clienteComSessao());
    const auth = TestBed.inject(AuthService);
    const encerrar = vi.spyOn(auth, 'encerrarPorExpiracao').mockResolvedValue();
    await auth.entrar('ana@clinica.com', 'segredo');

    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('acesso ao armazenamento negado');
      },
    });

    try {
      expect(erros.mensagem(erro('P0001', 'Apenas médicas consultam a auditoria'))).toBe(
        'Apenas médicas consultam a auditoria',
      );
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      }
    }

    expect(encerrar).not.toHaveBeenCalled();
  });

  it('devolve a mensagem genérica para os demais códigos', () => {
    const erros = criar(clienteFalso());

    const mensagem = erros.mensagem(erro('08000', 'connection failure'));

    expect(mensagem).toBe(ERRO_GENERICO);
  });
});
