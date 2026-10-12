/**
 * Test-only helper: a migrated in-memory database.
 *
 * Kept out of application code and imported only by repository tests.
 */

import type { Database } from '@/data/db/database';
import { migrate } from '@/data/db/schema';
import { createTestDatabase } from '@/data/db/testing';

/** Create a fresh in-memory database with the full schema applied. */
export async function createMigratedDatabase(): Promise<Database> {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}
