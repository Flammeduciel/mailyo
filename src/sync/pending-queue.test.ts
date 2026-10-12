import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { enqueueOperation, getOperation, listPendingOperations } from '@/data/repositories';
import type { PendingOperation } from '@/domain/models';
import {
  processPendingOperations,
  sendResultToOutcome,
  type OperationExecutor,
  type OperationOutcome,
} from '@/sync/pending-queue';

const BASE = 1_700_000_000_000;

function operation(overrides: Partial<PendingOperation> = {}): PendingOperation {
  return {
    id: overrides.id ?? 'op_1',
    accountId: overrides.accountId ?? 'acc_1',
    messageId: overrides.messageId ?? 'msg_1',
    operationType: overrides.operationType ?? 'archive',
    payload: overrides.payload ?? { remoteUid: 12 },
    createdAt: overrides.createdAt ?? BASE,
    retryCount: overrides.retryCount ?? 0,
    status: overrides.status ?? 'pending',
    lastError: overrides.lastError ?? null,
  };
}

function executorReturning(outcome: OperationOutcome): OperationExecutor {
  return { execute: jest.fn(async () => outcome) };
}

describe('pending queue', () => {
  it('marks a done operation and removes it from the pending list', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation());

    const report = await processPendingOperations({
      db,
      executor: executorReturning({ kind: 'done' }),
    });

    expect(report).toEqual({ processed: 1, done: 1, deferred: 0, failed: 0, conflicts: 0 });
    expect(await listPendingOperations(db)).toHaveLength(0);
    expect((await getOperation(db, 'op_1'))?.status).toBe('done');
  });

  it('defers a retryable failure and keeps it pending', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation());

    const report = await processPendingOperations({
      db,
      executor: executorReturning({ kind: 'retry', error: 'réseau indisponible' }),
      maxRetries: 3,
    });

    expect(report.deferred).toBe(1);
    const stored = await getOperation(db, 'op_1');
    expect(stored?.status).toBe('pending');
    expect(stored?.retryCount).toBe(1);
    expect(stored?.lastError).toBe('réseau indisponible');
  });

  it('gives up after maxRetries', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation({ retryCount: 2 }));

    const report = await processPendingOperations({
      db,
      executor: executorReturning({ kind: 'retry', error: 'toujours en échec' }),
      maxRetries: 3,
    });

    expect(report.failed).toBe(1);
    expect((await getOperation(db, 'op_1'))?.status).toBe('failed');
  });

  it('never blindly retries an ambiguous send', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation({ operationType: 'send' }));

    const report = await processPendingOperations({
      db,
      executor: executorReturning({ kind: 'ambiguous', error: 'connexion coupée' }),
    });

    expect(report.failed).toBe(1);
    const stored = await getOperation(db, 'op_1');
    expect(stored?.status).toBe('failed');
    expect(stored?.lastError).toBe('statut à vérifier : connexion coupée');
    expect(await listPendingOperations(db)).toHaveLength(0);
  });

  it('parks conflicts with an explicit status', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation());

    const report = await processPendingOperations({
      db,
      executor: executorReturning({ kind: 'conflict', error: 'UID distant manquant' }),
    });

    expect(report.conflicts).toBe(1);
    expect((await getOperation(db, 'op_1'))?.status).toBe('conflict');
  });

  it('treats a thrown executor error as retryable', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation());

    const executor: OperationExecutor = {
      execute: jest.fn(async () => {
        throw new Error('boom');
      }),
    };

    const report = await processPendingOperations({ db, executor, maxRetries: 5 });
    expect(report.deferred).toBe(1);
    expect((await getOperation(db, 'op_1'))?.lastError).toBe('boom');
  });

  it('only processes an account when filtered', async () => {
    const db = await createMigratedDatabase();
    await enqueueOperation(db, operation({ id: 'a', accountId: 'acc_1' }));
    await enqueueOperation(db, operation({ id: 'b', accountId: 'acc_2' }));

    const report = await processPendingOperations({
      db,
      executor: executorReturning({ kind: 'done' }),
      accountId: 'acc_1',
    });

    expect(report.processed).toBe(1);
    expect(await listPendingOperations(db)).toHaveLength(1);
  });

  it('maps send results to queue outcomes', () => {
    expect(sendResultToOutcome({ status: 'sent' })).toEqual({ kind: 'done' });
    expect(sendResultToOutcome({ status: 'ambiguous' })).toEqual({
      kind: 'ambiguous',
      error: 'résultat inconnu',
    });
    expect(sendResultToOutcome({ status: 'failed', error: 'refusé' })).toEqual({
      kind: 'retry',
      error: 'refusé',
    });
  });
});
