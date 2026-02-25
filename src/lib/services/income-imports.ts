import Papa from 'papaparse';
import { z } from 'zod';
import { addIncomeReceipt } from '@/lib/services/income';
import { sha256 } from '@/lib/utils/hashing';
import type { IncomeSourceType } from '@/lib/types';

const rawRowSchema = z.record(z.string(), z.string().optional().nullable());

interface ParsedIncomeRow {
  receivedDate: string;
  sourceType: IncomeSourceType;
  payerName: string;
  projectName: string | null;
  grossAmount: number;
  incomeLike: boolean;
  notes: string | null;
  splitChris: number;
  splitKate: number;
  splitBigPicture: number;
}

export interface IncomeImportResult {
  inserted: number;
  skipped: number;
  invalid: number;
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

function toNumber(input: string, fallback = 0): number {
  if (!input?.trim()) return fallback;
  const cleaned = input.replace(/[$,%\s,]/g, '');
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return fallback;
  return value;
}

function normalizeSourceType(input: string): IncomeSourceType {
  const value = input.toLowerCase().trim();
  if (!value) return 'client_payment';
  if (value.includes('client')) return 'client_payment';
  if (value.includes('gift')) return 'gift';
  if (value.includes('unemployment')) return 'unemployment';
  if (value.includes('food')) return 'food_stamps';
  return 'other';
}

function inferSourceType(sourceTypeRaw: string, payerRaw: string): IncomeSourceType {
  const explicit = normalizeSourceType(sourceTypeRaw);
  if (sourceTypeRaw.trim()) return explicit;
  const payer = payerRaw.toLowerCase();
  if (payer.includes('unemployment')) return 'unemployment';
  if (payer.includes('food') || payer.includes('snap') || payer.includes('ebt')) return 'food_stamps';
  if (payer.includes('gift')) return 'gift';
  return 'client_payment';
}

function parseIncomeCsv(content: string): { rows: ParsedIncomeRow[]; invalid: number } {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'Income CSV parse error');
  }

  let invalid = 0;
  const rows: ParsedIncomeRow[] = [];

  for (const raw of parsed.data) {
    try {
      const row = rawRowSchema.parse(raw);
      const splitChris = toNumber(pick(row, ['split chris %', 'chris %', 'split_chris', 'chris_split']), 0);
      const splitKate = toNumber(pick(row, ['split kate %', 'kate %', 'split_kate', 'kate_split']), 0);
      const splitBigPicture = toNumber(
        pick(row, ['split big picture %', 'big picture %', 'split_big_picture', 'big_picture_split', 'big picture split %']),
        0
      );

      const entity = pick(row, ['entity', 'owner']).toLowerCase().trim();
      let normalizedChris = splitChris;
      let normalizedKate = splitKate;
      let normalizedBigPicture = splitBigPicture;
      if (normalizedChris + normalizedKate + normalizedBigPicture === 0) {
        if (entity === 'chris') normalizedChris = 100;
        else if (entity === 'kate') normalizedKate = 100;
        else normalizedBigPicture = 100;
      }

      rows.push({
        // Rocket Money exports often encode inflow as negative Amount.
        // We only import income-like rows and normalize gross to positive.
        ...(() => {
          const amountRaw = toNumber(pick(row, ['gross amount', 'amount', 'payment amount']), 0);
          const inflowRaw = toNumber(pick(row, ['inflow']), 0);
          const categoryRaw = pick(row, ['category']).toLowerCase();
          const incomeLike = categoryRaw.includes('income') || inflowRaw > 0 || amountRaw < 0;
          const grossAmount = inflowRaw > 0 ? inflowRaw : Math.abs(amountRaw);
          return { grossAmount, incomeLike };
        })(),
        receivedDate: toIsoDate(pick(row, ['received date', 'date', 'payment date'])),
        sourceType: inferSourceType(
          pick(row, ['source type', 'income type', 'type']),
          pick(row, ['custom name', 'custom_name', 'payer', 'client', 'source', 'payer name', 'client name', 'name'])
        ),
        payerName:
          pick(row, ['custom name', 'custom_name', 'payer', 'client', 'source', 'payer name', 'client name', 'name']) || 'Unknown Source',
        projectName: pick(row, ['project', 'project name']) || null,
        notes: pick(row, ['notes', 'memo', 'description']) || null,
        splitChris: normalizedChris,
        splitKate: normalizedKate,
        splitBigPicture: normalizedBigPicture
      });
    } catch {
      invalid += 1;
    }
  }

  return { rows, invalid };
}

function rowImportHash(tenantId: string, row: ParsedIncomeRow) {
  return sha256(
    [
      tenantId,
      row.receivedDate,
      row.sourceType,
      row.payerName.toLowerCase().trim(),
      (row.projectName ?? '').toLowerCase().trim(),
      row.grossAmount.toFixed(2),
      row.splitChris.toFixed(3),
      row.splitKate.toFixed(3),
      row.splitBigPicture.toFixed(3)
    ].join('|')
  );
}

export async function importIncomeCsvFile(tenantId: string, content: string): Promise<IncomeImportResult> {
  const parsed = parseIncomeCsv(content);
  const rows = parsed.rows;
  let inserted = 0;
  let skipped = 0;
  let invalid = parsed.invalid;

  for (const row of rows) {
    const splitTotal = row.splitChris + row.splitKate + row.splitBigPicture;
    const valid = row.incomeLike && row.grossAmount > 0 && row.payerName.trim().length > 0 && splitTotal > 0 && splitTotal <= 100;
    if (!valid) {
      invalid += 1;
      continue;
    }

    const insertedRow = await addIncomeReceipt({
      tenantId,
      receivedDate: row.receivedDate,
      sourceType: row.sourceType,
      payerName: row.payerName,
      projectName: row.projectName,
      grossAmount: row.grossAmount,
      notes: row.notes,
      importHash: rowImportHash(tenantId, row),
      splits: [
        { entity: 'chris', percent: row.splitChris },
        { entity: 'kate', percent: row.splitKate },
        { entity: 'big_picture', percent: row.splitBigPicture }
      ]
    });
    if (insertedRow) inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped, invalid };
}
