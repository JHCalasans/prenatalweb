import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { CatalogoExamesService, DadosTipoExame } from './catalogo-exames.service';

function clienteFalso(resposta: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: resposta.data ?? null, error: resposta.error ?? null }),
  };
}

function criar(cliente: ReturnType<typeof clienteFalso>): CatalogoExamesService {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: SUPABASE_CLIENT, useValue: cliente }],
  });
  return TestBed.inject(CatalogoExamesService);
}

const TIPO: DadosTipoExame = {
  criando: true,
  codigo: 'tsh',
  nome: 'TSH',
  ordem: 12,
  componentes: [
    {
      codigo: 'tsh',
      nome: 'TSH',
      natureza: 'quantitativo',
      unidade: 'mUI/L',
      refMin: 0.3,
      refMax: 3,
      rotuloNegativo: null,
      rotuloPositivo: null,
      positivoAlterado: true,
      obrigatorio: true,
    },
  ],
};

describe('CatalogoExamesService', () => {
  it('salva mapeando os componentes para a RPC', async () => {
    const cliente = clienteFalso({});
    const service = criar(cliente);

    const resultado = await service.salvar(TIPO);

    expect(resultado.ok).toBe(true);
    expect(cliente.rpc).toHaveBeenCalledWith('salvar_tipo_exame', {
      p_criando: true,
      p_codigo: 'tsh',
      p_nome: 'TSH',
      p_ordem: 12,
      p_componentes: [
        {
          codigo: 'tsh',
          nome: 'TSH',
          natureza: 'quantitativo',
          unidade: 'mUI/L',
          ref_min: 0.3,
          ref_max: 3,
          rotulo_negativo: null,
          rotulo_positivo: null,
          positivo_alterado: true,
          obrigatorio: true,
        },
      ],
    });
  });

  it('repassa a recusa da RPC (P0001)', async () => {
    const cliente = clienteFalso({
      error: { code: 'P0001', message: 'Já existe um exame com este código' },
    });
    const service = criar(cliente);

    const resultado = await service.salvar(TIPO);

    expect(resultado).toEqual({ ok: false, mensagem: 'Já existe um exame com este código' });
  });

  it('exclui pelo código', async () => {
    const cliente = clienteFalso({});
    const service = criar(cliente);

    const resultado = await service.excluir('tsh');

    expect(resultado.ok).toBe(true);
    expect(cliente.rpc).toHaveBeenCalledWith('excluir_tipo_exame', { p_codigo: 'tsh' });
  });
});
