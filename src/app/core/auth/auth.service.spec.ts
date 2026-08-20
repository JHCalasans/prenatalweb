import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SUPABASE_CLIENT } from '../supabase-client';
import { AuthService } from './auth.service';

function clienteFalso(opcoes: {
  sessao?: unknown;
  erroLogin?: boolean;
  perfil?: { id: string; nome: string; papel: string } | null;
}) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  return {
    signOut,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: opcoes.sessao ?? null } }),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi
        .fn()
        .mockResolvedValue(
          opcoes.erroLogin
            ? { data: { session: null }, error: { message: 'invalid' } }
            : { data: { session: opcoes.sessao ?? null }, error: null },
        ),
      signOut,
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: opcoes.perfil ?? null, error: null }),
        }),
      }),
    }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): AuthService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: SUPABASE_CLIENT, useValue: cliente },
    ],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  const sessao = { user: { id: 'u1' } };

  it('autentica uma médica e expõe o papel', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Ana', papel: 'medica' },
    });
    const auth = criar(cliente);

    const resultado = await auth.entrar('ana@clinica.com', 'segredo');

    expect(resultado.ok).toBe(true);
    expect(auth.autenticado()).toBe(true);
    expect(auth.papel()).toBe('medica');
  });

  it('autentica uma secretaria', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Bia', papel: 'secretaria' },
    });
    const auth = criar(cliente);

    await auth.entrar('bia@clinica.com', 'segredo');

    expect(auth.papel()).toBe('secretaria');
  });

  it('recusa paciente e descarta a sessão', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Carla', papel: 'paciente' },
    });
    const auth = criar(cliente);

    const resultado = await auth.entrar('carla@x.com', 'segredo');

    expect(resultado).toMatchObject({ ok: false, motivo: 'papel_negado' });
    expect(auth.autenticado()).toBe(false);
    expect(cliente.auth.signOut).toHaveBeenCalled();
  });

  it('recusa conta sem perfil', async () => {
    const cliente = clienteFalso({ sessao, perfil: null });
    const auth = criar(cliente);

    const resultado = await auth.entrar('x@x.com', 'segredo');

    expect(resultado).toMatchObject({ ok: false, motivo: 'sem_perfil' });
  });

  it('devolve erro de credenciais sem consultar perfil', async () => {
    const cliente = clienteFalso({ erroLogin: true });
    const auth = criar(cliente);

    const resultado = await auth.entrar('x@x.com', 'errada');

    expect(resultado).toMatchObject({ ok: false, motivo: 'credenciais' });
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it('restaura a sessão persistida no boot', async () => {
    const cliente = clienteFalso({
      sessao,
      perfil: { id: 'u1', nome: 'Ana', papel: 'medica' },
    });
    const auth = criar(cliente);

    await auth.inicializar();

    expect(auth.autenticado()).toBe(true);
    expect(auth.perfil()?.nome).toBe('Ana');
  });
});
