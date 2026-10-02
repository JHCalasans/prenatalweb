import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgendaService, ConsultaAgenda } from '../../core/agenda/agenda.service';
import { AuthService } from '../../core/auth/auth.service';
import { PacientesService } from '../../core/pacientes/pacientes.service';
import { Agenda, inicioDaSemana } from './agenda';

const hoje = new Date();

function asIso(dias: number, hora: number): string {
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias, hora).toISOString();
}

const futura = {
  consulta_id: 'c1',
  gestacao_id: 'g1',
  paciente_id: 'p1',
  nome: 'Maria Souza',
  data_hora: asIso(1, 9),
  tipo: 'Consulta de pré-natal',
  local: 'Clínica — sala 2',
  status: 'agendada',
  medica_id: 'm1',
  medica_nome: 'Dra A',
} as ConsultaAgenda;

const vencida = {
  ...futura,
  consulta_id: 'c2',
  nome: 'Zilda Lima',
  data_hora: asIso(-1, 8),
  local: null,
} as ConsultaAgenda;

const realizada = {
  ...futura,
  consulta_id: 'c3',
  nome: 'Ana Célia',
  data_hora: asIso(-1, 14),
  status: 'realizada',
} as ConsultaAgenda;

const gestacaoAtiva = {
  id: 'g1',
  dppOrigem: 'dum' as const,
  dum: '2026-04-01',
  dppUsg: null,
  dppFinal: '2027-01-06',
  tipo: 'unica' as const,
};

function montar(config?: {
  papel?: 'secretaria' | 'medica';
  listar?: ReturnType<typeof vi.fn>;
  agendar?: ReturnType<typeof vi.fn>;
  gestacaoAtiva?: ReturnType<typeof vi.fn>;
  criarGestacao?: ReturnType<typeof vi.fn>;
}) {
  const agendaService = {
    listar: config?.listar ?? vi.fn().mockResolvedValue({ ok: true, valor: [] }),
    pacientesAgendaveis: vi
      .fn()
      .mockResolvedValue({ ok: true, valor: [{ pacienteId: 'p1', nome: 'Maria Souza' }] }),
    agendar: config?.agendar ?? vi.fn().mockResolvedValue({ ok: true, valor: 'c9' }),
    reagendar: vi.fn().mockResolvedValue({ ok: true, valor: null }),
    cancelar: vi.fn().mockResolvedValue({ ok: true, valor: null }),
    marcarFalta: vi.fn().mockResolvedValue({ ok: true, valor: null }),
    registrarRealizada: vi.fn().mockResolvedValue({ ok: true, valor: null }),
  };
  const pacientesService = {
    listarMedicas: vi.fn().mockResolvedValue({ ok: true, valor: [{ id: 'm1', nome: 'Dra A' }] }),
    gestacaoAtiva: config?.gestacaoAtiva ?? vi.fn().mockResolvedValue({ ok: true, valor: gestacaoAtiva }),
    criarGestacao: config?.criarGestacao ?? vi.fn().mockResolvedValue({ ok: true, valor: 'g9' }),
  };
  TestBed.configureTestingModule({
    imports: [Agenda],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AgendaService, useValue: agendaService },
      { provide: PacientesService, useValue: pacientesService },
      {
        provide: AuthService,
        useValue: {
          papel: () => config?.papel ?? 'secretaria',
          perfil: () => ({ id: 'u1', nome: 'Sec', papel: config?.papel ?? 'secretaria' }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(Agenda);
  return { fixture, agendaService, pacientesService };
}

interface Interno {
  formulario: { setValue(v: unknown): void };
  aplicar(): void;
  periodo(): { de: Date; ate: Date };
  total(): number;
  criando(): boolean;
  formNova: { setValue(v: unknown): void };
  abrirNovaConsulta(): Promise<void>;
  confirmarNovaConsulta(): Promise<void>;
  mover(direcao: number): void;
  voltarHoje(): void;
}

describe('Agenda', () => {
  it('agrupa as consultas por dia com hora, médica e situação', async () => {
    const { fixture } = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [futura, vencida, realizada] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Maria Souza');
    expect(texto).toContain('Dra A');
    expect(texto).toContain('Agendada');
    expect(texto).toContain('Realizada');
    expect(texto).toContain('—');

    const componente = fixture.componentInstance as unknown as Interno;
    expect(componente.total()).toBe(3);
  });

  it('começa a semana na segunda-feira', () => {
    // 27/08/2026 é quinta; 30/08 é domingo — ambos caem na segunda 24/08.
    expect(inicioDaSemana(new Date(2026, 7, 27)).getDate()).toBe(24);
    expect(inicioDaSemana(new Date(2026, 7, 30)).getDate()).toBe(24);
  });

  it('visão mensal cobre o mês inteiro', async () => {
    const { fixture } = montar();
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({ visao: 'mes', medicaId: null, status: null });
    componente.aplicar();

    const { de, ate } = componente.periodo();
    expect(de.getDate()).toBe(1);
    expect(ate.getMonth()).toBe((de.getMonth() + 1) % 12);
  });

  it('Hoje volta ao período atual nas visões semana e mês', async () => {
    const { fixture } = montar();
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;

    componente.mover(1);
    componente.voltarHoje();
    expect(componente.periodo().de.getTime()).toBe(inicioDaSemana(new Date()).getTime());

    componente.formulario.setValue({ visao: 'mes', medicaId: null, status: null });
    componente.aplicar();
    componente.mover(-1);
    componente.voltarHoje();

    const hoje = new Date();
    const { de } = componente.periodo();
    expect(de.getMonth()).toBe(hoje.getMonth());
    expect(de.getFullYear()).toBe(hoje.getFullYear());
  });

  it('mostra cancelar para futura, falta para vencida e nada para realizada', async () => {
    const { fixture } = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [futura, vencida, realizada] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Cancelar');
    expect(texto).toContain('Marcar falta');
    expect(texto.match(/Reagendar/g)).toHaveLength(2);
  });

  it('filtra por situação no cliente', async () => {
    const { fixture } = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [futura, vencida, realizada] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({ visao: 'semana', medicaId: null, status: 'agendada' });
    componente.aplicar();

    expect(componente.total()).toBe(2);
  });

  it('médica lista sem filtro por médica e sem o seletor', async () => {
    const { fixture, agendaService } = montar({ papel: 'medica' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(agendaService.listar).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), null);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Todas as médicas');
  });

  it('só a médica vê Realizada na vencida — e confirma pelo diálogo', async () => {
    const { fixture, agendaService } = montar({
      papel: 'medica',
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [futura, vencida] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Realizada');

    const componente = fixture.componentInstance as unknown as {
      pedirRealizada(c: unknown): void;
      confirmarFechamento(): Promise<void>;
    };
    componente.pedirRealizada(vencida);
    await componente.confirmarFechamento();

    expect(agendaService.registrarRealizada).toHaveBeenCalledWith('c2');
  });

  it('secretaria não vê a ação Realizada', async () => {
    const { fixture } = montar({
      papel: 'secretaria',
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [futura, vencida] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Realizada');
  });

  it('agenda consulta pelo diálogo com local vazio virando null', async () => {
    const { fixture, agendaService, pacientesService } = montar();
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.abrirNovaConsulta();
    expect(componente.criando()).toBe(true);

    componente.formNova.setValue({
      pacienteId: 'p1',
      medicaId: 'm1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: 'Consulta de pré-natal',
      local: '   ',
      dum: null,
    });
    await componente.confirmarNovaConsulta();

    expect(agendaService.agendar).toHaveBeenCalledWith({
      pacienteId: 'p1',
      medicaId: 'm1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: 'Consulta de pré-natal',
      local: null,
    });
    // Paciente com gestação ativa: fluxo atual intacto, sem criação extra.
    expect(pacientesService.criarGestacao).not.toHaveBeenCalled();
    expect(componente.criando()).toBe(false);
  });

  it('paciente sem gestação: campo de DUM aparece e a consulta agenda depois da criação', async () => {
    const { fixture, agendaService, pacientesService } = montar({
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: true, valor: null }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.abrirNovaConsulta();

    componente.formNova.setValue({
      pacienteId: 'p1',
      medicaId: 'm1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: 'Consulta de pré-natal',
      local: '',
      dum: new Date(2026, 7, 10),
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Esta paciente ainda não tem gestação cadastrada.');
    expect(texto).toContain('Data da última menstruação');

    await componente.confirmarNovaConsulta();

    expect(pacientesService.criarGestacao).toHaveBeenCalledWith('p1', '2026-08-10');
    const criacao = (pacientesService.criarGestacao as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const agendamento = (agendaService.agendar as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(criacao).toBeLessThan(agendamento);
    expect(componente.criando()).toBe(false);
  });

  it('falha ao criar a gestação aborta o agendamento e exibe a mensagem', async () => {
    const { fixture, agendaService, pacientesService } = montar({
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: true, valor: null }),
      criarGestacao: vi
        .fn()
        .mockResolvedValue({ ok: false, mensagem: 'Paciente já tem gestação ativa.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.abrirNovaConsulta();

    componente.formNova.setValue({
      pacienteId: 'p1',
      medicaId: 'm1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: 'Consulta de pré-natal',
      local: '',
      dum: new Date(2026, 7, 10),
    });
    await fixture.whenStable();

    await componente.confirmarNovaConsulta();
    fixture.detectChanges();

    expect(pacientesService.criarGestacao).toHaveBeenCalledTimes(1);
    expect(agendaService.agendar).not.toHaveBeenCalled();
    expect(componente.criando()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Paciente já tem gestação ativa.',
    );
  });

  it('médica com paciente sem gestação: aviso com link para o cartão e sem agendar', async () => {
    const { fixture, agendaService, pacientesService } = montar({
      papel: 'medica',
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: true, valor: null }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.abrirNovaConsulta();

    componente.formNova.setValue({
      pacienteId: 'p1',
      medicaId: 'u1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: 'Consulta de pré-natal',
      local: '',
      dum: null,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('cartão da gestante');
    expect(texto).not.toContain('Data da última menstruação');

    await componente.confirmarNovaConsulta();

    expect(pacientesService.criarGestacao).not.toHaveBeenCalled();
    expect(agendaService.agendar).not.toHaveBeenCalled();
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const { fixture } = montar({
      listar: vi.fn().mockResolvedValue({
        ok: false,
        mensagem: 'Apenas secretaria e médica acessam a agenda',
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Apenas secretaria e médica acessam a agenda',
    );
  });
});
