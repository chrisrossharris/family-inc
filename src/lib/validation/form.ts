import { z } from 'zod';

function emptyToUndefined(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export function formOptionalNumber(options: { min?: number; max?: number; int?: boolean; positive?: boolean } = {}) {
  let schema = z.coerce.number();
  if (options.int) schema = schema.int();
  if (options.positive) schema = schema.positive();
  if (options.min !== undefined) schema = schema.min(options.min);
  if (options.max !== undefined) schema = schema.max(options.max);
  return z.preprocess(emptyToUndefined, schema.optional());
}

export function formOptionalInt(options: { min?: number; max?: number; positive?: boolean } = {}) {
  return formOptionalNumber({ ...options, int: true });
}

export function formOptionalFlag() {
  return formOptionalInt({ min: 0 });
}

export function formTrimmedString(min = 1) {
  return z.string().trim().min(min);
}
