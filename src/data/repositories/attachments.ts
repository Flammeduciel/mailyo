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
