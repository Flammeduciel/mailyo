import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Message, ThreadSummary } from '@/domain/models';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { ConversationRow } from './ConversationRow';
import { EmptyState } from './EmptyState';
import { MessageBubble } from './MessageBubble';

const NOW = new Date(2026, 0, 15, 9, 30, 0).getTime();

const thread: ThreadSummary = {
  id: 't1',
  accountId: 'a1',
  normalizedSubject: 'reunion demain',
  lastMessageAt: NOW,
  unreadCount: 2,
  isPinned: false,
  isArchived: false,
  lastMessage: {
    senderName: 'Alice Durand',
    senderAddress: 'alice@example.com',
    subject: 'Réunion demain',
    bodyText: 'Bonjour, on se voit demain à 10h ?',
    receivedAt: NOW,
  },
  messageCount: 3,
  hasAttachments: true,
};

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    accountId: 'a1',
    folderId: 'f1',
    remoteUid: 1,
    messageIdHeader: null,
    inReplyTo: null,
    referencesHeader: null,
    threadId: 't1',
    senderName: 'Alice Durand',
    senderAddress: 'alice@example.com',
    to: [],
    cc: [],
    subject: 'Réunion demain',
    bodyText: 'Bonjour le monde',
    bodyHtmlSanitized: null,
    receivedAt: NOW,
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    syncState: 'synced',
    ...overrides,
  };
}

describe('Button', () => {
  it('renders its label and calls onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <Button label="Envoyer" onPress={onPress} testID="send" />,
    );

    expect(getByText('Envoyer')).toBeTruthy();
    fireEvent.press(getByTestId('send'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and does not fire while loading', () => {
    const onPress = jest.fn();
    const { getByTestId, queryByText } = render(
      <Button label="Envoyer" onPress={onPress} loading testID="send" />,
    );

    expect(getByTestId('send-loading')).toBeTruthy();
    expect(queryByText('Envoyer')).toBeNull();
    fireEvent.press(getByTestId('send'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Button label="Envoyer" onPress={onPress} disabled testID="send" />,
    );

    fireEvent.press(getByTestId('send'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ConversationRow', () => {
  it('shows sender, subject, preview, time and unread badge and calls onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <ConversationRow thread={thread} onPress={onPress} now={NOW} testID="row" />,
    );

    expect(getByText('Alice Durand')).toBeTruthy();
    expect(getByText('Réunion demain')).toBeTruthy();
    expect(getByText('Bonjour, on se voit demain à 10h ?')).toBeTruthy();
    expect(getByText('09:30')).toBeTruthy();
    expect(getByTestId('row-badge')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();

    fireEvent.press(getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides the badge on read threads', () => {
    const readThread: ThreadSummary = { ...thread, unreadCount: 0 };
    const { queryByTestId } = render(
      <ConversationRow thread={readThread} now={NOW} testID="row" />,
    );

    expect(queryByTestId('row-badge')).toBeNull();
  });
});

describe('MessageBubble', () => {
  it('shows the body text', () => {
    const { getByText } = render(
      <MessageBubble message={makeMessage()} isOwn={false} testID="bubble" />,
    );

    expect(getByText('Bonjour le monde')).toBeTruthy();
  });

  it('aligns outgoing and incoming bubbles differently', () => {
    const { getByTestId } = render(
      <>
        <MessageBubble message={makeMessage()} isOwn testID="bubble-own" />
        <MessageBubble message={makeMessage()} isOwn={false} testID="bubble-in" />
      </>,
    );

    const own = StyleSheet.flatten(getByTestId('bubble-own').props.style);
    const incoming = StyleSheet.flatten(getByTestId('bubble-in').props.style);

    expect(own.alignItems).toBe('flex-end');
    expect(incoming.alignItems).toBe('flex-start');
  });
});

describe('EmptyState', () => {
  it('shows title and description', () => {
    const { getByText } = render(
      <EmptyState title="Boîte vide" description="Aucun message à afficher" testID="empty" />,
    );

    expect(getByText('Boîte vide')).toBeTruthy();
    expect(getByText('Aucun message à afficher')).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('derives two initials from a full name', () => {
    const { getByText } = render(<Avatar name="Alice Durand" />);
    expect(getByText('AD')).toBeTruthy();
  });

  it('falls back to the first letter of an email address', () => {
    const { getByText } = render(<Avatar name="bob@example.com" />);
    expect(getByText('B')).toBeTruthy();
  });
});
