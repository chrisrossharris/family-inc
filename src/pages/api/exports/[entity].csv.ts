import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';

export const GET: APIRoute = async ({ params }) => {
  const entity = params.entity;
  if (!entity || !['chris', 'kate', 'big_picture'].includes(entity)) {
    return new Response('Invalid entity', { status: 400 });
  }

  const rows = await db.all<{
    date: string;
    vendor: string;
    amount: number;
    category: string;
    deductible_flag: 0 | 1;
    description: string;
  }>(
    `SELECT date, vendor, amount, category, deductible_flag, description
     FROM transactions
     WHERE entity = ?
     ORDER BY date ASC, id ASC`,
    [entity]
  );

  const header = 'Date,Vendor,Amount,Category,Deductible,Notes';
  const body = rows
    .map((row) => {
      const notes = row.description.replaceAll('"', '""');
      return `${row.date},"${row.vendor}",${row.amount.toFixed(2)},"${row.category}",${row.deductible_flag ? 'Yes' : 'No'},"${notes}"`;
    })
    .join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${entity}-transactions.csv"`
    }
  });
};
