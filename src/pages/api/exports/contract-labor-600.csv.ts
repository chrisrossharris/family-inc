import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';

export const GET: APIRoute = async () => {
  const rows = await db.all<{ entity: string; vendor: string; total_paid: number }>(
    `SELECT entity, vendor, SUM(amount) AS total_paid
     FROM transactions
     WHERE category = 'Contract Labor' AND amount > 0
     GROUP BY entity, vendor
     HAVING SUM(amount) > 600
     ORDER BY total_paid DESC`
  );

  const header = 'Entity,Vendor,Total Paid';
  const body = rows.map((r) => `${r.entity},"${r.vendor}",${r.total_paid.toFixed(2)}`).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="contract-labor-over-600.csv"'
    }
  });
};
