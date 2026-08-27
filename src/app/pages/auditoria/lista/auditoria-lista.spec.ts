import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuditoriaService, RegistroAuditoria } from '../../../core/auditoria/auditoria.service';
import { AuditoriaLista } from './auditoria-lista';

const publicado = {
  registro_id: 1,
  em: '2026-08-27T10:30:00Z',
  ator_id: 'a1',
  ator_nome: 'Dra Ana Célia',
  acao: 'documento.publicado',
  entidade: 'documentos',
  entidade_id: 'd1',
  alvo: 'USG 24 semanas',
  meta: { achado_alterado: true },
} as RegistroAuditoria;

const criado = {
  registro_id: 2,
  em: '2026-08-26T09:00:00Z',
  ator_id: 'a1',
  ator_nome: 'Sec',
  acao: 'paciente.criado',
  entidade: 'pacientes',
  entidade_id: 'p1',
  alvo: 'Gestação Lima',
  meta: {},
} as RegistroAuditoria;

interface ValorForm {
  desde: Date;
  ate: Date;
  acao: string | null;
  entidade: string | null;
  busca: string;
}

interface Interno {
  formulario: { getRawValue(): ValorForm; setValue(v: ValorForm): void };
  aplicar(): void;
  linhas(): RegistroAuditoria[];
  detalhe: { set(v: RegistroAuditoria | null): void };
}

function montar(listar: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [AuditoriaLista],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: AuditoriaService,
        useValue: { listar, acoes: vi.fn().mockResolvedValue({ ok: true, valor: [] }) },
      },
    ],
  });
  return TestBed.createComponent(AuditoriaLista);
}

function trocarBusca(componente: Interno, busca: string): void {
  componente.formulario.setValue({ ...componente.formulario.getRawValue(), busca });
  componente.aplicar();
}

describe('AuditoriaLista', () => {
  it('renderiza quem agiu, a ação em português e o alvo', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [publicado] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Dra Ana Célia');
    expect(texto).toContain('Documento publicado');
    expect(texto).toContain('USG 24 semanas');
    expect(texto).not.toContain('documento.publicado');
  });

  it('busca por texto filtra por quem agiu e por alvo, sem acento', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [publicado, criado] }));
    fixture.detectChanges();
    await fixture.whenStable();
    const componente = fixture.componentInstance as unknown as Interno;

    trocarBusca(componente, 'celia');
    expect(componente.linhas()).toHaveLength(1);
    expect(componente.linhas()[0].ator_nome).toBe('Dra Ana Célia');

    trocarBusca(componente, 'gestacao');
    expect(componente.linhas()).toHaveLength(1);
    expect(componente.linhas()[0].alvo).toBe('Gestação Lima');

    trocarBusca(componente, 'nao-existe');
    expect(componente.linhas()).toHaveLength(0);
  });

  it('mostra Sistema para registro sem ator e travessão sem alvo', async () => {
    const semAtor = {
      ...publicado,
      registro_id: 3,
      ator_id: null,
      ator_nome: null,
      acao: 'convite.ativado',
      alvo: null,
    } as RegistroAuditoria;
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [semAtor] }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Sistema');
    expect(texto).toContain('—');
  });

  it('avisa quando a consulta bate o teto de 500 registros', async () => {
    const muitos = Array.from({ length: 500 }, (_, i) => ({
      ...publicado,
      registro_id: i + 1,
    })) as RegistroAuditoria[];
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: muitos }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'alcançou o teto de 500 registros',
    );
  });

  it('abre o detalhe com o meta formatado', async () => {
    const fixture = montar(vi.fn().mockResolvedValue({ ok: true, valor: [publicado] }));
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.detalhe.set(publicado);
    fixture.detectChanges();
    await fixture.whenStable();

    const texto =
      (fixture.nativeElement as HTMLElement).textContent ?? '' + (document.body.textContent ?? '');
    expect(texto).toContain('Detalhe do registro');
    expect(texto).toContain('"achado_alterado": true');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar(
      vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas médicas consultam a auditoria' }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Apenas médicas consultam a auditoria',
    );
  });
});
