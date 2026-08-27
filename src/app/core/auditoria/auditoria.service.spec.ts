import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { AuditoriaService } from './auditoria.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): AuditoriaService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(AuditoriaService);
}

describe('AuditoriaService', () => {
  it('lista o período e omite ação e entidade quando não há filtro', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('2026-08-20', '2026-08-28', null, null);

    expect(cliente.rpc).toHaveBeenCalledWith('auditoria_da_clinica', {
      p_desde: '2026-08-20',
      p_ate: '2026-08-28',
      p_acao: undefined,
      p_entidade: undefined,
    });
  });

  it('repassa os filtros de ação e entidade na listagem', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('2026-08-20', '2026-08-28', 'documento.publicado', 'documentos');

    expect(cliente.rpc).toHaveBeenCalledWith('auditoria_da_clinica', {
      p_desde: '2026-08-20',
      p_ate: '2026-08-28',
      p_acao: 'documento.publicado',
      p_entidade: 'documentos',
    });
  });

  it('desembrulha a coluna acao em string[]', async () => {
    const cliente = clienteFalso({
      data: [{ acao: 'paciente.criado' }, { acao: 'convite.emitido' }],
    });
    const service = criar(cliente);

    const resultado = await service.acoes();

    expect(cliente.rpc).toHaveBeenCalledWith('acoes_auditadas');
    expect(resultado).toEqual({ ok: true, valor: ['paciente.criado', 'convite.emitido'] });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Apenas médicas consultam a auditoria' },
    });
    const service = criar(cliente);

    expect(await service.listar('2026-08-20', '2026-08-28', null, null)).toEqual({
      ok: false,
      mensagem: 'Apenas médicas consultam a auditoria',
    });
  });

  it('código de erro desconhecido vira mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: 'XX000', message: 'boom' } });
    const service = criar(cliente);

    expect(await service.acoes()).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
