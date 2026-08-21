import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { PacientesLista } from './pacientes-lista';

function montar(listar: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [PacientesLista],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: PacientesService, useValue: { listar } },
    ],
  });
  return TestBed.createComponent(PacientesLista);
}

const linha = {
  paciente_id: 'p1',
  nome: 'Maria Souza',
  data_nascimento: '1995-04-10',
  cpf: '12345678900',
  contato_emergencia: null,
  tem_acesso: true,
  medicas: 'Dra A',
};

describe('PacientesLista', () => {
  it('mostra as pacientes com CPF e data formatados', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [linha] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Maria Souza');
    expect(texto).toContain('123.456.789-00');
    expect(texto).toContain('10/04/1995');
    expect(texto).toContain('Dra A');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem permissão.' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem permissão.');
  });

  it('avisa quando não há resultado', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma paciente encontrada',
    );
  });
});
