/**
 * In-memory `Database` adapter backed by Node's built-in `node:sqlite`.
 *
 * Used by unit tests so repositories run against real SQLite without the native
 * `expo-sqlite` module. Imported by tests only, never by application code.
 */

import { DatabaseSync } from 'node:sqlite';

import type { Database, SqlParams, SqlRunResult } from '@/data/db/database';

type AnonymousParams = (string | number | null | Uint8Array)[];

function isNamedParams(
  params: SqlParams,
): params is Record<string, string | number | null | Uint8Array> {
  return !Array.isArray(params);
}

export function createTestDatabase(): Database {
  const db = new DatabaseSync(':memory:');

  const bind = (source: string, params?: SqlParams) => {
    const statement = db.prepare(source);
    if (params === undefined) {
      return { statement, args: [] as AnonymousParams, named: null };
    }
    if (isNamedParams(params)) {
      return { statement, args: [] as AnonymousParams, named: params };
    }
    return { statement, args: params as AnonymousParams, named: null };
  };

  return {
    async execAsync(source: string): Promise<void> {
      db.exec(source);
    },
    async runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
      const { statement, args, named } = bind(source, params);
      const result = named ? statement.run(named) : statement.run(...args);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
      const { statement, args, named } = bind(source, params);
      const row = named ? statement.get(named) : statement.get(...args);
      return (row as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
      const { statement, args, named } = bind(source, params);
      const rows = named ? statement.all(named) : statement.all(...args);
      return rows as T[];
    },
  };
}
