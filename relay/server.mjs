// Wouah Mail relay: turns Gmail push notifications (Cloud Pub/Sub) into a
// data-only Firebase Cloud Messaging push to the user's phones.
//
// It never sees any mail content. Gmail's Pub/Sub message only carries the
// address and a history id; the relay stores, per address, the FCM tokens of
// the phones that registered for it. Node 22, no dependencies.

import { createServer } from 'node:http';
import { createSign, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_FILE = process.env.DATA_FILE ?? '/data/registrations.json';
const PUBSUB_TOKEN = process.env.PUBSUB_TOKEN ?? '';
const GOOGLE_CLIENT_IDS = (process.env.GOOGLE_CLIENT_IDS ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const SERVICE_ACCOUNT = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT ?? '');
const MAX_TOKENS_PER_ADDRESS = 10;
const MAX_BODY = 64 * 1024;

function parseServiceAccount(raw) {
  if (!raw.trim()) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const json = JSON.parse(text);
    if (!json.client_email || !json.private_key || !json.project_id) throw new Error('incomplete');
    return json;
  } catch (error) {
    console.error(
      '[relay] FIREBASE_SERVICE_ACCOUNT is not a valid service account JSON',
      error.message,
    );
    return null;
  }
}

// ------------------------------------------------------------- storage

/** { [address]: { [fcmToken]: updatedAtMs } } */
let registrations = {};
function load() {
  try {
    if (existsSync(DATA_FILE)) registrations = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.error('[relay] could not read', DATA_FILE, error.message);
  }
}
function save() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(registrations));
  renameSync(tmp, DATA_FILE);
}
function addToken(address, token) {
  const entry = registrations[address] ?? {};
  entry[token] = Date.now();
  // Keep the most recent phones only.
  const kept = Object.entries(entry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOKENS_PER_ADDRESS);
  registrations[address] = Object.fromEntries(kept);
  save();
}
function removeToken(address, token) {
  const entry = registrations[address];
  if (!entry || !(token in entry)) return;
  delete entry[token];
  if (Object.keys(entry).length === 0) delete registrations[address];
  save();
}

// ------------------------------------------------- Google access checks

/**
 * The phone proves it owns the address with its own Google access token:
 * Google says which address and which OAuth client it belongs to.
 */
async function verifyGoogleToken(accessToken, address) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!response.ok) return false;
  const info = await response.json();
  const audience = info.azp ?? info.aud;
  if (GOOGLE_CLIENT_IDS.length > 0 && !GOOGLE_CLIENT_IDS.includes(audience)) return false;
  return typeof info.email === 'string' && info.email.toLowerCase() === address;
}

// ------------------------------------------------------------- FCM v1

let fcmAccess = { token: '', expiresAt: 0 };
async function fcmAccessToken() {
  if (fcmAccess.token && fcmAccess.expiresAt - 60_000 > Date.now()) return fcmAccess.token;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iss: SERVICE_ACCOUNT.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  ).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(SERVICE_ACCOUNT.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`);
  const json = await response.json();
  fcmAccess = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return fcmAccess.token;
}

/** Data-only, high priority: wakes the app, which syncs and shows the real notification. */
async function pushNewMail(address) {
  const tokens = Object.keys(registrations[address] ?? {});
  if (tokens.length === 0 || !SERVICE_ACCOUNT) return 0;
  const access = await fcmAccessToken();
  let sent = 0;
  await Promise.all(
    tokens.map(async (token) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              data: { type: 'gmail', email: address },
              android: { priority: 'HIGH', collapse_key: `gmail-${address}`, ttl: '600s' },
            },
          }),
        },
      );
      if (response.ok) {
        sent += 1;
      } else if (response.status === 404 || response.status === 400) {
        // App uninstalled or token rotated: forget it.
        removeToken(address, token);
      } else {
        console.warn('[relay] FCM error', response.status);
      }
    }),
  );
  return sent;
}

// --------------------------------------------------------------- HTTP

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sameSecret(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const isAddress = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v) && v.length < 320;
const isToken = (v) => typeof v === 'string' && v.length > 20 && v.length < 4096;

async function handle(req, res) {
  const url = new URL(req.url, 'http://relay');

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, {
      ok: true,
      fcm: Boolean(SERVICE_ACCOUNT),
      pubsub: Boolean(PUBSUB_TOKEN),
    });
  }

  if (req.method === 'POST' && (url.pathname === '/register' || url.pathname === '/unregister')) {
    const body = await readJson(req);
    const address = String(body.email ?? '').toLowerCase();
    if (!isAddress(address) || !isToken(body.fcmToken) || typeof body.accessToken !== 'string') {
      return send(res, 400, { error: 'invalid request' });
    }
    if (!(await verifyGoogleToken(body.accessToken, address))) {
      return send(res, 403, { error: 'access token does not match this address' });
    }
    if (url.pathname === '/register') addToken(address, body.fcmToken);
    else removeToken(address, body.fcmToken);
    return send(res, 200, { ok: true });
  }

  // Cloud Pub/Sub push subscription: https://<relay>/pubsub?token=<PUBSUB_TOKEN>
  if (req.method === 'POST' && url.pathname === '/pubsub') {
    if (!sameSecret(url.searchParams.get('token'), PUBSUB_TOKEN)) {
      return send(res, 403, { error: 'forbidden' });
    }
    const body = await readJson(req);
    let address = '';
    try {
      const data = JSON.parse(Buffer.from(body.message?.data ?? '', 'base64').toString('utf8'));
      address = String(data.emailAddress ?? '').toLowerCase();
    } catch {
      // Malformed message: acknowledge so Pub/Sub does not retry forever.
    }
    if (isAddress(address)) {
      try {
        await pushNewMail(address);
      } catch (error) {
        console.error('[relay] push failed', error.message);
        return send(res, 500, { error: 'push failed' }); // Pub/Sub retries
      }
    }
    return send(res, 204, {});
  }

  send(res, 404, { error: 'not found' });
}

load();
createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[relay]', error.message);
    if (!res.headersSent) send(res, 400, { error: 'bad request' });
  });
}).listen(PORT, () => {
  console.log(
    `[relay] listening on ${PORT} (fcm: ${Boolean(SERVICE_ACCOUNT)}, pubsub: ${Boolean(PUBSUB_TOKEN)})`,
  );
});
