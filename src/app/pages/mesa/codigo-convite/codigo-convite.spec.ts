import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CodigoConvite } from './codigo-convite';

function montar(codigo: string | null) {
  TestBed.configureTestingModule({
    imports: [CodigoConvite],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(CodigoConvite);
  fixture.componentRef.setInput('codigo', codigo);
  return fixture;
}

interface Interno {
  copiar(): Promise<void>;
  copiado: () => boolean;
}

function comClipboard(escrever: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockImplementation(escrever) },
  });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

describe('CodigoConvite', () => {
  it('fica fechado enquanto não há código', async () => {
    const fixture = montar(null);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('uma única vez');
  });

  it('mostra o código e o aviso de exibição única', async () => {
    const fixture = montar('ABCD-1234');
    await fixture.whenStable();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('ABCD-1234');
    expect(texto).toContain('uma única vez');
  });

  it('emite fechado no botão de já anotei', async () => {
    const fixture = montar('ABCD-1234');
    await fixture.whenStable();

    let fechados = 0;
    fixture.componentInstance.fechado.subscribe(() => fechados++);

    const botao = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Já anotei',
    );
    botao?.click();

    expect(fechados).toBe(1);
  });

  it('copia o código e acende o aviso', async () => {
    const escrever = comClipboard(() => Promise.resolve());
    const fixture = montar('ABCD-1234');
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.copiar();
    await fixture.whenStable();

    expect(escrever).toHaveBeenCalledWith('ABCD-1234');
    expect(componente.copiado()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Copiado');
  });

  // Sem HTTPS o navegador não expõe a área de transferência; o código na tela
  // continua sendo o caminho de saída.
  it('não acende o aviso quando o clipboard falha', async () => {
    comClipboard(() => Promise.reject(new Error('contexto inseguro')));
    const fixture = montar('ABCD-1234');
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.copiar();
    await fixture.whenStable();

    expect(componente.copiado()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Copiado');
  });

  it('não herda o aviso de cópia no código seguinte', async () => {
    comClipboard(() => Promise.resolve());
    const fixture = montar('ABCD-1234');
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.copiar();
    expect(componente.copiado()).toBe(true);

    fixture.componentRef.setInput('codigo', 'WXYZ-9999');
    await fixture.whenStable();

    expect(componente.copiado()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Copiado');
  });
});
