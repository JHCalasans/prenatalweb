import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, Perfil } from '../../core/auth/auth.service';
import { PapelEquipe } from '../../core/auth/papel';
import { Shell } from './shell';

function montar(papel: PapelEquipe) {
  const perfil: Perfil = { id: 'u1', nome: 'Helena', papel };
  TestBed.configureTestingModule({
    imports: [Shell],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { perfil: signal(perfil), papel: signal(papel), sair: vi.fn() },
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  fixture.detectChanges();
  return fixture;
}

function rotas(fixture: ReturnType<typeof montar>): string[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map(
    (a) => a.getAttribute('href') ?? '',
  );
}

describe('Shell', () => {
  it('menu da médica segue igual: mesa, protocolo e os quatro compartilhados', () => {
    expect(rotas(montar('medica'))).toEqual([
      '/inicio',
      '/agenda',
      '/mesa',
      '/protocolo',
      '/auditoria',
      '/relatorios',
    ]);
  });

  it('menu da secretaria não traz mais Relatórios nem Equipe', () => {
    expect(rotas(montar('secretaria'))).toEqual(['/inicio', '/agenda', '/pacientes', '/convites']);
  });

  it('menu do admin traz Início, Convites, Equipe, Catálogo de exames, Auditoria e Relatórios', () => {
    expect(rotas(montar('admin'))).toEqual([
      '/inicio',
      '/convites',
      '/equipe',
      '/catalogo',
      '/auditoria',
      '/relatorios',
    ]);
  });

  it('topo mostra o rótulo Administração para o admin', () => {
    const texto = (montar('admin').nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Administração');
  });
});
