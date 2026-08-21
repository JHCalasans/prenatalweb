import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { VinculosService } from './vinculos.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): VinculosService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(VinculosService);
}

describe('VinculosService', () => {
  it('lista os vínculos da paciente', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('p1');

    expect(cliente.rpc).toHaveBeenCalledWith('vinculos_da_paciente', { p_paciente_id: 'p1' });
  });

  it('manda médica e papel na atribuição', async () => {
    const cliente = clienteFalso({ data: 'v1' });
    const service = criar(cliente);

    const resultado = await service.atribuir('p1', 'm1', 'medicina_fetal');

    expect(cliente.rpc).toHaveBeenCalledWith('atribuir_vinculo_pela_secretaria', {
      p_paciente_id: 'p1',
      p_medica_id: 'm1',
      p_papel: 'medicina_fetal',
    });
    expect(resultado).toEqual({ ok: true, valor: 'v1' });
  });

  it('repassa a mensagem da RPC ao proteger o último vínculo', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'A paciente ficaria sem médica responsável' },
    });
    const service = criar(cliente);

    const resultado = await service.inativar('v1');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'A paciente ficaria sem médica responsável',
    });
  });

  it('traduz erro desconhecido em mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: '08006', message: 'connection failure' } });
    const service = criar(cliente);

    const resultado = await service.transferir('v1', 'm2');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
