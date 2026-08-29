const SEPARADOR = ';';
const QUEBRA = '\r\n';
// O Excel em pt-BR abre CSV separado por vírgula numa coluna só, e sem BOM
// come o acento.
const BOM = '﻿';

function escapar(valor: string): string {
  if (!/[;"\n\r]/.test(valor)) {
    return valor;
  }
  return `"${valor.replaceAll('"', '""')}"`;
}

export function paraCsv(
  cabecalhos: readonly string[],
  linhas: readonly (readonly string[])[],
): string {
  const tudo = [cabecalhos, ...linhas];
  return BOM + tudo.map((linha) => linha.map(escapar).join(SEPARADOR)).join(QUEBRA);
}

// Âncora sintética em vez de window.open: o download por âncora não esbarra no
// bloqueio de pop-up que já atrapalha a abertura de laudo no cartão.
export function baixarCsv(
  nomeArquivo: string,
  cabecalhos: readonly string[],
  linhas: readonly (readonly string[])[],
): void {
  const blob = new Blob([paraCsv(cabecalhos, linhas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const ancora = document.createElement('a');
    ancora.href = url;
    ancora.download = nomeArquivo;
    ancora.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
