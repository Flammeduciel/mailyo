import {
  attachmentKind,
  effectiveMimeType,
  formatFileSize,
  isPreviewable,
  typeLabel,
} from '@/domain/attachments';

describe('attachments domain', () => {
  it('formats sizes with French units', () => {
    expect(formatFileSize(0)).toBe('0 o');
    expect(formatFileSize(850)).toBe('850 o');
    expect(formatFileSize(12_700)).toBe('12,4 Ko');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3 Mo');
    expect(formatFileSize(1_057_149)).toBe('1 Mo');
  });

  it('detects the kind from the MIME type, falling back to the extension', () => {
    expect(attachmentKind('image/png', 'a.png')).toBe('image');
    expect(attachmentKind('video/mp4', 'a.mp4')).toBe('video');
    expect(attachmentKind('application/pdf', 'a.pdf')).toBe('pdf');
    expect(attachmentKind('application/octet-stream', 'scan.PDF')).toBe('pdf');
    expect(attachmentKind('application/zip', 'a.zip')).toBe('archive');
    expect(attachmentKind('application/octet-stream', 'blob')).toBe('file');
    expect(effectiveMimeType('', 'photo.jpg')).toBe('image/jpeg');
  });

  it('labels types and flags previewable kinds', () => {
    expect(typeLabel('image/jpeg', 'photo.jpg')).toBe('JPEG');
    expect(typeLabel('application/pdf', 'doc.pdf')).toBe('PDF');
    expect(typeLabel('application/pdf', 'sans-extension')).toBe('PDF');
    expect(isPreviewable('pdf')).toBe(true);
    expect(isPreviewable('archive')).toBe(false);
  });
});
