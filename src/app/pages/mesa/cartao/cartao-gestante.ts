import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  CartaoService,
  ConsultaCartao,
  GestacaoCartao,
  ItemChecklist,
  PacienteCartao,
  StatusChecklist,
  VinculoCartao,
} from '../../../core/cartao/cartao.service';
import { formatarCpf } from '../../../core/formato/cpf';
import { deDataIso, formatarData, formatarDataHora, paraDataIso } from '../../../core/formato/data';
import { CartaoDocumentos } from './cartao-documentos';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

const JANELA_ROTULO: Record<string, string> = {
  futuro: 'Ainda não',
  na_janela: 'Na janela',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
  resolvido: 'Resolvido',
};

const JANELA_SEVERIDADE: Record<string, Severidade> = {
  futuro: 'secondary',
  na_janela: 'info',
  vencendo: 'warn',
  vencido: 'danger',
  resolvido: 'success',
};

const STATUS_ROTULO: Record<string, string> = {
  pendente: 'Pendente',
  solicitado: 'Solicitado',
  realizado: 'Realizado',
  nao_aplicavel: 'Não se aplica',
};

@Component({
  imports: [
    ButtonModule,
    CartaoDocumentos,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    RouterLink,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-cartao-gestante',
  styleUrl: './cartao-gestante.scss',
  templateUrl: './cartao-gestante.html',
})
export class CartaoGestante implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cartao = inject(CartaoService);
  private readonly rota = inject(ActivatedRoute);

  private readonly pacienteId = this.rota.snapshot.paramMap.get('pacienteId') ?? '';

  protected readonly paciente = signal<PacienteCartao | null>(null);
  protected readonly gestacoes = signal<GestacaoCartao[]>([]);
  protected readonly vinculos = signal<VinculoCartao[]>([]);
  protected readonly consultas = signal<ConsultaCartao[]>([]);
  protected readonly checklist = signal<ItemChecklist[]>([]);

  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aMarcar = signal<ItemChecklist | null>(null);

  protected readonly formatarCpf = formatarCpf;
  protected readonly formatarData = formatarData;
  protected readonly formatarDataHora = formatarDataHora;

  protected readonly statusOpcoes = [
    { rotulo: 'Pendente', valor: 'pendente' as StatusChecklist },
    { rotulo: 'Solicitado', valor: 'solicitado' as StatusChecklist },
    { rotulo: 'Realizado', valor: 'realizado' as StatusChecklist },
    { rotulo: 'Não se aplica', valor: 'nao_aplicavel' as StatusChecklist },
  ];

  protected readonly marcacao = this.fb.group({
    status: ['solicitado' as StatusChecklist, Validators.required],
    data: [null as Date | null],
    observacao: [''],
  });

  // A ativa manda; sem ativa, a mais recente ainda precisa abrir o cartão.
  protected readonly gestacaoAtual = computed(() => {
    const todas = this.gestacoes();
    return todas.find((g) => g.status === 'ativa') ?? todas[0] ?? null;
  });

  protected readonly gestacaoAtiva = computed(() => this.gestacaoAtual()?.status === 'ativa');

  protected readonly pendentes = computed(
    () => this.checklist().filter((i) => i.janela === 'vencido' || i.janela === 'vencendo').length,
  );

  async ngOnInit(): Promise<void> {
    try {
      await this.carregar();
    } finally {
      this.carregando.set(false);
    }
  }

  protected janelaRotulo(janela: string): string {
    return JANELA_ROTULO[janela] ?? janela;
  }

  protected janelaSeveridade(janela: string): Severidade {
    return JANELA_SEVERIDADE[janela] ?? 'secondary';
  }

  protected statusRotulo(status: string): string {
    return STATUS_ROTULO[status] ?? status;
  }

  protected async carregar(): Promise<void> {
    this.erro.set(null);

    const [paciente, gestacoes, vinculos] = await Promise.all([
      this.cartao.paciente(this.pacienteId),
      this.cartao.gestacoes(this.pacienteId),
      this.cartao.vinculos(this.pacienteId),
    ]);

    if (!paciente.ok) {
      this.erro.set(paciente.mensagem);
      return;
    }
    this.paciente.set(paciente.valor);
    this.gestacoes.set(gestacoes.ok ? gestacoes.valor : []);
    this.vinculos.set(vinculos.ok ? vinculos.valor : []);

    const gestacao = this.gestacaoAtual();
    if (gestacao === null) {
      this.consultas.set([]);
      this.checklist.set([]);
      return;
    }

    const [consultas, checklist] = await Promise.all([
      this.cartao.consultas(gestacao.id),
      this.cartao.checklist(gestacao.id),
    ]);

    this.consultas.set(consultas.ok ? consultas.valor : []);
    this.checklist.set(checklist.ok ? checklist.valor : []);
  }

  protected abrirMarcacao(item: ItemChecklist): void {
    this.marcacao.setValue({
      status: item.status,
      data: deDataIso(item.data),
      observacao: item.observacao ?? '',
    });
    this.aMarcar.set(item);
  }

  protected async confirmarMarcacao(): Promise<void> {
    const item = this.aMarcar();
    const gestacao = this.gestacaoAtual();
    if (item === null || gestacao === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const bruto = this.marcacao.getRawValue();
      const resultado = await this.cartao.marcarChecklist({
        gestacaoId: gestacao.id,
        protocoloItemId: item.protocolo_item_id,
        status: bruto.status,
        data: paraDataIso(bruto.data),
        observacao: bruto.observacao.trim() === '' ? null : bruto.observacao.trim(),
      });
      this.aMarcar.set(null);
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
