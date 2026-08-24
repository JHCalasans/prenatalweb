import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { MesaService } from './mesa.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): MesaService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(MesaService);
}

describe('MesaService', () => {
  it('chama a RPC sem argumentos', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar();

    expect(cliente.rpc).toHaveBeenCalledWith('painel_da_medica');
  });

  it('devolve lista vazia quando a RPC não traz dados', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(resultado).toEqual({ ok: true, valor: [] });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Apenas médicas abrem o painel' },
    });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(resultado).toEqual({ ok: false, mensagem: 'Apenas médicas abrem o painel' });
  });

  it('traduz erro desconhecido em mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: '08006', message: 'connection failure' } });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
