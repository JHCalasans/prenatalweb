import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { RelatoriosService } from './relatorios.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): RelatoriosService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(RelatoriosService);
}

describe('RelatoriosService', () => {
  it('documentos publicados omite o tipo quando não há filtro', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.documentosPublicados('2026-08-01', '2026-08-29', null);

    expect(cliente.rpc).toHaveBeenCalledWith('relatorio_documentos_publicados', {
      p_desde: '2026-08-01',
      p_ate: '2026-08-29',
      p_tipo: undefined,
    });
  });

  it('documentos publicados repassa o tipo escolhido', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.documentosPublicados('2026-08-01', '2026-08-29', 'laudo_usg');

    expect(cliente.rpc).toHaveBeenCalledWith('relatorio_documentos_publicados', {
      p_desde: '2026-08-01',
      p_ate: '2026-08-29',
      p_tipo: 'laudo_usg',
    });
  });

  it('faltas omite a médica quando não há filtro e repassa quando há', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.faltas('2026-08-01', '2026-08-29', null);
    await service.faltas('2026-08-01', '2026-08-29', 'm1');

    expect(cliente.rpc).toHaveBeenNthCalledWith(1, 'relatorio_faltas', {
      p_desde: '2026-08-01',
      p_ate: '2026-08-29',
      p_medica_id: undefined,
    });
    expect(cliente.rpc).toHaveBeenNthCalledWith(2, 'relatorio_faltas', {
      p_desde: '2026-08-01',
      p_ate: '2026-08-29',
      p_medica_id: 'm1',
    });
  });

  it('os relatórios de retrato mandam só a flag, sem período', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.checklistVencidos(true);
    await service.convitesPendentes(false);

    expect(cliente.rpc).toHaveBeenNthCalledWith(1, 'relatorio_checklist_vencidos', {
      p_incluir_vencendo: true,
    });
    expect(cliente.rpc).toHaveBeenNthCalledWith(2, 'relatorio_convites_pendentes', {
      p_incluir_expirados: false,
    });
  });

  it('devolve lista vazia quando a RPC não traz dados', async () => {
    const service = criar(clienteFalso({ data: null }));

    expect(await service.convitesPendentes(false)).toEqual({ ok: true, valor: [] });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Apenas médicas abrem este relatório' },
    });
    const service = criar(cliente);

    expect(await service.checklistVencidos(false)).toEqual({
      ok: false,
      mensagem: 'Apenas médicas abrem este relatório',
    });
  });

  it('código de erro desconhecido vira mensagem genérica', async () => {
    const cliente = clienteFalso({ error: { code: 'XX000', message: 'boom' } });
    const service = criar(cliente);

    expect(await service.faltas('2026-08-01', '2026-08-29', null)).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
