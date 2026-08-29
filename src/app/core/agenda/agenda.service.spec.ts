import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { SUPABASE_CLIENT } from '../supabase-client';
import { AgendaService } from './agenda.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(
  cliente: ReturnType<typeof clienteFalso>,
  papel: 'secretaria' | 'medica',
): AgendaService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: SUPABASE_CLIENT, useValue: cliente },
      // autenticado false: o ambiente de teste não tem token no dispositivo, e
      // o ErroSupabase só trata P0001 como sessão expirada com tela autenticada.
      { provide: AuthService, useValue: { papel: () => papel, autenticado: () => false } },
    ],
  });
  return TestBed.inject(AgendaService);
}

describe('AgendaService', () => {
  it('lista o período em ISO e omite a médica quando não há filtro', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente, 'secretaria');

    await service.listar(new Date(2026, 7, 24), new Date(2026, 7, 31), null);

    expect(cliente.rpc).toHaveBeenCalledWith('agenda_da_clinica', {
      p_de: new Date(2026, 7, 24).toISOString(),
      p_ate: new Date(2026, 7, 31).toISOString(),
      p_medica_id: undefined,
    });
  });

  it('repassa o filtro por médica na listagem', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente, 'secretaria');

    await service.listar(new Date(2026, 7, 24), new Date(2026, 7, 31), 'm1');

    expect(cliente.rpc).toHaveBeenCalledWith('agenda_da_clinica', {
      p_de: expect.any(String),
      p_ate: expect.any(String),
      p_medica_id: 'm1',
    });
  });

  it('agenda com tipo trimado e sem local vazio', async () => {
    const cliente = clienteFalso({ data: 'c1' });
    const service = criar(cliente, 'secretaria');

    const resultado = await service.agendar({
      pacienteId: 'p1',
      medicaId: 'm1',
      dataHora: new Date(2026, 8, 3, 9, 30),
      tipo: '  Consulta de pré-natal  ',
      local: '   ',
    });

    expect(resultado).toEqual({ ok: true, valor: 'c1' });
    expect(cliente.rpc).toHaveBeenCalledWith('agendar_consulta', {
      p_paciente_id: 'p1',
      p_medica_id: 'm1',
      p_data_hora: new Date(2026, 8, 3, 9, 30).toISOString(),
      p_tipo: 'Consulta de pré-natal',
      p_local: undefined,
    });
  });

  it('reagenda, cancela e marca falta na consulta certa', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente, 'secretaria');

    await service.reagendar('c1', new Date(2026, 8, 3, 9, 30));
    await service.cancelar('c1');
    await service.marcarFalta('c2');

    expect(cliente.rpc).toHaveBeenNthCalledWith(1, 'reagendar_consulta', {
      p_consulta_id: 'c1',
      p_data_hora: new Date(2026, 8, 3, 9, 30).toISOString(),
    });
    expect(cliente.rpc).toHaveBeenNthCalledWith(2, 'cancelar_consulta', { p_consulta_id: 'c1' });
    expect(cliente.rpc).toHaveBeenNthCalledWith(3, 'marcar_falta', { p_consulta_id: 'c2' });
  });

  it('repassa a mensagem da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Só consulta futura pode ser cancelada' },
    });
    const service = criar(cliente, 'secretaria');

    const resultado = await service.cancelar('c1');

    expect(resultado).toEqual({ ok: false, mensagem: 'Só consulta futura pode ser cancelada' });
  });

  it('lista pacientes agendáveis do cadastro da secretaria', async () => {
    const cliente = clienteFalso({
      data: [
        { paciente_id: 'p1', nome: 'Maria' },
        { paciente_id: 'p2', nome: 'Zilda' },
      ],
    });
    const service = criar(cliente, 'secretaria');

    const resultado = await service.pacientesAgendaveis('mar');

    expect(cliente.rpc).toHaveBeenCalledWith('pacientes_da_secretaria', { p_busca: 'mar' });
    expect(resultado).toEqual({
      ok: true,
      valor: [
        { pacienteId: 'p1', nome: 'Maria' },
        { pacienteId: 'p2', nome: 'Zilda' },
      ],
    });
  });

  it('lista pacientes agendáveis do próprio painel quando médica', async () => {
    const cliente = clienteFalso({
      data: [{ paciente_id: 'p1', nome: 'Maria' }],
    });
    const service = criar(cliente, 'medica');

    const resultado = await service.pacientesAgendaveis('');

    expect(cliente.rpc).toHaveBeenCalledWith('painel_da_medica');
    expect(resultado).toEqual({ ok: true, valor: [{ pacienteId: 'p1', nome: 'Maria' }] });
  });
});
