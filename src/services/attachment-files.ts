/**
 * Writes downloaded attachment bytes into the app cache and returns the file URI.
 * Kept apart from `MailService` so the service stays testable without native modules.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { Attachment } from '@/domain/models';
import { base64ToBytes } from '@/providers/gmail/gmail-codec';

export type AttachmentWriter = (attachment: Attachment, base64: string) => Promise<string>;

function safeName(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, '_').slice(-80) || 'fichier';
}

export const writeAttachmentToCache: AttachmentWriter = async (attachment, base64) => {
  const directory = new Directory(Paths.cache, 'attachments');
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, `${attachment.id}_${safeName(attachment.filename)}`);
  file.create({ overwrite: true });
  file.write(base64ToBytes(base64));
  return file.uri;
};
