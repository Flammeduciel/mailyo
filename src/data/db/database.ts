/**
 * Minimal database abstraction.
 *
 * Repositories depend on this interface only, so they are driven by the
 * production `expo-sqlite` adapter on device and by an in-memory `node:sqlite`
 * adapter in unit tests (real SQL, no native module).
 */

export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface Database {
  /** Execute raw SQL (no parameter binding). Used for migrations/PRAGMAs. */
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]>;
}
