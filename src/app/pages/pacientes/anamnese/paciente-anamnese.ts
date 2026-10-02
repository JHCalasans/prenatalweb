import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import {
  Anamnese,
  AnamneseService,
  CONFLITO_ANAMNESE,
  DadosAnamnese,
  formatarGpa,
  formatarTipagem,
  ROTULO_PAPEL_AUTOR,
} from '../../../core/anamnese/anamnese.service';
import { formatarDataHora } from '../../../core/formato/data';
import { FormularioAnamnese } from '../../anamnese/formulario/formulario-anamnese';

@Component({
  imports: [ButtonModule, DialogModule, FormularioAnamnese, MessageModule, TagModule],
  selector: 'app-paciente-anamnese',
  styleUrl: './paciente-anamnese.scss',
  templateUrl: './paciente-anamnese.html',
})
export class PacienteAnamnese implements OnInit {
  readonly pacienteId = input.required<string>();

  private readonly anamneses = inject(AnamneseService);

  protected readonly historico = signal<Anamnese[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly conflito = signal(false);
  protected readonly editando = signal(false);
  protected readonly vendoHistorico = signal(false);

  protected readonly vigente = computed(() => this.historico()[0] ?? null);
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly formatarGpa = formatarGpa;
  protected readonly formatarTipagem = formatarTipagem;
  protected readonly rotuloPapel = ROTULO_PAPEL_AUTOR;

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    try {
      const resultado = await this.anamneses.historico(this.pacienteId());
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.erro.set(null);
      this.historico.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected abrir(): void {
    this.erro.set(null);
    this.conflito.set(false);
    this.editando.set(true);
  }

  protected async salvar(dados: DadosAnamnese): Promise<void> {
    if (this.salvando()) {
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.anamneses.registrar(
        this.pacienteId(),
        this.vigente()?.versao ?? 0,
        dados,
      );
      if (!resultado.ok) {
        if (resultado.mensagem === CONFLITO_ANAMNESE) {
          this.conflito.set(true);
          return;
        }
        this.erro.set(resultado.mensagem);
        return;
      }
      this.editando.set(false);
      await this.carregar();
    } finally {
      this.salvando.set(false);
    }
  }

  // Conflito: a ficha atual volta para o formulário e a edição desta tela é descartada.
  protected async recarregar(): Promise<void> {
    this.conflito.set(false);
    await this.carregar();
  }
}
