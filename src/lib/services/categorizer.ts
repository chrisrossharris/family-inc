import db from '@/lib/db/connection';
import type { Entity, VendorRule } from '@/lib/types';
import { getDefaultEntityCode } from '@/lib/services/finance-entities';

interface CategorizeInput {
  vendor: string;
  description: string;
  amount: number;
}

interface CategorizeResult {
  entity: Entity;
  category: VendorRule['category'];
  deductible_flag: 0 | 1;
  confidence: 'high' | 'medium' | 'low';
  rule_id: number | null;
  reason: string;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchesRule(rule: VendorRule, vendor: string): boolean {
  const value = normalize(vendor);
  const ruleValue = normalize(rule.match_value);

  if (rule.match_type === 'exact') return value === ruleValue;
  if (rule.match_type === 'contains') return value.includes(ruleValue);

  try {
    return new RegExp(rule.match_value, 'i').test(vendor);
  } catch {
    return false;
  }
}

export async function getOrderedVendorRules(tenantId: string): Promise<VendorRule[]> {
  return db.all<VendorRule>(
    "SELECT * FROM vendor_rules WHERE tenant_id = ? ORDER BY CASE match_type WHEN 'exact' THEN 1 WHEN 'contains' THEN 2 ELSE 3 END, LENGTH(match_value) DESC",
    [tenantId]
  );
}

export async function categorizeTransaction(tenantId: string, input: CategorizeInput, rules?: VendorRule[]): Promise<CategorizeResult> {
  const activeRules = rules ?? (await getOrderedVendorRules(tenantId));
  const match = activeRules.find((rule) => matchesRule(rule, input.vendor) || matchesRule(rule, input.description));

  if (match) {
    return {
      entity: match.entity,
      category: match.category,
      deductible_flag: match.deductible_flag,
      confidence: match.match_type === 'exact' ? 'high' : 'medium',
      rule_id: match.id,
      reason: `matched ${match.match_type}`
    };
  }

  const likelyRefund = input.amount < 0;
  const defaultEntity = await getDefaultEntityCode(tenantId);
  return {
    entity: defaultEntity,
    category: 'Other Business Expense (Needs Review)',
    deductible_flag: 0,
    confidence: likelyRefund ? 'medium' : 'low',
    rule_id: null,
    reason: likelyRefund ? 'possible refund, no rule match' : 'no rule match'
  };
}

export async function applyRuleRetroactively(tenantId: string, ruleId: number): Promise<number> {
  const rule = await db.get<VendorRule>('SELECT * FROM vendor_rules WHERE tenant_id = ? AND id = ?', [tenantId, ruleId]);
  if (!rule) return 0;

  const txns = await db.all<{ id: number; vendor: string; description: string }>(
    'SELECT id, vendor, description FROM transactions WHERE tenant_id = ?',
    [tenantId]
  );

  let count = 0;
  await db.transaction(async (tx) => {
    for (const row of txns) {
      if (matchesRule(rule, row.vendor) || matchesRule(rule, row.description)) {
        await tx.run(
          'UPDATE transactions SET entity = ?, category = ?, deductible_flag = ?, confidence = ?, rule_id = ? WHERE tenant_id = ? AND id = ?',
          [rule.entity, rule.category, rule.deductible_flag, 'high', rule.id, tenantId, row.id]
        );
        count += 1;
      }
    }
  });

  return count;
}
