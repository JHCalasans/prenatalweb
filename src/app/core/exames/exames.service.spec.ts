import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import {
  ExamesService,
  formatarReferencia,
  formatarValor,
  ResultadoComponente,
} from './exames.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): ExamesService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(ExamesService);
}

const HB: ResultadoComponente = {
  componente: 'hb',
  nome: 'Hemoglobina',
  natureza: 'quantitativo',
  valorNumerico: 10.2,
  valorQualitativo: null,
  rotulo: null,
  unidade: 'g/dL',
  refMin: 11,
  refMax: null,
  alterado: true,
};

describe('ExamesService', () => {
  it('agrupa o catálogo por tipo mantendo a ordem dos componentes', async () => {
    const base = {
      natureza: 'quantitativo',
      unidade: null,
      ref_min: null,
      ref_max: null,
      rotulo_negativo: null,
      rotulo_positivo: null,
      obrigatorio: true,
      ordem_tipo: 1,
      ordem_componente: 1,
      positivo_alterado: true,
    };
    const cliente = clienteFalso({
      data: [
        {
          ...base,
          tipo_exame: 'hemograma',
          tipo_nome: 'Hemograma',
          componente: 'hb',
          componente_nome: 'Hemoglobina',
          unidade: 'g/dL',
          ref_min: 11,
        },
        {
          ...base,
          tipo_exame: 'hemograma',
          tipo_nome: 'Hemograma',
          componente: 'ht',
          componente_nome: 'Hematócrito',
          ordem_componente: 2,
        },
        {
          ...base,
          tipo_exame: 'vdrl',
          tipo_nome: 'VDRL',
          ordem_tipo: 2,
          componente: 'vdrl',
          componente_nome: 'VDRL',
          natureza: 'qualitativo',
          rotulo_negativo: 'Não reagente',
          rotulo_positivo: 'Reagente',
        },
      ],
    });
    const service = criar(cliente);

    const resultado = await service.catalogo();

    expect(
      resultado.ok && resultado.valor.map((t) => [t.codigo, t.ordem, t.componentes.length]),
    ).toEqual([
      ['hemograma', 1, 2],
      ['vdrl', 2, 1],
    ]);
    expect(resultado.ok && resultado.valor[0]!.componentes[0]).toMatchObject({
      codigo: 'hb',
      refMin: 11,
      refMax: null,
      ordem: 1,
      positivoAlterado: true,
    });
  });

  it('mapeia o exame com os resultados em camelCase', async () => {
    const cliente = clienteFalso({
      data: [
        {
          id: 'e1',
          tipo_exame: 'hemograma',
          tipo_nome: 'Hemograma',
          coletado_em: '2026-10-01',
          observacao: null,
          alterado: true,
          documento_id: null,
          protocolo_item_id: 'i1',
          registrado_por_nome: 'Julia',
          papel_autor: 'secretaria',
          registrado_em: '2026-10-02T12:00:00Z',
          liberado_em: null,
          comunicado_presencialmente: false,
          resultados: [
            {
              componente: 'hb',
              nome: 'Hemoglobina',
              natureza: 'quantitativo',
              valor_numerico: 10.2,
              valor_qualitativo: null,
              rotulo: null,
              unidade: 'g/dL',
              ref_min: 11,
              ref_max: null,
              alterado: true,
            },
          ],
        },
      ],
    });
    const service = criar(cliente);

    const resultado = await service.exames('g1');

    expect(cliente.rpc).toHaveBeenCalledWith('exames_da_gestacao', { p_gestacao_id: 'g1' });
    expect(resultado.ok && resultado.valor[0]).toMatchObject({
      id: 'e1',
      alterado: true,
      liberadoEm: null,
      papelAutor: 'secretaria',
      resultados: [{ componente: 'hb', valorNumerico: 10.2, refMin: 11, alterado: true }],
    });
  });

  it('registra o resultado com valores numéricos e qualitativos', async () => {
    const cliente = clienteFalso({ data: true });
    const service = criar(cliente);

    const resultado = await service.registrarResultado(
      'e1',
      'g1',
      'toxoplasmose',
      '2026-10-01',
      [
        { componente: 'igg', valorNumerico: null, valorQualitativo: 'positivo' },
        { componente: 'igm', valorNumerico: null, valorQualitativo: 'negativo' },
      ],
      null,
      'd1',
    );

    expect(resultado).toEqual({ ok: true, valor: true });
    expect(cliente.rpc).toHaveBeenCalledWith('registrar_resultado_exame', {
      p_id: 'e1',
      p_gestacao_id: 'g1',
      p_tipo_exame: 'toxoplasmose',
      p_coletado_em: '2026-10-01',
      p_resultados: [
        { componente: 'igg', valor_numerico: null, valor_qualitativo: 'positivo' },
        { componente: 'igm', valor_numerico: null, valor_qualitativo: 'negativo' },
      ],
      p_observacao: undefined,
      p_documento_id: 'd1',
    });
  });

  it('repassa a recusa da liberação sem confirmação (P0001)', async () => {
    const cliente = clienteFalso({
      error: {
        code: 'P0001',
        message: 'Resultado alterado: confirme a comunicação presencial antes de liberar',
      },
    });
    const service = criar(cliente);

    const resultado = await service.liberar('e1', false);

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Resultado alterado: confirme a comunicação presencial antes de liberar',
    });
    expect(cliente.rpc).toHaveBeenCalledWith('liberar_exame', {
      p_id: 'e1',
      p_confirmar_comunicado: false,
    });
  });

  it('mapeia o calendário de vacinas e envia a dose registrada', async () => {
    const cliente = clienteFalso({
      data: [
        {
          vacina: 'hepatite_b',
          doses_esperadas: 3,
          situacao_calendario: 'pendente',
          registros: [
            {
              id: 'v1',
              dose: 1,
              situacao: 'aplicada',
              aplicada_em: '2026-09-20',
              lote: 'L1',
              local: null,
              observacao: null,
            },
          ],
        },
      ],
    });
    const service = criar(cliente);

    const vacinas = await service.vacinas('g1');
    await service.registrarVacina('v2', 'g1', {
      vacina: 'hepatite_b',
      dose: 2,
      situacao: 'aplicada',
      aplicadaEm: '2026-10-20',
      lote: null,
      local: 'UBS',
      observacao: null,
    });

    expect(vacinas.ok && vacinas.valor[0]).toMatchObject({
      vacina: 'hepatite_b',
      dosesEsperadas: 3,
      situacaoCalendario: 'pendente',
      registros: [{ id: 'v1', dose: 1, lote: 'L1', aplicadaEm: '2026-09-20' }],
    });
    expect(cliente.rpc).toHaveBeenLastCalledWith('registrar_vacina', {
      p_id: 'v2',
      p_gestacao_id: 'g1',
      p_vacina: 'hepatite_b',
      p_dose: 2,
      p_situacao: 'aplicada',
      p_aplicada_em: '2026-10-20',
      p_lote: undefined,
      p_local: 'UBS',
      p_observacao: undefined,
    });
  });

  it('vincula e desvincula o item do protocolo', async () => {
    const cliente = clienteFalso({});
    const service = criar(cliente);

    await service.vincularProtocolo('r1', 'hemograma');
    await service.vincularProtocolo('r1', null);

    expect(cliente.rpc).toHaveBeenNthCalledWith(1, 'vincular_exame_protocolo', {
      p_raiz_id: 'r1',
      p_tipo_exame: 'hemograma',
    });
    expect(cliente.rpc).toHaveBeenNthCalledWith(2, 'vincular_exame_protocolo', {
      p_raiz_id: 'r1',
      p_tipo_exame: undefined,
    });
  });

  it('formata valor e referência', () => {
    expect(formatarValor(HB)).toBe('10,2 g/dL');
    expect(formatarReferencia(HB)).toBe('≥ 11 g/dL');
    expect(formatarReferencia({ ...HB, refMin: 150, refMax: 450, unidade: 'mil/mm³' })).toBe(
      '150–450 mil/mm³',
    );
    expect(formatarReferencia({ ...HB, refMin: null, refMax: 91, unidade: 'mg/dL' })).toBe(
      '≤ 91 mg/dL',
    );
    expect(formatarReferencia({ ...HB, refMin: null })).toBe('');
    expect(
      formatarValor({
        ...HB,
        natureza: 'qualitativo',
        valorNumerico: null,
        valorQualitativo: 'positivo',
        rotulo: 'Reagente',
      }),
    ).toBe('Reagente');
  });
});
