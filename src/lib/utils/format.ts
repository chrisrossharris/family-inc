export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMonthLabel(monthIso: string): string {
  const date = new Date(`${monthIso}-01T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
