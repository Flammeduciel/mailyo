/**
 * Pending operation queue repository (outbox for local actions).
 */

import type { Database, SqlValue } from '@/data/db/database';
import type {
  PendingOperation,
  PendingOperationStatus,
  PendingOperationType,
} from '@/domain/models';

interface PendingOperationRow {
  id: string;
  account_id: string;
  message_id: string | null;
  operation_type: string;
  payload_json: string;
  created_at: number;
  retry_count: number;
  status: string;
  last_error: string | null;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapOperation(row: PendingOperationRow): PendingOperation {
  return {
    id: row.id,
    accountId: row.account_id,
    messageId: row.message_id,
    operationType: row.operation_type as PendingOperationType,
    payload: parsePayload(row.payload_json),
    createdAt: row.created_at,
    retryCount: row.retry_count,
    status: row.status as PendingOperationStatus,
    lastError: row.last_error,
  };
}

export async function enqueueOperation(db: Database, op: PendingOperation): Promise<void> {
  await db.runAsync(
    `INSERT INTO pending_operations
       (id, account_id, message_id, operation_type, payload_json, created_at, retry_count, status, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       message_id = excluded.message_id,
       operation_type = excluded.operation_type,
       payload_json = excluded.payload_json,
       created_at = excluded.created_at,
       retry_count = excluded.retry_count,
       status = excluded.status,
       last_error = excluded.last_error`,
    [
      op.id,
      op.accountId,
      op.messageId,
      op.operationType,
      JSON.stringify(op.payload),
      op.createdAt,
      op.retryCount,
      op.status,
      op.lastError,
    ],
  );
}

export async function listPendingOperations(
  db: Database,
  accountId?: string,
): Promise<PendingOperation[]> {
  const conditions = ["status = 'pending'"];
  const params: SqlValue[] = [];
  if (accountId !== undefined) {
    conditions.push('account_id = ?');
    params.push(accountId);
  }
  const rows = await db.getAllAsync<PendingOperationRow>(
    `SELECT * FROM pending_operations WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`,
    params,
  );
  return rows.map(mapOperation);
}

export async function getOperation(db: Database, id: string): Promise<PendingOperation | null> {
  const row = await db.getFirstAsync<PendingOperationRow>(
    'SELECT * FROM pending_operations WHERE id = ?',
    [id],
  );
  return row ? mapOperation(row) : null;
}

export async function updateOperationStatus(
  db: Database,
  id: string,
  status: PendingOperationStatus,
  update?: { retryCount?: number; lastError?: string | null; messageId?: string | null },
): Promise<void> {
  const assignments = ['status = ?'];
  const params: SqlValue[] = [status];

  if (update?.retryCount !== undefined) {
    assignments.push('retry_count = ?');
    params.push(update.retryCount);
  }
  if (update?.lastError !== undefined) {
    assignments.push('last_error = ?');
    params.push(update.lastError);
  }
  if (update?.messageId !== undefined) {
    assignments.push('message_id = ?');
    params.push(update.messageId);
  }

  params.push(id);
  await db.runAsync(`UPDATE pending_operations SET ${assignments.join(', ')} WHERE id = ?`, params);
}

export async function deleteOperation(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM pending_operations WHERE id = ?', [id]);
}

export async function countPending(db: Database, accountId?: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM pending_operations WHERE status = 'pending' AND (? IS NULL OR account_id = ?)",
    [accountId ?? null, accountId ?? null],
  );
  return row?.count ?? 0;
}
