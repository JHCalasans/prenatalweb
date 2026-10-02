import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacienteGestacao } from './paciente-gestacao';

const ativaDum = {
  id: 'g1',
  dppOrigem: 'dum' as const,
  dum: '2026-04-01',
  dppUsg: null,
  dppFinal: '2027-01-06',
  tipo: 'unica' as const,
};

const ativaUsg = {
  id: 'g2',
  dppOrigem: 'usg' as const,
  dum: null,
  dppUsg: '2026-12-20',
  dppFinal: '2026-12-20',
  tipo: 'unica' as const,
};

function montar(pacientes: Partial<PacientesService>) {
  TestBed.configureTestingModule({
    imports: [PacienteGestacao],
    providers: [
      provideZonelessChangeDetection(),
      { provide: PacientesService, useValue: pacientes },
    ],
  });
  const fixture = TestBed.createComponent(PacienteGestacao);
  fixture.componentRef.setInput('pacienteId', 'p1');
  return fixture;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

interface Interno {
  formulario: { setValue(v: unknown): void };
  abrirCorrecao(): void;
  cadastrar(): Promise<void>;
  salvarCorrecao(): Promise<void>;
}

describe('PacienteGestacao', () => {
  it('sem gestação: mostra o campo de DUM e cadastra pela RPC', async () => {
    const criarGestacao = vi.fn().mockResolvedValue({ ok: true, valor: 'g9' });
    const gestacaoAtiva = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ gestacaoAtiva, criarGestacao });
    const emitida = vi.fn();
    fixture.componentInstance.alterada.subscribe(emitida);
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Data da última menstruação');
    expect(texto).toContain('Cadastrar gestação');

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({ dum: new Date(2026, 3, 1) });
    await componente.cadastrar();

    expect(criarGestacao).toHaveBeenCalledWith('p1', '2026-04-01');
    expect(emitida).toHaveBeenCalled();
    expect(gestacaoAtiva).toHaveBeenCalledTimes(2);
  });

  it('gestação com origem dum: mostra DUM e DPP prevista e permite corrigir', async () => {
    const corrigirDum = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: true, valor: ativaDum }),
      corrigirDum,
    });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('DUM');
    expect(texto).toContain('DPP prevista');
    expect(texto).toContain('01/04/2026');
    expect(texto).toContain('06/01/2027');
    expect(texto).toContain('Corrigir DUM');

    const componente = fixture.componentInstance as unknown as Interno;
    componente.abrirCorrecao();
    fixture.detectChanges();
    componente.formulario.setValue({ dum: new Date(2026, 3, 15) });
    await componente.salvarCorrecao();

    expect(corrigirDum).toHaveBeenCalledWith('g1', '2026-04-15');
  });

  it('gestação com origem usg: modo leitura, sem correção', async () => {
    const corrigirDum = vi.fn();
    const fixture = montar({
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: true, valor: ativaUsg }),
      corrigirDum,
    });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('DPP definida por ultrassom pela médica.');
    expect(texto).toContain('20/12/2026');
    expect(texto).not.toContain('Corrigir DUM');
    expect(texto).not.toContain('Data da última menstruação');
    expect(corrigirDum).not.toHaveBeenCalled();
  });

  it('erro da RPC aparece na tela e não emite alterada', async () => {
    const criarGestacao = vi
      .fn()
      .mockResolvedValue({ ok: false, mensagem: 'Paciente já tem gestação ativa.' });
    const fixture = montar({
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: true, valor: null }),
      criarGestacao,
    });
    const emitida = vi.fn();
    fixture.componentInstance.alterada.subscribe(emitida);
    await estabilizar(fixture);

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({ dum: new Date(2026, 3, 1) });
    await componente.cadastrar();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Paciente já tem gestação ativa.',
    );
    expect(emitida).not.toHaveBeenCalled();
  });

  it('mostra a mensagem quando a leitura da gestação falha', async () => {
    const fixture = montar({
      gestacaoAtiva: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem acesso à gestação desta paciente.' }),
    });
    await estabilizar(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Sem acesso à gestação desta paciente.',
    );
  });
});
