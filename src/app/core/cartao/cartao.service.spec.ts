import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { CartaoService } from './cartao.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  const retorno = { data: resposta.data ?? null, error: resposta.error ?? null };
  const order = vi.fn().mockResolvedValue(retorno);
  const maybeSingle = vi.fn().mockResolvedValue(retorno);
  return {
    rpc: vi.fn().mockResolvedValue(retorno),
    order,
    maybeSingle,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order, maybeSingle }),
      }),
    }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): CartaoService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(CartaoService);
}

describe('CartaoService', () => {
  it('mapeia a paciente para camelCase', async () => {
    const cliente = clienteFalso({
      data: {
        id: 'p1',
        nome: 'Ana',
        data_nascimento: '1995-04-10',
        cpf: '12345678900',
        contato_emergencia: null,
      },
    });
    const service = criar(cliente);

    const resultado = await service.paciente('p1');

    expect(resultado).toEqual({
      ok: true,
      valor: {
        id: 'p1',
        nome: 'Ana',
        dataNascimento: '1995-04-10',
        cpf: '12345678900',
        contatoEmergencia: null,
      },
    });
  });

  it('avisa quando a paciente não existe', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.paciente('inexistente');

    expect(resultado).toEqual({ ok: false, mensagem: 'Paciente não encontrada.' });
  });

  it('busca os vínculos pela RPC', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.vinculos('p1');

    expect(cliente.rpc).toHaveBeenCalledWith('vinculos_da_paciente', { p_paciente_id: 'p1' });
  });

  it('omite data e observação nulas ao marcar', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    await service.marcarChecklist({
      gestacaoId: 'g1',
      protocoloItemId: 'i1',
      status: 'solicitado',
      data: null,
      observacao: null,
    });

    expect(cliente.rpc).toHaveBeenCalledWith('marcar_checklist_item', {
      p_gestacao_id: 'g1',
      p_protocolo_item_id: 'i1',
      p_status: 'solicitado',
      p_data: undefined,
      p_observacao: undefined,
    });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Gestação não está ativa' },
    });
    const service = criar(cliente);

    const resultado = await service.marcarChecklist({
      gestacaoId: 'g1',
      protocoloItemId: 'i1',
      status: 'realizado',
      data: '2026-08-10',
      observacao: null,
    });

    expect(resultado).toEqual({ ok: false, mensagem: 'Gestação não está ativa' });
  });
});
