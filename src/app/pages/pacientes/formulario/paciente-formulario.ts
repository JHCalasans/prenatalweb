import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputMaskModule } from 'primeng/inputmask';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { deDataIso, paraDataIso } from '../../../core/formato/data';
import { Medica, PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacienteVinculos } from '../vinculos/paciente-vinculos';

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    InputMaskModule,
    InputTextModule,
    MessageModule,
    PacienteVinculos,
    ReactiveFormsModule,
    RouterLink,
    SelectModule,
  ],
  selector: 'app-paciente-formulario',
  styleUrl: './paciente-formulario.scss',
  templateUrl: './paciente-formulario.html',
})
export class PacienteFormulario implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pacientes = inject(PacientesService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  protected readonly id = signal<string | null>(this.rota.snapshot.paramMap.get('id'));
  protected readonly edicao = computed(() => this.id() !== null);
  protected readonly medicas = signal<Medica[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly hoje = new Date();

  protected readonly papeisVinculo = [
    { rotulo: 'Obstetra', valor: 'obstetra' as const },
    { rotulo: 'Medicina fetal', valor: 'medicina_fetal' as const },
  ];

  protected readonly formulario = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    medicaId: [''],
    papelVinculo: ['obstetra' as 'obstetra' | 'medicina_fetal'],
    dataNascimento: [null as Date | null],
    cpf: [''],
    contatoEmergencia: [''],
  });

  async ngOnInit(): Promise<void> {
    try {
      if (this.edicao()) {
        const resultado = await this.pacientes.buscarPorId(this.id()!);
        if (!resultado.ok) {
          this.erro.set(resultado.mensagem);
          return;
        }
        this.formulario.patchValue({
          nome: resultado.valor.nome,
          dataNascimento: deDataIso(resultado.valor.dataNascimento),
          cpf: resultado.valor.cpf ?? '',
          contatoEmergencia: resultado.valor.contatoEmergencia ?? '',
        });
        return;
      }

      this.formulario.controls.medicaId.addValidators(Validators.required);
      this.formulario.controls.medicaId.updateValueAndValidity();

      const resultado = await this.pacientes.listarMedicas();
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.medicas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.salvando()) {
      return;
    }
    this.erro.set(null);
    this.salvando.set(true);
    try {
      const bruto = this.formulario.getRawValue();
      const comuns = {
        nome: bruto.nome.trim(),
        dataNascimento: paraDataIso(bruto.dataNascimento),
        cpf: bruto.cpf.trim() === '' ? null : bruto.cpf.trim(),
        contatoEmergencia:
          bruto.contatoEmergencia.trim() === '' ? null : bruto.contatoEmergencia.trim(),
      };

      const resultado = this.edicao()
        ? await this.pacientes.atualizar(this.id()!, comuns)
        : await this.pacientes.criar({
            ...comuns,
            medicaId: bruto.medicaId,
            papelVinculo: bruto.papelVinculo,
          });

      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.router.navigate(['/pacientes']);
    } finally {
      this.salvando.set(false);
    }
  }
}
