import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { PacientesService } from './pacientes.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null });
  return {
    rpc,
    maybeSingle,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle,
          order: vi
            .fn()
            .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
        }),
      }),
    }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): PacientesService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(PacientesService);
}

describe('PacientesService', () => {
  it('manda undefined quando a busca está vazia', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('   ');

    expect(cliente.rpc).toHaveBeenCalledWith('pacientes_da_secretaria', { p_busca: undefined });
  });

  it('repassa o termo trimado', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    await service.listar('  Maria ');

    expect(cliente.rpc).toHaveBeenCalledWith('pacientes_da_secretaria', { p_busca: 'Maria' });
  });

  it('traduz CPF duplicado', async () => {
    const cliente = clienteFalso({ error: { code: '23505', message: 'duplicate key' } });
    const service = criar(cliente);

    const resultado = await service.criar({
      nome: 'Maria',
      medicaId: 'm1',
      papelVinculo: 'obstetra',
      dataNascimento: null,
      cpf: '12345678900',
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Já existe uma paciente cadastrada com este CPF.',
    });
  });

  it('repassa a mensagem das RPCs (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Médica responsável inválida' },
    });
    const service = criar(cliente);

    const resultado = await service.atualizar('p1', {
      nome: 'Maria',
      dataNascimento: null,
      cpf: null,
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({ ok: false, mensagem: 'Médica responsável inválida' });
  });

  it('traduz violação de check em mensagem de CPF', async () => {
    const cliente = clienteFalso({ error: { code: '23514', message: 'check violation' } });
    const service = criar(cliente);

    const resultado = await service.atualizar('p1', {
      nome: 'Maria',
      dataNascimento: null,
      cpf: '123',
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({ ok: false, mensagem: 'CPF deve ter 11 dígitos.' });
  });

  it('devolve erro quando a paciente não existe', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.buscarPorId('inexistente');

    expect(resultado).toEqual({ ok: false, mensagem: 'Paciente não encontrada.' });
  });
});
