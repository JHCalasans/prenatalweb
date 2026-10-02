import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  AgendaService,
  ConsultaAgenda,
  PacienteAgendavel,
  StatusConsulta,
} from '../../core/agenda/agenda.service';
import { AuthService } from '../../core/auth/auth.service';
import { formatarData, formatarDataHora, formatarHora, paraDataIso } from '../../core/formato/data';
import { GestacaoAtiva, Medica, PacientesService } from '../../core/pacientes/pacientes.service';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';
type Visao = 'semana' | 'mes';

interface DiaAgenda {
  iso: string;
  consultas: ConsultaAgenda[];
}

const STATUS_ROTULO: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  faltou: 'Faltou',
};

const STATUS_SEVERIDADE: Record<StatusConsulta, Severidade> = {
  agendada: 'info',
  realizada: 'success',
  cancelada: 'secondary',
  faltou: 'warn',
};

export function inicioDaSemana(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  // getDay(): domingo = 0; a semana da agenda começa na segunda.
  const deslocamento = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - deslocamento);
  return d;
}

@Component({
  imports: [
    ButtonModule,
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
  selector: 'app-agenda',
  styleUrl: './agenda.scss',
  templateUrl: './agenda.html',
})
export class Agenda implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly agenda = inject(AgendaService);
  private readonly pacientesService = inject(PacientesService);
  private readonly auth = inject(AuthService);

  protected readonly consultas = signal<ConsultaAgenda[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly visao = signal<Visao>('semana');
  protected readonly ref = signal<Date>(inicioDaSemana(new Date()));
  protected readonly filtroStatus = signal<StatusConsulta | null>(null);
  protected readonly filtroMedicaId = signal<string | null>(null);

  protected readonly medicas = signal<Medica[]>([]);
  protected readonly pacientes = signal<PacienteAgendavel[]>([]);

  protected readonly criando = signal(false);
  protected readonly aReagendar = signal<ConsultaAgenda | null>(null);
  protected readonly aFechar = signal<{
    consulta: ConsultaAgenda;
    acao: 'cancelar' | 'falta' | 'realizada';
  } | null>(null);

  protected readonly formatarData = formatarData;
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly formatarHora = formatarHora;

  protected readonly hojeIso = paraDataIso(new Date()) ?? '';

  protected readonly visoes = [
    { rotulo: 'Semana', valor: 'semana' as Visao },
    { rotulo: 'Mês', valor: 'mes' as Visao },
  ];

  protected readonly statusFiltro = [
    { rotulo: 'Todas as situações', valor: null as StatusConsulta | null },
    { rotulo: 'Agendada', valor: 'agendada' as StatusConsulta | null },
    { rotulo: 'Realizada', valor: 'realizada' as StatusConsulta | null },
    { rotulo: 'Cancelada', valor: 'cancelada' as StatusConsulta | null },
    { rotulo: 'Faltou', valor: 'faltou' as StatusConsulta | null },
  ];

  protected readonly formulario = this.fb.group({
    visao: ['semana' as Visao],
    medicaId: [null as string | null],
    status: [null as StatusConsulta | null],
  });

  protected readonly formNova = this.fb.group({
    pacienteId: ['', Validators.required],
    medicaId: ['', Validators.required],
    dataHora: [null as Date | null, Validators.required],
    tipo: ['Consulta de pré-natal'],
    local: [''],
    dum: [null as Date | null],
  });

  protected readonly formReagendar = this.fb.group({
    dataHora: [null as Date | null, Validators.required],
  });

  protected readonly ehSecretaria = computed(() => this.auth.papel() === 'secretaria');
  protected readonly ehMedica = computed(() => this.auth.papel() === 'medica');

  protected readonly hoje = new Date();
  // Mesma janela da RPC: DUM de uma gestação em curso (até 300 dias atrás).
  protected readonly dumMinima = new Date(
    this.hoje.getFullYear(),
    this.hoje.getMonth(),
    this.hoje.getDate() - 300,
  );

  protected readonly pacienteEscolhida = signal('');
  protected readonly gestacaoDaPaciente = signal<GestacaoAtiva | null>(null);
  protected readonly verificandoGestacao = signal(false);
  protected readonly precisaDeGestacao = computed(
    () =>
      this.pacienteEscolhida() !== '' && !this.verificandoGestacao() && this.gestacaoDaPaciente() === null,
  );

  protected readonly periodo = computed<{ de: Date; ate: Date }>(() => {
    const base = this.ref();
    if (this.visao() === 'semana') {
      const ate = new Date(base);
      ate.setDate(ate.getDate() + 7);
      return { de: new Date(base), ate };
    }
    return {
      de: new Date(base.getFullYear(), base.getMonth(), 1),
      ate: new Date(base.getFullYear(), base.getMonth() + 1, 1),
    };
  });

  protected readonly dias = computed<DiaAgenda[]>(() => {
    const status = this.filtroStatus();
    const porDia = new Map<string, ConsultaAgenda[]>();
    for (const c of this.consultas()) {
      if (status !== null && c.status !== status) {
        continue;
      }
      const iso = paraDataIso(new Date(c.data_hora)) ?? '';
      const doDia = porDia.get(iso) ?? [];
      doDia.push(c);
      porDia.set(iso, doDia);
    }
    return [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, doDia]) => ({ iso, consultas: doDia }));
  });

  protected readonly total = computed(() =>
    this.dias().reduce((soma, dia) => soma + dia.consultas.length, 0),
  );

  protected readonly medicaFiltroOpcoes = computed(() => [
    { rotulo: 'Todas as médicas', valor: null as string | null },
    ...this.medicas().map((m) => ({ rotulo: m.nome, valor: m.id as string | null })),
  ]);

  protected readonly rotuloPeriodo = computed(() => {
    const { de, ate } = this.periodo();
    if (this.visao() === 'mes') {
      return de.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
    const ultimo = new Date(ate);
    ultimo.setDate(ultimo.getDate() - 1);
    if (de.getMonth() === ultimo.getMonth()) {
      return `${de.getDate()}–${ultimo.getDate()} ${de.toLocaleDateString('pt-BR', { month: 'short' })} ${de.getFullYear()}`;
    }
    return `${de.getDate()} ${de.toLocaleDateString('pt-BR', { month: 'short' })} – ${ultimo.getDate()} ${ultimo.toLocaleDateString('pt-BR', { month: 'short' })} ${ultimo.getFullYear()}`;
  });

  ngOnInit(): void {
    if (this.ehSecretaria()) {
      void this.carregarMedicas();
    }
    void this.carregar();
    this.formNova.controls.pacienteId.valueChanges.subscribe((pacienteId) => {
      void this.verificarGestacao(pacienteId);
    });
  }

  // A obrigatoriedade da DUM depende da paciente escolhida: só a secretaria
  // cadastra gestação pelo diálogo, e só quando não há gestação ativa.
  private async verificarGestacao(pacienteId: string): Promise<void> {
    const dum = this.formNova.controls.dum;
    this.pacienteEscolhida.set(pacienteId);
    dum.setValue(null);
    dum.removeValidators(Validators.required);
    dum.updateValueAndValidity();
    if (pacienteId === '') {
      this.gestacaoDaPaciente.set(null);
      this.verificandoGestacao.set(false);
      return;
    }
    this.verificandoGestacao.set(true);
    const resultado = await this.pacientesService.gestacaoAtiva(pacienteId);
    // Troca rápida de paciente: a resposta tardia da anterior é descartada.
    if (this.formNova.controls.pacienteId.value !== pacienteId) {
      return;
    }
    this.verificandoGestacao.set(false);
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      return;
    }
    this.gestacaoDaPaciente.set(resultado.valor);
    if (resultado.valor === null) {
      dum.addValidators(Validators.required);
      dum.updateValueAndValidity();
    }
  }

  private async carregarMedicas(): Promise<void> {
    const resultado = await this.pacientesService.listarMedicas();
    if (resultado.ok) {
      this.medicas.set(resultado.valor);
    }
  }

  protected rotuloStatus(status: StatusConsulta): string {
    return STATUS_ROTULO[status];
  }

  protected severidade(status: StatusConsulta): Severidade {
    return STATUS_SEVERIDADE[status];
  }

  // Consulta que já passou sem registro é a única que vira falta.
  protected vencida(c: ConsultaAgenda): boolean {
    return new Date(c.data_hora).getTime() <= Date.now();
  }

  protected resumoConsulta(c: ConsultaAgenda | null): string {
    return c === null ? '' : `${c.nome} · ${formatarDataHora(c.data_hora)}`;
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const { de, ate } = this.periodo();
      const resultado = await this.agenda.listar(
        de,
        ate,
        this.ehSecretaria() ? this.filtroMedicaId() : null,
      );
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.consultas.set([]);
        return;
      }
      this.consultas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected aplicar(): void {
    const { visao, medicaId, status } = this.formulario.getRawValue();
    this.visao.set(visao);
    this.filtroMedicaId.set(medicaId);
    this.filtroStatus.set(status);
    void this.carregar();
  }

  protected mover(direcao: number): void {
    const base = this.ref();
    if (this.visao() === 'semana') {
      const nova = new Date(base);
      nova.setDate(nova.getDate() + direcao * 7);
      this.ref.set(nova);
    } else {
      this.ref.set(new Date(base.getFullYear(), base.getMonth() + direcao, 1));
    }
    void this.carregar();
  }

  protected voltarHoje(): void {
    const hoje = new Date();
    // Na visão mês, a semana atual pode começar no mês anterior: voltar ao dia 1º.
    this.ref.set(
      this.visao() === 'mes'
        ? new Date(hoje.getFullYear(), hoje.getMonth(), 1)
        : inicioDaSemana(hoje),
    );
    void this.carregar();
  }

  protected async abrirNovaConsulta(): Promise<void> {
    this.erro.set(null);
    const pacientes = await this.agenda.pacientesAgendaveis('');
    if (!pacientes.ok) {
      this.erro.set(pacientes.mensagem);
      return;
    }
    this.pacientes.set(pacientes.valor);
    this.gestacaoDaPaciente.set(null);
    this.pacienteEscolhida.set('');
    this.verificandoGestacao.set(false);
    this.formNova.setValue({
      pacienteId: '',
      medicaId: this.ehSecretaria() ? '' : (this.auth.perfil()?.id ?? ''),
      dataHora: null,
      tipo: 'Consulta de pré-natal',
      local: '',
      dum: null,
    });
    this.criando.set(true);
  }

  protected fecharNovaConsulta(): void {
    this.criando.set(false);
    this.gestacaoDaPaciente.set(null);
    this.pacienteEscolhida.set('');
    this.verificandoGestacao.set(false);
  }

  protected async confirmarNovaConsulta(): Promise<void> {
    if (this.agindo()) {
      return;
    }
    // Sem marcar como tocado, o clique não mostra o que está faltando.
    if (this.formNova.invalid) {
      this.formNova.markAllAsTouched();
      return;
    }
    // O botão da médica já vem desabilitado; o Enter no form passaria por aqui.
    if (this.precisaDeGestacao() && !this.ehSecretaria()) {
      return;
    }
    const { pacienteId, medicaId, dataHora, tipo, local, dum } = this.formNova.getRawValue();
    if (dataHora === null) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      if (this.precisaDeGestacao() && this.ehSecretaria()) {
        const criada = await this.pacientesService.criarGestacao(pacienteId, paraDataIso(dum)!);
        if (!criada.ok) {
          this.erro.set(criada.mensagem);
          return;
        }
      }
      const resultado = await this.agenda.agendar({
        pacienteId,
        medicaId,
        dataHora,
        tipo,
        local: local.trim() === '' ? null : local.trim(),
      });
      this.criando.set(false);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected abrirReagendar(c: ConsultaAgenda): void {
    this.formReagendar.setValue({ dataHora: null });
    this.aReagendar.set(c);
  }

  protected async confirmarReagendar(): Promise<void> {
    const consulta = this.aReagendar();
    const { dataHora } = this.formReagendar.getRawValue();
    if (this.agindo()) {
      return;
    }
    if (consulta === null) {
      return;
    }
    if (dataHora === null) {
      this.formReagendar.markAllAsTouched();
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.agenda.reagendar(consulta.consulta_id, dataHora);
      this.aReagendar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected pedirCancelamento(c: ConsultaAgenda): void {
    this.aFechar.set({ consulta: c, acao: 'cancelar' });
  }

  protected pedirFalta(c: ConsultaAgenda): void {
    this.aFechar.set({ consulta: c, acao: 'falta' });
  }

  protected pedirRealizada(c: ConsultaAgenda): void {
    this.aFechar.set({ consulta: c, acao: 'realizada' });
  }

  protected async confirmarFechamento(): Promise<void> {
    const alvo = this.aFechar();
    if (alvo === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado =
        alvo.acao === 'cancelar'
          ? await this.agenda.cancelar(alvo.consulta.consulta_id)
          : alvo.acao === 'falta'
            ? await this.agenda.marcarFalta(alvo.consulta.consulta_id)
            : await this.agenda.registrarRealizada(alvo.consulta.consulta_id);
      this.aFechar.set(null);
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
