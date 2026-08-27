import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AgendaService, ConsultaAgenda } from '../../core/agenda/agenda.service';
import { AuthService } from '../../core/auth/auth.service';
import { MesaService, PacienteMesa } from '../../core/mesa/mesa.service';
import { Inicio } from './inicio';

const emDia = {
  paciente_id: 'p1',
  nome: 'Ana Célia',
  data_nascimento: null,
  convite_ativado_em: '2026-08-01T12:00:00Z',
  convite_revogado_em: null,
  gestacao_id: 'g1',
  dpp_final: '2026-12-12',
  ig_semanas: 24,
  trimestre: 2,
  proxima_consulta_em: null,
  consulta_a_registrar_id: null,
  consulta_a_registrar_em: null,
  laudos_para_publicar: 0,
  achados_para_comunicar: 0,
  faltou_sem_reagendar: false,
  checklist_vencidos: 0,
  checklist_vencendo: 0,
  urgencia_score: 0,
} as PacienteMesa;

const critica = {
  ...emDia,
  paciente_id: 'p2',
  nome: 'Zilda Souza',
  ig_semanas: 34,
  achados_para_comunicar: 1,
  urgencia_score: 100,
};

const comVencidos = {
  ...emDia,
  paciente_id: 'p3',
  nome: 'Rita Farias',
  checklist_vencidos: 2,
  checklist_vencendo: 1,
  urgencia_score: 80,
};

const comFalta = {
  ...emDia,
  paciente_id: 'p5',
  nome: 'Irêne Costa',
  faltou_sem_reagendar: true,
  urgencia_score: 30,
};

const comLaudos = {
  ...emDia,
  paciente_id: 'p4',
  nome: 'Bianca Lopes',
  laudos_para_publicar: 3,
  urgencia_score: 30,
};

function consulta(overrides: Partial<ConsultaAgenda>): ConsultaAgenda {
  return {
    consulta_id: 'c1',
    data_hora: new Date(2026, 7, 27, 13, 30).toISOString(),
    gestacao_id: 'g1',
    local: null,
    medica_id: 'm1',
    medica_nome: 'Helena',
    nome: 'Camila Teles',
    paciente_id: 'p1',
    status: 'agendada',
    tipo: 'retorno',
    ...overrides,
  };
}

function montar(
  painel: ReturnType<typeof vi.fn>,
  agenda: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ ok: true, valor: [] }),
  papel: 'medica' | 'secretaria' = 'medica',
) {
  TestBed.configureTestingModule({
    imports: [Inicio],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          perfil: () => ({ id: 'm1', nome: 'Helena', papel }),
          papel: () => papel,
        },
      },
      { provide: MesaService, useValue: { listar: painel } },
      { provide: AgendaService, useValue: { listar: agenda } },
    ],
  });
  return TestBed.createComponent(Inicio);
}

function texto(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

// `carregar` aguarda duas RPCs em `Promise.all`: `whenStable` resolve antes
// delas, então a espera confiável é o flag `carregando` baixar.
async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  const interno = fixture.componentInstance as unknown as { carregando(): boolean };
  await vi.waitFor(() => {
    expect(interno.carregando()).toBe(false);
  });
  fixture.detectChanges();
}

describe('Inicio', () => {
  it('resume as pendências da mesa e linka para a mesa filtrada', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [critica, comVencidos] }));
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('1 a comunicar');
    // O chip espelha o filtro da mesa: vencidos + vencendo.
    expect(corpo).toContain('3 vencidos ou vencendo');

    const link = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href*="pendencia=achados"]',
    );
    expect(link).not.toBeNull();
  });

  it('mantém a ordem de urgência e mostra IG e DPP', async () => {
    // A RPC devolve ordenada por urgência; o componente só recorta o topo.
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [critica, comLaudos] }));
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('34 sem');
    expect(corpo).toContain('DPP 12/12/2026');
    expect(corpo.indexOf('Zilda Souza')).toBeLessThan(corpo.indexOf('Bianca Lopes'));
  });

  it('mostra a agenda de hoje com hora e nome', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: true, valor: [emDia] }),
      vi.fn().mockResolvedValue({ ok: true, valor: [consulta({ status: 'faltou' })] }),
    );
    await estabilizar(fixture);

    const corpo = texto(fixture);
    const hora = new Date(2026, 7, 27, 13, 30).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(corpo).toContain(hora);
    expect(corpo).toContain('Camila Teles');
    expect(corpo).toContain('Faltou');
  });

  it('conta faltas por paciente', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [comFalta] }));
    await estabilizar(fixture);

    expect(texto(fixture)).toContain('1 paciente faltou');
  });

  it('esconde consultas canceladas da agenda de hoje', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: true, valor: [emDia] }),
      vi.fn().mockResolvedValue({
        ok: true,
        valor: [
          consulta({ consulta_id: 'c1', nome: 'Camila Teles' }),
          consulta({ consulta_id: 'c2', nome: 'Sônia Braga', status: 'cancelada' }),
        ],
      }),
    );
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('Camila Teles');
    expect(corpo).not.toContain('Sônia Braga');
  });

  it('agenda com erro não derruba as urgências', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: true, valor: [critica] }),
      vi.fn().mockResolvedValue({ ok: false, mensagem: 'Período inválido' }),
    );
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('Zilda Souza');
    expect(corpo).toContain('Período inválido');
  });

  it('painel com erro não derruba a agenda nem mostra a faixa', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas médicas abrem o painel' }),
      vi.fn().mockResolvedValue({ ok: true, valor: [consulta({})] }),
    );
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('Camila Teles');
    expect(corpo).toContain('Apenas médicas abrem o painel');
    expect((fixture.nativeElement as HTMLElement).querySelector('.mesa-hoje')).toBeNull();
  });

  it('exibe Mesa em dia quando não há pendências', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [emDia] }));
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('Mesa em dia');
    expect(corpo).toContain('Nenhuma paciente pede atenção agora');
    expect(corpo).toContain('Nenhuma consulta hoje');
  });

  it('secretaria vê a agenda da clínica, sem o painel da mesa', async () => {
    const painel = vi.fn();
    const fixture = montar(
      painel,
      vi.fn().mockResolvedValue({ ok: true, valor: [consulta({ medica_nome: 'Dra. Marta' })] }),
      'secretaria',
    );
    await estabilizar(fixture);

    const corpo = texto(fixture);
    expect(corpo).toContain('Camila Teles');
    // A secretaria precisa saber de quem é a consulta.
    expect(corpo).toContain('Dra. Marta');
    expect(corpo).not.toContain('Comece por aqui');
    expect(painel).not.toHaveBeenCalled();

    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.querySelector('a[href*="/pacientes/p1"]')).not.toBeNull();
    expect(elemento.querySelector('a[href*="/mesa"]')).toBeNull();
  });
});
