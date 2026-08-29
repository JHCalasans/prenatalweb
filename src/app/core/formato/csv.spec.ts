import { paraCsv } from './csv';

describe('geração de CSV', () => {
  it('abre com BOM, separa por ponto e vírgula e fecha linha com CRLF', () => {
    const csv = paraCsv(['Quem', 'Quando'], [['Ana', '10/08/2026']]);

    expect(csv).toBe('﻿Quem;Quando\r\nAna;10/08/2026');
  });

  it('envolve em aspas o valor com separador, aspas ou quebra', () => {
    const csv = paraCsv(
      ['Titulo'],
      [['USG; morfológica'], ['Laudo "final"'], ['Duas\nlinhas'], ['Simples']],
    );

    expect(csv).toBe(
      '﻿Titulo\r\n"USG; morfológica"\r\n"Laudo ""final"""\r\n"Duas\nlinhas"\r\nSimples',
    );
  });

  it('escreve só o cabeçalho quando não há linhas', () => {
    expect(paraCsv(['Quem'], [])).toBe('﻿Quem');
  });
});
