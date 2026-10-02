import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import {
  Anamnese,
  AnamneseService,
  ClassificacaoRisco,
  CONFLITO_ANAMNESE,
  DadosAnamnese,
  FatorRisco,
  formatarGpa,
  formatarTipagem,
  RiscoGestacional,
  ROTULO_COMORBIDADE,
  ROTULO_INTERCORRENCIA,
  ROTULO_PAPEL_AUTOR,
} from '../../../core/anamnese/anamnese.service';
import { formatarDataHora } from '../../../core/formato/data';
import { FormularioAnamnese } from '../../anamnese/formulario/formulario-anamnese';

export const ERRO_MOTIVO_RISCO = 'Informe o motivo do alto risco (mínimo de 10 caracteres).';

@Component({
  imports: [
    ButtonModule,
    DialogModule,
    FormsModule,
    FormularioAnamnese,
    MessageModule,
    SelectButtonModule,
    TagModule,
    TextareaModule,
  ],
  selector: 'app-cartao-anamnese',
  styleUrl: './cartao-anamnese.scss',
  templateUrl: './cartao-anamnese.html',
})
export class CartaoAnamnese implements OnInit {
  readonly pacienteId = input.required<string>();
  readonly gestacaoId = input.required<string>();
  readonly gestacaoAtiva = input.required<boolean>();

  private readonly anamneses = inject(AnamneseService);

  protected readonly historico = signal<Anamnese[]>([]);
  protected readonly riscos = signal<RiscoGestacional[]>([]);
  protected readonly fatores = signal<FatorRisco[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly erroDialogo = signal<string | null>(null);
  protected readonly conflito = signal(false);
  protected readonly editando = signal(false);
  protected readonly classificando = signal(false);
  protected readonly vendoHistorico = signal(false);
  protected readonly classificacao = signal<ClassificacaoRisco>('habitual');
  protected readonly motivo = signal('');

  protected readonly vigente = computed(() => this.historico()[0] ?? null);
  protected readonly riscoVigente = computed(() => this.riscos()[0] ?? null);
  // Escolher habitual com fatores sugeridos é permitido, mas merece aviso.
  protected readonly avisoHabitual = computed(
    () => this.classificacao() === 'habitual' && this.fatores().length > 0,
  );

  protected readonly opcoesRisco = [
    { rotulo: 'Habitual', valor: 'habitual' as ClassificacaoRisco },
    { rotulo: 'Alto risco', valor: 'alto' as ClassificacaoRisco },
  ];
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly formatarGpa = formatarGpa;
  protected readonly formatarTipagem = formatarTipagem;
  protected readonly rotuloPapel = ROTULO_PAPEL_AUTOR;

  ngOnInit(): void {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    try {
      await this.carregar();
    } finally {
      this.carregando.set(false);
    }
  }

  protected async carregar(): Promise<void> {
    const [historico, riscos] = await Promise.all([
      this.anamneses.historico(this.pacienteId()),
      this.anamneses.riscos(this.gestacaoId()),
    ]);
    if (!historico.ok) {
      this.erro.set(historico.mensagem);
      return;
    }
    this.erro.set(riscos.ok ? null : riscos.mensagem);
    this.historico.set(historico.valor);
    this.riscos.set(riscos.ok ? riscos.valor : []);
  }

  protected comorbidades(a: Anamnese): string {
    const nomes = a.comorbidades.map((c) => ROTULO_COMORBIDADE[c]);
    if (a.comorbidadesOutras) {
      nomes.push(a.comorbidadesOutras);
    }
    return nomes.length === 0 ? '—' : nomes.join(', ');
  }

  protected intercorrencias(a: Anamnese): string {
    const nomes = a.intercorrenciasPrevias.map((i) => ROTULO_INTERCORRENCIA[i]);
    if (a.intercorrenciasOutras) {
      nomes.push(a.intercorrenciasOutras);
    }
    return nomes.length === 0 ? '—' : nomes.join(', ');
  }

  protected abrirEdicao(): void {
    this.erroDialogo.set(null);
    this.conflito.set(false);
    this.editando.set(true);
  }

  protected async salvarAnamnese(dados: DadosAnamnese): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erroDialogo.set(null);
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
        this.erroDialogo.set(resultado.mensagem);
        return;
      }
      this.editando.set(false);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async recarregarFicha(): Promise<void> {
    this.conflito.set(false);
    await this.carregar();
  }

  protected async abrirClassificacao(): Promise<void> {
    this.erroDialogo.set(null);
    this.classificacao.set(this.riscoVigente()?.classificacao ?? 'habitual');
    this.motivo.set('');
    const resultado = await this.anamneses.fatoresSugeridos(this.gestacaoId());
    this.fatores.set(resultado.ok ? resultado.valor : []);
    if (!resultado.ok) {
      this.erroDialogo.set(resultado.mensagem);
    }
    this.classificando.set(true);
  }

  protected async confirmarClassificacao(): Promise<void> {
    if (this.agindo()) {
      return;
    }
    const motivo = this.motivo().trim();
    if (this.classificacao() === 'alto' && motivo.length < 10) {
      this.erroDialogo.set(ERRO_MOTIVO_RISCO);
      return;
    }
    this.agindo.set(true);
    this.erroDialogo.set(null);
    try {
      const resultado = await this.anamneses.classificarRisco(
        this.gestacaoId(),
        this.classificacao(),
        motivo === '' ? null : motivo,
      );
      if (!resultado.ok) {
        this.erroDialogo.set(resultado.mensagem);
        return;
      }
      this.classificando.set(false);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }
}
