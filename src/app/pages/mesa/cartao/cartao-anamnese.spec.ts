import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Anamnese,
  AnamneseService,
  RiscoGestacional,
} from '../../../core/anamnese/anamnese.service';
import { CartaoAnamnese, ERRO_MOTIVO_RISCO } from './cartao-anamnese';

const vigente: Anamnese = {
  id: 'a1',
  versao: 2,
  autorId: 's1',
  autorNome: 'Julia',
  papelAutor: 'secretaria',
  registradaEm: '2026-10-02T12:00:00Z',
  tipoSanguineo: 'O',
  fatorRh: 'negativo',
  alergias: 'Dipirona',
  semAlergiasConhecidas: false,
  medicacoesEmUso: null,
  comorbidades: ['hipertensao_cronica'],
  comorbidadesOutras: null,
  cirurgiasPrevias: null,
  gestacoesAnteriores: 1,
  partosNormais: 1,
  cesareas: 0,
  abortos: 0,
  natimortos: 0,
  dataUltimoParto: null,
  intercorrenciasPrevias: [],
  intercorrenciasOutras: null,
  antecedentesFamiliares: [],
  familiaresOutros: null,
  tabagismo: null,
  alcool: null,
  outrasDrogas: null,
};

const alto: RiscoGestacional = {
  id: 'r1',
  classificacao: 'alto',
  motivo: 'Hipertensão crônica',
  fatoresSugeridos: ['comorbidade:hipertensao_cronica'],
  autoraId: 'm1',
  autoraNome: 'Dra. Ana',
  registradoEm: '2026-10-02T13:00:00Z',
};

function montar(servico: Partial<AnamneseService>) {
  TestBed.configureTestingModule({
    imports: [CartaoAnamnese],
    providers: [provideZonelessChangeDetection(), { provide: AnamneseService, useValue: servico }],
  });
  const fixture = TestBed.createComponent(CartaoAnamnese);
  fixture.componentRef.setInput('pacienteId', 'p1');
  fixture.componentRef.setInput('gestacaoId', 'g1');
  fixture.componentRef.setInput('gestacaoAtiva', true);
  return fixture;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

interface Interno {
  abrirClassificacao(): Promise<void>;
  confirmarClassificacao(): Promise<void>;
  classificacao: { set(v: 'habitual' | 'alto'): void };
  motivo: { set(v: string): void };
  avisoHabitual(): boolean;
  erroDialogo(): string | null;
  classificando(): boolean;
}

describe('CartaoAnamnese', () => {
  it('mostra alergia, Rh negativo, alto risco e quem preencheu', async () => {
    const fixture = montar({
      historico: vi.fn().mockResolvedValue({ ok: true, valor: [vigente] }),
      riscos: vi.fn().mockResolvedValue({ ok: true, valor: [alto] }),
    });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Alergias: Dipirona');
    expect(texto).toContain('Rh negativo');
    expect(texto).toContain('Alto risco');
    expect(texto).toContain('Hipertensão crônica');
    expect(texto).toContain('Julia (secretaria)');
  });

  it('sem ficha e sem risco mostra os dois avisos', async () => {
    const fixture = montar({
      historico: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
      riscos: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
    });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Ficha não preenchida');
    expect(texto).toContain('Risco não classificado');
  });

  it('alto risco sem motivo não chama o serviço', async () => {
    const classificarRisco = vi.fn();
    const fixture = montar({
      historico: vi.fn().mockResolvedValue({ ok: true, valor: [vigente] }),
      riscos: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
      fatoresSugeridos: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
      classificarRisco,
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    await interno.abrirClassificacao();
    interno.classificacao.set('alto');
    interno.motivo.set('curto');
    await interno.confirmarClassificacao();

    expect(classificarRisco).not.toHaveBeenCalled();
    expect(interno.erroDialogo()).toBe(ERRO_MOTIVO_RISCO);
  });

  it('avisa ao escolher habitual com fatores sugeridos e salva mesmo assim', async () => {
    const classificarRisco = vi.fn().mockResolvedValue({ ok: true, valor: 'r2' });
    const riscos = vi.fn().mockResolvedValue({ ok: true, valor: [] });
    const fixture = montar({
      historico: vi.fn().mockResolvedValue({ ok: true, valor: [vigente] }),
      riscos,
      fatoresSugeridos: vi.fn().mockResolvedValue({
        ok: true,
        valor: [{ codigo: 'gemelar', descricao: 'Gestação gemelar' }],
      }),
      classificarRisco,
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    await interno.abrirClassificacao();
    expect(interno.avisoHabitual()).toBe(true);
    await interno.confirmarClassificacao();

    expect(classificarRisco).toHaveBeenCalledWith('g1', 'habitual', null);
    expect(interno.classificando()).toBe(false);
    expect(riscos).toHaveBeenCalledTimes(2);
  });
});
