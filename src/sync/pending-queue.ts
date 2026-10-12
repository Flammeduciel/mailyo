/**
 * Offline / retry queue for user actions.
 *
 * Actions that need the server (send, archive, mark read...) are persisted in
 * `pending_operations` so a network failure never silently loses the user's
 * intent. The queue is *not* a blind retry loop: an ambiguous SMTP result is
 * parked as `failed` with a "statut à vérifier" marker instead of being resent
 * (plan §7 and §16).
 */

import { updateOperationStatus, listPendingOperations } from '@/data/repositories';
import type { Database } from '@/data/db/database';
import type { MailProvider } from '@/providers/types';
import type { PendingOperation, PendingOperationStatus } from '@/domain/models';

export type OperationOutcome =
  | { kind: 'done' }
  | { kind: 'retry'; error: string }
  | { kind: 'ambiguous'; error: string }
  | { kind: 'conflict'; error: string };

export interface OperationExecutor {
  execute(operation: PendingOperation): Promise<OperationOutcome>;
}

export interface ProcessOptions {
  db: Database;
  executor: OperationExecutor;
  maxRetries?: number;
  accountId?: string;
}

export interface ProcessReport {
  processed: number;
  done: number;
  deferred: number;
  failed: number;
  conflicts: number;
}

/** Run every pending operation once. Safe to call repeatedly. */
export async function processPendingOperations(options: ProcessOptions): Promise<ProcessReport> {
  const maxRetries = options.maxRetries ?? 5;
  const operations = await listPendingOperations(options.db, options.accountId);
  const report: ProcessReport = {
    processed: 0,
    done: 0,
    deferred: 0,
    failed: 0,
    conflicts: 0,
  };

  for (const operation of operations) {
    report.processed += 1;
    await updateOperationStatus(options.db, operation.id, 'running');

    let outcome: OperationOutcome;
    try {
      outcome = await options.executor.execute(operation);
    } catch (error) {
      outcome = { kind: 'retry', error: error instanceof Error ? error.message : String(error) };
    }

    switch (outcome.kind) {
      case 'done':
        report.done += 1;
        await updateOperationStatus(options.db, operation.id, 'done');
        break;
      case 'ambiguous':
        // Never retry an ambiguous send automatically.
        report.failed += 1;
        await updateOperationStatus(options.db, operation.id, 'failed', {
          lastError: `statut à vérifier : ${outcome.error}`,
        });
        break;
      case 'conflict':
        report.conflicts += 1;
        await updateOperationStatus(options.db, operation.id, 'conflict', {
          lastError: outcome.error,
        });
        break;
      case 'retry': {
        const retryCount = operation.retryCount + 1;
        const status: PendingOperationStatus = retryCount >= maxRetries ? 'failed' : 'pending';
        if (status === 'failed') {
          report.failed += 1;
        } else {
          report.deferred += 1;
        }
        await updateOperationStatus(options.db, operation.id, status, {
          retryCount,
          lastError: outcome.error,
        });
        break;
      }
    }
  }

  return report;
}

/** Map a provider call result onto a queue outcome. */
export function sendResultToOutcome(result: {
  status: string;
  error?: string | null;
}): OperationOutcome {
  if (result.status === 'sent') {
    return { kind: 'done' };
  }
  if (result.status === 'ambiguous') {
    return { kind: 'ambiguous', error: result.error ?? 'résultat inconnu' };
  }
  return { kind: 'retry', error: result.error ?? 'envoi refusé' };
}

/** Executor backed by a `MailProvider`. */
export function createProviderExecutor(provider: MailProvider): OperationExecutor {
  return {
    async execute(operation: PendingOperation): Promise<OperationOutcome> {
      const payload = operation.payload as Record<string, unknown>;
      const remoteUid = typeof payload.remoteUid === 'number' ? payload.remoteUid : null;

      switch (operation.operationType) {
        case 'send': {
          const result = await provider.send(payload as never);
          return sendResultToOutcome(result);
        }
        case 'markRead':
        case 'markUnread': {
          if (remoteUid === null) {
            return { kind: 'conflict', error: 'UID distant manquant' };
          }
          await provider.setRead(remoteUid, operation.operationType === 'markRead');
          return { kind: 'done' };
        }
        case 'star': {
          if (remoteUid === null) {
            return { kind: 'conflict', error: 'UID distant manquant' };
          }
          await provider.star(remoteUid, payload.isStarred === true);
          return { kind: 'done' };
        }
        case 'archive': {
          if (remoteUid === null) {
            return { kind: 'conflict', error: 'UID distant manquant' };
          }
          await provider.archive(remoteUid);
          return { kind: 'done' };
        }
        case 'delete': {
          if (remoteUid === null) {
            return { kind: 'conflict', error: 'UID distant manquant' };
          }
          await provider.moveToTrash(remoteUid);
          return { kind: 'done' };
        }
        default:
          return { kind: 'conflict', error: `opération inconnue : ${operation.operationType}` };
      }
    },
  };
}
