import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MesaService, PacienteMesa } from '../../../core/mesa/mesa.service';
import { MesaLista } from './mesa-lista';

const base = {
  paciente_id: 'p1',
  nome: 'Ana Célia',
  data_nascimento: null,
  convite_ativado_em: '2026-08-01T12:00:00Z',
  convite_revogado_em: null,
  gestacao_id: 'g1',
  dpp_final: '2026-12-01',
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

const urgente = {
  ...base,
  paciente_id: 'p2',
  nome: 'Zilda Souza',
  trimestre: 3,
  ig_semanas: 30,
  achados_para_comunicar: 1,
  urgencia_score: 100,
};

const semGestacao = {
  ...base,
  paciente_id: 'p3',
  nome: 'Beatriz Lima',
  gestacao_id: null,
  ig_semanas: null,
  trimestre: null,
};

function montar(listar: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [MesaLista],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: MesaService, useValue: { listar } },
    ],
  });
  return TestBed.createComponent(MesaLista);
}

interface Interno {
  formulario: { setValue(v: unknown): void };
  aplicar(): void;
  total(): number;
}

describe('MesaLista', () => {
  it('mostra IG, trimestre e as pendências', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Zilda Souza');
    expect(texto).toContain('30 sem');
    expect(texto).toContain('1 a comunicar');
    expect(texto).toContain('Em dia');
  });

  it('preserva a ordem que a RPC devolveu', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto.indexOf('Zilda Souza')).toBeLessThan(texto.indexOf('Ana Célia'));
  });

  it('busca por nome ignora acento', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base] }));
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({ busca: 'celia', trimestre: null, pendencia: null });
    componente.aplicar();

    expect(componente.total()).toBe(1);
  });

  it('filtra por trimestre e por pendência', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: true, valor: [urgente, base, semGestacao] }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;

    componente.formulario.setValue({ busca: '', trimestre: 3, pendencia: null });
    componente.aplicar();
    expect(componente.total()).toBe(1);

    componente.formulario.setValue({ busca: '', trimestre: null, pendencia: 'achados' });
    componente.aplicar();
    expect(componente.total()).toBe(1);
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas médicas abrem o painel' }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Apenas médicas abrem o painel',
    );
  });
});
