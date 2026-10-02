import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Anamnese, DadosAnamnese } from '../../../core/anamnese/anamnese.service';
import { ERRO_CONTAGEM, ERRO_TIPAGEM, FormularioAnamnese } from './formulario-anamnese';

const vigente: Anamnese = {
  id: 'a1',
  versao: 1,
  autorId: 's1',
  autorNome: 'Julia',
  papelAutor: 'secretaria',
  registradaEm: '2026-10-02T12:00:00Z',
  tipoSanguineo: 'O',
  fatorRh: 'negativo',
  alergias: 'Dipirona',
  semAlergiasConhecidas: false,
  medicacoesEmUso: null,
  comorbidades: ['asma'],
  comorbidadesOutras: null,
  cirurgiasPrevias: null,
  gestacoesAnteriores: 2,
  partosNormais: 1,
  cesareas: 0,
  abortos: 1,
  natimortos: 0,
  dataUltimoParto: '2024-05-10',
  intercorrenciasPrevias: [],
  intercorrenciasOutras: null,
  antecedentesFamiliares: [],
  familiaresOutros: null,
  tabagismo: null,
  alcool: null,
  outrasDrogas: null,
};

interface Interno {
  form: {
    patchValue(v: Record<string, unknown>): void;
    controls: { alergias: { disabled: boolean; value: string } };
  };
  enviar(): void;
  erro(): string | null;
}

async function montar(anamnese: Anamnese | null) {
  TestBed.configureTestingModule({
    imports: [FormularioAnamnese],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(FormularioAnamnese);
  fixture.componentRef.setInput('anamnese', anamnese);
  fixture.detectChanges();
  await fixture.whenStable();
  const emitidos: DadosAnamnese[] = [];
  fixture.componentInstance.salvar.subscribe((d) => emitidos.push(d));
  return { fixture, interno: fixture.componentInstance as unknown as Interno, emitidos };
}

describe('FormularioAnamnese', () => {
  it('preenche a partir da vigente e emite os dados com textos limpos', async () => {
    const { interno, emitidos } = await montar(vigente);

    interno.form.patchValue({ medicacoesEmUso: '  Ácido fólico  ' });
    interno.enviar();

    expect(emitidos).toHaveLength(1);
    expect(emitidos[0]).toMatchObject({
      tipoSanguineo: 'O',
      fatorRh: 'negativo',
      alergias: 'Dipirona',
      medicacoesEmUso: 'Ácido fólico',
      comorbidades: ['asma'],
      gestacoesAnteriores: 2,
      dataUltimoParto: '2024-05-10',
      cirurgiasPrevias: null,
    });
  });

  it('"sem alergias conhecidas" desabilita e limpa a descrição', async () => {
    const { interno, emitidos } = await montar(vigente);

    interno.form.patchValue({ semAlergiasConhecidas: true });
    expect(interno.form.controls.alergias.disabled).toBe(true);
    expect(interno.form.controls.alergias.value).toBe('');

    interno.enviar();
    expect(emitidos[0]).toMatchObject({ semAlergiasConhecidas: true, alergias: null });
  });

  it('bloqueia contagem obstétrica incoerente', async () => {
    const { interno, emitidos } = await montar(null);

    interno.form.patchValue({ gestacoesAnteriores: 1, partosNormais: 1, abortos: 1 });
    interno.enviar();

    expect(emitidos).toHaveLength(0);
    expect(interno.erro()).toBe(ERRO_CONTAGEM);
  });

  it('bloqueia tipo sanguíneo sem Rh', async () => {
    const { interno, emitidos } = await montar(null);

    interno.form.patchValue({ tipoSanguineo: 'A' });
    interno.enviar();

    expect(emitidos).toHaveLength(0);
    expect(interno.erro()).toBe(ERRO_TIPAGEM);
  });

  it('sem ficha começa vazio com contagens zero', async () => {
    const { interno, emitidos } = await montar(null);

    interno.enviar();

    expect(emitidos[0]).toMatchObject({
      tipoSanguineo: null,
      alergias: null,
      semAlergiasConhecidas: false,
      gestacoesAnteriores: 0,
      comorbidades: [],
    });
  });
});
