// `date` do Postgres é dia civil: converter por toISOString() joga o dia para
// trás em fusos negativos, que é o caso do Brasil.
export function paraDataIso(data: Date | null): string | null {
  if (data === null) {
    return null;
  }
  const mes = `${data.getMonth() + 1}`.padStart(2, '0');
  const dia = `${data.getDate()}`.padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function deDataIso(valor: string | null): Date | null {
  if (!valor) {
    return null;
  }
  const [ano, mes, dia] = valor.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export function formatarData(valor: string | null): string {
  const data = deDataIso(valor);
  return data === null ? '' : data.toLocaleDateString('pt-BR');
}

// `timestamptz` do Postgres: diferente do `date` acima, traz hora e fuso.
export function formatarDataHora(valor: string | null): string {
  if (!valor) {
    return '';
  }
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Só o horário, para linhas já agrupadas por dia.
export function formatarHora(valor: string | null): string {
  if (!valor) {
    return '';
  }
  return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
