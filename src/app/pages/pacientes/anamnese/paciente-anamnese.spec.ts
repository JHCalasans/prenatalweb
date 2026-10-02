import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  Anamnese,
  AnamneseService,
  CONFLITO_ANAMNESE,
  DadosAnamnese,
} from '../../../core/anamnese/anamnese.service';
import { PacienteAnamnese } from './paciente-anamnese';

const vigente: Anamnese = {
  id: 'a1',
  versao: 3,
  autorId: 'm1',
  autorNome: 'Dra. Ana',
  papelAutor: 'medica',
  registradaEm: '2026-10-02T12:00:00Z',
  tipoSanguineo: 'O',
  fatorRh: 'negativo',
  alergias: 'Dipirona',
  semAlergiasConhecidas: false,
  medicacoesEmUso: null,
  comorbidades: [],
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

const dados = vigente as DadosAnamnese;

function montar(servico: Partial<AnamneseService>) {
  TestBed.configureTestingModule({
    imports: [PacienteAnamnese],
    providers: [provideZonelessChangeDetection(), { provide: AnamneseService, useValue: servico }],
  });
  const fixture = TestBed.createComponent(PacienteAnamnese);
  fixture.componentRef.setInput('pacienteId', 'p1');
  return fixture;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

interface Interno {
  salvar(d: DadosAnamnese): Promise<void>;
  recarregar(): Promise<void>;
  conflito(): boolean;
  editando(): boolean;
  abrir(): void;
}

describe('PacienteAnamnese', () => {
  it('mostra tipagem, alergias, GPA e quem atualizou', async () => {
    const fixture = montar({
      historico: vi.fn().mockResolvedValue({ ok: true, valor: [vigente] }),
    });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('O negativo');
    expect(texto).toContain('Dipirona');
    expect(texto).toContain('G2 P1 A0');
    expect(texto).toContain('Dra. Ana (médica)');
  });

  it('sem ficha oferece preencher', async () => {
    const fixture = montar({ historico: vi.fn().mockResolvedValue({ ok: true, valor: [] }) });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Ficha não preenchida');
    expect(texto).toContain('Preencher ficha');
  });

  it('salva com a versão vigente como base e recarrega', async () => {
    const registrar = vi.fn().mockResolvedValue({ ok: true, valor: 4 });
    const historico = vi.fn().mockResolvedValue({ ok: true, valor: [vigente] });
    const fixture = montar({ historico, registrar });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrir();
    await interno.salvar(dados);

    expect(registrar).toHaveBeenCalledWith('p1', 3, dados);
    expect(historico).toHaveBeenCalledTimes(2);
    expect(interno.editando()).toBe(false);
  });

  it('no conflito avisa e recarrega a ficha ao pedir', async () => {
    const registrar = vi.fn().mockResolvedValue({ ok: false, mensagem: CONFLITO_ANAMNESE });
    const historico = vi.fn().mockResolvedValue({ ok: true, valor: [vigente] });
    const fixture = montar({ historico, registrar });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.abrir();
    await interno.salvar(dados);
    expect(interno.conflito()).toBe(true);
    expect(interno.editando()).toBe(true);

    await interno.recarregar();
    expect(interno.conflito()).toBe(false);
    expect(historico).toHaveBeenCalledTimes(2);
  });
});
