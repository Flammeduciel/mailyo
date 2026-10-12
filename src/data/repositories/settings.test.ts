import { createMigratedDatabase } from '@/data/repositories/test-utils';
import {
  deleteSetting,
  getAllSettings,
  getSetting,
  setSetting,
  setSettings,
} from '@/data/repositories/settings';

describe('settings repository', () => {
  it('stores and reads a value', async () => {
    const db = await createMigratedDatabase();
    await setSetting(db, 'app.theme', 'dark');
    expect(await getSetting(db, 'app.theme')).toBe('dark');
  });

  it('returns null for a missing key', async () => {
    const db = await createMigratedDatabase();
    expect(await getSetting(db, 'missing')).toBeNull();
  });

  it('overwrites an existing key instead of duplicating it', async () => {
    const db = await createMigratedDatabase();
    await setSetting(db, 'app.theme', 'dark');
    await setSetting(db, 'app.theme', 'light');
    expect(await getSetting(db, 'app.theme')).toBe('light');
    expect(await getAllSettings(db)).toEqual({ 'app.theme': 'light' });
  });

  it('writes several keys at once', async () => {
    const db = await createMigratedDatabase();
    await setSettings(db, { a: '1', b: '2' });
    expect(await getAllSettings(db)).toEqual({ a: '1', b: '2' });
  });

  it('deletes a key', async () => {
    const db = await createMigratedDatabase();
    await setSetting(db, 'a', '1');
    await deleteSetting(db, 'a');
    expect(await getSetting(db, 'a')).toBeNull();
  });
});
