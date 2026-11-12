import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import type { MailboxCount, MailboxId } from '@/domain/mailboxes';
import { useApp } from '@/state/app-context';
import { MailboxDrawer } from '@/ui';

export interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Mailbox on screen (highlighted); opening another one replaces the screen. */
  current?: MailboxId | null;
  /** A vital permission is missing: dot on « Paramètres ». */
  permissionAlert?: boolean;
}

/** The side drawer with live counts, wired to navigation. */
export function AppDrawer({ visible, onClose, current, permissionAlert }: AppDrawerProps) {
  const { service, revision } = useApp();
  const [counts, setCounts] = useState<Partial<Record<MailboxId, MailboxCount>>>({});
  const [subtitle, setSubtitle] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void service.countMailboxes().then((next) => {
      if (alive) setCounts(next);
    });
    void service.listAccounts().then((accounts) => {
      if (!alive) return;
      const [first] = accounts;
      setSubtitle(
        first
          ? accounts.length > 1
            ? `${first.emailAddress} · +${accounts.length - 1}`
            : first.emailAddress
          : undefined,
      );
    });
    return () => {
      alive = false;
    };
  }, [visible, service, revision]);

  const open = (id: MailboxId) => {
    const target = { pathname: '/mailbox/[id]' as const, params: { id } };
    if (current) router.replace(target);
    else router.push(target);
  };

  return (
    <MailboxDrawer
      visible={visible}
      onClose={onClose}
      current={current}
      counts={counts}
      subtitle={subtitle}
      onOpenMailbox={open}
      links={[
        {
          key: 'trash',
          label: 'Corbeille',
          icon: 'delete-outline',
          onPress: () => router.push('/trash'),
        },
        {
          key: 'subscriptions',
          label: 'Abonnements',
          icon: 'unsubscribe',
          onPress: () => router.push('/subscriptions'),
        },
        {
          key: 'settings',
          label: 'Paramètres',
          icon: 'settings',
          alert: permissionAlert,
          onPress: () => router.push('/settings'),
        },
      ]}
    />
  );
}
