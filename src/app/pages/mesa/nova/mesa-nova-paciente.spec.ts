import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { MesaNovaPaciente } from './mesa-nova-paciente';

function montar(criarComConvite: ReturnType<typeof vi.fn>) {
  const pacientes = { criarComConvite, reemitirConvite: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MesaNovaPaciente],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: PacientesService, useValue: pacientes },
    ],
  });
  const fixture = TestBed.createComponent(MesaNovaPaciente);
  const router = TestBed.inject(Router);
  return { fixture, pacientes, navegar: vi.spyOn(router, 'navigate').mockResolvedValue(true) };
}

interface Interno {
  formulario: { setValue(v: unknown): void };
  salvar(): Promise<void>;
  irParaCartao(): void;
}

describe('MesaNovaPaciente', () => {
  it('cadastra com o payload trimado e exibe o código uma única vez', async () => {
    const criarComConvite = vi
      .fn()
      .mockResolvedValue({ ok: true, valor: { pacienteId: 'p9', codigo: 'ABCD-1234' } });
    const { fixture } = montar(criarComConvite);
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({
      nome: '  Maria Souza  ',
      papelVinculo: 'obstetra',
      dataNascimento: new Date(1995, 3, 10),
      cpf: '   ',
      contatoEmergencia: ' José ',
    });
    await componente.salvar();
    fixture.detectChanges();

    expect(criarComConvite).toHaveBeenCalledWith({
      nome: 'Maria Souza',
      papelVinculo: 'obstetra',
      dataNascimento: '1995-04-10',
      cpf: null,
      contatoEmergencia: 'José',
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ABCD-1234');
  });

  it('navega para o cartão da paciente nova ao fechar o código', async () => {
    const criarComConvite = vi
      .fn()
      .mockResolvedValue({ ok: true, valor: { pacienteId: 'p9', codigo: 'ABCD-1234' } });
    const { fixture, navegar } = montar(criarComConvite);
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({
      nome: 'Maria Souza',
      papelVinculo: 'obstetra',
      dataNascimento: null,
      cpf: '',
      contatoEmergencia: '',
    });
    await componente.salvar();
    componente.irParaCartao();

    expect(navegar).toHaveBeenCalledWith(['/mesa', 'p9']);
  });

  it('mostra a mensagem do serviço e não navega sem cadastro', async () => {
    const criarComConvite = vi.fn().mockResolvedValue({
      ok: false,
      mensagem: 'Já existe uma paciente cadastrada com este CPF.',
    });
    const { fixture, navegar } = montar(criarComConvite);
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.formulario.setValue({
      nome: 'Maria Souza',
      papelVinculo: 'obstetra',
      dataNascimento: null,
      cpf: '',
      contatoEmergencia: '',
    });
    await componente.salvar();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Já existe uma paciente cadastrada com este CPF.',
    );
    componente.irParaCartao();
    expect(navegar).not.toHaveBeenCalled();
  });
});
