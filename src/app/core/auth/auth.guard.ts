import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PapelEquipe } from './papel';

export const sessaoGuard: CanActivateFn = (_rota, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { retorno: estado.url } });
};

export const deslogadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.autenticado() ? router.createUrlTree(['/inicio']) : true;
};

export function papelGuard(...papeis: readonly PapelEquipe[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const papel = auth.papel();
    if (papel !== null && papeis.includes(papel)) {
      return true;
    }
    return router.createUrlTree(['/sem-acesso']);
  };
}
