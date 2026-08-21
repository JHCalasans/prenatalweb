import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { ConvitesService } from './convites.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): ConvitesService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(ConvitesService);
}

describe('ConvitesService', () => {
  it('omite busca e situação vazias', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('   ', '');

    expect(cliente.rpc).toHaveBeenCalledWith('convites_da_secretaria', {
      p_busca: undefined,
      p_situacao: undefined,
    });
  });

  it('repassa termo trimado e situação', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('  Maria ', 'pendente');

    expect(cliente.rpc).toHaveBeenCalledWith('convites_da_secretaria', {
      p_busca: 'Maria',
      p_situacao: 'pendente',
    });
  });

  it('devolve o código emitido', async () => {
    const cliente = clienteFalso({ data: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
    const service = criar(cliente);

    const resultado = await service.emitir('p1');

    expect(resultado).toEqual({ ok: true, valor: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Nenhum convite pendente para revogar' },
    });
    const service = criar(cliente);

    const resultado = await service.revogar('p1');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Nenhum convite pendente para revogar',
    });
  });

  it('traduz erro desconhecido em mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: '08006', message: 'connection failure' } });
    const service = criar(cliente);

    const resultado = await service.listar('', '');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });

  it('manda o array de ids no lote', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.emitirEmLote(['p1', 'p2']);

    expect(cliente.rpc).toHaveBeenCalledWith('emitir_convites_em_lote', {
      p_paciente_ids: ['p1', 'p2'],
    });
  });
});
