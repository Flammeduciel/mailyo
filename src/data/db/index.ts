/**
 * Data-layer database barrel.
 *
 * `openAppDatabase` returns the production `expo-sqlite` adapter; unit tests
 * use `createTestDatabase` from `@/data/db/testing` instead.
 */

export type { Database, SqlParams, SqlRunResult, SqlValue } from '@/data/db/database';
export { openAppDatabase } from '@/data/db/expo-sqlite-adapter';
export { migrate, SCHEMA_VERSION } from '@/data/db/schema';
