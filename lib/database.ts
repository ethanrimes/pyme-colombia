import { env } from "cloudflare:workers";
import type { D1Database } from "@cloudflare/workers-types";
export const database = () => (env as unknown as { DB: D1Database }).DB;
export function statement(sql: string, ...args: unknown[]) {
  return database()
    .prepare(sql)
    .bind(...args);
}
export async function all<T = Record<string, any>>(
  sql: string,
  ...args: unknown[]
): Promise<T[]> {
  return (await statement(sql, ...args).all<T>()).results;
}
export async function first<T = Record<string, any>>(
  sql: string,
  ...args: unknown[]
): Promise<T | null> {
  return statement(sql, ...args).first<T>();
}
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function insert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  if (!/^[a-z_]+$/.test(table) || keys.some((k) => !/^[a-z_]+$/.test(k)))
    throw new Error("Invalid SQL identifier");
  return statement(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    ...Object.values(row),
  );
}
export const auditStatement = (
  org: string,
  actor: string,
  action: string,
  reference: string,
) =>
  insert("audit", {
    id: uuid(),
    org,
    actor,
    action,
    reference,
    created_at: now(),
  });
