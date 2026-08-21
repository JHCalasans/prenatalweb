import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacienteFormulario } from './paciente-formulario';

// salvar() navega para /pacientes após o sucesso; sem a rota registrada o
// Router rejeita a navegação e derruba o teste.
class PaginaPacientes {}

function montar(servico: Partial<PacientesService>, id: string | null) {
  TestBed.configureTestingModule({
    imports: [PacienteFormulario],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'pacientes', component: PaginaPacientes }]),
      { provide: PacientesService, useValue: servico },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => id } } },
      },
    ],
  });
  return TestBed.createComponent(PacienteFormulario);
}

interface Interno {
  formulario: {
    setValue(v: unknown): void;
    patchValue(v: unknown): void;
    invalid: boolean;
  };
  salvar(): Promise<void>;
}

describe('PacienteFormulario', () => {
  it('exige nome e médica no cadastro', async () => {
    const fixture = montar(
      {
        listarMedicas: vi.fn().mockResolvedValue({
          ok: true,
          valor: [{ id: 'm1', nome: 'Dra A' }],
        }),
      },
      null,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(componente.formulario.invalid).toBe(true);
  });

  it('envia CPF sem máscara e data como dia civil', async () => {
    const criar = vi.fn().mockResolvedValue({ ok: true, valor: 'novo-id' });
    const fixture = montar(
      {
        criar,
        listarMedicas: vi.fn().mockResolvedValue({
          ok: true,
          valor: [{ id: 'm1', nome: 'Dra A' }],
        }),
      },
      null,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.patchValue({
      nome: '  Maria Souza ',
      medicaId: 'm1',
      papelVinculo: 'obstetra',
      dataNascimento: new Date(1995, 3, 10),
      cpf: '12345678900',
      contatoEmergencia: '',
    });

    await componente.salvar();

    expect(criar).toHaveBeenCalledWith({
      nome: 'Maria Souza',
      dataNascimento: '1995-04-10',
      cpf: '12345678900',
      contatoEmergencia: null,
      medicaId: 'm1',
      papelVinculo: 'obstetra',
    });
  });

  it('mostra o erro devolvido na edição', async () => {
    const fixture = montar(
      {
        buscarPorId: vi.fn().mockResolvedValue({
          ok: true,
          valor: {
            id: 'p1',
            nome: 'Maria',
            dataNascimento: null,
            cpf: null,
            contatoEmergencia: null,
          },
        }),
        atualizar: vi.fn().mockResolvedValue({
          ok: false,
          mensagem: 'Já existe uma paciente cadastrada com este CPF.',
        }),
      },
      'p1',
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.salvar();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Já existe uma paciente cadastrada com este CPF.',
    );
  });
});
