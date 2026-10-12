import type { Database } from '@/data/db/database';
import {
  deleteRule,
  insertRule,
  listRules,
  setRuleEnabled,
  updateRule,
  upsertRule,
} from '@/data/repositories/rules';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { NotificationRule } from '@/domain/models';

function rule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: 'rule_1',
    accountId: null,
    matchType: 'all',
    matchValue: '',
    action: 'notify',
    soundId: null,
    vibrationMode: 'default',
    enabled: true,
    createdAt: 1,
    ...overrides,
  };
}

describe('rules repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('inserts and reads back a rule including nullable account', async () => {
    await insertRule(db, rule({ accountId: null, enabled: false, soundId: 'ding' }));

    const rules = await listRules(db);
    expect(rules).toEqual([rule({ accountId: null, enabled: false, soundId: 'ding' })]);
  });

  it('upserts idempotently', async () => {
    await upsertRule(db, rule());
    await upsertRule(db, rule({ matchValue: 'changed' }));

    const rules = await listRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0].matchValue).toBe('changed');
  });

  it('updates every mutable field', async () => {
    await insertRule(db, rule());
    await updateRule(
      db,
      rule({
        accountId: 'acc_1',
        matchType: 'domain',
        matchValue: 'example.com',
        action: 'silent',
        soundId: 'none',
        vibrationMode: 'short',
        enabled: false,
      }),
    );

    expect(await listRules(db)).toEqual([
      rule({
        accountId: 'acc_1',
        matchType: 'domain',
        matchValue: 'example.com',
        action: 'silent',
        soundId: 'none',
        vibrationMode: 'short',
        enabled: false,
      }),
    ]);
  });

  it('toggles enabled and deletes', async () => {
    await insertRule(db, rule());
    await setRuleEnabled(db, 'rule_1', false);
    expect((await listRules(db))[0].enabled).toBe(false);

    await deleteRule(db, 'rule_1');
    expect(await listRules(db)).toEqual([]);
  });

  it('lists global + account rules ordered by created_at', async () => {
    await insertRule(db, rule({ id: 'global', accountId: null, createdAt: 2 }));
    await insertRule(db, rule({ id: 'mine', accountId: 'acc_1', createdAt: 1 }));
    await insertRule(db, rule({ id: 'other', accountId: 'acc_2', createdAt: 3 }));

    expect((await listRules(db, 'acc_1')).map((r) => r.id)).toEqual(['mine', 'global']);
    expect((await listRules(db, undefined)).map((r) => r.id)).toEqual(['mine', 'global', 'other']);
    expect((await listRules(db, null)).map((r) => r.id)).toEqual(['global']);
  });
});
