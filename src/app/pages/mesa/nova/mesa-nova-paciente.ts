import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputMaskModule } from 'primeng/inputmask';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { paraDataIso } from '../../../core/formato/data';
import { PacientesService, PapelVinculo } from '../../../core/pacientes/pacientes.service';
import { CodigoConvite } from '../codigo-convite/codigo-convite';

// Cadastro pela própria médica: a RPC cria paciente, vínculo com ela e o
// convite numa transação; o código volta uma única vez para o diálogo.
@Component({
  imports: [
    ButtonModule,
    CodigoConvite,
    DatePickerModule,
    InputMaskModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    RouterLink,
    SelectModule,
  ],
  selector: 'app-mesa-nova-paciente',
  styleUrl: './mesa-nova-paciente.scss',
  templateUrl: './mesa-nova-paciente.html',
})
export class MesaNovaPaciente {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pacientes = inject(PacientesService);
  private readonly router = inject(Router);

  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly codigo = signal<string | null>(null);
  protected readonly pacienteCriadaId = signal<string | null>(null);
  protected readonly hoje = new Date();

  protected readonly papeisVinculo = [
    { rotulo: 'Obstetra', valor: 'obstetra' as PapelVinculo },
    { rotulo: 'Medicina fetal', valor: 'medicina_fetal' as PapelVinculo },
  ];

  protected readonly formulario = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    papelVinculo: ['obstetra' as PapelVinculo],
    dataNascimento: [null as Date | null],
    cpf: [''],
    contatoEmergencia: [''],
  });

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.salvando()) {
      return;
    }
    this.erro.set(null);
    this.salvando.set(true);
    try {
      const bruto = this.formulario.getRawValue();
      const resultado = await this.pacientes.criarComConvite({
        nome: bruto.nome.trim(),
        papelVinculo: bruto.papelVinculo,
        dataNascimento: paraDataIso(bruto.dataNascimento),
        cpf: bruto.cpf.trim() === '' ? null : bruto.cpf.trim(),
        contatoEmergencia:
          bruto.contatoEmergencia.trim() === '' ? null : bruto.contatoEmergencia.trim(),
      });
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.pacienteCriadaId.set(resultado.valor.pacienteId);
      this.codigo.set(resultado.valor.codigo);
    } finally {
      this.salvando.set(false);
    }
  }

  protected irParaCartao(): void {
    const id = this.pacienteCriadaId();
    this.codigo.set(null);
    if (id !== null) {
      void this.router.navigate(['/mesa', id]);
    }
  }
}
