import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../../../core/auth/auth.service';
import { ConsultaCartao } from '../../../core/cartao/cartao.service';
import { formatarDataHora } from '../../../core/formato/data';
import {
  ApresentacaoFetal,
  CONFLITO_RASCUNHO,
  DadosEvolucao,
  EvolucaoProntuario,
  GrauEdema,
  MovimentacaoFetal,
  ProntuarioService,
} from '../../../core/prontuario/prontuario.service';

export const ATRASO_AUTOSAVE_MS = 2000;

type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro' | 'conflito';

interface ValorEditor {
  consultaId: string | null;
  atendidaEm: Date | null;
  pesoKg: number | null;
  paSistolica: number | null;
  paDiastolica: number | null;
  alturaUterinaCm: number | null;
  bcfBpm: number | null;
  movimentacaoFetal: MovimentacaoFetal | null;
  edema: GrauEdema | null;
  apresentacao: ApresentacaoFetal | null;
  queixa: string;
  exameFisico: string;
  avaliacao: string;
  conduta: string;
}

interface Editando {
  id: string;
  consultaId: string | null;
  retificaId: string | null;
}

const MOVIMENTACAO_ROTULO: Record<MovimentacaoFetal, string> = {
  presente: 'Presente',
  diminuida: 'Diminuída',
  ausente: 'Ausente',
};

const EDEMA_ROTULO: Record<GrauEdema, string> = {
  ausente: 'Ausente',
  uma_cruz: '+',
  duas_cruzes: '++',
  tres_cruzes: '+++',
  quatro_cruzes: '++++',
};

const APRESENTACAO_ROTULO: Record<ApresentacaoFetal, string> = {
  cefalica: 'Cefálica',
  pelvica: 'Pélvica',
  transversa: 'Transversa',
  indefinida: 'Indefinida',
};

function opcoes<T extends string>(rotulos: Record<T, string>): { rotulo: string; valor: T }[] {
  return (Object.keys(rotulos) as T[]).map((valor) => ({ rotulo: rotulos[valor], valor }));
}

function texto(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    DialogModule,
    FormsModule,
    InputNumberModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TagModule,
    TextareaModule,
  ],
  selector: 'app-cartao-prontuario',
  styleUrl: './cartao-prontuario.scss',
  templateUrl: './cartao-prontuario.html',
})
export class CartaoProntuario implements OnInit {
  readonly pacienteId = input.required<string>();
  readonly gestacaoId = input.required<string>();
  readonly gestacaoAtiva = input.required<boolean>();
  readonly consultas = input.required<ConsultaCartao[]>();
  readonly alterado = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly prontuario = inject(ProntuarioService);
  private readonly auth = inject(AuthService);

  protected readonly evolucoes = signal<EvolucaoProntuario[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly expandida = signal<string | null>(null);
  protected readonly historico = signal<string | null>(null);
  protected readonly aExcluir = signal<EvolucaoProntuario | null>(null);

  protected readonly editando = signal<Editando | null>(null);
  protected readonly revisao = signal(0);
  protected readonly estado = signal<EstadoSalvamento>('ocioso');
  protected readonly salvoEm = signal<string | null>(null);
  protected readonly erroEditor = signal<string | null>(null);
  protected readonly assinando = signal(false);
  protected readonly motivo = signal('');

  protected readonly formatarDataHora = formatarDataHora;
  protected readonly movimentacaoOpcoes = opcoes(MOVIMENTACAO_ROTULO);
  protected readonly edemaOpcoes = opcoes(EDEMA_ROTULO);
  protected readonly apresentacaoOpcoes = opcoes(APRESENTACAO_ROTULO);

  protected readonly form = this.fb.group({
    consultaId: [null as string | null],
    atendidaEm: [null as Date | null],
    pesoKg: [null as number | null],
    paSistolica: [null as number | null],
    paDiastolica: [null as number | null],
    alturaUterinaCm: [null as number | null],
    bcfBpm: [null as number | null],
    movimentacaoFetal: [null as MovimentacaoFetal | null],
    edema: [null as GrauEdema | null],
    apresentacao: [null as ApresentacaoFetal | null],
    queixa: [''],
    exameFisico: [''],
    avaliacao: [''],
    conduta: [''],
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private salvando: Promise<void> | null = null;
  private sujo = false;

  protected readonly minhaId = computed(() => this.auth.sessao()?.user.id ?? null);

  protected readonly daGestacao = computed(() =>
    this.evolucoes().filter((e) => e.gestacaoId === this.gestacaoId()),
  );

  protected readonly vigentes = computed(() =>
    this.daGestacao().filter((e) => e.status === 'assinada' && e.vigente),
  );

  protected readonly rascunhos = computed(() =>
    this.daGestacao().filter((e) => e.status === 'rascunho'),
  );

  // Consulta que já aconteceu e ainda não tem evolução original.
  protected readonly consultasDisponiveis = computed(() => {
    if (!this.gestacaoAtiva()) {
      return [];
    }
    const comEvolucao = new Set(
      this.daGestacao()
        .filter((e) => e.retificaId === null && e.consultaId !== null)
        .map((e) => e.consultaId),
    );
    const agora = Date.now();
    return this.consultas()
      .filter(
        (c) =>
          !comEvolucao.has(c.id) &&
          (c.status === 'realizada' ||
            (c.status === 'agendada' && new Date(c.dataHora).getTime() <= agora)),
      )
      .map((c) => ({ rotulo: `${formatarDataHora(c.dataHora)} · ${c.tipo}`, valor: c.id }));
  });

  protected readonly emRetificacao = computed(() => this.editando()?.retificaId != null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelarTimer());
    this.form.valueChanges.subscribe(() => {
      if (this.editando() !== null) {
        this.agendarSalvamento();
      }
    });
  }

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
    const resultado = await this.prontuario.prontuario(this.pacienteId());
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      this.evolucoes.set([]);
      return;
    }
    this.erro.set(null);
    this.evolucoes.set(resultado.valor);
  }

  protected versoesAnteriores(e: EvolucaoProntuario): EvolucaoProntuario[] {
    return this.daGestacao().filter(
      (v) => v.raizId === e.raizId && v.status === 'assinada' && !v.vigente,
    );
  }

  protected ig(dias: number | null): string {
    if (dias === null) {
      return '—';
    }
    return `${Math.floor(dias / 7)}s ${dias % 7}d`;
  }

  protected numero(valor: number | null): string {
    return valor === null ? '—' : valor.toLocaleString('pt-BR');
  }

  protected pa(e: EvolucaoProntuario): string {
    return e.paSistolica === null ? '—' : `${e.paSistolica}×${e.paDiastolica}`;
  }

  protected movimentacaoRotulo(v: MovimentacaoFetal | null): string {
    return v === null ? '—' : MOVIMENTACAO_ROTULO[v];
  }

  protected edemaRotulo(v: GrauEdema | null): string {
    return v === null ? '—' : EDEMA_ROTULO[v];
  }

  protected apresentacaoRotulo(v: ApresentacaoFetal | null): string {
    return v === null ? '—' : APRESENTACAO_ROTULO[v];
  }

  protected alternar(e: EvolucaoProntuario): void {
    this.expandida.set(this.expandida() === e.id ? null : e.id);
  }

  protected podeRetificar(e: EvolucaoProntuario): boolean {
    const raizComRascunho = this.rascunhos().some((r) => r.raizId === e.raizId);
    return e.autoraId === this.minhaId() && !raizComRascunho;
  }

  protected novaEvolucao(): void {
    const primeira = this.consultasDisponiveis()[0]?.valor ?? null;
    const consulta = this.consultas().find((c) => c.id === primeira);
    this.abrirEditor({ id: crypto.randomUUID(), consultaId: primeira, retificaId: null }, 0, {
      consultaId: primeira,
      atendidaEm: consulta ? new Date(consulta.dataHora) : new Date(),
      pesoKg: null,
      paSistolica: null,
      paDiastolica: null,
      alturaUterinaCm: null,
      bcfBpm: null,
      movimentacaoFetal: null,
      edema: null,
      apresentacao: null,
      queixa: '',
      exameFisico: '',
      avaliacao: '',
      conduta: '',
    });
  }

  protected continuar(e: EvolucaoProntuario): void {
    this.abrirEditor(
      { id: e.id, consultaId: e.consultaId, retificaId: e.retificaId },
      e.revisao,
      this.valorDe(e),
    );
  }

  protected async retificar(e: EvolucaoProntuario): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const novoId = crypto.randomUUID();
      const resultado = await this.prontuario.iniciarRetificacao(novoId, e.id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
      const rascunho = this.evolucoes().find((r) => r.id === novoId);
      if (rascunho !== undefined) {
        this.continuar(rascunho);
      }
    } finally {
      this.agindo.set(false);
    }
  }

  // Ao trocar a consulta de uma evolução nova, a data acompanha a consulta.
  protected escolherConsulta(consultaId: string | null): void {
    const editando = this.editando();
    if (editando === null || this.revisao() !== 0) {
      return;
    }
    this.editando.set({ ...editando, consultaId });
    const consulta = this.consultas().find((c) => c.id === consultaId);
    if (consulta !== undefined) {
      this.form.controls.atendidaEm.setValue(new Date(consulta.dataHora));
    }
  }

  protected async fecharEditor(): Promise<void> {
    await this.descarregar();
    this.editando.set(null);
    this.assinando.set(false);
    await this.carregar();
  }

  protected async pedirAssinatura(): Promise<void> {
    await this.descarregar();
    if (this.estado() === 'erro' || this.estado() === 'conflito' || this.revisao() === 0) {
      return;
    }
    this.motivo.set('');
    this.assinando.set(true);
  }

  protected async confirmarAssinatura(): Promise<void> {
    const editando = this.editando();
    if (editando === null || this.agindo()) {
      return;
    }
    if (editando.retificaId !== null && this.motivo().trim().length < 10) {
      this.erroEditor.set('Informe o motivo da retificação (mínimo de 10 caracteres).');
      return;
    }
    this.agindo.set(true);
    this.erroEditor.set(null);
    try {
      const resultado = await this.prontuario.assinar(
        editando.id,
        this.revisao(),
        editando.retificaId === null ? null : texto(this.motivo()),
      );
      if (!resultado.ok) {
        this.erroEditor.set(resultado.mensagem);
        return;
      }
      this.assinando.set(false);
      this.editando.set(null);
      await this.carregar();
      this.alterado.emit();
    } finally {
      this.agindo.set(false);
    }
  }

  // Conflito: a versão do servidor volta para a tela e a desta tela é descartada.
  protected async recarregarVersaoSalva(): Promise<void> {
    const editando = this.editando();
    if (editando === null) {
      return;
    }
    await this.carregar();
    const doServidor = this.evolucoes().find((e) => e.id === editando.id);
    if (doServidor === undefined || doServidor.status !== 'rascunho') {
      this.editando.set(null);
      this.erro.set('O rascunho foi assinado ou excluído em outro aparelho.');
      return;
    }
    this.continuar(doServidor);
  }

  // Conflito: a tela atual vence e é gravada sobre a revisão mais recente.
  protected async manterEstaTela(): Promise<void> {
    const editando = this.editando();
    if (editando === null) {
      return;
    }
    await this.carregar();
    const doServidor = this.evolucoes().find((e) => e.id === editando.id);
    if (doServidor === undefined || doServidor.status !== 'rascunho') {
      this.editando.set(null);
      this.erro.set('O rascunho foi assinado ou excluído em outro aparelho.');
      return;
    }
    this.revisao.set(doServidor.revisao);
    this.sujo = true;
    await this.salvar();
  }

  protected async confirmarExclusao(): Promise<void> {
    const e = this.aExcluir();
    if (e === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.prontuario.excluirRascunho(e.id);
      this.aExcluir.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  private abrirEditor(editando: Editando, revisao: number, valor: ValorEditor): void {
    this.cancelarTimer();
    this.sujo = false;
    this.editando.set(editando);
    this.revisao.set(revisao);
    this.estado.set(revisao === 0 ? 'ocioso' : 'salvo');
    this.salvoEm.set(null);
    this.erroEditor.set(null);
    this.form.setValue(valor, { emitEvent: false });
    if (revisao === 0) {
      this.form.controls.consultaId.enable({ emitEvent: false });
    } else {
      this.form.controls.consultaId.disable({ emitEvent: false });
    }
  }

  private valorDe(e: EvolucaoProntuario): ValorEditor {
    return {
      consultaId: e.consultaId,
      atendidaEm: new Date(e.atendidaEm),
      pesoKg: e.pesoKg,
      paSistolica: e.paSistolica,
      paDiastolica: e.paDiastolica,
      alturaUterinaCm: e.alturaUterinaCm,
      bcfBpm: e.bcfBpm,
      movimentacaoFetal: e.movimentacaoFetal,
      edema: e.edema,
      apresentacao: e.apresentacao,
      queixa: e.queixa ?? '',
      exameFisico: e.exameFisico ?? '',
      avaliacao: e.avaliacao ?? '',
      conduta: e.conduta ?? '',
    };
  }

  private dados(atendidaEm: Date): DadosEvolucao {
    const v = this.form.getRawValue();
    return {
      atendidaEm: atendidaEm.toISOString(),
      pesoKg: v.pesoKg,
      paSistolica: v.paSistolica,
      paDiastolica: v.paDiastolica,
      alturaUterinaCm: v.alturaUterinaCm,
      bcfBpm: v.bcfBpm,
      movimentacaoFetal: v.movimentacaoFetal,
      edema: v.edema,
      apresentacao: v.apresentacao,
      queixa: texto(v.queixa),
      exameFisico: texto(v.exameFisico),
      avaliacao: texto(v.avaliacao),
      conduta: texto(v.conduta),
    };
  }

  private agendarSalvamento(): void {
    this.sujo = true;
    if (this.estado() === 'conflito') {
      return;
    }
    this.cancelarTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.salvar();
    }, ATRASO_AUTOSAVE_MS);
  }

  private cancelarTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Grava o que estiver pendente agora, sem esperar o debounce.
  private async descarregar(): Promise<void> {
    this.cancelarTimer();
    if (this.salvando !== null) {
      await this.salvando;
    }
    if (this.sujo && this.estado() !== 'conflito') {
      await this.salvar();
    }
  }

  private async salvar(): Promise<void> {
    if (this.salvando !== null) {
      await this.salvando;
      if (!this.sujo) {
        return;
      }
    }
    const editando = this.editando();
    if (editando === null) {
      return;
    }
    this.salvando = this.executarSalvamento(editando);
    try {
      await this.salvando;
    } finally {
      this.salvando = null;
    }
  }

  private async executarSalvamento(editando: Editando): Promise<void> {
    const atendidaEm = this.form.controls.atendidaEm.value;
    if (atendidaEm === null) {
      this.estado.set('erro');
      this.erroEditor.set('Informe a data do atendimento.');
      return;
    }
    this.sujo = false;
    this.estado.set('salvando');
    const resultado = await this.prontuario.salvarRascunho(
      editando.id,
      this.gestacaoId(),
      editando.consultaId,
      this.revisao(),
      this.dados(atendidaEm),
    );
    if (this.editando()?.id !== editando.id) {
      return;
    }
    if (!resultado.ok) {
      if (resultado.mensagem === CONFLITO_RASCUNHO) {
        this.estado.set('conflito');
        this.erroEditor.set(null);
        return;
      }
      this.sujo = true;
      this.estado.set('erro');
      this.erroEditor.set(resultado.mensagem);
      return;
    }
    if (this.revisao() === 0) {
      this.form.controls.consultaId.disable({ emitEvent: false });
    }
    this.revisao.set(resultado.valor);
    this.erroEditor.set(null);
    this.estado.set('salvo');
    this.salvoEm.set(
      new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    );
    if (this.sujo) {
      this.agendarSalvamento();
    }
  }
}
