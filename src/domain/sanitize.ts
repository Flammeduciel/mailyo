/**
 * Incoming email HTML sanitisation for a mobile client.
 *
 * Email bodies are untrusted: a message may contain scripts, event handlers and
 * `javascript:` links that would run inside a WebView. This module implements a
 * small allow-list sanitiser with no external dependency. It is intentionally
 * conservative — anything not explicitly allowed is dropped.
 *
 * The functions here are pure and never throw, so they are safe to call while
 * rendering a list of messages.
 */

/** Tags that are removed together with everything they contain. */
const DROP_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'svg',
  'math',
  'form',
  'noscript',
  'template',
  'title',
  'head',
]);

/** Void/wrapper tags that are dropped but whose (nonexistent) content is kept. */
const DROP_TAGS = new Set(['input', 'meta', 'link', 'base', 'embed', 'source', 'track', 'frame']);

/** Tags that are kept in the output. */
const ALLOWED = new Set([
  'p',
  'br',
  'div',
  'span',
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'img',
  'hr',
  'small',
  'sub',
  'sup',
]);

/** Elements that have no closing tag. */
const VOID = new Set([
  'br',
  'hr',
  'img',
  'input',
  'meta',
  'link',
  'base',
  'embed',
  'source',
  'track',
  'area',
  'col',
  'wbr',
]);

/** Per-tag attribute allow-list. Tags not listed keep no attributes. */
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};

/** Attributes whose value is a URL and must be scheme-checked. */
const URL_ATTRS = new Set(['href', 'src', 'action']);

const ATTR_PATTERN = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

interface TagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: string;
  /** Index just past the closing `>`. */
  end: number;
}

/**
 * Parse a single tag starting at `start` (which must be a `<`). Returns null when
 * the text does not form a tag, in which case the caller treats `<` as text.
 */
function parseTag(source: string, start: number): TagToken | null {
  let i = start + 1;
  let closing = false;
  if (source[i] === '/') {
    closing = true;
    i += 1;
  }

  const nameStart = i;
  while (i < source.length && /[a-zA-Z0-9:_-]/.test(source[i])) {
    i += 1;
  }
  if (i === nameStart) {
    return null;
  }
  const name = source.slice(nameStart, i).toLowerCase();

  const attrStart = i;
  let quote: string | null = null;
  while (i < source.length) {
    const char = source[i];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    i += 1;
  }
  if (i >= source.length) {
    return null;
  }

  const attrs = source.slice(attrStart, i);
  return {
    name,
    closing,
    selfClosing: /\/\s*$/.test(attrs),
    attrs,
    end: i + 1,
  };
}

/** Neutralise dangerous URL schemes. Returns '' when the value must be dropped. */
function sanitizeUrl(value: string): string {
  const raw = value.trim();
  // Strip control characters and whitespace that can hide a scheme.
  const compact = raw.replace(/[\u0000-\u0020\u00a0]+/g, '').toLowerCase();
  if (compact.startsWith('javascript:') || compact.startsWith('vbscript:')) {
    return '';
  }
  if (compact.startsWith('data:')) {
    return /^data:image\//.test(compact) ? raw : '';
  }
  return raw;
}

/** Rebuild the attribute string for an allowed tag, dropping everything unsafe. */
function renderAttributes(name: string, attrs: string): string {
  const allowed = TAG_ATTRS[name];
  let result = '';
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(attrs)) !== null) {
    const attr = match[1].toLowerCase();
    if (attr.startsWith('on')) {
      continue; // event handler
    }
    if (!allowed || !allowed.has(attr)) {
      continue;
    }
    let value = match[2] ?? match[3] ?? match[4] ?? '';
    if (URL_ATTRS.has(attr)) {
      value = sanitizeUrl(value);
      if (value === '') {
        continue;
      }
    }
    result += ` ${attr}="${escapeHtml(value)}"`;
  }
  return result;
}

/** Render an allowed opening tag. */
function renderTag(tag: TagToken): string {
  const attrs = renderAttributes(tag.name, tag.attrs);
  if (tag.name === 'a') {
    return `<a${attrs} rel="noopener noreferrer" target="_blank">`;
  }
  return `<${tag.name}${attrs}>`;
}

/**
 * Sanitise untrusted email HTML down to a safe allow-list.
 *
 * Removes active content (scripts, styles, embedded documents, form controls),
 * strips `on*` handlers, neutralises `javascript:`/`vbscript:`/non-image `data:`
 * URLs, drops unknown tags while keeping their text, hardens links and limits
 * image attributes. Never throws.
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  let out = '';
  let i = 0;
  const dropStack: string[] = [];

  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      if (dropStack.length === 0) {
        out += input.slice(i);
      }
      break;
    }
    if (lt > i && dropStack.length === 0) {
      out += input.slice(i, lt);
    }

    // Comments and doctypes/PIs are dropped entirely.
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      i = end === -1 ? input.length : end + 3;
      continue;
    }
    if (input.startsWith('<!', lt) || input.startsWith('<?', lt)) {
      const end = input.indexOf('>', lt + 2);
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    const tag = parseTag(input, lt);
    if (!tag) {
      // Not a tag: keep the '<' as literal text.
      if (dropStack.length === 0) {
        out += '<';
      }
      i = lt + 1;
      continue;
    }
    i = tag.end;

    // Inside a dropped container: swallow everything until it closes.
    if (dropStack.length > 0) {
      if (tag.closing && tag.name === dropStack[dropStack.length - 1]) {
        dropStack.pop();
      }
      continue;
    }

    if (tag.closing) {
      if (ALLOWED.has(tag.name) && !VOID.has(tag.name)) {
        out += `</${tag.name}>`;
      }
      continue;
    }

    if (DROP_CONTENT.has(tag.name)) {
      if (!tag.selfClosing && !VOID.has(tag.name)) {
        dropStack.push(tag.name);
      }
      continue;
    }
    if (DROP_TAGS.has(tag.name) || !ALLOWED.has(tag.name)) {
      continue;
    }

    out += renderTag(tag);
  }

  return out;
}

/** Decode the small set of entities common in mail bodies. */
function decodeEntities(input: string): string {
  return (
    input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&apos;/gi, "'")
      // Decoded last so `&amp;lt;` becomes the literal text `&lt;`.
      .replace(/&amp;/gi, '&')
  );
}

/**
 * Convert email HTML to plain text: tags removed, block/line breaks turned into
 * newlines, common entities decoded and whitespace collapsed. Never throws.
 */
export function htmlToText(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  let text = input;
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  // Drop the content of raw/embedded elements so it does not leak as text.
  text = text.replace(
    /<(script|style|iframe|object|svg|math|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ' ',
  );
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(
    /<\/(p|div|li|tr|h[1-6]|blockquote|ul|ol|table|pre|section|article|header|footer|main)\s*>/gi,
    '\n',
  );
  text = text.replace(/<[^>]*>/g, ' ');
  text = decodeEntities(text);

  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Short plain-text preview of a message body: the first non-empty line,
 * truncated to `maxLength` with an ellipsis. Returns '' for empty input.
 */
export function buildPreview(body: string, maxLength = 120): string {
  const text = htmlToText(body ?? '');
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) {
    return '';
  }
  const limit = Math.max(0, maxLength);
  if (firstLine.length <= limit) {
    return firstLine;
  }
  return `${firstLine.slice(0, limit)}…`;
}

/** Escape the five HTML-significant characters for safe text rendering. */
export function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
