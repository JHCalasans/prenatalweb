import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExamesService } from '../../../core/exames/exames.service';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacienteExames } from './paciente-exames';

function montar(gestacaoAtiva: unknown) {
  TestBed.configureTestingModule({
    imports: [PacienteExames],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: PacientesService,
        useValue: { gestacaoAtiva: vi.fn().mockResolvedValue(gestacaoAtiva) },
      },
      {
        provide: ExamesService,
        useValue: {
          catalogo: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          exames: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          vacinas: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PacienteExames);
  fixture.componentRef.setInput('pacienteId', 'p1');
  return fixture;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PacienteExames', () => {
  it('mostra exames e vacinas da gestação ativa, sem liberar', async () => {
    const fixture = montar({ ok: true, valor: { id: 'g1' } });
    await estabilizar(fixture);

    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.querySelector('app-painel-exames')).not.toBeNull();
    expect(elemento.querySelector('app-painel-vacinas')).not.toBeNull();
    expect(elemento.textContent).not.toContain('Liberar para a gestante');
  });

  it('sem gestação ativa pede para cadastrá-la', async () => {
    const fixture = montar({ ok: true, valor: null });
    await estabilizar(fixture);

    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.textContent).toContain('Cadastre a gestação para registrar exames e vacinas.');
    expect(elemento.querySelector('app-painel-exames')).toBeNull();
  });

  it('mostra o erro ao buscar a gestação', async () => {
    const fixture = montar({ ok: false, mensagem: 'Sem acesso.' });
    await estabilizar(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem acesso.');
  });
});
