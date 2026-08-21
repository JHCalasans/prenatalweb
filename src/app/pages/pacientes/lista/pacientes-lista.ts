import { Component, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { formatarData } from '../../../core/formato/data';
import { formatarCpf } from '../../../core/formato/cpf';
import { PacienteLista, PacientesService } from '../../../core/pacientes/pacientes.service';

@Component({
  imports: [
    ButtonModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    TagModule,
  ],
  selector: 'app-pacientes-lista',
  styleUrl: './pacientes-lista.scss',
  templateUrl: './pacientes-lista.html',
})
export class PacientesLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly pacientes = inject(PacientesService);
  private readonly router = inject(Router);

  protected readonly linhas = signal<PacienteLista[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = this.fb.group({ busca: '' });

  protected readonly formatarCpf = formatarCpf;
  protected readonly formatarData = formatarData;

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.pacientes.listar(this.formulario.getRawValue().busca);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.linhas.set([]);
        return;
      }
      this.linhas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async limpar(): Promise<void> {
    this.formulario.setValue({ busca: '' });
    await this.carregar();
  }

  protected abrir(linha: PacienteLista): void {
    void this.router.navigate(['/pacientes', linha.paciente_id]);
  }
}
