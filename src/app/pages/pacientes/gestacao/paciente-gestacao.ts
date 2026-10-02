import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { deDataIso, formatarData, paraDataIso } from '../../../core/formato/data';
import { GestacaoAtiva, PacientesService, Resultado } from '../../../core/pacientes/pacientes.service';

@Component({
  imports: [ButtonModule, DatePickerModule, MessageModule, ReactiveFormsModule, TagModule],
  selector: 'app-paciente-gestacao',
  styleUrl: './paciente-gestacao.scss',
  templateUrl: './paciente-gestacao.html',
})
export class PacienteGestacao implements OnInit {
  readonly pacienteId = input.required<string>();
  readonly alterada = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pacientes = inject(PacientesService);

  protected readonly gestacao = signal<GestacaoAtiva | null>(null);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly editando = signal(false);

  protected readonly formatarData = formatarData;
  protected readonly hoje = new Date();
  // Mesma janela da RPC: DUM de uma gestação em curso (até 300 dias atrás).
  protected readonly dumMinima = new Date(
    this.hoje.getFullYear(),
    this.hoje.getMonth(),
    this.hoje.getDate() - 300,
  );

  protected readonly formulario = this.fb.group({
    dum: [null as Date | null, Validators.required],
  });

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    try {
      const resultado = await this.pacientes.gestacaoAtiva(this.pacienteId());
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.gestacao.set(resultado.valor);
      this.editando.set(false);
      this.formulario.setValue({ dum: null });
    } finally {
      this.carregando.set(false);
    }
  }

  protected abrirCorrecao(): void {
    this.erro.set(null);
    this.formulario.setValue({ dum: deDataIso(this.gestacao()?.dum ?? null) });
    this.editando.set(true);
  }

  protected fecharCorrecao(): void {
    this.editando.set(false);
    this.formulario.setValue({ dum: null });
  }

  protected async cadastrar(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      this.formulario.markAllAsTouched();
      return;
    }
    await this.executar(() =>
      this.pacientes.criarGestacao(this.pacienteId(), paraDataIso(this.formulario.getRawValue().dum)!),
    );
  }

  protected async salvarCorrecao(): Promise<void> {
    const gestacao = this.gestacao();
    if (gestacao === null || this.formulario.invalid || this.agindo()) {
      this.formulario.markAllAsTouched();
      return;
    }
    await this.executar(() =>
      this.pacientes.corrigirDum(gestacao.id, paraDataIso(this.formulario.getRawValue().dum)!),
    );
  }

  private async executar(acao: () => Promise<Resultado<unknown>>): Promise<void> {
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await acao();
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.alterada.emit();
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }
}
