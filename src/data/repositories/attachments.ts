/**
 * Attachment repository (metadata only: bytes live in the file cache).
 */

import type { Database } from '@/data/db/database';
import type { Attachment } from '@/domain/models';

interface AttachmentRow {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  remote_part_id: string | null;
  local_path: string | null;
  download_state: string;
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    messageId: row.message_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    remotePartId: row.remote_part_id,
    localPath: row.local_path,
    downloadState: row.download_state as Attachment['downloadState'],
  };
}

/**
 * Replace the attachments of a message with the freshly synced list, keeping
 * the local copy of the ones already downloaded.
 */
export async function replaceMessageAttachments(
  db: Database,
  messageId: string,
  attachments: Attachment[],
): Promise<void> {
  const existing = await listAttachmentsByMessage(db, messageId);
  const downloaded = new Map(existing.filter((a) => a.localPath).map((a) => [a.id, a] as const));
  await db.runAsync('DELETE FROM attachments WHERE message_id = ?', [messageId]);
  for (const attachment of attachments) {
    const kept = downloaded.get(attachment.id);
    const localPath = attachment.localPath ?? kept?.localPath ?? null;
    await db.runAsync(
      `INSERT INTO attachments
         (id, message_id, filename, mime_type, size_bytes, remote_part_id, local_path, download_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attachment.id,
        attachment.messageId,
        attachment.filename,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.remotePartId,
        localPath,
        localPath ? 'downloaded' : attachment.downloadState,
      ],
    );
  }
}

export async function listAttachmentsByMessage(
  db: Database,
  messageId: string,
): Promise<Attachment[]> {
  const rows = await db.getAllAsync<AttachmentRow>(
    'SELECT * FROM attachments WHERE message_id = ? ORDER BY rowid',
    [messageId],
  );
  return rows.map(mapAttachment);
}

export async function listAttachmentsByThread(
  db: Database,
  threadId: string,
): Promise<Attachment[]> {
  const rows = await db.getAllAsync<AttachmentRow>(
    `SELECT a.* FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE m.thread_id = ?
      ORDER BY m.received_at, a.rowid`,
    [threadId],
  );
  return rows.map(mapAttachment);
}

export async function getAttachment(db: Database, id: string): Promise<Attachment | null> {
  const row = await db.getFirstAsync<AttachmentRow>('SELECT * FROM attachments WHERE id = ?', [id]);
  return row ? mapAttachment(row) : null;
}

export async function setAttachmentDownloaded(
  db: Database,
  id: string,
  localPath: string,
): Promise<void> {
  await db.runAsync(
    "UPDATE attachments SET local_path = ?, download_state = 'downloaded' WHERE id = ?",
    [localPath, id],
  );
}

export async function setAttachmentState(
  db: Database,
  id: string,
  state: Attachment['downloadState'],
): Promise<void> {
  await db.runAsync('UPDATE attachments SET download_state = ? WHERE id = ?', [state, id]);
}

/** Forget local copies stored in the app cache (remote https: sources are kept). */
export async function clearDownloadedAttachmentPaths(db: Database): Promise<void> {
  await db.runAsync(
    "UPDATE attachments SET local_path = NULL, download_state = 'remote' WHERE local_path LIKE 'file:%' AND remote_part_id IS NOT NULL",
  );
}

/** Attachments of starred messages that have no local copy yet. */
export async function listStarredRemoteAttachments(db: Database): Promise<Attachment[]> {
  const rows = await db.getAllAsync<AttachmentRow>(
    `SELECT a.* FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE m.is_starred = 1 AND a.local_path IS NULL AND a.remote_part_id IS NOT NULL`,
  );
  return rows.map(mapAttachment);
}

/** An attachment found by name, with what is needed to open its conversation. */
export interface FileSearchHit {
  attachment: Attachment;
  threadId: string;
  senderName: string;
  receivedAt: number;
}

export async function searchAttachmentsByName(
  db: Database,
  query: string,
  limit = 100,
): Promise<FileSearchHit[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db.getAllAsync<
    AttachmentRow & {
      thread_id: string;
      sender_name: string;
      sender_address: string;
      received_at: number;
    }
  >(
    `SELECT a.*, m.thread_id, m.sender_name, m.sender_address, m.received_at
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE a.filename LIKE ? ESCAPE '\\'
      ORDER BY m.received_at DESC
      LIMIT ?`,
    [pattern, limit],
  );
  return rows.map((row) => ({
    attachment: mapAttachment(row),
    threadId: row.thread_id,
    senderName: row.sender_name || row.sender_address,
    receivedAt: row.received_at,
  }));
}
