import type { Database } from '@/data/db/database';
import { deleteDraft, getDraft, listDrafts, upsertDraft } from '@/data/repositories/drafts';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { Draft } from '@/domain/models';

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 'draft_1',
    accountId: 'acc_1',
    remoteDraftId: null,
    to: [{ name: 'Alice', address: 'alice@example.com' }],
    cc: [],
    bcc: [{ name: 'Secret', address: 'secret@example.com' }],
    subject: 'Hi',
    body: 'Body',
    updatedAt: 1_000,
    syncState: 'pending',
    ...overrides,
  };
}

describe('drafts repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('round-trips address arrays and nullable remote id', async () => {
    await upsertDraft(db, draft());
    expect(await getDraft(db, 'draft_1')).toEqual(draft());
  });

  it('upserts idempotently', async () => {
    await upsertDraft(db, draft());
    await upsertDraft(db, draft({ subject: 'Updated' }));

    const drafts = await listDrafts(db, 'acc_1');
    expect(drafts).toHaveLength(1);
    expect(drafts[0].subject).toBe('Updated');
  });

  it('lists drafts by account ordered by updated_at desc', async () => {
    await upsertDraft(db, draft({ id: 'd1', updatedAt: 1_000 }));
    await upsertDraft(db, draft({ id: 'd2', updatedAt: 2_000 }));
    await upsertDraft(db, draft({ id: 'd3', accountId: 'acc_2', updatedAt: 3_000 }));

    expect((await listDrafts(db, 'acc_1')).map((d) => d.id)).toEqual(['d2', 'd1']);
  });

  it('deletes a draft', async () => {
    await upsertDraft(db, draft());
    await deleteDraft(db, 'draft_1');
    expect(await getDraft(db, 'draft_1')).toBeNull();
  });
});
