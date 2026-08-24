// Busca por nome ignora acento e caixa, igual ao normalizarBusca do mobile.
export function normalizarBusca(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
