import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { PapelEquipe, rotuloPapel } from '../../core/auth/papel';

interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: string;
  papeis: readonly PapelEquipe[];
}

const MENU: readonly ItemMenu[] = [
  {
    rota: '/inicio',
    rotulo: 'Início',
    icone: 'pi-home',
    papeis: ['medica', 'secretaria', 'admin'],
  },
  { rota: '/agenda', rotulo: 'Agenda', icone: 'pi-calendar', papeis: ['medica', 'secretaria'] },
  { rota: '/mesa', rotulo: 'Minhas pacientes', icone: 'pi-users', papeis: ['medica'] },
  { rota: '/pacientes', rotulo: 'Pacientes', icone: 'pi-users', papeis: ['secretaria'] },
  { rota: '/convites', rotulo: 'Convites', icone: 'pi-send', papeis: ['secretaria', 'admin'] },
  { rota: '/protocolo', rotulo: 'Protocolo', icone: 'pi-list-check', papeis: ['medica'] },
  { rota: '/equipe', rotulo: 'Equipe', icone: 'pi-id-card', papeis: ['admin'] },
  { rota: '/auditoria', rotulo: 'Auditoria', icone: 'pi-history', papeis: ['medica', 'admin'] },
  { rota: '/relatorios', rotulo: 'Relatórios', icone: 'pi-chart-bar', papeis: ['medica', 'admin'] },
];

@Component({
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-shell',
  styleUrl: './shell.scss',
  templateUrl: './shell.html',
})
export class Shell {
  private readonly auth = inject(AuthService);

  protected readonly perfil = this.auth.perfil;
  protected readonly papel = this.auth.papel;
  protected readonly papelRotulo = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? '' : rotuloPapel(papel);
  });

  protected readonly itens = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? [] : MENU.filter((item) => item.papeis.includes(papel));
  });

  protected async sair(): Promise<void> {
    await this.auth.sair();
  }
}
