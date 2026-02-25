import { isPostgres } from './connection';

export function sqlYearExpr(column = 'date'): string {
  return isPostgres ? `TO_CHAR(${column}::date, 'YYYY')` : `strftime('%Y', ${column})`;
}

export function sqlMonthExpr(column = 'date'): string {
  return isPostgres ? `TO_CHAR(${column}::date, 'YYYY-MM')` : `strftime('%Y-%m', ${column})`;
}

export function insertIgnore(sqliteSql: string, postgresSql: string): string {
  return isPostgres ? postgresSql : sqliteSql;
}
