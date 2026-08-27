import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CartaoService, DocumentoCartao, TipoDocumento } from '../../../core/cartao/cartao.service';
import { CartaoDocumentos } from './cartao-documentos';

const base = {
  tipo: 'laudo_usg',
  titulo: 'USG morfologia',
  dataExame: '2026-08-01',
  achadoAlterado: false,
  comunicadoPresencialmente: false,
  publicadoEm: null,
  arquivoEnviadoEm: '2026-08-02T09:00:00Z',
  storagePath: 'gestacoes/g1/d1.pdf',
};

const publicado: DocumentoCartao = { ...base, id: 'd1', publicadoEm: '2026-08-02T10:00:00Z' };
const rascunho: DocumentoCartao = { ...base, id: 'd2', titulo: 'Hemograma' };
const aComunicar: DocumentoCartao = {
  ...base,
  id: 'd3',
  titulo: 'USG com achado',
  achadoAlterado: true,
};

function montar(servico: Partial<CartaoService>) {
  TestBed.configureTestingModule({
    imports: [CartaoDocumentos],
    providers: [provideZonelessChangeDetection(), { provide: CartaoService, useValue: servico }],
  });
  const fixture = TestBed.createComponent(CartaoDocumentos);
  fixture.componentRef.setInput('gestacaoId', 'g1');
  fixture.componentRef.setInput('gestacaoAtiva', true);
  return fixture;
}

interface Interno {
  pedirPublicacao(d: DocumentoCartao): void;
  confirmarPublicacao(): Promise<void>;
  confirmarExclusao(): Promise<void>;
  aExcluir: { set(v: DocumentoCartao | null): void };
  comunicado: { set(v: boolean): void };
  arquivo: { set(v: File | null): void };
  envio: {
    setValue(v: {
      tipo: TipoDocumento;
      titulo: string;
      dataExame: Date | null;
      achadoAlterado: boolean;
    }): void;
  };
  enviar(): Promise<void>;
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CartaoDocumentos', () => {
  it('mostra título e situação de publicado, rascunho e achado a comunicar', async () => {
    const fixture = montar({
      documentos: vi.fn().mockResolvedValue({ ok: true, valor: [publicado, rascunho, aComunicar] }),
    });
    await estabilizar(fixture);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('USG morfologia');
    expect(texto).toContain('Hemograma');
    expect(texto).toContain('Publicado');
    expect(texto).toContain('Rascunho');
    expect(texto).toContain('Achado a comunicar');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      documentos: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem permissão.' }),
    });
    await estabilizar(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem permissão.');
  });

  it('publica direto documento sem achado alterado', async () => {
    const publicar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const documentos = vi.fn().mockResolvedValue({ ok: true, valor: [rascunho] });
    const fixture = montar({ documentos, publicar });
    await estabilizar(fixture);

    const componente = fixture.componentInstance as unknown as Interno;
    componente.pedirPublicacao(rascunho);
    await fixture.whenStable();
    await fixture.whenStable();

    expect(publicar).toHaveBeenCalledWith('d2', false);
  });

  it('publica com achado alterado só depois do checkbox de comunicação', async () => {
    const publicar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const documentos = vi.fn().mockResolvedValue({ ok: true, valor: [aComunicar] });
    const fixture = montar({ documentos, publicar });
    await estabilizar(fixture);

    const componente = fixture.componentInstance as unknown as Interno;
    componente.pedirPublicacao(aComunicar);
    expect(publicar).not.toHaveBeenCalled();

    await componente.confirmarPublicacao();
    expect(publicar).not.toHaveBeenCalled();

    componente.comunicado.set(true);
    await componente.confirmarPublicacao();

    expect(publicar).toHaveBeenCalledWith('d3', true);
  });

  it('exclui o rascunho só depois da confirmação', async () => {
    const excluirRascunho = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const documentos = vi.fn().mockResolvedValue({ ok: true, valor: [rascunho] });
    const fixture = montar({ documentos, excluirRascunho });
    await estabilizar(fixture);

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.confirmarExclusao();
    expect(excluirRascunho).not.toHaveBeenCalled();

    componente.aExcluir.set(rascunho);
    await componente.confirmarExclusao();

    expect(excluirRascunho).toHaveBeenCalledWith('d2');
  });

  it('recusa arquivo com extensão inválida sem chamar o serviço', async () => {
    const criarRascunho = vi.fn();
    const documentos = vi.fn().mockResolvedValue({ ok: true, valor: [] });
    const fixture = montar({ documentos, criarRascunho });
    await estabilizar(fixture);

    const componente = fixture.componentInstance as unknown as Interno;
    componente.envio.setValue({
      tipo: 'laudo_usg',
      titulo: 'USG morfologia',
      dataExame: null,
      achadoAlterado: false,
    });
    componente.arquivo.set(new File(['conteúdo'], 'laudo.docx'));
    await componente.enviar();
    fixture.detectChanges();

    expect(criarRascunho).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Extensão não suportada');
  });
});
