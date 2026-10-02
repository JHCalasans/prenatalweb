import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import {
  ComponenteCatalogo,
  ERRO_CONFIRMACAO_ALTERADO,
  Exame,
  ExamesService,
  formatarReferencia,
  formatarValor,
  ResultadoQualitativo,
  ROTULO_PAPEL_AUTOR,
  TipoExameCatalogo,
  ValorComponente,
} from '../../../core/exames/exames.service';
import { deDataIso, formatarData, paraDataIso } from '../../../core/formato/data';

export const ERRO_DATA_COLETA = 'Informe a data da coleta.';
export const ERRO_TIPO_EXAME = 'Escolha o tipo de exame.';

interface Editando {
  id: string;
  tipoExame: string | null;
  existente: boolean;
}

@Component({
  imports: [
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    DialogModule,
    FormsModule,
    InputNumberModule,
    MessageModule,
    SelectButtonModule,
    SelectModule,
    TagModule,
    TextareaModule,
  ],
  selector: 'app-painel-exames',
  styleUrl: './painel-exames.scss',
  templateUrl: './painel-exames.html',
})
export class PainelExames implements OnInit {
  readonly gestacaoId = input.required<string>();
  readonly gestacaoAtiva = input.required<boolean>();
  /** Só a médica vinculada libera; a secretaria registra e acompanha. */
  readonly podeLiberar = input.required<boolean>();
  readonly documentos = input<{ id: string; titulo: string }[]>([]);
  /** Avisa o cartão quando um resultado marca ou desmarca o checklist. */
  readonly mudou = output<void>();

  private readonly exames = inject(ExamesService);

  protected readonly lista = signal<Exame[]>([]);
  protected readonly catalogo = signal<TipoExameCatalogo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly erroDialogo = signal<string | null>(null);

  protected readonly editando = signal<Editando | null>(null);
  protected readonly coletadoEm = signal<Date | null>(null);
  protected readonly observacao = signal('');
  protected readonly documentoId = signal<string | null>(null);
  protected readonly numeros = signal<Record<string, number | null>>({});
  protected readonly qualitativos = signal<Record<string, ResultadoQualitativo | null>>({});

  protected readonly aLiberar = signal<Exame | null>(null);
  protected readonly comunicado = signal(false);
  protected readonly aExcluir = signal<Exame | null>(null);

  protected readonly hoje = new Date();
  protected readonly formatarData = formatarData;
  protected readonly formatarValor = formatarValor;
  protected readonly formatarReferencia = formatarReferencia;
  protected readonly rotuloPapel = ROTULO_PAPEL_AUTOR;

  protected readonly tipoSelecionado = computed(
    () => this.catalogo().find((t) => t.codigo === this.editando()?.tipoExame) ?? null,
  );

  protected readonly opcoesTipo = computed(() =>
    this.catalogo().map((t) => ({ rotulo: t.nome, valor: t.codigo })),
  );

  protected readonly opcoesDocumento = computed(() => [
    { rotulo: 'Sem laudo', valor: null as string | null },
    ...this.documentos().map((d) => ({ rotulo: d.titulo, valor: d.id as string | null })),
  ]);

  ngOnInit(): void {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    try {
      const [catalogo] = await Promise.all([this.exames.catalogo(), this.carregar()]);
      if (catalogo.ok) {
        this.catalogo.set(catalogo.valor);
      } else {
        this.erro.set(catalogo.mensagem);
      }
    } finally {
      this.carregando.set(false);
    }
  }

  protected async carregar(): Promise<void> {
    const resultado = await this.exames.exames(this.gestacaoId());
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      this.lista.set([]);
      return;
    }
    this.erro.set(null);
    this.lista.set(resultado.valor);
  }

  protected opcoesQualitativas(
    c: ComponenteCatalogo,
  ): { rotulo: string; valor: ResultadoQualitativo }[] {
    return [
      { rotulo: c.rotuloNegativo ?? 'Negativo', valor: 'negativo' },
      { rotulo: c.rotuloPositivo ?? 'Positivo', valor: 'positivo' },
      { rotulo: 'Indeterminado', valor: 'indeterminado' },
    ];
  }

  protected abrirNovo(): void {
    this.resetarDialogo({ id: crypto.randomUUID(), tipoExame: null, existente: false });
  }

  protected abrirEdicao(e: Exame): void {
    this.resetarDialogo({ id: e.id, tipoExame: e.tipoExame, existente: true });
    this.coletadoEm.set(deDataIso(e.coletadoEm));
    this.observacao.set(e.observacao ?? '');
    this.documentoId.set(e.documentoId);
    const numeros: Record<string, number | null> = {};
    const qualitativos: Record<string, ResultadoQualitativo | null> = {};
    for (const r of e.resultados) {
      numeros[r.componente] = r.valorNumerico;
      qualitativos[r.componente] = r.valorQualitativo;
    }
    this.numeros.set(numeros);
    this.qualitativos.set(qualitativos);
  }

  private resetarDialogo(editando: Editando): void {
    this.erroDialogo.set(null);
    this.coletadoEm.set(null);
    this.observacao.set('');
    this.documentoId.set(null);
    this.numeros.set({});
    this.qualitativos.set({});
    this.editando.set(editando);
  }

  protected escolherTipo(tipo: string | null): void {
    const editando = this.editando();
    if (editando === null) {
      return;
    }
    this.editando.set({ ...editando, tipoExame: tipo });
    this.numeros.set({});
    this.qualitativos.set({});
  }

  protected definirNumero(codigo: string, valor: number | null): void {
    this.numeros.update((atual) => ({ ...atual, [codigo]: valor }));
  }

  protected definirQualitativo(codigo: string, valor: ResultadoQualitativo | null): void {
    this.qualitativos.update((atual) => ({ ...atual, [codigo]: valor }));
  }

  // Só segue o que foi preenchido; o que falta o Postgres nomeia na recusa.
  private valores(tipo: TipoExameCatalogo): ValorComponente[] {
    const valores: ValorComponente[] = [];
    for (const c of tipo.componentes) {
      const numero = this.numeros()[c.codigo] ?? null;
      const qualitativo = this.qualitativos()[c.codigo] ?? null;
      if (c.natureza === 'quantitativo' && numero !== null) {
        valores.push({ componente: c.codigo, valorNumerico: numero, valorQualitativo: null });
      }
      if (c.natureza === 'qualitativo' && qualitativo !== null) {
        valores.push({ componente: c.codigo, valorNumerico: null, valorQualitativo: qualitativo });
      }
    }
    return valores;
  }

  protected async salvar(): Promise<void> {
    const editando = this.editando();
    const tipo = this.tipoSelecionado();
    if (editando === null || this.agindo()) {
      return;
    }
    if (tipo === null) {
      this.erroDialogo.set(ERRO_TIPO_EXAME);
      return;
    }
    const coleta = paraDataIso(this.coletadoEm());
    if (coleta === null) {
      this.erroDialogo.set(ERRO_DATA_COLETA);
      return;
    }
    this.agindo.set(true);
    this.erroDialogo.set(null);
    try {
      const observacao = this.observacao().trim();
      const resultado = await this.exames.registrarResultado(
        editando.id,
        this.gestacaoId(),
        tipo.codigo,
        coleta,
        this.valores(tipo),
        observacao === '' ? null : observacao,
        this.documentoId(),
      );
      if (!resultado.ok) {
        this.erroDialogo.set(resultado.mensagem);
        return;
      }
      this.editando.set(null);
      await this.carregar();
      this.mudou.emit();
    } finally {
      this.agindo.set(false);
    }
  }

  protected pedirLiberacao(e: Exame): void {
    if (e.alterado) {
      this.comunicado.set(false);
      this.erro.set(null);
      this.aLiberar.set(e);
      return;
    }
    void this.executarLiberacao(e, false);
  }

  protected async confirmarLiberacao(): Promise<void> {
    const e = this.aLiberar();
    if (e === null) {
      return;
    }
    if (!this.comunicado()) {
      this.erro.set(ERRO_CONFIRMACAO_ALTERADO);
      return;
    }
    await this.executarLiberacao(e, true);
  }

  private async executarLiberacao(e: Exame, confirmar: boolean): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.exames.liberar(e.id, confirmar);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.aLiberar.set(null);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarExclusao(): Promise<void> {
    const e = this.aExcluir();
    if (e === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.exames.excluirResultado(e.id);
      this.aExcluir.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
      this.mudou.emit();
    } finally {
      this.agindo.set(false);
    }
  }

  protected tituloDocumento(id: string | null): string | null {
    return this.documentos().find((d) => d.id === id)?.titulo ?? null;
  }
}
