import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';

export const GET: APIRoute = async () => {
  const rows = await db.all<{ entity: string; gross_total: number; deductible_total: number }>(
    `SELECT entity, SUM(amount) AS gross_total, SUM(amount) * 0.5 AS deductible_total
     FROM transactions
     WHERE category = 'Meals (50%)' AND amount > 0
     GROUP BY entity
     ORDER BY entity`
  );

  const header = 'Entity,Meals Gross,Meals Deductible (50%)';
  const body = rows.map((r) => `${r.entity},${r.gross_total.toFixed(2)},${r.deductible_total.toFixed(2)}`).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="meals-summary.csv"'
    }
  });
};
