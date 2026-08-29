import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { PapelEquipe } from '../../core/auth/papel';
import { PacientesService } from '../../core/pacientes/pacientes.service';
import { RelatoriosService } from '../../core/relatorios/relatorios.service';
import { ChaveRelatorio, Relatorios } from './relatorios';

const documento = {
  documento_id: 'd1',
  publicado_em: '2026-08-27T13:30:00Z',
  paciente_nome: 'Gestação Lima',
  tipo: 'laudo_usg',
  titulo: 'USG 24 semanas',
  data_exame: null,
  achado_alterado: true,
  comunicado_presencialmente: false,
  publicado_por_nome: null,
};

const falta = {
  consulta_id: 'c1',
  data_hora: '2026-08-20T14:00:00Z',
  paciente_id: 'p1',
  paciente_nome: 'Ana Prado',
  medica_nome: 'Dra Ana Célia',
  tipo: 'Consulta de pré-natal',
  local: null,
  reagendou: false,
};

interface Interno {
  formulario: {
    controls: { relatorio: { value: ChaveRelatorio; setValue(v: ChaveRelatorio): void } };
    getRawValue(): { desde: Date; ate: Date };
  };
  trocar(): void;
  colunas(): readonly { rotulo: string }[];
  opcoesRelatorio(): readonly { valor: ChaveRelatorio }[];
}

function montar(papel: PapelEquipe, servico: Partial<Record<keyof RelatoriosService, unknown>>) {
  TestBed.configureTestingModule({
    imports: [Relatorios],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: RelatoriosService,
        useValue: {
          documentosPublicados: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          faltas: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          checklistVencidos: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          convitesPendentes: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          ...servico,
        },
      },
      {
        provide: PacientesService,
        useValue: { listarMedicas: vi.fn().mockResolvedValue({ ok: true, valor: [] }) },
      },
      { provide: AuthService, useValue: { papel: signal(papel) } },
    ],
  });
  return TestBed.createComponent(Relatorios);
}

function interno(fixture: ReturnType<typeof montar>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

describe('Relatorios', () => {
  it('a secretaria só enxerga os relatórios operacionais', async () => {
    const fixture = montar('secretaria', {});
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      interno(fixture)
        .opcoesRelatorio()
        .map((o) => o.valor),
    ).toEqual(['faltas', 'convites']);
  });

  it('a médica enxerga os quatro e abre no primeiro deles', async () => {
    const faltas = vi.fn().mockResolvedValue({ ok: true, valor: [] });
    const documentosPublicados = vi.fn().mockResolvedValue({ ok: true, valor: [documento] });
    const fixture = montar('medica', { documentosPublicados, faltas });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      interno(fixture)
        .opcoesRelatorio()
        .map((o) => o.valor),
    ).toEqual(['documentos', 'faltas', 'checklist', 'convites']);
    expect(documentosPublicados).toHaveBeenCalled();
    expect(faltas).not.toHaveBeenCalled();
  });

  it('renderiza a linha com Sim/Não e travessão no que é nulo', async () => {
    const documentosPublicados = vi.fn().mockResolvedValue({ ok: true, valor: [documento] });
    const fixture = montar('medica', { documentosPublicados });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('USG 24 semanas');
    expect(texto).toContain('Laudo de USG');
    expect(texto).toContain('Sim');
    expect(texto).toContain('—');
  });

  it('trocar de relatório troca as colunas e chama a outra RPC', async () => {
    const faltas = vi.fn().mockResolvedValue({ ok: true, valor: [falta] });
    const fixture = montar('medica', { faltas });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    expect(componente.colunas().map((c) => c.rotulo)).toContain('Publicado em');

    componente.formulario.controls.relatorio.setValue('faltas');
    componente.trocar();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(componente.colunas().map((c) => c.rotulo)).toEqual([
      'Quando',
      'Paciente',
      'Médica',
      'Tipo',
      'Local',
      'Remarcou',
    ]);
    expect(faltas).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ana Prado');
  });

  it('relatório de retrato desabilita o período e manda só a flag', async () => {
    const checklistVencidos = vi.fn().mockResolvedValue({ ok: true, valor: [] });
    const fixture = montar('medica', { checklistVencidos });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = interno(fixture);
    componente.formulario.controls.relatorio.setValue('checklist');
    componente.trocar();
    await fixture.whenStable();

    expect(checklistVencidos).toHaveBeenCalledWith(false);
    // getRawValue segue trazendo as datas; o que muda é o controle desabilitado.
    expect(fixture.nativeElement.querySelector('#desde')).toBeNull();
  });

  it('avisa quando a consulta bate no teto de 500 linhas', async () => {
    const cheio = Array.from({ length: 500 }, (_, i) => ({ ...documento, documento_id: `d${i}` }));
    const documentosPublicados = vi.fn().mockResolvedValue({ ok: true, valor: cheio });
    const fixture = montar('medica', { documentosPublicados });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('teto de 500 linhas');
  });

  it('mostra o erro que a RPC devolveu', async () => {
    const documentosPublicados = vi
      .fn()
      .mockResolvedValue({ ok: false, mensagem: 'Apenas médicas abrem este relatório' });
    const fixture = montar('medica', { documentosPublicados });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Apenas médicas abrem este relatório',
    );
  });
});
