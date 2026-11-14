import {
  base64ToBytes,
  buildRawMessage,
  repairMojibake,
  bytesToBase64Url,
  decodeCharset,
  decodeEncodedWords,
  gmailCategory,
  gmailMessageToRemote,
  utf8Decode,
  utf8Encode,
  type GmailMessage,
} from '@/providers/gmail/gmail-codec';

function b64url(text: string): string {
  return bytesToBase64Url(utf8Encode(text));
}

describe('gmail codec', () => {
  it('round-trips UTF-8 through base64url, including emoji', () => {
    const text = 'Élève « café » ☕ 😀';
    expect(utf8Decode(base64ToBytes(b64url(text)))).toBe(text);
  });

  it('decodes Latin-1 / Windows-1252 bodies', () => {
    expect(
      decodeCharset(Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80]), 'windows-1252'),
    ).toBe('café €');
  });

  it('decodes RFC 2047 encoded words (B and Q)', () => {
    expect(decodeEncodedWords('=?UTF-8?B?w4l0w6k=?= =?UTF-8?Q?_caf=C3=A9?=')).toBe('Été café');
  });

  it('maps a multipart Gmail message onto a RemoteMessage', () => {
    const message: GmailMessage = {
      id: '18c0ffee',
      labelIds: ['INBOX', 'UNREAD', 'STARRED'],
      internalDate: '1700000000123',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Alice Martin <alice@example.com>' },
          { name: 'To', value: 'moi@gmail.com, "Bob, B." <bob@example.com>' },
          { name: 'Subject', value: 'Réunion' },
          { name: 'Message-ID', value: '<abc@example.com>' },
          { name: 'In-Reply-To', value: '<parent@example.com>' },
        ],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: b64url('Bonjour à tous') } },
              { mimeType: 'text/html', body: { data: b64url('<p>Bonjour à tous</p>') } },
            ],
          },
          {
            mimeType: 'application/pdf',
            filename: 'ordre.pdf',
            body: { attachmentId: 'att1', size: 48213 },
          },
        ],
      },
    };

    expect(gmailMessageToRemote(message, 'INBOX')).toEqual({
      remoteUid: 1700000000123,
      folderRemoteId: 'INBOX',
      messageIdHeader: '<abc@example.com>',
      inReplyTo: '<parent@example.com>',
      referencesHeader: null,
      senderName: 'Alice Martin',
      senderAddress: 'alice@example.com',
      to: [
        { name: 'moi@gmail.com', address: 'moi@gmail.com' },
        { name: 'Bob, B.', address: 'bob@example.com' },
      ],
      cc: [],
      subject: 'Réunion',
      bodyText: 'Bonjour à tous',
      bodyHtml: '<p>Bonjour à tous</p>',
      receivedAt: 1700000000123,
      isRead: false,
      isStarred: true,
      hasAttachments: true,
      attachments: [
        {
          filename: 'ordre.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 48213,
          remotePartId: 'att1',
        },
      ],
      listUnsubscribe: '',
      listUnsubscribePost: null,
      category: 'primary',
    });
  });

  it('builds a raw RFC 5322 message with encoded non-ASCII headers and body', () => {
    const raw = buildRawMessage('moi@gmail.com', {
      to: [{ name: 'Élodie', address: 'elodie@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Été',
      bodyText: 'Ligne 1\nLigne 2 ☕',
      inReplyTo: '<parent@example.com>',
      references: '<parent@example.com>',
    });
    const decoded = utf8Decode(base64ToBytes(raw));

    expect(raw).not.toMatch(/[+/=]/);
    expect(decoded).toContain('From: moi@gmail.com\r\n');
    expect(decoded).toContain('To: =?UTF-8?B?w4lsb2RpZQ==?= <elodie@example.com>\r\n');
    expect(decoded).toContain('Subject: =?UTF-8?B?w4l0w6k=?=\r\n');
    expect(decoded).toContain('In-Reply-To: <parent@example.com>\r\n');

    const body = decoded.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(utf8Decode(base64ToBytes(body))).toBe('Ligne 1\r\nLigne 2 ☕');
  });
});

describe('gmailCategory', () => {
  it('maps Gmail tab labels, defaulting inbox mail to primary', () => {
    expect(gmailCategory(['INBOX', 'CATEGORY_PROMOTIONS'])).toBe('promotions');
    expect(gmailCategory(['INBOX', 'CATEGORY_FORUMS'])).toBe('forums');
    expect(gmailCategory(['INBOX'])).toBe('primary');
    expect(gmailCategory(['SENT'])).toBeNull();
  });

  it('builds a multipart message when files are attached', () => {
    const raw = buildRawMessage('moi@gmail.com', {
      to: [{ name: '', address: 'bob@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Devis',
      bodyText: 'Ci-joint.',
      attachments: [
        { filename: 'devis été.pdf', mimeType: 'application/pdf', base64: 'JVBERi0xLjQ=' },
      ],
    });
    const decoded = utf8Decode(base64ToBytes(raw));
    expect(decoded).toMatch(/Content-Type: multipart\/mixed; boundary="mailyo_/);
    expect(decoded).toContain('Content-Type: application/pdf; name="=?UTF-8?B?');
    expect(decoded).toContain('Content-Disposition: attachment; filename=');
    expect(decoded).toContain('JVBERi0xLjQ=');
    expect(decoded.trim().endsWith('--')).toBe(true);
  });

  it('repairs UTF-8 text mislabelled as Latin-1, and leaves real text alone', () => {
    expect(repairMojibake('Livrables S22 Â· Fullstack A')).toBe('Livrables S22 · Fullstack A');
    expect(repairMojibake('RÃ©union demain')).toBe('Réunion demain');
    expect(repairMojibake('Itâ€™s ok')).toBe('It’s ok');
    expect(repairMojibake('Réunion · café')).toBe('Réunion · café');
    expect(repairMojibake('Âge')).toBe('Âge');
  });
});
