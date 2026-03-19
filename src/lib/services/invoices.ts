import db, { isPostgres } from '@/lib/db/connection';
import { insertIgnore, sqlYearExpr } from '@/lib/db/sql-dialect';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';
import type { Entity } from '@/lib/types';

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export async function addInvoice(input: {
  tenantId: string;
  invoiceNumber: string;
  clientName: string;
  projectName?: string | null;
  entity: Entity;
  issuedOn: string;
  dueOn: string;
  amountTotal: number;
  status?: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO invoices (tenant_id, invoice_number, client_name, project_name, entity, issued_on, due_on, amount_total, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      input.tenantId,
      input.invoiceNumber,
      input.clientName,
      input.projectName ?? null,
      input.entity,
      input.issuedOn,
      input.dueOn,
      input.amountTotal,
      input.status ?? 'sent',
      input.notes ?? null
    ]
  );
}

async function recomputeInvoiceStatus(tenantId: string, invoiceId: number) {
  const invoice = await db.get<{ id: number; status: string; amount_total: number; due_on: string }>(
    'SELECT id, status, amount_total, due_on FROM invoices WHERE tenant_id = ? AND id = ?',
    [tenantId, invoiceId]
  );
  if (!invoice || invoice.status === 'void' || invoice.status === 'draft') return;

  const paid = (await db.get<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM invoice_payments WHERE tenant_id = ? AND invoice_id = ?', [tenantId, invoiceId]))
    ?.total ?? 0;

  const nowIso = new Date().toISOString().slice(0, 10);
  let nextStatus: 'sent' | 'partial' | 'paid' | 'overdue' = 'sent';
  if (paid >= invoice.amount_total) nextStatus = 'paid';
  else if (paid > 0) nextStatus = 'partial';
  else if (invoice.due_on < nowIso) nextStatus = 'overdue';

  await db.run('UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id = ?', [nextStatus, tenantId, invoiceId]);
}

export async function addInvoicePayment(input: {
  tenantId: string;
  invoiceId: number;
  receivedOn: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<boolean> {
  const result = await db.run(
    insertIgnore(
      `INSERT OR IGNORE INTO invoice_payments (tenant_id, invoice_id, received_on, amount, method, reference, notes, stripe_payment_intent_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      `INSERT INTO invoice_payments (tenant_id, invoice_id, received_on, amount, method, reference, notes, stripe_payment_intent_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id, stripe_payment_intent_id) DO NOTHING`
    ),
    [
      input.tenantId,
      input.invoiceId,
      input.receivedOn,
      input.amount,
      input.method ?? null,
      input.reference ?? null,
      input.notes ?? null,
      input.stripePaymentIntentId ?? null
    ]
  );
  if (result.changes > 0) await recomputeInvoiceStatus(input.tenantId, input.invoiceId);
  return result.changes > 0;
}

export async function getInvoicesOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('i.issued_on');
  const invoices = await db.all<{
    id: number;
    invoice_number: string;
    client_name: string;
    project_name: string | null;
    entity: Entity;
    issued_on: string;
    due_on: string;
    amount_total: number;
    status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
    notes: string | null;
    amount_paid: number;
  }>(
    `SELECT
       i.id,
       i.invoice_number,
       i.client_name,
       i.project_name,
       i.entity,
       i.issued_on,
       i.due_on,
       i.amount_total,
       i.status,
       i.notes,
       COALESCE(SUM(p.amount), 0) AS amount_paid
     FROM invoices i
     LEFT JOIN invoice_payments p ON p.invoice_id = i.id
     WHERE i.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY i.id, i.invoice_number, i.client_name, i.project_name, i.entity, i.issued_on, i.due_on, i.amount_total, i.status, i.notes
     ORDER BY i.due_on ASC, i.id DESC`,
    [tenantId, reportYear]
  );

  const payments = await db.all<{
    id: number;
    invoice_id: number;
    income_receipt_id: number | null;
    stripe_payment_intent_id: string | null;
    invoice_number: string;
    client_name: string;
    received_on: string;
    amount: number;
    method: string | null;
    reference: string | null;
  }>(
    `SELECT p.id, p.invoice_id, p.income_receipt_id, p.stripe_payment_intent_id, i.invoice_number, i.client_name, p.received_on, p.amount, p.method, p.reference
     FROM invoice_payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     WHERE p.tenant_id = ? AND ${sqlYearExpr('p.received_on')} = ?
     ORDER BY p.received_on DESC, p.id DESC`,
    [tenantId, reportYear]
  );

  const nowIso = new Date().toISOString().slice(0, 10);
  for (const inv of invoices) {
    if (inv.status !== 'void' && inv.status !== 'paid' && inv.due_on < nowIso && inv.amount_paid <= 0) {
      await db.run('UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND id = ?', ['overdue', tenantId, inv.id]);
      inv.status = 'overdue';
    }
  }

  const enriched = invoices.map((row) => ({
    ...row,
    amount_outstanding: Math.max(0, row.amount_total - row.amount_paid),
    progress_pct: row.amount_total > 0 ? Math.min(100, (row.amount_paid / row.amount_total) * 100) : 0
  }));

  const totalInvoiced = sum(enriched.map((i) => i.amount_total));
  const totalPaid = sum(enriched.map((i) => i.amount_paid));
  const totalOutstanding = Math.max(0, totalInvoiced - totalPaid);

  const topClients = await db.all<{ client_name: string; total: number }>(
    `SELECT i.client_name, COALESCE(SUM(i.amount_total), 0) AS total
     FROM invoices i
     WHERE i.tenant_id = ? AND ${yearExpr} = ?
     GROUP BY i.client_name
     ORDER BY total DESC, i.client_name ASC
     LIMIT 15`,
    [tenantId, reportYear]
  );

  const upcomingDateClause = isPostgres ? "i.due_on::date >= CURRENT_DATE" : "i.due_on >= DATE('now')";
  const dueSoon = (await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM invoices i
     WHERE i.tenant_id = ? AND ${yearExpr} = ? AND i.status IN ('sent','partial','overdue') AND ${upcomingDateClause}`,
    [tenantId, reportYear]
  ))?.count ?? 0;

  return {
    reportYear,
    invoices: enriched,
    payments,
    topClients,
    stats: {
      invoicesCount: enriched.length,
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      overdueCount: enriched.filter((i) => i.status === 'overdue').length,
      partialCount: enriched.filter((i) => i.status === 'partial').length,
      paidCount: enriched.filter((i) => i.status === 'paid').length,
      dueSoon
    }
  };
}
