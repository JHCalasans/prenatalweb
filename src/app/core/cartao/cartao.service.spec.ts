import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../supabase-client';
import { CartaoService } from './cartao.service';

interface Resposta {
  data?: unknown;
  error?: unknown;
}

function clienteFalso(resposta: Resposta, rpcs: Record<string, Resposta> = {}) {
  const retorno = { data: resposta.data ?? null, error: resposta.error ?? null };
  const order = vi.fn().mockResolvedValue(retorno);
  const maybeSingle = vi.fn().mockResolvedValue(retorno);
  const upload = vi.fn().mockResolvedValue({ data: { path: 'documento' }, error: null });
  const download = vi.fn().mockResolvedValue({ data: new Blob(['arquivo']), error: null });
  return {
    rpc: vi.fn((nome: string) => {
      const especifica = rpcs[nome];
      return Promise.resolve(
        especifica === undefined
          ? retorno
          : { data: especifica.data ?? null, error: especifica.error ?? null },
      );
    }),
    order,
    maybeSingle,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order, maybeSingle }),
      }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({ upload, download }),
    },
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

  it('cria o rascunho, sobe o arquivo e confirma, nessa ordem', async () => {
    const cliente = clienteFalso(
      { data: null },
      {
        criar_documento_rascunho: {
          data: [{ documento_id: 'd1', storage_path: 'gestacoes/g1/d1.pdf' }],
        },
      },
    );
    const service = criar(cliente);
    const arquivo = new File(['conteúdo'], 'laudo.pdf');

    const resultado = await service.criarRascunho({
      gestacaoId: 'g1',
      tipo: 'laudo_usg',
      titulo: 'USG morfologia',
      dataExame: null,
      achadoAlterado: false,
      arquivo,
    });

    expect(resultado).toEqual({ ok: true, valor: 'd1' });
    const { upload } = cliente.storage.from('documentos');
    expect(cliente.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      upload.mock.invocationCallOrder[0],
    );
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(
      cliente.rpc.mock.invocationCallOrder[1],
    );
    expect(cliente.rpc).toHaveBeenNthCalledWith(1, 'criar_documento_rascunho', {
      p_gestacao_id: 'g1',
      p_tipo: 'laudo_usg',
      p_titulo: 'USG morfologia',
      p_extensao: 'pdf',
      p_data_exame: undefined,
      p_achado_alterado: false,
    });
    expect(upload).toHaveBeenCalledWith('gestacoes/g1/d1.pdf', arquivo, {
      contentType: 'application/pdf',
    });
    expect(cliente.rpc).toHaveBeenNthCalledWith(2, 'confirmar_upload_documento', {
      p_documento_id: 'd1',
    });
    expect(cliente.rpc).toHaveBeenCalledTimes(2);
  });

  it('desfaz o rascunho quando o upload falha', async () => {
    const cliente = clienteFalso(
      { data: null },
      {
        criar_documento_rascunho: {
          data: [{ documento_id: 'd1', storage_path: 'gestacoes/g1/d1.pdf' }],
        },
      },
    );
    const { upload } = cliente.storage.from('documentos');
    upload.mockResolvedValue({ data: null, error: { message: 'objeto grande demais' } });
    const service = criar(cliente);

    const resultado = await service.criarRascunho({
      gestacaoId: 'g1',
      tipo: 'laudo_usg',
      titulo: 'USG morfologia',
      dataExame: null,
      achadoAlterado: false,
      arquivo: new File(['conteúdo'], 'laudo.pdf'),
    });

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
    expect(cliente.rpc).toHaveBeenCalledWith('excluir_documento_rascunho', {
      p_documento_id: 'd1',
    });
    expect(cliente.rpc).not.toHaveBeenCalledWith('confirmar_upload_documento', expect.anything());
  });

  it('recusa extensão fora da lista sem chamar a RPC', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.criarRascunho({
      gestacaoId: 'g1',
      tipo: 'laudo_usg',
      titulo: 'USG morfologia',
      dataExame: null,
      achadoAlterado: false,
      arquivo: new File(['conteúdo'], 'laudo.docx'),
    });

    expect(resultado.ok).toBe(false);
    expect((resultado as { mensagem: string }).mensagem).toBe(
      'Extensão não suportada. Envie PDF, JPG ou PNG.',
    );
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it('recusa arquivo acima de 20 MB sem chamar a RPC', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);
    const arquivo = new File(['conteúdo'], 'laudo.pdf');
    Object.defineProperty(arquivo, 'size', { value: 21 * 1024 * 1024 });

    const resultado = await service.criarRascunho({
      gestacaoId: 'g1',
      tipo: 'laudo_usg',
      titulo: 'USG morfologia',
      dataExame: null,
      achadoAlterado: false,
      arquivo,
    });

    expect(resultado.ok).toBe(false);
    expect((resultado as { mensagem: string }).mensagem).toBe('Arquivo acima de 20 MB.');
    expect(cliente.rpc).not.toHaveBeenCalled();
  });

  it('publicar repassa a confirmação do comunicado', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    await service.publicar('d1', true);

    expect(cliente.rpc).toHaveBeenCalledWith('publicar_documento', {
      p_documento_id: 'd1',
      p_confirmar_comunicado: true,
    });
  });

  it('registrar leitura engola o erro da auditoria', async () => {
    const cliente = clienteFalso({ data: null });
    cliente.rpc.mockRejectedValueOnce(new Error('rede caiu'));
    const service = criar(cliente);

    await expect(service.registrarLeitura('d1')).resolves.toBeUndefined();
    expect(cliente.rpc).toHaveBeenCalledWith('log_documento_acesso', { p_documento_id: 'd1' });
  });

  it('abrirArquivo devolve o blob baixado', async () => {
    const cliente = clienteFalso({ data: null });
    const service = criar(cliente);

    const resultado = await service.abrirArquivo('gestacoes/g1/d1.pdf');

    expect(resultado.ok).toBe(true);
    const { download } = cliente.storage.from('documentos');
    expect(download).toHaveBeenCalledWith('gestacoes/g1/d1.pdf');
  });

  it('abrirArquivo devolve erro genérico quando o download falha', async () => {
    const cliente = clienteFalso({ data: null });
    const { download } = cliente.storage.from('documentos');
    download.mockResolvedValue({ data: null, error: { message: 'não encontrado' } });
    const service = criar(cliente);

    const resultado = await service.abrirArquivo('gestacoes/g1/d1.pdf');

    expect(resultado).toEqual({
      ok: false,
      mensagem: 'Não foi possível concluir. Tente novamente.',
    });
  });
});
