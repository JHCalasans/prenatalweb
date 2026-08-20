import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  function montar(entrar: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { entrar } },
      ],
    });
    return TestBed.createComponent(Login);
  }

  it('desabilita o envio com formulário vazio', async () => {
    const fixture = montar(vi.fn());
    await fixture.whenStable();
    const botao = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
  });

  it('exibe o logo da aplicação acima do card', async () => {
    const fixture = montar(vi.fn());
    await fixture.whenStable();

    const logo = fixture.nativeElement.querySelector('.logo') as HTMLImageElement;
    expect(logo.getAttribute('src')).toBe('app-logo.png');
    expect(logo.alt).toBe('Pré-Natal Web');
    expect(logo.compareDocumentPosition(fixture.nativeElement.querySelector('.cartao'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('exibe a recuperação de senha e reserva a mensagem do formulário', async () => {
    const fixture = montar(vi.fn());
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.link-senha') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Esqueci minha senha');
    expect(link.getAttribute('href')).toBe('#');
    expect(fixture.nativeElement.querySelector('.mensagem-formulario')).not.toBeNull();
  });

  it('mostra a mensagem devolvida pelo serviço', async () => {
    const entrar = vi.fn().mockResolvedValue({
      ok: false,
      motivo: 'papel_negado',
      mensagem: 'Acesso restrito à equipe da clínica. Gestantes usam o aplicativo.',
    });
    const fixture = montar(entrar);
    const componente = fixture.componentInstance as unknown as {
      formulario: { setValue(v: { email: string; senha: string }): void };
      entrar(): Promise<void>;
    };
    componente.formulario.setValue({ email: 'a@b.com', senha: 'segredo' });

    await componente.entrar();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Acesso restrito');
  });
});
