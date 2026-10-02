import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import {
  CartaoService,
  DesfechoGestacao,
  DppOrigem,
  GestacaoCartao,
  TipoGestacao,
} from '../../../core/cartao/cartao.service';
import { deDataIso, formatarData, paraDataIso } from '../../../core/formato/data';

const DESFECHO_ROTULO: Record<DesfechoGestacao, string> = {
  parto_normal: 'Parto normal',
  cesarea: 'Cesárea',
  aborto: 'Aborto',
  obito_fetal: 'Óbito fetal',
  transferencia_cuidado: 'Transferência de cuidado',
  outro: 'Outro',
};

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    DialogModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  selector: 'app-cartao-gestacoes',
  styleUrl: './cartao-gestacoes.scss',
  templateUrl: './cartao-gestacoes.html',
})
export class CartaoGestacoes {
  readonly pacienteId = input.required<string>();
  readonly gestacoes = input.required<GestacaoCartao[]>();
  readonly alterada = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cartao = inject(CartaoService);

  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly criando = signal(false);
  protected readonly aEditar = signal<GestacaoCartao | null>(null);
  protected readonly aEncerrar = signal<GestacaoCartao | null>(null);
  protected readonly origem = signal<DppOrigem>('dum');

  protected readonly formatarData = formatarData;

  protected readonly origens = [
    { rotulo: 'Pela DUM', valor: 'dum' as DppOrigem },
    { rotulo: 'Por ultrassom', valor: 'usg' as DppOrigem },
  ];

  protected readonly tipos = [
    { rotulo: 'Única', valor: 'unica' as TipoGestacao },
    { rotulo: 'Gemelar', valor: 'gemelar' as TipoGestacao },
  ];

  protected readonly desfechos = (Object.keys(DESFECHO_ROTULO) as DesfechoGestacao[]).map(
    (valor) => ({ rotulo: DESFECHO_ROTULO[valor], valor }),
  );

  // Os limites espelham as validações da RPC, para o formulário recusar
  // antes do banco; a regra autoritativa continua no Postgres.
  protected readonly hoje = new Date();
  protected readonly minDum = this.diasAtras(300);
  protected readonly minUsg = this.diasAtras(60);
  protected readonly maxUsg = this.diasAFrente(300);

  protected readonly formulario = this.fb.group({
    dppOrigem: ['dum' as DppOrigem, Validators.required],
    tipo: ['unica' as TipoGestacao, Validators.required],
    dum: [null as Date | null],
    dppUsg: [null as Date | null],
  });

  protected readonly encerramento = this.fb.group({
    desfecho: [null as DesfechoGestacao | null, Validators.required],
    observacao: [''],
  });

  // "Nova" só existe sem gestação ativa: o banco recusaria a segunda.
  protected readonly podeCriar = computed(
    () => !this.gestacoes().some((g) => g.status === 'ativa'),
  );

  protected readonly ativa = computed(() => this.gestacoes().find((g) => g.status === 'ativa'));

  private diasAtras(dias: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d;
  }

  private diasAFrente(dias: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d;
  }

  protected abrirCriacao(): void {
    this.formulario.reset({ dppOrigem: 'dum', tipo: 'unica', dum: null, dppUsg: null });
    this.origem.set('dum');
    this.erro.set(null);
    this.criando.set(true);
  }

  protected abrirEdicao(g: GestacaoCartao): void {
    this.formulario.reset({
      dppOrigem: g.dppOrigem as DppOrigem,
      tipo: g.tipo as TipoGestacao,
      dum: deDataIso(g.dum),
      dppUsg: deDataIso(g.dppUsg),
    });
    this.origem.set(g.dppOrigem as DppOrigem);
    this.erro.set(null);
    this.aEditar.set(g);
  }

  protected trocarOrigem(valor: DppOrigem): void {
    this.origem.set(valor);
    this.formulario.controls.dppOrigem.setValue(valor);
    // A data da origem contrária não sobrevive escondida no formulário.
    this.formulario.controls.dum.setValue(null);
    this.formulario.controls.dppUsg.setValue(null);
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      return;
    }
    const bruto = this.formulario.getRawValue();
    // Só a data da origem escolhida segue; a outra é anulada.
    const dados = {
      dppOrigem: bruto.dppOrigem,
      tipo: bruto.tipo,
      dum: bruto.dppOrigem === 'dum' ? paraDataIso(bruto.dum) : null,
      dppUsg: bruto.dppOrigem === 'usg' ? paraDataIso(bruto.dppUsg) : null,
    };

    this.agindo.set(true);
    this.erro.set(null);
    try {
      const editando = this.aEditar();
      const resultado =
        editando === null
          ? await this.cartao.criarGestacao(this.pacienteId(), dados)
          : await this.cartao.atualizarGestacao(editando.id, dados);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.criando.set(false);
      this.aEditar.set(null);
      this.alterada.emit();
    } finally {
      this.agindo.set(false);
    }
  }

  protected pedirEncerramento(g: GestacaoCartao): void {
    this.encerramento.reset({ desfecho: null, observacao: '' });
    this.erro.set(null);
    this.aEncerrar.set(g);
  }

  protected async confirmarEncerramento(): Promise<void> {
    const g = this.aEncerrar();
    const { desfecho, observacao } = this.encerramento.getRawValue();
    if (g === null || desfecho === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.cartao.encerrarGestacao(
        g.id,
        desfecho,
        observacao.trim() === '' ? null : observacao.trim(),
      );
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.aEncerrar.set(null);
      this.alterada.emit();
    } finally {
      this.agindo.set(false);
    }
  }
}
