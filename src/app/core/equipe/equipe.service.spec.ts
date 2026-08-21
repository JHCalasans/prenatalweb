import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { EquipeService } from './equipe.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    functions: {
      invoke: vi
        .fn()
        .mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
    },
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): EquipeService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(EquipeService);
}

describe('EquipeService', () => {
  it('desembrulha a lista de membros', async () => {
    const membro = {
      id: 'u1',
      nome: 'Dra A',
      papel: 'medica',
      telefone: null,
      email: 'a@x.com',
      ativo: true,
    };
    const cliente = clienteFalso({ data: { membros: [membro] } });
    const service = criar(cliente);

    const resultado = await service.listar();

    expect(cliente.functions.invoke).toHaveBeenCalledWith('gerir-equipe', {
      body: { acao: 'listar' },
    });
    expect(resultado).toEqual({ ok: true, valor: [membro] });
  });

  it('devolve a senha provisória na criação', async () => {
    const cliente = clienteFalso({ data: { usuario_id: 'u2', senha: 'SENHA-PROVISORIA' } });
    const service = criar(cliente);

    const resultado = await service.criar({
      nome: 'Bia',
      email: 'bia@x.com',
      papel: 'secretaria',
    });

    expect(cliente.functions.invoke).toHaveBeenCalledWith('gerir-equipe', {
      body: { acao: 'criar', nome: 'Bia', email: 'bia@x.com', papel: 'secretaria' },
    });
    expect(resultado).toEqual({ ok: true, valor: 'SENHA-PROVISORIA' });
  });

  it('lê a mensagem do corpo quando a função responde erro', async () => {
    const cliente = clienteFalso({
      error: {
        context: {
          json: vi.fn().mockResolvedValue({ error: 'A clínica ficaria sem secretaria ativa.' }),
        },
      },
    });
    const service = criar(cliente);

    const resultado = await service.desativar('u1');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'A clínica ficaria sem secretaria ativa.',
    });
  });

  it('cai na mensagem genérica quando não há corpo legível', async () => {
    const cliente = clienteFalso({ error: { message: 'network' } });
    const service = criar(cliente);

    const resultado = await service.reativar('u1');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
