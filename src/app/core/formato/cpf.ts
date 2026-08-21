export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function formatarCpf(valor: string | null | undefined): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 11) {
    return digitos;
  }
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}
