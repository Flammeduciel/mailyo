/**
 * Pure helpers describing an attachment to the user: its kind (image, video,
 * PDF…), a readable size and a short type label.
 */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'archive' | 'file';

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  pdf: 'application/pdf',
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/** The declared MIME type, or one guessed from the extension when it is generic. */
export function effectiveMimeType(mimeType: string, filename: string): string {
  const declared = mimeType.trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') {
    return declared;
  }
  return EXTENSION_MIME[extensionOf(filename)] ?? (declared || 'application/octet-stream');
}

export function attachmentKind(mimeType: string, filename: string): AttachmentKind {
  const mime = effectiveMimeType(mimeType, filename);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (/zip|rar|7z|tar|gzip/.test(mime)) return 'archive';
  if (/word|excel|sheet|powerpoint|presentation|opendocument|rtf|^text\//.test(mime)) {
    return 'document';
  }
  return 'file';
}

/** Whether the app can show an in-app preview for this kind. */
export function isPreviewable(kind: AttachmentKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'pdf';
}

/** "850 o", "12,4 Ko", "3,2 Mo" (French units and decimal comma). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 o';
  }
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) {
    return `${Math.round(value)} o`;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}

/** Short upper-case type shown next to the size: "PDF", "JPEG", "MP4"… */
export function typeLabel(mimeType: string, filename: string): string {
  const ext = extensionOf(filename);
  if (ext && ext.length <= 5) {
    return ext === 'jpg' ? 'JPEG' : ext.toUpperCase();
  }
  const subtype = effectiveMimeType(mimeType, filename).split('/')[1] ?? '';
  return (subtype.split(/[+.;-]/)[0] || 'Fichier').toUpperCase();
}
