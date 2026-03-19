export const ENTITIES = ['chris', 'kate', 'big_picture'] as const;
export type Entity = string;

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export type MatchType = 'exact' | 'contains' | 'regex';

export type DeductionType = 'home_office' | 'mileage' | 'phone' | 'equipment';
export type IncomeSourceType = 'client_payment' | 'gift' | 'unemployment' | 'food_stamps' | 'interest' | 'other';

export type ScheduleCCategory =
  | 'Advertising & Marketing (Lead Gen)'
  | 'Advertising & Marketing (Website/Hosting)'
  | 'Software & Subscriptions'
  | 'Contract Labor'
  | 'Insurance'
  | 'Supplies'
  | 'Travel'
  | 'Meals (50%)'
  | 'Other Business Expense (Needs Review)';

export interface Transaction {
  id: number;
  date: string;
  vendor: string;
  amount: number;
  description: string;
  account: string;
  entity: string;
  category: ScheduleCCategory;
  deductible_flag: 0 | 1;
  confidence: Confidence;
  rule_id: number | null;
  import_hash: string;
  created_at: string;
}

export interface VendorRule {
  id: number;
  match_type: MatchType;
  match_value: string;
  entity: string;
  category: ScheduleCCategory;
  deductible_flag: 0 | 1;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
