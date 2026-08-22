import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ItemProtocolo, ProtocoloService } from '../../../core/protocolo/protocolo.service';
import { ProtocoloLista } from './protocolo-lista';

const ativo = {
  item_id: 'i1',
  nome: 'Hemograma completo',
  trimestre: 1,
  semana_ini: 6,
  semana_fim: 12,
  obrigatorio: true,
  ordem: 10,
  ativo: true,
  raiz_id: 'i1',
  marcacoes: 0,
} as ItemProtocolo;

const emUso = { ...ativo, item_id: 'i2', nome: 'Glicemia', ordem: 20, marcacoes: 3 };
const aposentado = { ...ativo, item_id: 'i3', nome: 'Exame Velho', ativo: false };

function montar(servico: Partial<ProtocoloService>) {
  TestBed.configureTestingModule({
    imports: [ProtocoloLista],
    providers: [provideZonelessChangeDetection(), { provide: ProtocoloService, useValue: servico }],
  });
  return TestBed.createComponent(ProtocoloLista);
}

interface Interno {
  abrirEdicao(item: unknown): void;
  avisoVersao(): boolean;
  mover(item: unknown, direcao: number): Promise<void>;
  aAposentar: { set(v: unknown): void };
  confirmarAposentadoria(): Promise<void>;
}

describe('ProtocoloLista', () => {
  it('mostra os itens com janela e situação', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, aposentado] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Hemograma completo');
    expect(texto).toContain('6–12 sem');
    expect(texto).toContain('Ativo');
    expect(texto).toContain('Aposentado');
  });

  it('avisa que editar item em uso cria versão nova', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, emUso] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;

    componente.abrirEdicao(ativo);
    expect(componente.avisoVersao()).toBe(false);

    componente.abrirEdicao(emUso);
    expect(componente.avisoVersao()).toBe(true);
  });

  it('reordena mandando a lista do trimestre trocada', async () => {
    const reordenar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo, emUso] }),
      reordenar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.mover(emUso, -1);

    expect(reordenar).toHaveBeenCalledWith(['i2', 'i1']);
  });

  it('não aposenta sem confirmação', async () => {
    const aposentar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [ativo] }),
      aposentar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(aposentar).not.toHaveBeenCalled();

    componente.aAposentar.set(ativo);
    await componente.confirmarAposentadoria();

    expect(aposentar).toHaveBeenCalledWith('i1');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas a equipe.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Apenas a equipe.');
  });
});
