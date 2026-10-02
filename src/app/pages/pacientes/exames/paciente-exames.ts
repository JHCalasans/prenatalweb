import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PainelExames } from '../../exames/painel/painel-exames';
import { PainelVacinas } from '../../exames/vacinas/painel-vacinas';

/** Exames e vacinas na ficha da paciente: a secretaria registra, a médica libera no cartão. */
@Component({
  imports: [MessageModule, PainelExames, PainelVacinas],
  selector: 'app-paciente-exames',
  styleUrl: './paciente-exames.scss',
  templateUrl: './paciente-exames.html',
})
export class PacienteExames implements OnInit {
  readonly pacienteId = input.required<string>();

  private readonly pacientes = inject(PacientesService);

  protected readonly gestacaoId = signal<string | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    void this.carregar();
  }

  private async carregar(): Promise<void> {
    try {
      const resultado = await this.pacientes.gestacaoAtiva(this.pacienteId());
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.gestacaoId.set(resultado.valor?.id ?? null);
    } finally {
      this.carregando.set(false);
    }
  }
}
