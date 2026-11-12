import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Message, ThreadSummary } from '@/domain/models';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Chips } from './Chips';
import { ConversationRow, formatThreadTime } from './ConversationRow';
import { EmptyState } from './EmptyState';
import { MessageBubble, shouldRenderHtml } from './MessageBubble';

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
  isStarred: false,
  contact: { name: 'Alice Durand', address: 'alice@example.com' },
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

describe('Chips', () => {
  it('reports the value of the pressed option', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <Chips
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Bravo' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );

    fireEvent.press(getByText('Bravo'));
    expect(onChange).toHaveBeenCalledWith('b');
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
    expect(getByText(/Bonjour, on se voit demain à 10h \?/)).toBeTruthy();
    expect(getByText('09:30')).toBeTruthy();
    expect(getByTestId('row-badge')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();

    fireEvent.press(getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports long presses for multi-selection', () => {
    const onLongPress = jest.fn();
    const { getByTestId } = render(
      <ConversationRow thread={thread} onLongPress={onLongPress} now={NOW} testID="row" selected />,
    );

    fireEvent(getByTestId('row'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('formats times like a messaging app', () => {
    const at = (day: number, hour = 8) => new Date(2026, 0, day, hour, 5).getTime();
    expect(formatThreadTime(at(15), NOW)).toBe('08:05');
    expect(formatThreadTime(at(14), NOW)).toBe('Hier');
    expect(formatThreadTime(at(12), NOW)).toBe('lundi');
    expect(formatThreadTime(at(2), NOW)).toBe('02/01/2026');
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
  it('shows the replied-to message as a tappable quote', () => {
    const onQuotePress = jest.fn();
    const { getByText, getByTestId } = render(
      <MessageBubble
        message={makeMessage()}
        isOwn={false}
        quoted={{ id: 'parent', senderName: 'Alice', snippet: 'On se voit ?', isOwn: true }}
        onQuotePress={onQuotePress}
        testID="bubble"
      />,
    );

    expect(getByText('Vous')).toBeTruthy();
    expect(getByText('On se voit ?')).toBeTruthy();
    fireEvent.press(getByTestId('bubble-quote'));
    expect(onQuotePress).toHaveBeenCalledWith('parent');
  });

  it('folds quoted history behind a toggle', () => {
    const message = makeMessage({ bodyText: 'Oui !\n\nOn Tue, Bob wrote:\n> ok ?' });
    const { getByText, queryByText } = render(<MessageBubble message={message} isOwn={false} />);

    expect(getByText('Oui !')).toBeTruthy();
    expect(queryByText(/ok \?/)).toBeNull();
    fireEvent.press(getByText('••• Historique'));
    // Shown as a quote card: author on top, text without the "> " markers.
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('ok ?')).toBeTruthy();
    expect(queryByText(/> ok/)).toBeNull();
  });

  it('renders layout-heavy HTML in a web view and simple mail as text', () => {
    const table = '<table><tr><td>x</td></tr></table>';
    expect(shouldRenderHtml({ bodyHtmlSanitized: table, bodyText: 'x' })).toBe(true);
    expect(shouldRenderHtml({ bodyHtmlSanitized: '<p>Salut</p>', bodyText: 'Salut' })).toBe(false);
    expect(shouldRenderHtml({ bodyHtmlSanitized: '<p>Salut</p>', bodyText: '' })).toBe(true);
    expect(shouldRenderHtml({ bodyHtmlSanitized: null, bodyText: 'Salut' })).toBe(false);
  });

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
  it('shows the Google image when one is provided', () => {
    const { getByLabelText, queryByTestId } = render(
      <Avatar name="Alice Durand" imageUri="https://lh3.googleusercontent.com/a" />,
    );
    expect(getByLabelText('Alice Durand')).toBeTruthy();
    expect(queryByTestId('avatar-placeholder')).toBeNull();
  });

  it('draws no initials without an image, only a neutral placeholder', () => {
    const { getByTestId, queryByText } = render(<Avatar name="Alice Durand" />);
    expect(getByTestId('avatar-placeholder')).toBeTruthy();
    expect(queryByText('AD')).toBeNull();
  });
});
