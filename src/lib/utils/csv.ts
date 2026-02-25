import Papa from 'papaparse';
import { z } from 'zod';

const rawRowSchema = z.record(z.string(), z.string().optional().nullable());

export interface NormalizedCsvRow {
  date: string;
  vendor: string;
  legacyVendor: string;
  description: string;
  amount: number;
  account: string;
}

function pick(row: Record<string, string | null | undefined>, candidates: string[]): string {
  for (const key of candidates) {
    const found = Object.keys(row).find((k) => k.toLowerCase().trim() === key.toLowerCase());
    if (found && row[found]) return String(row[found]).trim();
  }
  return '';
}

function toIsoDate(input: string): string {
  const value = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${input}`);
  return parsed.toISOString().slice(0, 10);
}

function toAmount(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, '');
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) throw new Error(`Invalid amount: ${input}`);
  return value;
}

export function parseCsv(content: string): NormalizedCsvRow[] {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'CSV parse error');
  }

  return parsed.data
    .map((row) => rawRowSchema.parse(row))
    .map((row) => {
      const amount = pick(row, ['amount', 'debit', 'transaction amount']);
      const outflow = pick(row, ['outflow']);
      const inflow = pick(row, ['inflow']);
      let normalizedAmount = amount ? toAmount(amount) : 0;

      if (!amount && outflow) normalizedAmount = toAmount(outflow);
      if (!amount && inflow) normalizedAmount = -Math.abs(toAmount(inflow));

      const legacyVendor = pick(row, ['merchant', 'vendor', 'payee', 'name', 'description']) || 'Unknown Vendor';
      const preferredVendor = pick(row, ['custom name', 'custom_name', 'merchant', 'vendor', 'payee', 'name', 'description']) || legacyVendor;

      return {
        date: toIsoDate(pick(row, ['date', 'posted date', 'transaction date'])),
        vendor: preferredVendor,
        legacyVendor,
        description: pick(row, ['description', 'memo', 'notes']) || '',
        amount: normalizedAmount,
        account: pick(row, ['account', 'account name', 'source']) || 'Unknown Account'
      };
    });
}
