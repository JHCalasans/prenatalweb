import { Component, inject, input, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Medica, PacientesService } from '../../../core/pacientes/pacientes.service';
import { PapelVinculo, Vinculo, VinculosService } from '../../../core/vinculos/vinculos.service';

const PAPEIS: Record<string, string> = {
  obstetra: 'Obstetra',
  medicina_fetal: 'Medicina fetal',
};

@Component({
  imports: [
    ButtonModule,
    DialogModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-paciente-vinculos',
  styleUrl: './paciente-vinculos.scss',
  templateUrl: './paciente-vinculos.html',
})
export class PacienteVinculos implements OnInit {
  readonly pacienteId = input.required<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly vinculos = inject(VinculosService);
  private readonly pacientes = inject(PacientesService);

  protected readonly linhas = signal<Vinculo[]>([]);
  protected readonly medicas = signal<Medica[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly aInativar = signal<Vinculo | null>(null);
  protected readonly aTransferir = signal<Vinculo | null>(null);

  protected readonly papeis = [
    { rotulo: 'Obstetra', valor: 'obstetra' as PapelVinculo },
    { rotulo: 'Medicina fetal', valor: 'medicina_fetal' as PapelVinculo },
  ];

  protected readonly formulario = this.fb.group({
    medicaId: ['', Validators.required],
    papel: ['obstetra' as PapelVinculo, Validators.required],
  });

  protected readonly destino = this.fb.group({
    medicaId: ['', Validators.required],
  });

  ngOnInit(): void {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    try {
      const medicas = await this.pacientes.listarMedicas();
      if (medicas.ok) {
        this.medicas.set(medicas.valor);
      } else {
        this.erro.set(medicas.mensagem);
      }
      await this.carregar();
    } finally {
      this.carregando.set(false);
    }
  }

  protected rotuloPapel(papel: string): string {
    return PAPEIS[papel] ?? papel;
  }

  protected async carregar(): Promise<void> {
    const resultado = await this.vinculos.listar(this.pacienteId());
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      this.linhas.set([]);
      return;
    }
    this.linhas.set(resultado.valor);
  }

  protected async atribuir(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const { medicaId, papel } = this.formulario.getRawValue();
      const resultado = await this.vinculos.atribuir(this.pacienteId(), medicaId, papel);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.formulario.setValue({ medicaId: '', papel: 'obstetra' });
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarInativacao(): Promise<void> {
    const linha = this.aInativar();
    if (linha === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.vinculos.inativar(linha.vinculo_id);
      this.aInativar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected abrirTransferencia(linha: Vinculo): void {
    this.destino.setValue({ medicaId: '' });
    this.aTransferir.set(linha);
  }

  protected async confirmarTransferencia(): Promise<void> {
    const linha = this.aTransferir();
    if (linha === null || this.destino.invalid || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.vinculos.transferir(
        linha.vinculo_id,
        this.destino.getRawValue().medicaId,
      );
      this.aTransferir.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }
}
