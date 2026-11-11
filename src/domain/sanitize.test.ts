import { buildPreview, escapeHtml, htmlToText, sanitizeCss, sanitizeHtml } from '@/domain/sanitize';

describe('sanitizeHtml', () => {
  it('removes script elements and their content', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>');
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
    expect(sanitizeHtml('<SCRIPT type="text/javascript">alert(1)</SCRIPT>')).toBe('');
  });

  it('removes style, iframe, object and embed elements', () => {
    expect(sanitizeHtml('<style>.x{color:red}</style>Hi')).toBe('Hi');
    expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe('');
    expect(sanitizeHtml('<object data="https://evil.example"></object>')).toBe('');
    expect(sanitizeHtml('<embed src="https://evil.example">')).toBe('');
    expect(sanitizeHtml('<svg><circle r="1" /></svg>')).toBe('');
    expect(sanitizeHtml('<math><mi>x</mi></math>')).toBe('');
  });

  it('removes form, input, meta and link elements', () => {
    expect(sanitizeHtml('<form action="/submit"><input name="q"></form>')).toBe('');
    expect(sanitizeHtml('<input type="text" name="q">')).toBe('');
    expect(sanitizeHtml('<meta charset="utf-8">')).toBe('');
    expect(sanitizeHtml('<link rel="stylesheet" href="https://evil.example/x.css">')).toBe('');
    expect(sanitizeHtml('<base href="https://evil.example/">')).toBe('');
  });

  it('strips on* event handler attributes', () => {
    expect(sanitizeHtml('<img src="a.png" onerror="alert(1)">')).toBe('<img src="a.png">');
    expect(sanitizeHtml('<div onclick="alert(1)">hi</div>')).toBe('<div>hi</div>');
    expect(sanitizeHtml('<a href="https://x.example" onmouseover="x()">l</a>')).toBe(
      '<a href="https://x.example" rel="noopener noreferrer" target="_blank">l</a>',
    );
  });

  it('neutralises javascript: and vbscript: URLs', () => {
    const js = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(js).not.toContain('javascript:');
    expect(js).toContain('rel="noopener noreferrer"');
    expect(js).toContain('target="_blank"');

    const spaced = sanitizeHtml('<a href="java\tscript:alert(1)">x</a>');
    expect(spaced).not.toContain('script:');

    const vb = sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>');
    expect(vb).not.toContain('vbscript:');
  });

  it('keeps http(s) and other safe URLs', () => {
    expect(sanitizeHtml('<a href="https://example.com/a?b=1">x</a>')).toContain(
      'href="https://example.com/a?b=1"',
    );
    expect(sanitizeHtml('<a href="mailto:a@b.com">x</a>')).toContain('href="mailto:a@b.com"');
    expect(sanitizeHtml('<img src="cid:image1">')).toBe('<img src="cid:image1">');
  });

  it('keeps data:image URLs but drops other data: URLs', () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="logo">')).toBe(
      '<img src="data:image/png;base64,AAAA" alt="logo">',
    );
    expect(sanitizeHtml('<img src="data:text/html;base64,AAAA">')).toBe('<img>');
    expect(sanitizeHtml('<a href="data:text/html,<script>1</script>">x</a>')).not.toContain(
      'data:',
    );
  });

  it('keeps allowed tags', () => {
    expect(sanitizeHtml('<p>hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeHtml('<ul><li>a</li><li>b</li></ul>')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(sanitizeHtml('<strong>bold</strong><em>it</em>')).toBe(
      '<strong>bold</strong><em>it</em>',
    );
  });

  it('removes unknown tags but keeps their inner text', () => {
    expect(sanitizeHtml('<custom-tag>hello</custom-tag>')).toBe('hello');
    expect(sanitizeHtml('<p>keep <foo>me</foo></p>')).toBe('<p>keep me</p>');
    expect(sanitizeHtml('<div>a<blink>b</blink>c</div>')).toBe('<div>abc</div>');
  });

  it('adds rel and target to links', () => {
    expect(sanitizeHtml('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer" target="_blank">link</a>',
    );
  });

  it('keeps presentational image attributes, drops handlers and invalid styles', () => {
    expect(
      sanitizeHtml(
        '<img src="x.png" alt="y" width="10" height="20" class="c" style="z" onload="e()">',
      ),
    ).toBe('<img src="x.png" alt="y" width="10" height="20" class="c">');
  });

  it('keeps safe inline styles and layout attributes used by email templates', () => {
    expect(
      sanitizeHtml(
        '<table width="600" bgcolor="#fff" onclick="x()"><tr><td align="center" style="color: #333; padding: 8px">Hi</td></tr></table>',
      ),
    ).toBe(
      '<table width="600" bgcolor="#fff"><tr><td align="center" style="color: #333; padding: 8px">Hi</td></tr></table>',
    );
    expect(sanitizeHtml('<div class="gmail_quote">old</div>')).toBe(
      '<div class="gmail_quote">old</div>',
    );
  });

  it('removes HTML comments and handles empty input', () => {
    expect(sanitizeHtml('<!-- <script>1</script> -->ok')).toBe('ok');
    expect(sanitizeHtml('')).toBe('');
  });

  it('never throws on malformed input', () => {
    expect(() => sanitizeHtml('<a href="<script>broken')).not.toThrow();
    expect(() => sanitizeHtml('<div')).not.toThrow();
    expect(() => sanitizeHtml('<<<>>>')).not.toThrow();
  });
});

describe('htmlToText', () => {
  it('converts paragraph breaks to newlines', () => {
    expect(htmlToText('<p>Hello</p><p>World</p>')).toBe('Hello\nWorld');
    expect(htmlToText('<div>a</div><div>b</div>')).toBe('a\nb');
    expect(htmlToText('<ul><li>one</li><li>two</li></ul>')).toBe('one\ntwo');
  });

  it('converts <br> to a newline', () => {
    expect(htmlToText('Line1<br>Line2')).toBe('Line1\nLine2');
    expect(htmlToText('Line1<br/>Line2')).toBe('Line1\nLine2');
  });

  it('decodes common entities', () => {
    expect(htmlToText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(htmlToText('&lt;tag&gt; &quot;q&quot; &#39;s&#39;&nbsp;end')).toBe(`<tag> "q" 's' end`);
  });

  it('strips tags and collapses whitespace', () => {
    expect(htmlToText('<b>hi</b>   <i>there</i>')).toBe('hi there');
    expect(htmlToText('<script>evil()</script>safe')).toBe('safe');
  });

  it('never throws on invalid HTML', () => {
    expect(() => htmlToText('<a href="<">')).not.toThrow();
  });
});

describe('buildPreview', () => {
  it('returns the first line only', () => {
    expect(buildPreview('<p>first</p><p>second</p>')).toBe('first');
  });

  it('truncates long text at the default length with an ellipsis', () => {
    const body = 'a'.repeat(200);
    const preview = buildPreview(body);
    expect(preview).toBe(`${'a'.repeat(120)}…`);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('honours a custom maxLength', () => {
    expect(buildPreview('hello world', 5)).toBe('hello…');
    expect(buildPreview('hi', 5)).toBe('hi');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(buildPreview('')).toBe('');
    expect(buildPreview('   <p>   </p>')).toBe('');
    expect(buildPreview('<br><br>')).toBe('');
  });

  it('never throws on invalid HTML', () => {
    expect(() => buildPreview('<a href="<script>')).not.toThrow();
    expect(typeof buildPreview('<<<>>>')).toBe('string');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Hello, world!')).toBe('Hello, world!');
  });
});

describe('sanitizeCss', () => {
  it('drops script-like values, foreign urls and overlay positioning', () => {
    expect(sanitizeCss('color: red; width: expression(alert(1))')).toBe('color: red');
    expect(sanitizeCss('background: url(javascript:alert(1)); margin: 0')).toBe('margin: 0');
    expect(sanitizeCss("background-image: url('https://cdn.example/a.png')")).toBe(
      "background-image: url('https://cdn.example/a.png')",
    );
    expect(sanitizeCss('position: fixed; top: 0; z-index: 9999')).toBe('top: 0');
    expect(sanitizeCss('behavior: url(x.htc); -moz-binding: url(x)')).toBe('');
  });
});
