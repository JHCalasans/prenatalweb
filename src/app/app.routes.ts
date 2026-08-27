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
        path: 'agenda',
        canActivate: [papelGuard('secretaria', 'medica')],
        loadComponent: () => import('./pages/agenda/agenda').then((m) => m.Agenda),
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
      {
        path: 'convites',
        canActivate: [papelGuard('secretaria')],
        loadComponent: () =>
          import('./pages/convites/lista/convites-lista').then((m) => m.ConvitesLista),
      },
      {
        path: 'equipe',
        canActivate: [papelGuard('secretaria')],
        loadComponent: () => import('./pages/equipe/lista/equipe-lista').then((m) => m.EquipeLista),
      },
      {
        path: 'protocolo',
        canActivate: [papelGuard('medica')],
        loadComponent: () =>
          import('./pages/protocolo/lista/protocolo-lista').then((m) => m.ProtocoloLista),
      },
      {
        path: 'mesa',
        canActivate: [papelGuard('medica')],
        children: [
          {
            path: '',
            loadComponent: () => import('./pages/mesa/lista/mesa-lista').then((m) => m.MesaLista),
          },
          {
            path: ':pacienteId',
            loadComponent: () =>
              import('./pages/mesa/cartao/cartao-gestante').then((m) => m.CartaoGestante),
          },
        ],
      },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  { path: '**', redirectTo: '' },
];
