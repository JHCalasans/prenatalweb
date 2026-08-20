import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { AconchegoPreset } from './core/theme/aconchego.preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    providePrimeNG({
      theme: {
        preset: AconchegoPreset,
        options: {
          // O Aconchego só existe em modo claro; `.app-dark` reservado para um
          // futuro tema escuro real, sem depender do `prefers-color-scheme`.
          darkModeSelector: '.app-dark',
          // Ordem declarada também em src/styles.scss (@layer theme, base, primeng).
          cssLayer: { name: 'primeng', order: 'theme, base, primeng' },
        },
      },
    }),
  ],
};
