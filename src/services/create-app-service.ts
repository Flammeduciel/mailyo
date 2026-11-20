/**
 * The fully wired MailService used by the app and by the background sync
 * task: notifications, OAuth tokens (Gmail) and IMAP credentials.
 */

import Constants from 'expo-constants';

import type { Database } from '@/data/db/database';
import { createExpoNotificationApi, Notifier } from '@/notifications/notifier';
import { SecureTokenStore } from '@/providers';
import { SecureImapCredentialStore } from '@/providers/imap/credentials';
import { MailService } from '@/services/mail-service';
import { getMailyoImap } from '../../modules/mailyo-imap';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export function createAppMailService(db: Database): MailService {
  return new MailService({
    db,
    notifier: new Notifier(createExpoNotificationApi(), (accountId, uid) => {
      getMailyoImap().dismissMail(accountId, uid);
    }),
    tokenStore: new SecureTokenStore(),
    gmailClientId: (extra.gmailClientId as string | undefined) ?? '',
    gmailPush: {
      relayUrl: (extra.relayUrl as string | undefined) ?? '',
      topicName: (extra.gmailPushTopic as string | undefined) ?? '',
    },
    imapCredentials: new SecureImapCredentialStore(),
    imapNative: getMailyoImap,
  });
}
