import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { DadosEvolucao, ProntuarioService } from './prontuario.service';

interface Resposta {
  data?: unknown;
  error?: unknown;
}

function clienteFalso(resposta: Resposta) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): ProntuarioService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(ProntuarioService);
}

const DADOS: DadosEvolucao = {
  atendidaEm: '2026-10-01T12:00:00.000Z',
  queixa: 'Sem queixas',
  exameFisico: null,
  avaliacao: null,
  conduta: 'Retorno em 30 dias',
  pesoKg: 70.5,
  paSistolica: 120,
  paDiastolica: 80,
  alturaUterinaCm: null,
  bcfBpm: 140,
  movimentacaoFetal: 'presente',
  edema: null,
  apresentacao: null,
};

describe('ProntuarioService', () => {
  it('mapeia a linha do prontuário com nulos explícitos', async () => {
    const cliente = clienteFalso({
      data: [
        {
          id: 'e1',
          raiz_id: 'e1',
          retifica_id: null,
          motivo_retificacao: null,
          gestacao_id: 'g1',
          consulta_id: null,
          autora_id: 'm1',
          autora_nome: 'Dra. Ana',
          papel_vinculo: 'obstetra',
          status: 'assinada',
          revisao: 3,
          atendida_em: '2026-10-01T12:00:00Z',
          queixa: 'Sem queixas',
          exame_fisico: null,
          avaliacao: null,
          conduta: null,
          peso_kg: 70.5,
          pa_sistolica: 120,
          pa_diastolica: 80,
          altura_uterina_cm: null,
          bcf_bpm: null,
          movimentacao_fetal: null,
          edema: 'uma_cruz',
          apresentacao: null,
          ig_dias: 168,
          assinada_em: '2026-10-01T12:30:00Z',
          crm: '123456',
          crm_uf: 'SP',
          vigente: true,
          retificada: false,
          atualizado_em: '2026-10-01T12:30:00Z',
        },
      ],
    });
    const service = criar(cliente);

    const resultado = await service.prontuario('p1');

    expect(cliente.rpc).toHaveBeenCalledWith('prontuario_da_paciente', { p_paciente_id: 'p1' });
    expect(resultado.ok && resultado.valor[0]).toMatchObject({
      id: 'e1',
      autoraNome: 'Dra. Ana',
      pesoKg: 70.5,
      bcfBpm: null,
      edema: 'uma_cruz',
      igDias: 168,
      crmUf: 'SP',
      vigente: true,
    });
  });

  it('envia o rascunho omitindo os campos nulos', async () => {
    const cliente = clienteFalso({ data: 2 });
    const service = criar(cliente);

    const resultado = await service.salvarRascunho('e1', 'g1', null, 1, DADOS);

    expect(resultado).toEqual({ ok: true, valor: 2 });
    expect(cliente.rpc).toHaveBeenCalledWith('salvar_rascunho_evolucao', {
      p_id: 'e1',
      p_gestacao_id: 'g1',
      p_consulta_id: undefined,
      p_revisao_base: 1,
      p_atendida_em: '2026-10-01T12:00:00.000Z',
      p_queixa: 'Sem queixas',
      p_exame_fisico: undefined,
      p_avaliacao: undefined,
      p_conduta: 'Retorno em 30 dias',
      p_peso_kg: 70.5,
      p_pa_sistolica: 120,
      p_pa_diastolica: 80,
      p_altura_uterina_cm: undefined,
      p_bcf_bpm: 140,
      p_movimentacao_fetal: 'presente',
      p_edema: undefined,
      p_apresentacao: undefined,
    });
  });

  it('repassa a mensagem de conflito da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Rascunho alterado em outro aparelho' },
    });
    const service = criar(cliente);

    const resultado = await service.salvarRascunho('e1', 'g1', 'c1', 4, DADOS);

    expect(resultado).toEqual({ ok: false, mensagem: 'Rascunho alterado em outro aparelho' });
  });

  it('assina com o motivo da retificação', async () => {
    const cliente = clienteFalso({ data: '2026-10-01T12:30:00Z' });
    const service = criar(cliente);

    const resultado = await service.assinar('e2', 1, 'Peso digitado errado');

    expect(resultado).toEqual({ ok: true, valor: '2026-10-01T12:30:00Z' });
    expect(cliente.rpc).toHaveBeenCalledWith('assinar_evolucao', {
      p_id: 'e2',
      p_revisao_base: 1,
      p_motivo_retificacao: 'Peso digitado errado',
    });
  });

  it('inicia a retificação e exclui o rascunho pelas RPCs', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    await service.iniciarRetificacao('e2', 'e1');
    await service.excluirRascunho('e2');

    expect(cliente.rpc).toHaveBeenCalledWith('iniciar_retificacao', {
      p_id: 'e2',
      p_evolucao_id: 'e1',
    });
    expect(cliente.rpc).toHaveBeenCalledWith('excluir_rascunho_evolucao', { p_id: 'e2' });
  });

  it('mapeia as medidas da caderneta', async () => {
    const cliente = clienteFalso({
      data: [
        {
          evolucao_id: 'e1',
          atendida_em: '2026-10-01T12:00:00Z',
          ig_dias: null,
          peso_kg: 70,
          pa_sistolica: null,
          pa_diastolica: null,
          altura_uterina_cm: 24,
          bcf_bpm: 140,
          movimentacao_fetal: null,
          edema: null,
          apresentacao: 'cefalica',
        },
      ],
    });
    const service = criar(cliente);

    const resultado = await service.medidas('g1');

    expect(resultado).toEqual({
      ok: true,
      valor: [
        {
          evolucaoId: 'e1',
          atendidaEm: '2026-10-01T12:00:00Z',
          igDias: null,
          pesoKg: 70,
          paSistolica: null,
          paDiastolica: null,
          alturaUterinaCm: 24,
          bcfBpm: 140,
          movimentacaoFetal: null,
          edema: null,
          apresentacao: 'cefalica',
        },
      ],
    });
  });
});
