import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExamesService, VacinaGestacao } from '../../../core/exames/exames.service';
import { ERRO_DATA_APLICACAO, PainelVacinas } from './painel-vacinas';

const VACINAS: VacinaGestacao[] = [
  {
    vacina: 'dtpa',
    dosesEsperadas: 1,
    situacaoCalendario: 'em_dia',
    registros: [
      {
        id: 'v1',
        dose: 1,
        situacao: 'aplicada',
        aplicadaEm: '2026-09-20',
        lote: 'L123',
        local: 'UBS Centro',
        observacao: null,
      },
    ],
  },
  {
    vacina: 'hepatite_b',
    dosesEsperadas: 3,
    situacaoCalendario: 'pendente',
    registros: [
      {
        id: 'v2',
        dose: 1,
        situacao: 'aplicada',
        aplicadaEm: '2026-09-01',
        lote: null,
        local: null,
        observacao: null,
      },
    ],
  },
  { vacina: 'influenza', dosesEsperadas: 1, situacaoCalendario: 'recusada', registros: [] },
  { vacina: 'covid_19', dosesEsperadas: 1, situacaoCalendario: 'pendente', registros: [] },
];

function montar(servico: Partial<ExamesService>) {
  TestBed.configureTestingModule({
    imports: [PainelVacinas],
    providers: [provideZonelessChangeDetection(), { provide: ExamesService, useValue: servico }],
  });
  const fixture = TestBed.createComponent(PainelVacinas);
  fixture.componentRef.setInput('gestacaoId', 'g1');
  fixture.componentRef.setInput('gestacaoAtiva', true);
  return fixture;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

interface Interno {
  abrirNova(v: VacinaGestacao): void;
  situacao: { set(v: string): void };
  aplicadaEm: { set(v: Date | null): void };
  dose(): number;
  opcoesDose(): { valor: number }[];
  salvar(): Promise<void>;
  erroDialogo(): string | null;
}

describe('PainelVacinas', () => {
  it('mostra a situação do calendário e as doses registradas', async () => {
    const fixture = montar({ vacinas: vi.fn().mockResolvedValue({ ok: true, valor: VACINAS }) });
    await estabilizar(fixture);

    // O template deixa espaços duplos que o navegador colapsa.
    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('dTpa');
    expect(texto).toContain('Em dia');
    expect(texto).toContain('Pendente');
    expect(texto).toContain('Recusada');
    expect(texto).toContain('Dose 1 · Aplicada · 20/09/2026 · lote L123 · UBS Centro');
  });

  it('sugere a próxima dose livre e limita ao esquema da vacina', async () => {
    const fixture = montar({ vacinas: vi.fn().mockResolvedValue({ ok: true, valor: VACINAS }) });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNova(VACINAS[1]!);

    expect(interno.dose()).toBe(2);
    expect(interno.opcoesDose().map((o) => o.valor)).toEqual([1, 2, 3]);

    interno.abrirNova(VACINAS[0]!);
    expect(interno.opcoesDose().map((o) => o.valor)).toEqual([1]);
  });

  it('exige a data quando a situação é aplicada', async () => {
    const registrarVacina = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      vacinas: vi.fn().mockResolvedValue({ ok: true, valor: VACINAS }),
      registrarVacina,
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNova(VACINAS[3]!);
    await interno.salvar();

    expect(interno.erroDialogo()).toBe(ERRO_DATA_APLICACAO);
    expect(registrarVacina).not.toHaveBeenCalled();
  });

  it('registra recusa sem data e recarrega o calendário', async () => {
    const registrarVacina = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const vacinas = vi.fn().mockResolvedValue({ ok: true, valor: VACINAS });
    const fixture = montar({ vacinas, registrarVacina });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNova(VACINAS[3]!);
    interno.situacao.set('recusada');
    await interno.salvar();

    expect(registrarVacina).toHaveBeenCalledTimes(1);
    const [id, gestacaoId, dados] = registrarVacina.mock.calls[0]!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(gestacaoId).toBe('g1');
    expect(dados).toMatchObject({
      vacina: 'covid_19',
      dose: 1,
      situacao: 'recusada',
      aplicadaEm: null,
    });
    expect(vacinas).toHaveBeenCalledTimes(2);
  });

  it('mostra a recusa do Postgres no diálogo', async () => {
    const registrarVacina = vi
      .fn()
      .mockResolvedValue({ ok: false, mensagem: 'Esta dose já está registrada' });
    const fixture = montar({
      vacinas: vi.fn().mockResolvedValue({ ok: true, valor: VACINAS }),
      registrarVacina,
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNova(VACINAS[3]!);
    interno.situacao.set('recusada');
    await interno.salvar();

    expect(interno.erroDialogo()).toBe('Esta dose já está registrada');
  });
});
