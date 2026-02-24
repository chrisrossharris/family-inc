import db from '@/lib/db/connection';
import { categorizeTransaction, getOrderedVendorRules } from '@/lib/services/categorizer';
import { parseCsv } from '@/lib/utils/csv';
import { sha256 } from '@/lib/utils/hashing';

interface ImportResult {
  inserted: number;
  skipped: number;
  duplicatesFlagged: number;
  importId: number;
  alreadyImported: boolean;
  existingRowCount?: number;
  existingImportedAt?: string;
}

function normalizeVendor(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildRowHash(date: string, vendor: string, amount: number, account: string, description: string): string {
  return sha256([date, vendor, amount.toFixed(2), account, description].join('|'));
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00`).getTime();
  const b = new Date(`${bIso}T00:00:00`).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

async function isLikelyDuplicate(vendor: string, amount: number, date: string): Promise<boolean> {
  const candidates = await db.all<{ date: string }>('SELECT date FROM transactions WHERE vendor = ? AND ABS(amount - ?) < 0.0001', [vendor, amount]);
  return candidates.some((row) => daysBetween(row.date, date) <= 3);
}

export async function importCsvFile(filename: string, content: string): Promise<ImportResult> {
  const fileHash = sha256(content);
  const rows = parseCsv(content);
  const existingImport = await db.get<{ id: number; row_count: number; imported_at: string }>(
    'SELECT id, row_count, imported_at FROM imports WHERE file_hash = ?',
    [fileHash]
  );

  if (existingImport) {
    const sampleHashes = rows
      .slice(0, 10)
      .map((row) => buildRowHash(row.date, normalizeVendor(row.vendor), row.amount, row.account, row.description));

    const placeholders = sampleHashes.map(() => '?').join(',');
    const sampleMatch =
      sampleHashes.length > 0
        ? await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM transactions WHERE import_hash IN (${placeholders})`, sampleHashes)
        : { count: 0 };

    // Recover from stale import metadata created before a failed/aborted transaction.
    if ((sampleMatch?.count ?? 0) === 0) {
      await db.run('DELETE FROM imports WHERE id = ?', [existingImport.id]);
    } else {
      return {
        inserted: 0,
        skipped: 0,
        duplicatesFlagged: 0,
        importId: existingImport.id,
        alreadyImported: true,
        existingRowCount: existingImport.row_count,
        existingImportedAt: existingImport.imported_at
      };
    }
  }

  let inserted = 0;
  let skipped = 0;
  let duplicatesFlagged = 0;
  const rules = await getOrderedVendorRules();
  let importId = 0;

  await db.transaction(async (tx) => {
    const importRow = await tx.run('INSERT INTO imports (filename, row_count, file_hash) VALUES (?, ?, ?)', [filename, rows.length, fileHash]);
    importId = importRow.lastInsertRowid ?? 0;

    for (const row of rows) {
      const normalizedVendor = normalizeVendor(row.vendor);
      const baseHash = buildRowHash(row.date, normalizedVendor, row.amount, row.account, row.description);
      const categorization = await categorizeTransaction(
        {
          vendor: normalizedVendor,
          description: row.description,
          amount: row.amount
        },
        rules
      );

      const duplicate = await isLikelyDuplicate(normalizedVendor, row.amount, row.date);
      if (duplicate) duplicatesFlagged += 1;

      const result = await tx.run(
        `INSERT OR IGNORE INTO transactions (
          date, vendor, amount, description, account, entity, category, deductible_flag, confidence, rule_id, import_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.date,
          normalizedVendor,
          row.amount,
          duplicate ? `${row.description} [POTENTIAL DUPLICATE]` : row.description,
          row.account,
          categorization.entity,
          categorization.category,
          categorization.deductible_flag,
          duplicate ? 'low' : categorization.confidence,
          categorization.rule_id,
          baseHash
        ]
      );

      if (result.changes === 1) inserted += 1;
      else skipped += 1;
    }
  });

  return {
    inserted,
    skipped,
    duplicatesFlagged,
    importId,
    alreadyImported: false
  };
}
