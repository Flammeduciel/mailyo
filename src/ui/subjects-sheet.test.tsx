import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ThreadSummary } from '@/domain/models';

import { sortSubjects, SubjectsSheet } from './SubjectsSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function thread(id: string, subject: string, at: number, unread = 0): ThreadSummary {
  return {
    id,
    accountId: 'a',
    normalizedSubject: subject.toLowerCase(),
    lastMessageAt: at,
    unreadCount: unread,
    isPinned: false,
    isArchived: false,
    messageCount: 1,
    hasAttachments: false,
    isStarred: false,
    isSpam: false,
    contact: { name: 'Google', address: 'no-reply@google.com' },
    lastMessage: {
      subject,
      bodyText: 'Bonjour',
      receivedAt: at,
      senderName: 'Google',
      senderAddress: 'no-reply@google.com',
    },
  } as ThreadSummary;
}

describe('SubjectsSheet', () => {
  const threads = [
    thread('t1', 'Alerte', 3),
    thread('t2', 'Sécurité', 1, 2),
    thread('t3', 'Bienvenue', 2),
  ];

  it('lists unread conversations first, then the most recent', () => {
    expect(sortSubjects(threads).map((t) => t.id)).toEqual(['t2', 't1', 't3']);
  });

  it('opens the conversation picked in the sheet', async () => {
    const onPick = jest.fn();
    const screen = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SubjectsSheet
          visible
          name="Google"
          threads={threads}
          now={10}
          onPick={onPick}
          onClose={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('3 conversations · 1 non lue')).toBeTruthy();
    fireEvent.press(screen.getByTestId('subject-t2'));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' })));
  });
});
