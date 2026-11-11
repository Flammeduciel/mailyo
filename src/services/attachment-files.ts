/**
 * Writes downloaded attachment bytes into the app cache and returns the file URI.
 * Kept apart from `MailService` so the service stays testable without native modules.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Attachment } from '@/domain/models';
import { base64ToBytes } from '@/providers/gmail/gmail-codec';

export type AttachmentWriter = (attachment: Attachment, base64: string) => Promise<string>;

function safeName(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, '_').slice(-80) || 'fichier';
}

export const writeAttachmentToCache: AttachmentWriter = async (attachment, base64) => {
  const file = new File(cacheDirectory(), `${attachment.id}_${safeName(attachment.filename)}`);
  file.create({ overwrite: true });
  file.write(base64ToBytes(base64));
  return file.uri;
};

function cacheDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'attachments');
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

/**
 * A `file://` copy of the attachment (needed to save or share it). Remote
 * `https:` sources (demo data) are downloaded into the cache first.
 */
export async function ensureLocalFile(
  attachment: Attachment,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const uri = attachment.localPath;
  if (!uri) {
    throw new Error('Pièce jointe pas encore téléchargée.');
  }
  if (!/^https?:/i.test(uri)) {
    return uri;
  }
  const destination = new File(
    cacheDirectory(),
    `${attachment.id}_${safeName(attachment.filename)}`,
  );
  if (destination.exists) {
    return destination.uri;
  }
  const task = File.createDownloadTask(uri, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(bytesWritten / totalBytes);
    },
  });
  const file = await task.downloadAsync();
  return (file ?? destination).uri;
}

/**
 * Save a copy on the device. Android: the user picks a folder (Downloads…)
 * through the system picker. iOS: the share sheet offers "Save to Files".
 * Returns false when the user cancelled.
 */
export async function saveFileToDevice(attachment: Attachment, fileUri: string): Promise<boolean> {
  if (Platform.OS === 'android') {
    let target: Directory;
    try {
      target = await Directory.pickDirectoryAsync();
    } catch {
      return false;
    }
    const created = target.createFile(attachment.filename, attachment.mimeType);
    created.write(await new File(fileUri).bytes());
    return true;
  }
  await shareFile(attachment, fileUri);
  return true;
}

export async function shareFile(attachment: Attachment, fileUri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage n’est pas disponible sur cet appareil.');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: attachment.mimeType,
    dialogTitle: attachment.filename,
  });
}

/** Total size of the attachment cache, in bytes. */
export function attachmentCacheSize(): number {
  const directory = new Directory(Paths.cache, 'attachments');
  if (!directory.exists) return 0;
  return directory
    .list()
    .reduce((sum, entry) => sum + (entry instanceof File ? (entry.size ?? 0) : 0), 0);
}

export function clearAttachmentCache(): void {
  const directory = new Directory(Paths.cache, 'attachments');
  if (directory.exists) directory.delete();
}

export async function readFileAsBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}
