import { findSentEcho, isSentEcho, type EchoCandidate } from '@/domain/sent-echo';

const T = Date.UTC(2026, 10, 12, 14, 49);
const local: EchoCandidate = {
  messageIdHeader: '<m_local@mailyo>',
  senderAddress: 'me@example.com',
  subject: 'Re: Prise de contact',
  bodyText: 'Ok',
  receivedAt: T,
};

describe('sent echoes', () => {
  it('matches the server copy by Message-ID', () => {
    expect(
      isSentEcho(local, { ...local, bodyText: 'something else', receivedAt: T + 3_600_000 }),
    ).toBe(true);
  });

  it('matches a rewritten Message-ID carrying the quoted history', () => {
    const server = {
      ...local,
      messageIdHeader: '<CAgmail123@mail.gmail.com>',
      senderAddress: 'Me@Example.com',
      subject: 'RE: Prise de contact',
      bodyText: 'Ok\n\nLe mer. 12 nov. 2026, Rick a écrit :\n> Hello\n> How do you do ?',
      receivedAt: T + 4_000,
    };
    expect(isSentEcho(local, server)).toBe(true);
  });

  it('does not merge different replies, other senders or distant dates', () => {
    const base = { ...local, messageIdHeader: '<x@gmail>' };
    expect(isSentEcho(local, { ...base, bodyText: 'Non rien' })).toBe(false);
    expect(isSentEcho(local, { ...base, senderAddress: 'rick@example.com' })).toBe(false);
    expect(isSentEcho(local, { ...base, receivedAt: T + 2 * 3_600_000 })).toBe(false);
    expect(isSentEcho(local, { ...base, subject: 'Autre chose' })).toBe(false);
  });

  it('pairs each server copy with the closest local copy only', () => {
    const second = { ...local, messageIdHeader: '<m2@mailyo>', receivedAt: T + 60_000 };
    const server = { ...local, messageIdHeader: '<g@gmail>', receivedAt: T + 62_000 };
    expect(findSentEcho([local, second], server)).toBe(1);
    expect(findSentEcho([], server)).toBe(-1);
  });
});
