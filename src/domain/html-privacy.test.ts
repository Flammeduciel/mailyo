import {
  blockRemoteImages,
  deceptiveLinkDomain,
  hostOf,
  parseListUnsubscribe,
} from '@/domain/html-privacy';

describe('html privacy helpers', () => {
  it('blocks remote images but keeps inline ones', () => {
    const { html, blocked } = blockRemoteImages(
      '<p><img alt="x" src="https://track.example/p.gif"><img src="data:image/png;base64,AA"></p>',
    );
    expect(blocked).toBe(1);
    expect(html).toContain('data-mailyo-src="https://track.example/p.gif"');
    expect(html).toContain('src="data:image/png;base64,AA"');
  });

  it('extracts hosts', () => {
    expect(hostOf('https://www.Example.com/a?b')).toBe('example.com');
    expect(hostOf('mailto:a@b.c')).toBeNull();
  });

  it('flags links whose text shows another domain', () => {
    expect(deceptiveLinkDomain('www.paypal.com', 'https://evil.example/login')).toBe('paypal.com');
    expect(deceptiveLinkDomain('paypal.com', 'https://www.paypal.com/x')).toBeNull();
    expect(deceptiveLinkDomain('Mon compte', 'https://evil.example')).toBeNull();
    expect(deceptiveLinkDomain('aide.paypal.com', 'https://paypal.com')).toBeNull();
  });

  it('parses List-Unsubscribe', () => {
    expect(
      parseListUnsubscribe('<mailto:unsub@news.example?subject=stop>, <https://news.example/u/1>'),
    ).toEqual({
      url: 'https://news.example/u/1',
      mailto: 'mailto:unsub@news.example?subject=stop',
    });
    expect(parseListUnsubscribe(null)).toEqual({ url: null, mailto: null });
  });
});
