import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { rotuloPapel } from '../../core/auth/papel';

@Component({
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-shell',
  styleUrl: './shell.scss',
  templateUrl: './shell.html',
})
export class Shell {
  private readonly auth = inject(AuthService);

  protected readonly perfil = this.auth.perfil;
  protected readonly papelRotulo = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? '' : rotuloPapel(papel);
  });

  protected async sair(): Promise<void> {
    await this.auth.sair();
  }
}
