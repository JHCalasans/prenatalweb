import { formatarCpf, somenteDigitos } from './cpf';

describe('formato de CPF', () => {
  it('mantém só os dígitos', () => {
    expect(somenteDigitos('123.456.789-00')).toBe('12345678900');
    expect(somenteDigitos(null)).toBe('');
  });

  it('formata CPF completo', () => {
    expect(formatarCpf('12345678900')).toBe('123.456.789-00');
  });

  it('devolve os dígitos crus quando não há 11', () => {
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCpf(null)).toBe('');
  });
});
