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

function montar(config?: {
  papel?: 'secretaria' | 'medica';
  listar?: ReturnType<typeof vi.fn>;
  agendar?: ReturnType<typeof vi.fn>;
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
  };
  TestBed.configureTestingModule({
    imports: [Agenda],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AgendaService, useValue: agendaService },
      {
        provide: PacientesService,
        useValue: {
          listarMedicas: vi
            .fn()
            .mockResolvedValue({ ok: true, valor: [{ id: 'm1', nome: 'Dra A' }] }),
        },
      },
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
  return { fixture, agendaService };
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

  it('agenda consulta pelo diálogo com local vazio virando null', async () => {
    const { fixture, agendaService } = montar();
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
    });
    await componente.confirmarNovaConsulta();

    expect(agendaService.agendar).toHaveBeenCalledWith({
      pacienteId: 'p1',
      medicaId: 'm1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: 'Consulta de pré-natal',
      local: null,
    });
    expect(componente.criando()).toBe(false);
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
