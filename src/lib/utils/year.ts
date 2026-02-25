export const DEFAULT_REPORT_YEAR = process.env.REPORT_YEAR ?? '2025';

export function normalizeReportYear(input: string | null | undefined): string {
  if (!input) return DEFAULT_REPORT_YEAR;
  const year = input.trim();
  if (!/^\d{4}$/.test(year)) return DEFAULT_REPORT_YEAR;
  return year;
}
