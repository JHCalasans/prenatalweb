import { Routes } from '@angular/router';
import { deslogadoGuard, papelGuard, sessaoGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [deslogadoGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'sem-acesso',
    loadComponent: () => import('./pages/sem-acesso/sem-acesso').then((m) => m.SemAcesso),
  },
  {
    path: '',
    canActivate: [sessaoGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./pages/inicio/inicio').then((m) => m.Inicio),
      },
      {
        path: 'pacientes',
        canActivate: [papelGuard('secretaria')],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./pages/pacientes/lista/pacientes-lista').then((m) => m.PacientesLista),
          },
          {
            path: 'nova',
            loadComponent: () =>
              import('./pages/pacientes/formulario/paciente-formulario').then(
                (m) => m.PacienteFormulario,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./pages/pacientes/formulario/paciente-formulario').then(
                (m) => m.PacienteFormulario,
              ),
          },
        ],
      },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  { path: '**', redirectTo: '' },
];
