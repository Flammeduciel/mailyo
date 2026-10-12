import type { Database } from '@/data/db/database';
import {
  countPending,
  deleteOperation,
  enqueueOperation,
  getOperation,
  listPendingOperations,
  updateOperationStatus,
} from '@/data/repositories/pending-operations';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { PendingOperation } from '@/domain/models';

function operation(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    id: 'op_1',
    accountId: 'acc_1',
    messageId: 'msg_1',
    operationType: 'markRead',
    payload: { read: true },
    createdAt: 1_000,
    retryCount: 0,
    status: 'pending',
    lastError: null,
    ...overrides,
  };
}

describe('pending-operations repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('round-trips the payload object and nullable fields', async () => {
    await enqueueOperation(db, operation({ messageId: null, payload: { a: 1, b: 'x' } }));
    expect(await getOperation(db, 'op_1')).toEqual(
      operation({ messageId: null, payload: { a: 1, b: 'x' } }),
    );
  });

  it('enqueues idempotently', async () => {
    await enqueueOperation(db, operation());
    await enqueueOperation(db, operation({ retryCount: 2 }));

    const ops = await listPendingOperations(db);
    expect(ops).toHaveLength(1);
    expect(ops[0].retryCount).toBe(2);
  });

  it('lists only pending operations ordered by created_at', async () => {
    await enqueueOperation(db, operation({ id: 'p2', createdAt: 2_000 }));
    await enqueueOperation(db, operation({ id: 'p1', createdAt: 1_000 }));
    await enqueueOperation(db, operation({ id: 'done', createdAt: 3_000, status: 'done' }));

    expect((await listPendingOperations(db)).map((o) => o.id)).toEqual(['p1', 'p2']);
    expect(await countPending(db)).toBe(2);
  });

  it('moves an operation out of the pending queue via updateOperationStatus', async () => {
    await enqueueOperation(db, operation());

    await updateOperationStatus(db, 'op_1', 'failed', {
      retryCount: 3,
      lastError: 'boom',
      messageId: null,
    });

    expect(await listPendingOperations(db)).toEqual([]);
    const loaded = await getOperation(db, 'op_1');
    expect(loaded?.status).toBe('failed');
    expect(loaded?.retryCount).toBe(3);
    expect(loaded?.lastError).toBe('boom');
    expect(loaded?.messageId).toBeNull();
  });

  it('filters and counts by account', async () => {
    await enqueueOperation(db, operation({ id: 'a1', accountId: 'acc_1' }));
    await enqueueOperation(db, operation({ id: 'a2', accountId: 'acc_2' }));

    expect((await listPendingOperations(db, 'acc_2')).map((o) => o.id)).toEqual(['a2']);
    expect(await countPending(db, 'acc_1')).toBe(1);
  });

  it('deletes an operation', async () => {
    await enqueueOperation(db, operation());
    await deleteOperation(db, 'op_1');
    expect(await getOperation(db, 'op_1')).toBeNull();
  });
});
