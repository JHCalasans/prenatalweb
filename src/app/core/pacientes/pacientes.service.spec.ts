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

  it('cadastra com convite lendo a primeira linha do retorno tabular', async () => {
    const cliente = clienteFalso({ data: [{ paciente_id: 'p9', codigo: 'ABCD-1234' }] });
    const service = criar(cliente);

    const resultado = await service.criarComConvite({
      nome: 'Maria',
      papelVinculo: 'obstetra',
      dataNascimento: '1995-04-10',
      cpf: null,
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({ ok: true, valor: { pacienteId: 'p9', codigo: 'ABCD-1234' } });
    expect(cliente.rpc).toHaveBeenCalledWith('criar_paciente_com_convite', {
      p_nome: 'Maria',
      p_papel_vinculo: 'obstetra',
      p_data_nascimento: '1995-04-10',
      p_cpf: undefined,
      p_contato_emergencia: undefined,
    });
  });

  it('avisa quando a RPC do convite volta vazia', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    const resultado = await service.criarComConvite({
      nome: 'Maria',
      papelVinculo: 'obstetra',
      dataNascimento: null,
      cpf: null,
      contatoEmergencia: null,
    });

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });

  it('reemite o convite e devolve o código novo', async () => {
    const cliente = clienteFalso({ data: 'XYZW-9876' });
    const service = criar(cliente);

    const resultado = await service.reemitirConvite('p9');

    expect(resultado).toEqual({ ok: true, valor: 'XYZW-9876' });
    expect(cliente.rpc).toHaveBeenCalledWith('reemitir_convite', { p_paciente_id: 'p9' });
  });

  it('mapeia a linha da gestação ativa devolvida pela RPC', async () => {
    const cliente = clienteFalso({
      data: [
        {
          gestacao_id: 'g1',
          dpp_origem: 'dum',
          dum: '2026-04-01',
          dpp_usg: null,
          dpp_final: '2027-01-06',
          tipo: 'unica',
        },
      ],
    });
    const service = criar(cliente);

    const resultado = await service.gestacaoAtiva('p1');

    expect(resultado).toEqual({
      ok: true,
      valor: {
        id: 'g1',
        dppOrigem: 'dum',
        dum: '2026-04-01',
        dppUsg: null,
        dppFinal: '2027-01-06',
        tipo: 'unica',
      },
    });
    expect(cliente.rpc).toHaveBeenCalledWith('gestacao_ativa_da_paciente', { p_paciente_id: 'p1' });
  });

  it('devolve null quando a paciente não tem gestação ativa', async () => {
    const cliente = clienteFalso({ data: [] });
    const service = criar(cliente);

    const resultado = await service.gestacaoAtiva('p1');

    expect(resultado).toEqual({ ok: true, valor: null });
  });

  it('cria a gestação pela secretaria com paciente e DUM', async () => {
    const cliente = clienteFalso({ data: 'g9' });
    const service = criar(cliente);

    const resultado = await service.criarGestacao('p1', '2026-04-01');

    expect(resultado).toEqual({ ok: true, valor: 'g9' });
    expect(cliente.rpc).toHaveBeenCalledWith('criar_gestacao_pela_secretaria', {
      p_paciente_id: 'p1',
      p_dum: '2026-04-01',
    });
  });

  it('corrige a DUM e propaga a mensagem de erro da RPC', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Gestação com DPP definida por ultrassom: só a médica corrige' },
    });
    const service = criar(cliente);

    const resultado = await service.corrigirDum('g1', '2026-04-15');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Gestação com DPP definida por ultrassom: só a médica corrige',
    });
    expect(cliente.rpc).toHaveBeenCalledWith('atualizar_dum_pela_secretaria', {
      p_gestacao_id: 'g1',
      p_dum: '2026-04-15',
    });
  });

  it('traduz CPF duplicado também no cadastro com convite', async () => {
    const cliente = clienteFalso({ error: { code: '23505', message: 'duplicate key' } });
    const service = criar(cliente);

    const resultado = await service.criarComConvite({
      nome: 'Maria',
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
});
