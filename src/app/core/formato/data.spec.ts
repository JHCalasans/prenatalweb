import { deDataIso, formatarData, formatarDataHora, paraDataIso } from './data';

describe('formato de data', () => {
  it('converte Date para o dia civil sem deslocar o fuso', () => {
    expect(paraDataIso(new Date(1995, 3, 10))).toBe('1995-04-10');
    expect(paraDataIso(null)).toBeNull();
  });

  it('reconstrói a data local a partir do ISO', () => {
    const data = deDataIso('1995-04-10');
    expect(data?.getFullYear()).toBe(1995);
    expect(data?.getMonth()).toBe(3);
    expect(data?.getDate()).toBe(10);
  });

  it('formata em pt-BR e tolera nulo', () => {
    expect(formatarData('1995-04-10')).toBe('10/04/1995');
    expect(formatarData(null)).toBe('');
  });

  it('formata timestamptz com data e hora e tolera nulo', () => {
    // Sem sufixo de fuso o JS interpreta como hora local: saída determinística.
    expect(formatarDataHora('2026-03-12T14:30:00')).toBe('12/03/2026, 14:30');
    expect(formatarDataHora(null)).toBe('');
  });
});
