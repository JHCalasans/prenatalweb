import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CartaoService, GestacaoCartao } from '../../../core/cartao/cartao.service';
import { CartaoGestacoes } from './cartao-gestacoes';

const ativa: GestacaoCartao = {
  id: 'g1',
  dppFinal: '2026-12-01',
  dppOrigem: 'dum',
  tipo: 'unica',
  status: 'ativa',
  desfecho: null,
  desfechoObservacao: null,
  dum: '2026-03-01',
  dppUsg: null,
  createdAt: '2026-05-01T12:00:00Z',
};

const encerrada: GestacaoCartao = {
  ...ativa,
  id: 'g0',
  status: 'encerrada',
  desfecho: 'parto_normal',
};

function montar(gestacoes: GestacaoCartao[]) {
  const cartao = {
    criarGestacao: vi.fn().mockResolvedValue({ ok: true, valor: 'g9' }),
    atualizarGestacao: vi.fn().mockResolvedValue({ ok: true, valor: null }),
    encerrarGestacao: vi.fn().mockResolvedValue({ ok: true, valor: null }),
  };
  TestBed.configureTestingModule({
    imports: [CartaoGestacoes],
    providers: [provideZonelessChangeDetection(), { provide: CartaoService, useValue: cartao }],
  });
  const fixture = TestBed.createComponent(CartaoGestacoes);
  fixture.componentRef.setInput('pacienteId', 'p1');
  fixture.componentRef.setInput('gestacoes', gestacoes);
  return { fixture, cartao };
}

interface Interno {
  abrirCriacao(): void;
  abrirEdicao(g: GestacaoCartao): void;
  trocarOrigem(origem: string): void;
  salvar(): Promise<void>;
  pedirEncerramento(g: GestacaoCartao): void;
  confirmarEncerramento(): Promise<void>;
  formulario: { getRawValue(): Record<string, unknown> };
  alterada: { subscribe(fn: () => void): unknown };
}

describe('CartaoGestacoes', () => {
  it('oferece Nova gestação apenas com gestação ativa existente fora', async () => {
    const { fixture } = montar([ativa]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Nova gestação');
  });

  it('oferece Nova gestação quando nenhuma está ativa', async () => {
    const { fixture } = montar([encerrada]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nova gestação');
  });

  it('oferece Editar e Encerrar na linha da ativa', async () => {
    const { fixture } = montar([ativa]);
    await fixture.whenStable();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Editar');
    expect(texto).toContain('Encerrar');
  });

  it('abre a edição preenchendo a data original da gestação', async () => {
    const { fixture, cartao } = montar([ativa]);
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.abrirEdicao(ativa);
    await componente.salvar();

    expect(cartao.atualizarGestacao).toHaveBeenCalledWith('g1', {
      dppOrigem: 'dum',
      tipo: 'unica',
      dum: '2026-03-01',
      dppUsg: null,
    });
  });

  it('troca o controle de data com a origem e anula a ociosa', async () => {
    const { fixture, cartao } = montar([]);
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.abrirCriacao();
    componente.trocarOrigem('usg');
    expect(componente.formulario.getRawValue()['dppOrigem']).toBe('usg');

    await componente.salvar();

    expect(cartao.criarGestacao).toHaveBeenCalledWith('p1', {
      dppOrigem: 'usg',
      tipo: 'unica',
      dum: null,
      dppUsg: null,
    });
  });

  it('emite alterada quando a criação tem sucesso', async () => {
    const { fixture } = montar([]);
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    let emitidas = 0;
    componente.alterada.subscribe(() => emitidas++);

    componente.abrirCriacao();
    await componente.salvar();

    expect(emitidas).toBe(1);
  });

  it('só encerra depois do desfecho escolhido', async () => {
    const { fixture, cartao } = montar([ativa]);
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    let emitidas = 0;
    componente.alterada.subscribe(() => emitidas++);

    componente.pedirEncerramento(ativa);
    await componente.confirmarEncerramento();
    expect(cartao.encerrarGestacao).not.toHaveBeenCalled();

    const encerramento = (
      fixture.componentInstance as unknown as {
        encerramento: { patchValue(v: unknown): void };
      }
    ).encerramento;
    encerramento.patchValue({ desfecho: 'cesarea' });
    await componente.confirmarEncerramento();

    expect(cartao.encerrarGestacao).toHaveBeenCalledWith('g1', 'cesarea', null);
    expect(emitidas).toBe(1);
  });
});
