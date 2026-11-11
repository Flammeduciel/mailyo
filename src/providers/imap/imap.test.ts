import type { MailyoImapNative, NativeMessage } from '../../../modules/mailyo-imap';

import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { parseAutoconfig, discoverSettings } from '@/providers/imap/autoconfig';
import type { ImapAccountConfig, ImapCredentialStore } from '@/providers/imap/credentials';
import { folderRole, folderRoles, nativeToRemote } from '@/providers/imap/imap-codec';
import { ImapMailProvider } from '@/providers/imap/imap-provider';
import { isMicrosoftAddress, presetForAddress } from '@/providers/imap/presets';
import { base64ToBytes, utf8Decode } from '@/providers/gmail/gmail-codec';
import { MailService } from '@/services/mail-service';

const CONFIG: ImapAccountConfig = {
  username: 'moi@yahoo.fr',
  password: 'app-password',
  imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'ssl' },
  smtp: { host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl' },
  serviceId: 'yahoo',
};

const FOLDERS = [
  { fullName: 'INBOX', name: 'INBOX', attributes: [] },
  { fullName: 'Sent', name: 'Sent', attributes: ['\\Sent'] },
  { fullName: 'Bulk Mail', name: 'Bulk Mail', attributes: ['\\Junk'] },
  { fullName: 'Archive', name: 'Archive', attributes: ['\\Archive'] },
  { fullName: 'Trash', name: 'Trash', attributes: ['\\Trash'] },
  { fullName: 'Perso', name: 'Perso', attributes: [] },
];

function nativeMessage(uid: number, extra: Partial<NativeMessage> = {}): NativeMessage {
  return {
    uid,
    messageId: `<m${uid}@x.fr>`,
    inReplyTo: null,
    references: null,
    fromName: 'Claire',
    fromAddress: 'claire@x.fr',
    to: [{ name: '', address: 'moi@yahoo.fr' }],
    cc: [],
    subject: `Sujet ${uid}`,
    date: 1_000 * uid,
    seen: false,
    flagged: false,
    text: 'Bonjour',
    html: null,
    attachments: [],
    listUnsubscribe: null,
    listUnsubscribePost: null,
    ...extra,
  };
}

function fakeNative(
  overrides: Partial<MailyoImapNative> = {},
): MailyoImapNative & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const native = {
    calls,
    testConnection: jest.fn(async () => true),
    listFolders: jest.fn(async () => FOLDERS),
    fetchMessages: jest.fn(async (_imap, folder: string) => ({
      uidValidity: 7,
      messages: folder === 'INBOX' ? [nativeMessage(2), nativeMessage(1)] : [],
    })),
    fetchOlder: jest.fn(async () => []),
    setFlag: jest.fn(async (...args: unknown[]) => {
      calls.push(['setFlag', ...args.slice(1)]);
      return true;
    }),
    moveMessage: jest.fn(async (...args: unknown[]) => {
      calls.push(['move', ...args.slice(1)]);
      return true;
    }),
    downloadAttachment: jest.fn(async () => 'SGVsbG8='),
    fetchHeaders: jest.fn(async () => ({
      'List-Unsubscribe': '<https://x.fr/u>',
      'List-Unsubscribe-Post': null,
    })),
    sendRaw: jest.fn(async (...args: unknown[]) => {
      calls.push(['send', ...args.slice(1)]);
      return true;
    }),
    disconnect: jest.fn(async () => true),
    ...overrides,
  };
  return native as unknown as MailyoImapNative & { calls: unknown[][] };
}

class MemoryCredentials implements ImapCredentialStore {
  readonly saved = new Map<string, ImapAccountConfig>();
  async save(id: string, config: ImapAccountConfig) {
    this.saved.set(id, config);
  }
  async load(id: string) {
    return this.saved.get(id) ?? null;
  }
  async remove(id: string) {
    this.saved.delete(id);
  }
}

describe('IMAP folders and messages', () => {
  it('recognises folder roles from SPECIAL-USE flags and usual names', () => {
    expect(folderRoles(FOLDERS)).toEqual({
      inbox: 'INBOX',
      sent: 'Sent',
      spam: 'Bulk Mail',
      archive: 'Archive',
      trash: 'Trash',
    });
    expect(
      folderRole({ fullName: 'Éléments envoyés', name: 'Éléments envoyés', attributes: [] }),
    ).toBe('sent');
    expect(folderRole({ fullName: '[Gmail]/Spam', name: 'Spam', attributes: [] })).toBe('spam');
    expect(
      folderRole({
        fullName: 'Courrier indésirable',
        name: 'Courrier indésirable',
        attributes: [],
      }),
    ).toBe('spam');
  });

  it('maps a native message, with attachments and newsletter category', () => {
    const remote = nativeToRemote(
      nativeMessage(5, {
        attachments: [
          { filename: 'devis.pdf', mimeType: 'application/pdf', size: 3000, partPath: '2' },
        ],
        listUnsubscribe: '<mailto:u@x.fr>',
        subject: 'RÃ©union',
      }),
      'INBOX',
    );
    expect(remote).toMatchObject({
      remoteUid: 5,
      folderRemoteId: 'INBOX',
      subject: 'Réunion',
      hasAttachments: true,
      category: 'updates',
      attachments: [{ filename: 'devis.pdf', sizeBytes: 3000, remotePartId: '2' }],
    });
  });
});

describe('server discovery', () => {
  it('uses the known services first and recognises Microsoft addresses', async () => {
    expect(presetForAddress('Moi@Yahoo.fr')?.id).toBe('yahoo');
    expect(isMicrosoftAddress('a@hotmail.fr')).toBe(true);
    const found = await discoverSettings('a@orange.fr', jest.fn());
    expect(found).toMatchObject({ source: 'preset', imap: { host: 'imap.orange.fr' } });
  });

  it('parses Thunderbird autoconfig and never offers clear-text servers', async () => {
    const xml = `<clientConfig><emailProvider>
      <incomingServer type="imap"><hostname>plain.ex.fr</hostname><port>143</port><socketType>plain</socketType></incomingServer>
      <incomingServer type="imap"><hostname>mail.ex.fr</hostname><port>993</port><socketType>SSL</socketType></incomingServer>
      <outgoingServer type="smtp"><hostname>smtp.ex.fr</hostname><port>587</port><socketType>STARTTLS</socketType></outgoingServer>
    </emailProvider></clientConfig>`;
    expect(parseAutoconfig(xml)).toEqual({
      imap: { host: 'mail.ex.fr', port: 993, security: 'ssl' },
      smtp: { host: 'smtp.ex.fr', port: 587, security: 'starttls' },
    });
    const fetchImpl = jest.fn(
      async () => ({ ok: true, text: async () => xml }) as unknown as Response,
    );
    const found = await discoverSettings('a@ex.fr', fetchImpl as unknown as typeof fetch);
    expect(found.source).toBe('autoconfig');
    expect(fetchImpl).toHaveBeenCalledWith('https://autoconfig.thunderbird.net/v1.1/ex.fr');
  });
});

describe('ImapMailProvider', () => {
  function provider(native = fakeNative(), lookup: string | null = 'INBOX') {
    return {
      native,
      provider: new ImapMailProvider({
        emailAddress: 'moi@yahoo.fr',
        loadConfig: async () => CONFIG,
        native: () => native,
        lookupFolder: async () => lookup,
      }),
    };
  }

  it('lists the synced folders and fetches mail oldest first', async () => {
    const { provider: p } = provider();
    expect((await p.listFolders()).map((f) => f.role)).toEqual(['inbox', 'sent', 'spam']);
    const result = await p.fetchMessages({
      folderRemoteId: 'INBOX',
      knownUidValidity: null,
      lastSyncedUid: null,
    });
    expect(result.uidValidity).toBe(7);
    expect(result.messages.map((m) => m.remoteUid)).toEqual([1, 2]);
  });

  it('moves to the right folders and sets flags in the message folder', async () => {
    const { provider: p, native } = provider(fakeNative(), 'Bulk Mail');
    await p.setSpam(9, false);
    await p.moveToTrash(9);
    await p.setRead(9, true);
    expect(native.calls).toEqual([
      ['move', 'Bulk Mail', 9, 'INBOX'],
      ['move', 'Bulk Mail', 9, 'Trash'],
      ['setFlag', 'Bulk Mail', 9, 'seen', true],
    ]);
  });

  it('sends the raw MIME through SMTP, to every recipient, with a copy in Sent', async () => {
    const { provider: p, native } = provider();
    const result = await p.send({
      to: [{ name: 'Claire', address: 'claire@x.fr' }],
      cc: [{ name: '', address: 'bob@x.fr' }],
      bcc: [{ name: '', address: 'cache@x.fr' }],
      subject: 'Été',
      bodyText: 'Coucou',
      messageId: '<id-1@yahoo.fr>',
      date: Date.UTC(2026, 10, 11, 15, 0),
    });
    expect(result).toEqual({ status: 'sent', remoteId: '<id-1@yahoo.fr>' });
    const [, raw, recipients, , sent] = native.calls[0] as [
      string,
      string,
      string[],
      unknown,
      string,
    ];
    expect(recipients).toEqual(['claire@x.fr', 'bob@x.fr', 'cache@x.fr']);
    expect(sent).toBe('Sent');
    const mime = utf8Decode(base64ToBytes(raw));
    expect(mime).toContain('Message-ID: <id-1@yahoo.fr>\r\n');
    expect(mime).toContain('Date: Wed, 11 Nov 2026 15:00:00 +0000\r\n');
  });

  it('reports a refused login as a failure, not an ambiguous send', async () => {
    const native = fakeNative({
      sendRaw: jest.fn(async () => {
        throw new Error('SMTP : identifiant ou mot de passe refusé');
      }),
    });
    const { provider: p } = provider(native);
    const result = await p.send({
      to: [{ name: '', address: 'a@x.fr' }],
      cc: [],
      bcc: [],
      subject: 's',
      bodyText: 'b',
    });
    expect(result.status).toBe('failed');
  });
});

describe('MailService with an IMAP account', () => {
  it('tests the servers, stores the password securely and syncs the inbox', async () => {
    const db = await createMigratedDatabase();
    const credentials = new MemoryCredentials();
    const native = fakeNative();
    const service = new MailService({ db, imapCredentials: credentials, imapNative: () => native });

    const account = await service.connectImapAccount({
      emailAddress: 'moi@yahoo.fr',
      config: CONFIG,
    });
    expect(account).toMatchObject({ provider: 'imap', authType: 'password' });
    expect(native.testConnection).toHaveBeenCalled();
    expect(credentials.saved.get(account.id)?.password).toBe('app-password');

    await service.syncAll();
    const threads = await service.listConversations();
    expect(threads.map((t) => t.lastMessage.subject).sort()).toEqual(['Sujet 1', 'Sujet 2']);

    await service.signOutAccount(account.id);
    expect(credentials.saved.size).toBe(0);
  });

  it('does not create the account when the login is refused', async () => {
    const db = await createMigratedDatabase();
    const native = fakeNative({
      testConnection: jest.fn(async () => {
        throw new Error('Identifiant ou mot de passe refusé par le serveur');
      }),
    });
    const service = new MailService({
      db,
      imapCredentials: new MemoryCredentials(),
      imapNative: () => native,
    });
    await expect(
      service.connectImapAccount({ emailAddress: 'moi@yahoo.fr', config: CONFIG }),
    ).rejects.toThrow('refusé');
    expect(await service.listAccounts()).toHaveLength(0);
  });
});
