import type { Entity, IncomeSourceType, ScheduleCCategory } from './types';

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

export const INCOME_SOURCE_LABELS: Record<IncomeSourceType, string> = {
  client_payment: 'Client Payment',
  gift: 'Gift',
  unemployment: 'Unemployment',
  food_stamps: 'Food Stamps',
  other: 'Other'
};

export const MEALS_DEDUCTIBLE_RATE = 0.5;
