// Minimal dependency-free Redis client (RESP2 over TCP/TLS) for REDIS_URL.
// Keeps one connection per warm serverless instance and reconnects on failure.

const net = require('net');
const tls = require('tls');

function encode(args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const s = String(a);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

// Parse one RESP value from buf at offset; returns [value, nextOffset] or null if incomplete.
function parse(buf, i = 0) {
  if (i >= buf.length) return null;
  const type = String.fromCharCode(buf[i]);
  const eol = buf.indexOf('\r\n', i);
  if (eol === -1) return null;
  const line = buf.toString('utf8', i + 1, eol);
  const next = eol + 2;
  switch (type) {
    case '+': return [line, next];
    case '-': return [Object.assign(new Error(line), { redis: true }), next];
    case ':': return [Number(line), next];
    case '$': {
      const len = Number(line);
      if (len === -1) return [null, next];
      if (buf.length < next + len + 2) return null;
      return [buf.toString('utf8', next, next + len), next + len + 2];
    }
    case '*': {
      const n = Number(line);
      if (n === -1) return [null, next];
      const arr = [];
      let pos = next;
      for (let k = 0; k < n; k++) {
        const r = parse(buf, pos);
        if (!r) return null;
        arr.push(r[0]);
        pos = r[1];
      }
      return [arr, pos];
    }
    default: throw new Error(`Unexpected Redis reply type: ${type}`);
  }
}

class RedisClient {
  constructor(url) {
    this.url = new URL(url);
    this.socket = null;
    this.ready = null;
    this.queue = [];
    this.buf = Buffer.alloc(0);
  }

  connect() {
    if (this.ready) return this.ready;
    const u = this.url;
    const secure = u.protocol === 'rediss:';
    const opts = { host: u.hostname, port: Number(u.port) || 6379 };
    this.ready = new Promise((resolve, reject) => {
      const sock = secure ? tls.connect({ ...opts, servername: u.hostname }) : net.connect(opts);
      sock.setNoDelay(true);
      sock.setTimeout(10e3, () => sock.destroy(new Error('Redis connection timed out')));
      sock.once(secure ? 'secureConnect' : 'connect', async () => {
        sock.setTimeout(0);
        try {
          const user = decodeURIComponent(u.username || '');
          const pass = decodeURIComponent(u.password || '');
          if (pass) await this.send(user ? ['AUTH', user, pass] : ['AUTH', pass]);
          const db = u.pathname.replace('/', '');
          if (db) await this.send(['SELECT', db]);
          resolve();
        } catch (e) { reject(e); }
      });
      sock.on('data', chunk => this.onData(chunk));
      sock.on('error', err => this.fail(err, reject));
      sock.on('close', () => this.fail(new Error('Redis connection closed'), reject));
      this.socket = sock;
    });
    return this.ready;
  }

  fail(err, reject) {
    this.socket = null;
    this.ready = null;
    this.buf = Buffer.alloc(0);
    const pending = this.queue.splice(0);
    pending.forEach(p => p.reject(err));
    reject?.(err);
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.queue.length) {
      const r = parse(this.buf);
      if (!r) break;
      this.buf = this.buf.subarray(r[1]);
      const { resolve, reject } = this.queue.shift();
      r[0] instanceof Error ? reject(r[0]) : resolve(r[0]);
    }
  }

  send(args) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.socket.write(encode(args));
    });
  }

  async command(...args) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.connect();
        return await this.send(args);
      } catch (e) {
        if (e.redis || attempt === 1) throw e; // real Redis error, or second failure
      }
    }
  }
}

let client;
module.exports = url => {
  if (!client) client = new RedisClient(url);
  return (...args) => client.command(...args);
};
