/**
 * Process-wide database access.
 *
 * `_layout.tsx` and the application service need the same connection, and the
 * synchronous `expo-sqlite` API must not be opened twice. This module owns the
 * single long-lived `Database` for the process, opened and migrated once.
 */

import { DB_NAME } from '@/constants/config';
import type { Database } from '@/data/db/database';
import { openAppDatabase } from '@/data/db/expo-sqlite-adapter';
import { migrate } from '@/data/db/schema';

let cached: Promise<Database> | null = null;

async function openAndMigrate(name: string): Promise<Database> {
  const db = await openAppDatabase(name);
  await migrate(db);
  return db;
}

/** Open (once) and migrate the application database. */
export function getDatabase(name: string = DB_NAME): Promise<Database> {
  if (cached === null) {
    cached = openAndMigrate(name);
  }
  return cached;
}

/** Test-only: forget the cached connection so a fresh database can be opened. */
export function resetDatabaseForTests(): void {
  cached = null;
}
