/**
 * Periodic background synchronisation.
 *
 * Expo exposes the OS scheduler (`WorkManager` on Android, `BGTaskScheduler` on
 * iOS) through `expo-background-task`. The task runs in its own JS context, so
 * it cannot reuse the React provider tree: it opens the same database and builds
 * a bare `MailService`.
 *
 * Note: this is the best sync cadence reachable without custom native code. A
 * real IMAP `IDLE` connection needs a long-lived foreground service, which is a
 * native module beyond Expo's managed surface (see README, “Temps réel”).
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { getDatabase } from '@/data/db/instance';
import { createAppMailService } from '@/services/create-app-service';

export const BACKGROUND_SYNC_TASK = 'mailyo.background-sync';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const db = await getDatabase();
    // Same wiring as the app (tokens, IMAP credentials, notifier), or nothing syncs.
    const service = createAppMailService(db);
    await service.initialize();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('[mailyo] background sync failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Register the periodic sync if the OS allows it. Returns whether it is armed. */
export async function registerBackgroundSync(minimumIntervalMinutes = 15): Promise<boolean> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return false;
  }
  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: minimumIntervalMinutes,
  });
  return true;
}

export async function isBackgroundSyncRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
}

export async function unregisterBackgroundSync(): Promise<void> {
  if (await isBackgroundSyncRegistered()) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  }
}
