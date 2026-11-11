/**
 * Undo the classic "UTF-8 read as Latin-1/Windows-1252" mojibake
 * (« S22 Â· Fullstack », « rÃ©union », « Itâ€™s ») produced by senders that
 * mislabel their charset. Only applied when every character maps back to one
 * byte and those bytes form valid UTF-8, so genuine text is never altered.
 */

const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

const SUSPECT = /[ÂÃ][\u0080-¿]|â[€\u0080-¿]/;

/** Strict UTF-8 decoding; null when the bytes are not valid UTF-8. */
function strictUtf8(bytes: number[]): string | null {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const byte = bytes[i];
    let extra = 0;
    let code = byte;
    if (byte >= 0xf0 && byte <= 0xf4) {
      extra = 3;
      code = byte & 0x07;
    } else if (byte >= 0xe0) {
      extra = 2;
      code = byte & 0x0f;
    } else if (byte >= 0xc2 && byte <= 0xdf) {
      extra = 1;
      code = byte & 0x1f;
    } else if (byte >= 0x80) {
      return null;
    }
    for (let k = 1; k <= extra; k += 1) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
}

export function repairMojibake(value: string): string {
  if (!SUSPECT.test(value)) {
    return value;
  }
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x100) {
      bytes.push(code);
      continue;
    }
    const high = CP1252_HIGH.indexOf(code);
    if (high < 0) return value;
    bytes.push(0x80 + high);
  }
  return strictUtf8(bytes) ?? value;
}
