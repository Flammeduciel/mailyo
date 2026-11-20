/**
 * Receives the relay's FCM data message (« new Gmail mail for X »).
 *
 * expo-notifications runs this task whether the app is on screen, in the
 * background or closed. When the app is running it syncs through its own
 * MailService (no second instance on the same database); when it is closed
 * the task builds a bare service, syncs, and the service notifies.
 *
 * Defined at module scope: imported early by the app (app-context).
 */

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { getDatabase } from '@/data/db/instance';
import { parseRelayMessage } from '@/realtime/gmail-push';
import { createAppMailService } from '@/services/create-app-service';

export const GMAIL_PUSH_TASK = 'wouah-mail.gmail-push';

/** Set by the running app: syncs right away through its own service. */
let runningAppHandler: (() => Promise<void>) | null = null;

export function setRunningAppPushHandler(handler: (() => Promise<void>) | null): void {
  runningAppHandler = handler;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(GMAIL_PUSH_TASK, async ({ data }) => {
  const message = data && !('actionIdentifier' in data) ? parseRelayMessage(data.data) : null;
  if (!message) return Notifications.BackgroundNotificationTaskResult.NoData;
  try {
    if (runningAppHandler) {
      await runningAppHandler();
    } else {
      const service = createAppMailService(await getDatabase());
      await service.initialize();
    }
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch (error) {
    console.warn('[gmail-push] sync after push failed', error);
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

/** Registers the task and returns this phone's FCM token (null without Firebase). */
export async function prepareGmailPush(): Promise<string | null> {
  try {
    await Notifications.registerTaskAsync(GMAIL_PUSH_TASK);
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === 'string' && token.data.length > 0 ? token.data : null;
  } catch (error) {
    // No google-services.json in this build, or Play services missing.
    console.warn('[gmail-push] FCM unavailable', error);
    return null;
  }
}
