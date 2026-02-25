import db from '@/lib/db/connection';
import { insertIgnore } from '@/lib/db/sql-dialect';
import { categorizeTransaction, getOrderedVendorRules } from '@/lib/services/categorizer';
import { parseCsv } from '@/lib/utils/csv';
import { sha256 } from '@/lib/utils/hashing';

interface ImportResult {
  inserted: number;
  skipped: number;
  duplicatesFlagged: number;
  importId: number;
  alreadyImported: boolean;
  vendorNamesUpdated: number;
  existingRowCount?: number;
  existingImportedAt?: string;
}

function normalizeVendor(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildRowHash(tenantId: string, date: string, vendor: string, amount: number, account: string, description: string): string {
  return sha256([tenantId, date, vendor, amount.toFixed(2), account, description].join('|'));
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00`).getTime();
  const b = new Date(`${bIso}T00:00:00`).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

async function isLikelyDuplicate(tenantId: string, vendor: string, amount: number, date: string): Promise<boolean> {
  const candidates = await db.all<{ date: string }>(
    'SELECT date FROM transactions WHERE tenant_id = ? AND LOWER(vendor) = ? AND ABS(amount - ?) < 0.0001',
    [tenantId, normalizeVendor(vendor), amount]
  );
  return candidates.some((row) => daysBetween(row.date, date) <= 3);
}

async function backfillVendorsFromCustomName(
  tenantId: string,
  rows: Array<{ date: string; vendor: string; legacyVendor: string; description: string; amount: number; account: string }>
) {
  let updated = 0;

  for (const row of rows) {
    const preferredVendorDisplay = row.vendor.trim();
    const legacyVendor = normalizeVendor(row.legacyVendor);
    const preferredVendor = normalizeVendor(preferredVendorDisplay);
    if (!preferredVendorDisplay || preferredVendor === legacyVendor) continue;

    // Deterministic remap for previously imported rows:
    // old imports hashed using legacy vendor, so we can target exact rows.
    const legacyHash = buildRowHash(tenantId, row.date, legacyVendor, row.amount, row.account, row.description);
    const byHash = await db.run(
      `UPDATE transactions
       SET vendor = ?
       WHERE tenant_id = ?
         AND import_hash = ?
         AND LOWER(vendor) <> ?`,
      [preferredVendorDisplay, tenantId, legacyHash, preferredVendor]
    );

    if (byHash.changes > 0) {
      updated += byHash.changes;
      continue;
    }

    // Fallback for rows created before import_hash behavior was stable.
    const result = await db.run(
      `UPDATE transactions
       SET vendor = ?
       WHERE tenant_id = ?
         AND date = ?
         AND account = ?
         AND ABS(amount - ?) < 0.0001
         AND LOWER(vendor) = ?
         AND (
           description = ?
           OR description = ?
         )`,
      [preferredVendorDisplay, tenantId, row.date, row.account, row.amount, legacyVendor, row.description, `${row.description} [POTENTIAL DUPLICATE]`]
    );

    updated += result.changes;
  }

  return updated;
}

export async function importCsvFile(tenantId: string, filename: string, content: string): Promise<ImportResult> {
  const fileHash = sha256(`${tenantId}|${content}`);
  const rows = parseCsv(content);
  const existingImport = await db.get<{ id: number; row_count: number; imported_at: string }>(
    'SELECT id, row_count, imported_at FROM imports WHERE tenant_id = ? AND file_hash = ?',
    [tenantId, fileHash]
  );

  if (existingImport) {
    const vendorNamesUpdated = await backfillVendorsFromCustomName(tenantId, rows);
    return {
      inserted: 0,
      skipped: 0,
      duplicatesFlagged: 0,
      importId: existingImport.id,
      alreadyImported: true,
      vendorNamesUpdated,
      existingRowCount: existingImport.row_count,
      existingImportedAt: existingImport.imported_at
    };
  }

  let inserted = 0;
  let skipped = 0;
  let duplicatesFlagged = 0;
  let vendorNamesUpdated = 0;
  const rules = await getOrderedVendorRules(tenantId);
  let importId = 0;

  await db.transaction(async (tx) => {
    const importRow = await tx.run('INSERT INTO imports (tenant_id, filename, row_count, file_hash) VALUES (?, ?, ?, ?)', [
      tenantId,
      filename,
      rows.length,
      fileHash
    ]);
    importId = importRow.lastInsertRowid ?? 0;

    for (const row of rows) {
      const vendorDisplay = row.vendor.trim() || 'Unknown Vendor';
      const normalizedVendor = normalizeVendor(vendorDisplay);
      const hashVendorKey = normalizeVendor(row.legacyVendor || row.vendor || 'Unknown Vendor');
      const baseHash = buildRowHash(tenantId, row.date, hashVendorKey, row.amount, row.account, row.description);
      const categorization = await categorizeTransaction(
        tenantId,
        {
          vendor: normalizedVendor,
          description: row.description,
          amount: row.amount
        },
        rules
      );

      const duplicate = await isLikelyDuplicate(tenantId, normalizedVendor, row.amount, row.date);
      if (duplicate) duplicatesFlagged += 1;

      const result = await tx.run(
        insertIgnore(
          `INSERT OR IGNORE INTO transactions (
            tenant_id, date, vendor, amount, description, account, entity, category, deductible_flag, confidence, rule_id, import_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `INSERT INTO transactions (
            tenant_id, date, vendor, amount, description, account, entity, category, deductible_flag, confidence, rule_id, import_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (import_hash) DO NOTHING`
        ),
        [
          tenantId,
          row.date,
          vendorDisplay,
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
      else {
        skipped += 1;
        const vendorUpdate = await tx.run(
          `UPDATE transactions
           SET vendor = ?
           WHERE tenant_id = ?
             AND import_hash = ?
             AND LOWER(vendor) <> ?`,
          [vendorDisplay, tenantId, baseHash, normalizedVendor]
        );
        vendorNamesUpdated += vendorUpdate.changes;
      }
    }
  });

  return {
    inserted,
    skipped,
    duplicatesFlagged,
    importId,
    alreadyImported: false,
    vendorNamesUpdated
  };
}
