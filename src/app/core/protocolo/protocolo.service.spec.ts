import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ProtocoloService } from './protocolo.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): ProtocoloService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(ProtocoloService);
}

const dados = {
  nome: 'Hemograma',
  trimestre: 1,
  semanaIni: 6,
  semanaFim: 12,
  obrigatorio: true,
  ordem: 10,
};

describe('ProtocoloService', () => {
  it('repassa o filtro de aposentados', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar(true);

    expect(cliente.rpc).toHaveBeenCalledWith('protocolo_da_clinica', {
      p_incluir_aposentados: true,
    });
  });

  it('manda todos os campos na criação', async () => {
    const cliente = clienteFalso({ data: 'novo-id' });
    const service = criar(cliente);

    const resultado = await service.criar(dados);

    expect(cliente.rpc).toHaveBeenCalledWith('criar_protocolo_item', {
      p_nome: 'Hemograma',
      p_trimestre: 1,
      p_semana_ini: 6,
      p_semana_fim: 12,
      p_obrigatorio: true,
      p_ordem: 10,
    });
    expect(resultado).toEqual({ ok: true, valor: 'novo-id' });
  });

  it('devolve o id que passou a valer na edição', async () => {
    const cliente = clienteFalso({ data: 'versao-nova' });
    const service = criar(cliente);

    const resultado = await service.atualizar('antigo', dados);

    expect(resultado).toEqual({ ok: true, valor: 'versao-nova' });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Item aposentado não é editável' },
    });
    const service = criar(cliente);

    const resultado = await service.atualizar('x', dados);

    expect(resultado).toEqual({ ok: false, mensagem: 'Item aposentado não é editável' });
  });

  it('traduz o check da tabela', async () => {
    const cliente = clienteFalso({ error: { code: '23514', message: 'check violation' } });
    const service = criar(cliente);

    const resultado = await service.criar(dados);

    expect(resultado).toEqual({ ok: false, mensagem: 'Janela de semanas inválida.' });
  });

  it('manda o array de ids na reordenação', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    await service.reordenar(['a', 'b']);

    expect(cliente.rpc).toHaveBeenCalledWith('reordenar_protocolo', { p_ids: ['a', 'b'] });
  });
});
