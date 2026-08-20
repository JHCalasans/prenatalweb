import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { rotuloPapel } from '../../core/auth/papel';

@Component({
  imports: [],
  selector: 'app-inicio',
  styleUrl: './inicio.scss',
  templateUrl: './inicio.html',
})
export class Inicio {
  private readonly auth = inject(AuthService);

  protected readonly perfil = this.auth.perfil;
  protected readonly papelRotulo = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? '' : rotuloPapel(papel);
  });
}
