import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { AnamneseService, DadosAnamnese, formatarGpa, formatarTipagem } from './anamnese.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): AnamneseService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(AnamneseService);
}

const VAZIA: DadosAnamnese = {
  tipoSanguineo: null,
  fatorRh: null,
  alergias: null,
  semAlergiasConhecidas: false,
  medicacoesEmUso: null,
  comorbidades: [],
  comorbidadesOutras: null,
  cirurgiasPrevias: null,
  gestacoesAnteriores: 0,
  partosNormais: 0,
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

describe('AnamneseService', () => {
  it('mapeia o histórico com nulos e arrays vazios', async () => {
    const cliente = clienteFalso({
      data: [
        {
          id: 'a2',
          versao: 2,
          autor_id: 's1',
          autor_nome: 'Julia',
          papel_autor: 'secretaria',
          registrada_em: '2026-10-02T12:00:00Z',
          tipo_sanguineo: 'O',
          fator_rh: 'negativo',
          alergias: 'Dipirona',
          sem_alergias_conhecidas: false,
          medicacoes_em_uso: null,
          comorbidades: null,
          comorbidades_outras: null,
          cirurgias_previas: null,
          gestacoes_anteriores: 2,
          partos_normais: 1,
          cesareas: 0,
          abortos: 1,
          natimortos: 0,
          data_ultimo_parto: null,
          intercorrencias_previas: ['pre_eclampsia'],
          intercorrencias_outras: null,
          antecedentes_familiares: [],
          familiares_outros: null,
          tabagismo: 'nunca',
          alcool: null,
          outras_drogas: null,
        },
      ],
    });
    const service = criar(cliente);

    const resultado = await service.historico('p1');

    expect(cliente.rpc).toHaveBeenCalledWith('anamnese_da_paciente', { p_paciente_id: 'p1' });
    expect(resultado.ok && resultado.valor[0]).toMatchObject({
      versao: 2,
      papelAutor: 'secretaria',
      fatorRh: 'negativo',
      comorbidades: [],
      intercorrenciasPrevias: ['pre_eclampsia'],
      medicacoesEmUso: null,
    });
  });

  it('registra omitindo nulos e enviando arrays e contagens', async () => {
    const cliente = clienteFalso({ data: 3 });
    const service = criar(cliente);

    const resultado = await service.registrar('p1', 2, {
      ...VAZIA,
      alergias: 'Dipirona',
      comorbidades: ['asma'],
      gestacoesAnteriores: 1,
      partosNormais: 1,
    });

    expect(resultado).toEqual({ ok: true, valor: 3 });
    const [nome, args] = cliente.rpc.mock.calls[0]!;
    expect(nome).toBe('registrar_anamnese');
    expect(args).toMatchObject({
      p_paciente_id: 'p1',
      p_versao_base: 2,
      p_alergias: 'Dipirona',
      p_tipo_sanguineo: undefined,
      p_comorbidades: ['asma'],
      p_intercorrencias_previas: [],
      p_gestacoes_anteriores: 1,
      p_partos_normais: 1,
      p_sem_alergias_conhecidas: false,
    });
  });

  it('repassa o conflito da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Anamnese alterada por outra pessoa' },
    });
    const service = criar(cliente);

    const resultado = await service.registrar('p1', 1, VAZIA);

    expect(resultado).toEqual({ ok: false, mensagem: 'Anamnese alterada por outra pessoa' });
  });

  it('classifica o risco com e sem motivo', async () => {
    const cliente = clienteFalso({ data: 'r1' });
    const service = criar(cliente);

    await service.classificarRisco('g1', 'alto', 'Hipertensão crônica');
    await service.classificarRisco('g1', 'habitual', null);

    expect(cliente.rpc).toHaveBeenNthCalledWith(1, 'registrar_risco_gestacional', {
      p_gestacao_id: 'g1',
      p_classificacao: 'alto',
      p_motivo: 'Hipertensão crônica',
    });
    expect(cliente.rpc).toHaveBeenNthCalledWith(2, 'registrar_risco_gestacional', {
      p_gestacao_id: 'g1',
      p_classificacao: 'habitual',
      p_motivo: undefined,
    });
  });

  it('formata GPA e tipagem', () => {
    expect(formatarGpa({ gestacoesAnteriores: 2, partosNormais: 1, cesareas: 0, abortos: 1 })).toBe(
      'G3 P1 A1',
    );
    expect(formatarTipagem({ tipoSanguineo: 'AB', fatorRh: 'positivo' })).toBe('AB positivo');
    expect(formatarTipagem({ tipoSanguineo: null, fatorRh: null })).toBeNull();
  });
});
