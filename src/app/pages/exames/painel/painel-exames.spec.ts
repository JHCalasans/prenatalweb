import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Exame, ExamesService, TipoExameCatalogo } from '../../../core/exames/exames.service';
import { ERRO_DATA_COLETA, PainelExames } from './painel-exames';

const CATALOGO: TipoExameCatalogo[] = [
  {
    codigo: 'hemograma',
    nome: 'Hemograma',
    componentes: [
      {
        codigo: 'hb',
        nome: 'Hemoglobina',
        natureza: 'quantitativo',
        unidade: 'g/dL',
        refMin: 11,
        refMax: null,
        rotuloNegativo: null,
        rotuloPositivo: null,
        obrigatorio: true,
      },
    ],
  },
  {
    codigo: 'vdrl',
    nome: 'VDRL',
    componentes: [
      {
        codigo: 'vdrl',
        nome: 'VDRL',
        natureza: 'qualitativo',
        unidade: null,
        refMin: null,
        refMax: null,
        rotuloNegativo: 'Não reagente',
        rotuloPositivo: 'Reagente',
        obrigatorio: true,
      },
    ],
  },
];

const base: Exame = {
  id: 'e1',
  tipoExame: 'hemograma',
  tipoNome: 'Hemograma',
  coletadoEm: '2026-10-01',
  observacao: null,
  alterado: false,
  documentoId: null,
  protocoloItemId: null,
  registradoPorNome: 'Julia',
  papelAutor: 'secretaria',
  registradoEm: '2026-10-02T12:00:00Z',
  liberadoEm: null,
  comunicadoPresencialmente: false,
  resultados: [
    {
      componente: 'hb',
      nome: 'Hemoglobina',
      natureza: 'quantitativo',
      valorNumerico: 12.5,
      valorQualitativo: null,
      rotulo: null,
      unidade: 'g/dL',
      refMin: 11,
      refMax: null,
      alterado: false,
    },
  ],
};

const alterado: Exame = {
  ...base,
  id: 'e2',
  alterado: true,
  resultados: [{ ...base.resultados[0]!, valorNumerico: 10.2, alterado: true }],
};

const liberado: Exame = { ...base, id: 'e3', liberadoEm: '2026-10-02T13:00:00Z' };

function montar(servico: Partial<ExamesService>, podeLiberar = true) {
  TestBed.configureTestingModule({
    imports: [PainelExames],
    providers: [provideZonelessChangeDetection(), { provide: ExamesService, useValue: servico }],
  });
  const fixture = TestBed.createComponent(PainelExames);
  fixture.componentRef.setInput('gestacaoId', 'g1');
  fixture.componentRef.setInput('gestacaoAtiva', true);
  fixture.componentRef.setInput('podeLiberar', podeLiberar);
  return fixture;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

function servico(exames: Exame[], extra: Partial<ExamesService> = {}): Partial<ExamesService> {
  return {
    catalogo: vi.fn().mockResolvedValue({ ok: true, valor: CATALOGO }),
    exames: vi.fn().mockResolvedValue({ ok: true, valor: exames }),
    ...extra,
  };
}

interface Interno {
  abrirNovo(): void;
  escolherTipo(t: string | null): void;
  definirNumero(c: string, v: number | null): void;
  definirQualitativo(c: string, v: 'negativo' | 'positivo' | 'indeterminado' | null): void;
  coletadoEm: { set(v: Date | null): void };
  salvar(): Promise<void>;
  erroDialogo(): string | null;
  pedirLiberacao(e: Exame): void;
  confirmarLiberacao(): Promise<void>;
  comunicado: { set(v: boolean): void };
  aLiberar(): Exame | null;
  tipoSelecionado(): TipoExameCatalogo | null;
}

describe('PainelExames', () => {
  it('lista valor, referência, alterado e situação de liberação', async () => {
    const fixture = montar(servico([alterado, liberado]));
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('10,2 g/dL');
    expect(texto).toContain('ref. ≥ 11 g/dL');
    expect(texto).toContain('Alterado');
    expect(texto).toContain('Não liberado');
    expect(texto).toContain('Liberado');
    expect(texto).toContain('Julia (secretaria)');
  });

  it('esconde Liberar para a secretaria e some com as ações de exame liberado', async () => {
    const fixture = montar(servico([base, liberado]), false);
    await estabilizar(fixture);

    const botoes = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const textos = botoes.map((b) => b.textContent ?? '');
    expect(textos.some((t) => t.includes('Liberar para a gestante'))).toBe(false);
    expect(textos.filter((t) => t.includes('Excluir'))).toHaveLength(1);
  });

  it('gera os campos do tipo escolhido e envia só o que foi preenchido', async () => {
    const registrarResultado = vi.fn().mockResolvedValue({ ok: true, valor: true });
    const mudou = vi.fn();
    const fixture = montar(servico([], { registrarResultado }));
    fixture.componentInstance.mudou.subscribe(mudou);
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNovo();
    interno.escolherTipo('hemograma');
    expect(interno.tipoSelecionado()?.componentes.map((c) => c.codigo)).toEqual(['hb']);
    interno.definirNumero('hb', 10.2);
    interno.coletadoEm.set(new Date(2026, 9, 1));
    await interno.salvar();

    expect(registrarResultado).toHaveBeenCalledTimes(1);
    const [id, gestacaoId, tipo, coleta, valores, observacao, documento] =
      registrarResultado.mock.calls[0]!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect([gestacaoId, tipo, coleta, observacao, documento]).toEqual([
      'g1',
      'hemograma',
      '2026-10-01',
      null,
      null,
    ]);
    expect(valores).toEqual([{ componente: 'hb', valorNumerico: 10.2, valorQualitativo: null }]);
    expect(mudou).toHaveBeenCalledTimes(1);
  });

  it('envia resultado qualitativo e exige a data da coleta', async () => {
    const registrarResultado = vi.fn().mockResolvedValue({ ok: true, valor: false });
    const fixture = montar(servico([], { registrarResultado }));
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNovo();
    interno.escolherTipo('vdrl');
    interno.definirQualitativo('vdrl', 'negativo');
    await interno.salvar();
    expect(interno.erroDialogo()).toBe(ERRO_DATA_COLETA);
    expect(registrarResultado).not.toHaveBeenCalled();

    interno.coletadoEm.set(new Date(2026, 9, 1));
    await interno.salvar();
    expect(registrarResultado.mock.calls[0]![4]).toEqual([
      { componente: 'vdrl', valorNumerico: null, valorQualitativo: 'negativo' },
    ]);
  });

  it('mostra a recusa do Postgres no diálogo', async () => {
    const registrarResultado = vi
      .fn()
      .mockResolvedValue({ ok: false, mensagem: 'Informe Hematócrito' });
    const fixture = montar(servico([], { registrarResultado }));
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrirNovo();
    interno.escolherTipo('hemograma');
    interno.coletadoEm.set(new Date(2026, 9, 1));
    await interno.salvar();

    expect(interno.erroDialogo()).toBe('Informe Hematócrito');
  });

  it('exame alterado só libera depois da confirmação presencial', async () => {
    const liberar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar(servico([alterado], { liberar }));
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.pedirLiberacao(alterado);
    expect(interno.aLiberar()).toBe(alterado);
    expect(liberar).not.toHaveBeenCalled();

    await interno.confirmarLiberacao();
    expect(liberar).not.toHaveBeenCalled();

    interno.comunicado.set(true);
    await interno.confirmarLiberacao();
    expect(liberar).toHaveBeenCalledWith('e2', true);
  });

  it('exame normal libera direto, sem diálogo', async () => {
    const liberar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar(servico([base], { liberar }));
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.pedirLiberacao(base);
    await fixture.whenStable();

    expect(liberar).toHaveBeenCalledWith('e1', false);
    expect(interno.aLiberar()).toBeNull();
  });
});
