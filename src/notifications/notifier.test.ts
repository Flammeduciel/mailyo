import { Notifier, type NotificationApi } from '@/notifications/notifier';

jest.mock('expo-notifications', () => ({}));

function fakeApi(presented: { identifier: string; data: Record<string, unknown> | null }[]) {
  const dismissed: string[] = [];
  const scheduled: unknown[] = [];
  const api = {
    setNotificationHandler: () => undefined,
    getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestPermissionsAsync: async () => ({ granted: true }),
    setNotificationChannelAsync: async () => undefined,
    scheduleNotificationAsync: async (request: unknown) => {
      scheduled.push(request);
      return 'id';
    },
    getPresentedNotificationsAsync: async () => presented,
    dismissNotificationAsync: async (identifier: string) => {
      dismissed.push(identifier);
    },
  } satisfies NotificationApi;
  return { api, dismissed, scheduled };
}

describe('Notifier', () => {
  it('tags a mail notification with its conversation', async () => {
    const { api, scheduled } = fakeApi([]);
    await new Notifier(api).present(
      { notify: true, title: 'Awa', body: 'Salut', soundId: null } as never,
      '/open-mail?thread=t1',
      't1',
    );
    expect(scheduled[0]).toMatchObject({
      content: { data: { url: '/open-mail?thread=t1', threadId: 't1' } },
    });
  });

  it('removes the notifications of a conversation once it is read', async () => {
    const { api, dismissed } = fakeApi([
      { identifier: 'a', data: { threadId: 't1' } },
      { identifier: 'b', data: { threadId: 't2' } },
      { identifier: 'c', data: null },
    ]);
    const native = jest.fn();
    await new Notifier(api, native).dismissThread('t1', [
      { accountId: 'acc', remoteUid: 42 },
      { accountId: 'acc', remoteUid: null },
    ]);
    expect(dismissed).toEqual(['a']);
    expect(native).toHaveBeenCalledTimes(1);
    expect(native).toHaveBeenCalledWith('acc', 42);
  });

  it('survives a missing native module', async () => {
    const { api } = fakeApi([]);
    const native = () => {
      throw new Error('missing');
    };
    await expect(
      new Notifier(api, native).dismissThread('t1', [{ accountId: 'a', remoteUid: 1 }]),
    ).resolves.toBeUndefined();
  });
});
