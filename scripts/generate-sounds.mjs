// Generates small 16-bit mono PCM WAV chimes for MailYo notifications.
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 44100;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // audio format: PCM
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Fade-in/hold/fade-out envelope so tones never click. */
function envelope(t, duration, attack = 0.008, release = 0.09) {
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

function tone(freq, duration, gain = 0.6) {
  const out = new Float32Array(Math.round(duration * RATE));
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE;
    out[i] = gain * envelope(t, duration) * Math.sin(2 * Math.PI * freq * t);
  }
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function silence(duration) {
  return new Float32Array(Math.round(duration * RATE));
}

mkdirSync('assets/sounds', { recursive: true });

// soft.wav — gentle descending two-note chime.
writeFileSync(
  'assets/sounds/soft.wav',
  wav(concat([tone(880, 0.22, 0.5), tone(659, 0.34, 0.45)])),
);

// chime.wav — pleasant rising triad.
writeFileSync(
  'assets/sounds/chime.wav',
  wav(concat([tone(523, 0.16, 0.5), tone(659, 0.16, 0.5), tone(784, 0.34, 0.5)])),
);

// urgent.wav — three quick beeps.
writeFileSync(
  'assets/sounds/urgent.wav',
  wav(
    concat([
      tone(1000, 0.14, 0.6),
      silence(0.07),
      tone(1000, 0.14, 0.6),
      silence(0.07),
      tone(1200, 0.22, 0.6),
    ]),
  ),
);

console.log('sounds written');
