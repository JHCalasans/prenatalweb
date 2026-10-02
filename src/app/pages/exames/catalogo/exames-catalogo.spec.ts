import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogoExamesService } from '../../../core/exames/catalogo-exames.service';
import { ExamesService, TipoExameCatalogo } from '../../../core/exames/exames.service';
import { ExamesCatalogo } from './exames-catalogo';

const TIPO: TipoExameCatalogo = {
  codigo: 'hemograma',
  nome: 'Hemograma',
  ordem: 1,
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
      positivoAlterado: true,
      obrigatorio: true,
      ordem: 1,
    },
  ],
};

function montar(catalogo: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    imports: [ExamesCatalogo],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ExamesService,
        useValue: { catalogo: vi.fn().mockResolvedValue({ ok: true, valor: [TIPO] }) },
      },
      {
        provide: CatalogoExamesService,
        useValue: {
          salvar: vi.fn().mockResolvedValue({ ok: true, valor: null }),
          excluir: vi.fn().mockResolvedValue({ ok: true, valor: null }),
          ...catalogo,
        },
      },
    ],
  });
  return TestBed.createComponent(ExamesCatalogo);
}

interface Controle {
  setValue(v: unknown): void;
  disable(): void;
  disabled: boolean;
}

interface Interno {
  formulario: {
    controls: Record<string, Controle>;
    invalid: boolean;
    hasError(codigo: string, caminho?: string): boolean;
  };
  componentes: {
    at(i: number): { get(campo: string): Controle };
    removeAt(i: number): void;
  };
  erro(): string | null;
  erroDialogo(): string | null;
  aExcluir: { set(v: unknown): void };
  abrirCriacao(): void;
  abrirEdicao(tipo: unknown): void;
  salvar(): Promise<void>;
  confirmarExclusao(): Promise<void>;
}

function interno(fixture: { componentInstance: unknown }): Interno {
  return fixture.componentInstance as unknown as Interno;
}

describe('ExamesCatalogo', () => {
  it('lista os tipos com código, ordem e componentes', async () => {
    const fixture = montar();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Hemograma');
    expect(texto).toContain('hemograma');
    expect(texto).toContain('Hemoglobina');
  });

  it('salva tipo novo com o payload da RPC', async () => {
    const salvar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ salvar });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    componente.abrirCriacao();
    componente.formulario.controls['codigo']!.setValue('tsh');
    componente.formulario.controls['nome']!.setValue('TSH');
    componente.formulario.controls['ordem']!.setValue(12);
    const comp = componente.componentes.at(0);
    comp.get('codigo').setValue('tsh');
    comp.get('nome').setValue('TSH');
    comp.get('unidade').setValue('mUI/L');
    comp.get('refMin').setValue(0.3);
    comp.get('refMax').setValue(3);

    await componente.salvar();

    expect(salvar).toHaveBeenCalledWith({
      criando: true,
      codigo: 'tsh',
      nome: 'TSH',
      ordem: 12,
      componentes: [
        {
          codigo: 'tsh',
          nome: 'TSH',
          natureza: 'quantitativo',
          unidade: 'mUI/L',
          refMin: 0.3,
          refMax: 3,
          rotuloNegativo: '',
          rotuloPositivo: '',
          positivoAlterado: true,
          obrigatorio: true,
        },
      ],
    });
  });

  it('edita com o código travado e marcando criando = false', async () => {
    const salvar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ salvar });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    componente.abrirEdicao(TIPO);
    expect(componente.formulario.controls['codigo']!.disabled).toBe(true);

    await componente.salvar();

    expect(salvar).toHaveBeenCalledTimes(1);
    const chamada = salvar.mock.calls[0]![0] as { criando: boolean; codigo: string };
    expect(chamada.criando).toBe(false);
    expect(chamada.codigo).toBe('hemograma');
  });

  it('não salva sem nome e nem sem componentes', async () => {
    const salvar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ salvar });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    componente.abrirCriacao();
    componente.formulario.controls['codigo']!.setValue('tsh');
    expect(componente.formulario.invalid).toBe(true);

    componente.formulario.controls['nome']!.setValue('TSH');
    componente.componentes.removeAt(0);
    expect(componente.formulario.hasError('required', 'componentes')).toBe(true);

    await componente.salvar();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('mostra a recusa da exclusão e mantém o diálogo aberto', async () => {
    const fixture = montar({
      excluir: vi.fn().mockResolvedValue({
        ok: false,
        mensagem: 'Este exame já tem resultados registrados',
      }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    componente.aExcluir.set(TIPO);
    await componente.confirmarExclusao();

    expect(componente.erro()).toBe('Este exame já tem resultados registrados');
  });

  it('repassa a recusa do salvar para o diálogo', async () => {
    const fixture = montar({
      salvar: vi
        .fn()
        .mockResolvedValue({ ok: false, mensagem: 'Já existe um exame com este código' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    componente.abrirCriacao();
    componente.formulario.controls['codigo']!.setValue('tsh');
    componente.formulario.controls['nome']!.setValue('TSH');
    componente.componentes.at(0).get('codigo').setValue('tsh');
    componente.componentes.at(0).get('nome').setValue('TSH');

    await componente.salvar();

    expect(componente.erroDialogo()).toBe('Já existe um exame com este código');
  });
});
