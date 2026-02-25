import db from './connection';
import type { Entity, MatchType } from '../types';

interface SeedRule {
  match_type: MatchType;
  match_value: string;
  entity: Entity;
  category: string;
  deductible_flag: 0 | 1;
  notes?: string;
}

const seedRules: SeedRule[] = [
  { match_type: 'contains', match_value: 'squarespace', entity: 'big_picture', category: 'Advertising & Marketing (Website/Hosting)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'godaddy', entity: 'big_picture', category: 'Advertising & Marketing (Website/Hosting)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'vercel', entity: 'big_picture', category: 'Advertising & Marketing (Website/Hosting)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'shopify', entity: 'big_picture', category: 'Advertising & Marketing (Website/Hosting)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'openai', entity: 'big_picture', category: 'Software & Subscriptions', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'dropbox', entity: 'big_picture', category: 'Software & Subscriptions', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'adobe', entity: 'big_picture', category: 'Software & Subscriptions', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'elevenlabs', entity: 'big_picture', category: 'Software & Subscriptions', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'zoom', entity: 'big_picture', category: 'Software & Subscriptions', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'vimeo', entity: 'big_picture', category: 'Software & Subscriptions', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'thumbtack', entity: 'chris', category: 'Advertising & Marketing (Lead Gen)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'linkedin', entity: 'chris', category: 'Advertising & Marketing (Lead Gen)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'erie insurance', entity: 'big_picture', category: 'Insurance', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'amazon', entity: 'big_picture', category: 'Supplies', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'costco', entity: 'big_picture', category: 'Supplies', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'harbor freight', entity: 'big_picture', category: 'Supplies', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'delta', entity: 'big_picture', category: 'Travel', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'spirit', entity: 'big_picture', category: 'Travel', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'uber', entity: 'big_picture', category: 'Travel', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'hyatt', entity: 'big_picture', category: 'Travel', deductible_flag: 1 },
  { match_type: 'regex', match_value: 'restaurant|cafe|grill|bistro', entity: 'big_picture', category: 'Meals (50%)', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'john irwin', entity: 'chris', category: 'Contract Labor', deductible_flag: 1 },
  { match_type: 'contains', match_value: 'drew micco', entity: 'chris', category: 'Contract Labor', deductible_flag: 1 }
];
const tenantId = 'harris_holdings';

async function run() {
  await db.transaction(async (tx) => {
    for (const rule of seedRules) {
      await tx.run(
        `INSERT INTO vendor_rules (tenant_id, match_type, match_value, entity, category, deductible_flag, notes)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM vendor_rules WHERE tenant_id = ? AND match_type = ? AND match_value = ? AND entity = ?
         )`,
        [
          tenantId,
          rule.match_type,
          rule.match_value,
          rule.entity,
          rule.category,
          rule.deductible_flag,
          rule.notes ?? null,
          tenantId,
          rule.match_type,
          rule.match_value,
          rule.entity
        ]
      );
    }
  });

  console.log(`Seeded ${seedRules.length} baseline vendor rules.`);
}

await run();
