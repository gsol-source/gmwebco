// Storage for bookings, slot locks, Google tokens and login rate limits.
// On Vercel it uses Redis — either REDIS_URL (Vercel Redis, TCP) or an
// Upstash REST URL/token. Locally it falls back to JSON files in ./data.

const fs = require('fs');
const path = require('path');

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TCP_URL = process.env.REDIS_URL;
const useRedis = Boolean((REST_URL && REST_TOKEN) || TCP_URL);

// ---------- Redis ----------
const redis = TCP_URL ? require('./redis-tcp')(TCP_URL) : redisRest;

async function redisRest(...command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

// ---------- Local JSON files ----------
const DATA = path.join(__dirname, '..', 'data');
const file = name => path.join(DATA, name);
const readJson = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
};
const writeJson = (name, value) => {
  // Vercel's filesystem is read-only: bookings need the Upstash database there.
  if (process.env.VERCEL) throw Object.assign(new Error('No database connected'), { code: 'NO_DB' });
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
};

// ---------- Public API ----------
module.exports = {
  backend: useRedis ? 'redis' : 'file',

  async listBookings() {
    if (useRedis) {
      const all = await redis('HVALS', 'gm:bookings');
      return (all || []).map(s => JSON.parse(s));
    }
    return readJson('bookings.json', []);
  },

  async getBooking(id) {
    if (useRedis) {
      const s = await redis('HGET', 'gm:bookings', id);
      return s ? JSON.parse(s) : null;
    }
    return readJson('bookings.json', []).find(b => b.id === id) || null;
  },

  async saveBooking(booking) {
    if (useRedis) return redis('HSET', 'gm:bookings', booking.id, JSON.stringify(booking));
    const all = readJson('bookings.json', []);
    const i = all.findIndex(b => b.id === booking.id);
    if (i === -1) all.push(booking); else all[i] = booking;
    writeJson('bookings.json', all);
  },

  async deleteBooking(id) {
    if (useRedis) return redis('HDEL', 'gm:bookings', id);
    writeJson('bookings.json', readJson('bookings.json', []).filter(b => b.id !== id));
  },

  // Atomically reserve a time slot so two people can't book the same time.
  async claimSlot(startIso, id) {
    if (useRedis) return (await redis('SET', `gm:slot:${startIso}`, id, 'NX')) === 'OK';
    return !readJson('bookings.json', []).some(b => b.start === startIso && b.status !== 'cancelled');
  },

  async releaseSlot(startIso) {
    if (useRedis) return redis('DEL', `gm:slot:${startIso}`);
  },

  async getGoogleToken() {
    if (useRedis) {
      const s = await redis('GET', 'gm:google-token');
      return s ? JSON.parse(s) : null;
    }
    return readJson('google-token.json', null);
  },

  async setGoogleToken(token) {
    if (useRedis) return redis('SET', 'gm:google-token', JSON.stringify(token));
    writeJson('google-token.json', token);
  },

  // Generic counter that expires ttlSeconds after its first hit (rate limits)
  async hit(key, ttlSeconds) {
    if (useRedis) {
      const n = await redis('INCR', `gm:rl:${key}`);
      if (n === 1) await redis('EXPIRE', `gm:rl:${key}`, ttlSeconds);
      return n;
    }
    const cur = memHits.get(key);
    const entry = cur && cur.until > Date.now() ? cur : { count: 0, until: Date.now() + ttlSeconds * 1000 };
    entry.count++;
    memHits.set(key, entry);
    return entry.count;
  },

  // Failed-login counter per IP, expires after 15 minutes
  async loginFailures(ip) {
    if (useRedis) return Number(await redis('GET', `gm:fail:${ip}`)) || 0;
    const f = memFails.get(ip);
    return f && f.until > Date.now() ? f.count : 0;
  },

  async recordLoginFailure(ip) {
    if (useRedis) {
      const n = await redis('INCR', `gm:fail:${ip}`);
      if (n === 1) await redis('EXPIRE', `gm:fail:${ip}`, 900);
      return n;
    }
    const count = (await module.exports.loginFailures(ip)) + 1;
    memFails.set(ip, { count, until: Date.now() + 900e3 });
    return count;
  },

  async clearLoginFailures(ip) {
    if (useRedis) return redis('DEL', `gm:fail:${ip}`);
    memFails.delete(ip);
  },
};

const memFails = new Map();
const memHits = new Map();
