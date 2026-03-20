import type { APIRoute } from 'astro';
import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { normalizeReportYear } from '@/lib/utils/year';
import { resolveSession } from '@/lib/auth/session';
import { entityExists } from '@/lib/services/finance-entities';
import { getDeductions } from '@/lib/services/deductions';

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export const GET: APIRoute = async ({ url, locals, cookies }) => {
  const session = resolveSession(locals, cookies);
  const year = normalizeReportYear(url.searchParams.get('year'));
  const entity = url.searchParams.get('entity');
  const yearExpr = sqlYearExpr('date');

  if (entity) {
    const validEntity = await entityExists(session.tenantId, entity);
    if (!validEntity) return new Response('Invalid entity', { status: 400 });
  }

  const entities = entity
    ? [entity]
    : (
        await db.all<{ code: string }>(
          `SELECT code
           FROM finance_entities
           WHERE tenant_id = ? AND is_active = 1
           ORDER BY kind ASC, name ASC`,
          [session.tenantId]
        )
      ).map((row) => row.code);

  const header = 'Entity,Worksheet,Saved,Related Spend (YTD),Priority,Recommended Action';
  const lines: string[] = [];

  for (const code of entities) {
    const deductions = await getDeductions(session.tenantId, code);
    const has = new Set(deductions.map((row) => row.type));

    const travel = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE tenant_id = ? AND entity = ? AND ${yearExpr} = ? AND category = ?`,
      [session.tenantId, code, year, 'Travel']
    );
    const supplies = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE tenant_id = ? AND entity = ? AND ${yearExpr} = ? AND category = ?`,
      [session.tenantId, code, year, 'Supplies']
    );
    const phoneLike = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE tenant_id = ? AND entity = ? AND ${yearExpr} = ?
         AND (
           LOWER(vendor) LIKE '%verizon%'
           OR LOWER(vendor) LIKE '%att%'
           OR LOWER(vendor) LIKE '%at&t%'
           OR LOWER(vendor) LIKE '%t-mobile%'
           OR LOWER(vendor) LIKE '%comcast%'
           OR LOWER(vendor) LIKE '%xfinity%'
         )`,
      [session.tenantId, code, year]
    );

    const rows = [
      {
        worksheet: 'home_office',
        saved: has.has('home_office'),
        spend: 0,
        priority: has.has('home_office') ? 'ok' : 'high',
        action: has.has('home_office')
          ? 'Review sqft and annual costs for accuracy'
          : 'Add Home Office worksheet if you use part of home regularly for business'
      },
      {
        worksheet: 'mileage',
        saved: has.has('mileage'),
        spend: num(travel?.total),
        priority: !has.has('mileage') && num(travel?.total) > 0 ? 'high' : has.has('mileage') ? 'ok' : 'watch',
        action: has.has('mileage')
          ? 'Ensure mileage log supports business miles'
          : 'Add Mileage worksheet and log business miles'
      },
      {
        worksheet: 'phone',
        saved: has.has('phone'),
        spend: num(phoneLike?.total),
        priority: !has.has('phone') && num(phoneLike?.total) > 0 ? 'medium' : has.has('phone') ? 'ok' : 'watch',
        action: has.has('phone')
          ? 'Validate business-use % with consistent method'
          : 'Add Phone/Internet worksheet if family plan supports business use'
      },
      {
        worksheet: 'equipment',
        saved: has.has('equipment'),
        spend: num(supplies?.total),
        priority: !has.has('equipment') && num(supplies?.total) > 0 ? 'medium' : has.has('equipment') ? 'ok' : 'watch',
        action: has.has('equipment')
          ? 'Confirm Section 179 setting with CPA'
          : 'Add Equipment worksheet for tools/computers/cameras'
      }
    ];

    for (const row of rows) {
      lines.push(`"${code}","${row.worksheet}",${row.saved ? 'Yes' : 'No'},${row.spend.toFixed(2)},"${row.priority}","${row.action}"`);
    }
  }

  return new Response(`${header}\n${lines.join('\n')}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="deduction-opportunities-${entity ?? 'all'}-${year}.csv"`
    }
  });
};

