import type { Entity, ScheduleCCategory } from './types';

export const REPORT_PERIOD = `YTD ${process.env.REPORT_YEAR ?? '2025'}`;

export const DEFAULT_ENTITY: Entity = 'big_picture';

export const SCHEDULE_C_CATEGORIES: ScheduleCCategory[] = [
  'Advertising & Marketing (Lead Gen)',
  'Advertising & Marketing (Website/Hosting)',
  'Software & Subscriptions',
  'Contract Labor',
  'Insurance',
  'Supplies',
  'Travel',
  'Meals (50%)',
  'Other Business Expense (Needs Review)'
];

export const ENTITY_LABELS: Record<Entity, string> = {
  chris: 'Chris',
  kate: 'Kate',
  big_picture: 'Big Picture'
};

export const MEALS_DEDUCTIBLE_RATE = 0.5;
