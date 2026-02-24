import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';

export const GET: APIRoute = async () => {
  const rows = await db.all<{ entity: string; category: string; total: number }>(
    `SELECT entity, category, SUM(amount) AS total
     FROM transactions
     WHERE amount > 0
     GROUP BY entity, category
     ORDER BY entity, total DESC`
  );

  const header = 'Entity,Category,Total';
  const body = rows.map((r) => `${r.entity},"${r.category}",${r.total.toFixed(2)}`).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="annual-category-breakdown.csv"'
    }
  });
};
