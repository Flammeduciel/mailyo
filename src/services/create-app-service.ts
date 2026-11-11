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

export function createAppMailService(db: Database): MailService {
  return new MailService({
    db,
    notifier: new Notifier(createExpoNotificationApi()),
    tokenStore: new SecureTokenStore(),
    gmailClientId: (Constants.expoConfig?.extra?.gmailClientId as string | undefined) ?? '',
    imapCredentials: new SecureImapCredentialStore(),
    imapNative: getMailyoImap,
  });
}
