export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '')
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export function formatDate(date: string): string {
  const [year, month, day] = date.substring(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(2)}%`
}

export function maskPassword(value: string | null): string {
  if (!value) return '—'
  return '••••••••'
}

export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
