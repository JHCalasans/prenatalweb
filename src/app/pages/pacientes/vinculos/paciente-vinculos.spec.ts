import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { VinculosService } from '../../../core/vinculos/vinculos.service';
import { PacienteVinculos } from './paciente-vinculos';

const ativo = {
  vinculo_id: 'v1',
  medica_id: 'm1',
  medica_nome: 'Dra A',
  papel: 'obstetra',
  ativo: true,
  created_at: '2026-08-01T12:00:00Z',
};

const encerrado = { ...ativo, vinculo_id: 'v2', medica_nome: 'Dra B', ativo: false };

function montar(vinculos: Partial<VinculosService>) {
  TestBed.configureTestingModule({
    imports: [PacienteVinculos],
    providers: [
      provideZonelessChangeDetection(),
      { provide: VinculosService, useValue: vinculos },
      {
        provide: PacientesService,
        useValue: {
          listarMedicas: vi
            .fn()
            .mockResolvedValue({ ok: true, valor: [{ id: 'm1', nome: 'Dra A' }] }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PacienteVinculos);
  fixture.componentRef.setInput('pacienteId', 'p1');
  return fixture;
}

interface Interno {
  aInativar: { set(v: unknown): void };
  confirmarInativacao(): Promise<void>;
}

describe('PacienteVinculos', () => {
  it('mostra ativos e histórico com o papel em português', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, encerrado] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Dra A');
    expect(texto).toContain('Dra B');
    expect(texto).toContain('Obstetra');
    expect(texto).toContain('Ativo');
    expect(texto).toContain('Encerrado');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem permissão.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem permissão.');
  });

  it('só inativa depois da confirmação', async () => {
    const inativar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo] }),
      inativar,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(inativar).not.toHaveBeenCalled();

    componente.aInativar.set(ativo);
    await componente.confirmarInativacao();

    expect(inativar).toHaveBeenCalledWith('v1');
  });

  it('avisa quando não há vínculo', async () => {
    const fixture = montar({ listar: vi.fn().mockResolvedValue({ ok: true, valor: [] }) });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhum vínculo registrado',
    );
  });
});
