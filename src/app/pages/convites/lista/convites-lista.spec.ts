import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConvitesService } from '../../../core/convites/convites.service';
import { ConvitesLista } from './convites-lista';

function montar(servico: Partial<ConvitesService>) {
  TestBed.configureTestingModule({
    imports: [ConvitesLista],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ConvitesService, useValue: servico },
    ],
  });
  return TestBed.createComponent(ConvitesLista);
}

const semConvite = {
  paciente_id: 'p1',
  nome: 'Maria Souza',
  cpf: '12345678900',
  medicas: 'Dra A',
  convite_id: null,
  criado_em: null,
  expira_em: null,
  ativado_em: null,
  revogado_em: null,
  situacao: 'sem_convite',
};

const pendente = { ...semConvite, paciente_id: 'p2', nome: 'Ana Lima', situacao: 'pendente' };

interface Interno {
  emitir(linha: unknown): Promise<void>;
  confirmarRevogacao(): Promise<void>;
  aRevogar: { set(v: unknown): void };
  emitidos: () => unknown[];
}

describe('ConvitesLista', () => {
  it('mostra a situação e o CPF formatado', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [semConvite, pendente] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Maria Souza');
    expect(texto).toContain('123.456.789-00');
    expect(texto).toContain('Sem convite');
    expect(texto).toContain('Pendente');
  });

  it('abre a janela com o código depois de emitir', async () => {
    const emitir = vi.fn().mockResolvedValue({ ok: true, valor: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [semConvite] }),
      emitir,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.emitir(semConvite);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitir).toHaveBeenCalledWith('p1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'AAAA-BBBB-CCCC-DDDD-EEEE',
    );
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem permissão.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem permissão.');
  });

  it('revoga apenas depois da confirmação', async () => {
    const revogar = vi.fn().mockResolvedValue({ ok: true, valor: 1 });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [pendente] }),
      revogar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(revogar).not.toHaveBeenCalled();

    componente.aRevogar.set(pendente);
    await componente.confirmarRevogacao();

    expect(revogar).toHaveBeenCalledWith('p2');
  });

  it('avisa quando não há paciente', async () => {
    const fixture = montar({ listar: vi.fn().mockResolvedValue({ ok: true, valor: [] }) });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma paciente encontrada',
    );
  });
});
