/**
 * Draft repository.
 */

import type { Database } from '@/data/db/database';
import type { Draft, EmailAddress, SyncState } from '@/domain/models';

interface DraftRow {
  id: string;
  account_id: string;
  remote_draft_id: string | null;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  body: string;
  updated_at: number;
  sync_state: string;
}

function parseAddresses(value: string): EmailAddress[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as EmailAddress[]) : [];
  } catch {
    return [];
  }
}

function mapDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    accountId: row.account_id,
    remoteDraftId: row.remote_draft_id,
    to: parseAddresses(row.to_json),
    cc: parseAddresses(row.cc_json),
    bcc: parseAddresses(row.bcc_json),
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at,
    syncState: row.sync_state as SyncState,
  };
}

export async function upsertDraft(db: Database, draft: Draft): Promise<void> {
  await db.runAsync(
    `INSERT INTO drafts
       (id, account_id, remote_draft_id, to_json, cc_json, bcc_json, subject, body, updated_at, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       remote_draft_id = excluded.remote_draft_id,
       to_json = excluded.to_json,
       cc_json = excluded.cc_json,
       bcc_json = excluded.bcc_json,
       subject = excluded.subject,
       body = excluded.body,
       updated_at = excluded.updated_at,
       sync_state = excluded.sync_state`,
    [
      draft.id,
      draft.accountId,
      draft.remoteDraftId,
      JSON.stringify(draft.to),
      JSON.stringify(draft.cc),
      JSON.stringify(draft.bcc),
      draft.subject,
      draft.body,
      draft.updatedAt,
      draft.syncState,
    ],
  );
}

export async function getDraft(db: Database, id: string): Promise<Draft | null> {
  const row = await db.getFirstAsync<DraftRow>('SELECT * FROM drafts WHERE id = ?', [id]);
  return row ? mapDraft(row) : null;
}

export async function listDrafts(db: Database, accountId: string): Promise<Draft[]> {
  const rows = await db.getAllAsync<DraftRow>(
    'SELECT * FROM drafts WHERE account_id = ? ORDER BY updated_at DESC',
    [accountId],
  );
  return rows.map(mapDraft);
}

export async function deleteDraft(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM drafts WHERE id = ?', [id]);
}
