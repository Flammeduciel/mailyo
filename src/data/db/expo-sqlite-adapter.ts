/**
 * Production `Database` adapter backed by `expo-sqlite`.
 */

import * as SQLite from 'expo-sqlite';

import type { Database, SqlParams, SqlRunResult } from '@/data/db/database';

class ExpoSqliteDatabase implements Database {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async execAsync(source: string): Promise<void> {
    await this.db.execAsync(source);
  }

  async runAsync(source: string, params?: SqlParams): Promise<SqlRunResult> {
    const result = await this.db.runAsync(source, (params ?? []) as SQLite.SQLiteBindParams);
    return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
  }

  async getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null> {
    const row = await this.db.getFirstAsync<T>(source, (params ?? []) as SQLite.SQLiteBindParams);
    return row ?? null;
  }

  async getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]> {
    return this.db.getAllAsync<T>(source, (params ?? []) as SQLite.SQLiteBindParams);
  }
}

/** Open (creating if needed) the application database. */
export async function openAppDatabase(name = 'mailyo.db'): Promise<Database> {
  const db = await SQLite.openDatabaseAsync(name);
  return new ExpoSqliteDatabase(db);
}
