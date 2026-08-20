import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from './auth.service';
import { deslogadoGuard, papelGuard, sessaoGuard } from './auth.guard';

function configurar(autenticado: boolean, papel: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { autenticado: signal(autenticado), papel: signal(papel) },
      },
    ],
  });
}

const rota = {} as ActivatedRouteSnapshot;
const estado = { url: '/inicio' } as RouterStateSnapshot;

describe('guards de autenticação', () => {
  it('sessaoGuard libera quem está autenticado', () => {
    configurar(true, 'medica');
    expect(TestBed.runInInjectionContext(() => sessaoGuard(rota, estado))).toBe(true);
  });

  it('sessaoGuard manda para o login preservando a rota', () => {
    configurar(false, null);
    const resultado = TestBed.runInInjectionContext(() => sessaoGuard(rota, estado));
    expect(resultado).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(resultado as UrlTree)).toContain(
      'retorno=%2Finicio',
    );
  });

  it('deslogadoGuard tira do login quem já entrou', () => {
    configurar(true, 'secretaria');
    expect(TestBed.runInInjectionContext(() => deslogadoGuard(rota, estado))).toBeInstanceOf(
      UrlTree,
    );
  });

  it('papelGuard libera o papel permitido', () => {
    configurar(true, 'secretaria');
    const guard = papelGuard('secretaria');
    expect(TestBed.runInInjectionContext(() => guard(rota, estado))).toBe(true);
  });

  it('papelGuard barra papel fora da lista', () => {
    configurar(true, 'medica');
    const guard = papelGuard('secretaria');
    expect(TestBed.runInInjectionContext(() => guard(rota, estado))).toBeInstanceOf(UrlTree);
  });
});
