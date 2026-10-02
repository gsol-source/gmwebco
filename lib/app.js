// GM Web Co. — request handler shared by the local server (server.js)
// and the Vercel serverless function (api/index.js).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const fileConfig = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
const env = process.env;

const config = {
  timezone: 'America/New_York',
  // Bookable hours per day, Miami time, 24h clock [start, end).
  // 0 = Sunday ... 6 = Saturday. Leave a day out to close it.
  hours: {
    0: [10, 20], // Sun 10am–8pm
    1: [17, 21], // Mon 5pm–9pm
    2: [17, 21], // Tue
    3: [17, 21], // Wed
    4: [17, 21], // Thu
    5: [17, 21], // Fri
    6: [10, 20], // Sat 10am–8pm
  },
  slotMinutes: 30,
  // Make the schedule look lived-in: on some days a few times are kept blocked
  // (shown as unavailable, can't be booked). openDayShare of days have none.
  openDayShare: 0.45,
  heldShare: 0.15,
  maxHeldPerDay: 2,
  daysAhead: 21,
  minNoticeHours: 12,
  calendarId: 'primary',
  ...fileConfig,
  // Environment variables (used on Vercel) override config.json
  adminPassword: env.ADMIN_PASSWORD || fileConfig.adminPassword || '',
  // Added as guests on every Google Calendar event so the owners get an email for each new booking
  notifyEmails: (env.NOTIFY_EMAILS || (fileConfig.notifyEmails || []).join(',')).split(',').map(s => s.trim()).filter(Boolean),
  siteUrl: env.SITE_URL || fileConfig.siteUrl || 'https://gmwebco.com',
  googleClientId: env.GOOGLE_CLIENT_ID || fileConfig.googleClientId || '',
  googleClientSecret: env.GOOGLE_CLIENT_SECRET || fileConfig.googleClientSecret || '',
};

// ---------- time zone helpers ----------
function tzOffset(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

// Wall-clock time in `tz` -> real Date
function zonedTime(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = guess - tzOffset(new Date(guess), tz);
  return new Date(guess - tzOffset(new Date(first), tz));
}

function localDateParts(date, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map(x => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day };
}

// ---------- availability ----------
// Stable pseudo-random pick of times to keep blocked, so the schedule doesn't
// look empty. Same result on every refresh; those times really can't be booked.
const hashShare = key => crypto.createHash('sha256').update(key).digest().readUInt32BE(0) / 0xffffffff;
function isHeld(iso, date) {
  if (hashShare(`open-day:${date}`) < config.openDayShare) return false;
  return hashShare(`held:${iso}`) < config.heldShare;
}

async function getSlots() {
  const tz = config.timezone;
  const taken = new Set((await store.listBookings()).filter(b => b.status !== 'cancelled').map(b => b.start));
  const earliest = Date.now() + config.minNoticeHours * 3600e3;
  const today = localDateParts(new Date(), tz);
  const days = [];

  for (let i = 0; i < config.daysAhead; i++) {
    // noon on day i avoids DST edge cases when stepping days
    const noon = zonedTime(today.y, today.m, today.d + i, 12, 0, tz);
    const { y, m, d } = localDateParts(noon, tz);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const open = config.hours[weekday];
    if (!open) continue;

    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const slots = [];
    const unavailable = [];
    let held = 0;
    for (let mins = open[0] * 60; mins + config.slotMinutes <= open[1] * 60; mins += config.slotMinutes) {
      const start = zonedTime(y, m, d, Math.floor(mins / 60), mins % 60, tz);
      if (start.getTime() < earliest) continue;
      const iso = start.toISOString();
      const hold = !taken.has(iso) && held < config.maxHeldPerDay && isHeld(iso, date);
      if (hold) held++;
      (taken.has(iso) || hold ? unavailable : slots).push(iso);
    }
    if (slots.length) days.push({ date, slots, unavailable });
  }
  return days;
}

// ---------- signing (stateless sessions & OAuth state) ----------
const secretKey = () => crypto.createHash('sha256')
  .update(`gm-session:${config.adminPassword}:${env.SESSION_SECRET || ''}`).digest();
const sign = value => crypto.createHmac('sha256', secretKey()).update(value).digest('base64url');

function makeToken(ttlSeconds, purpose) {
  const exp = Date.now() + ttlSeconds * 1000;
  return `${exp}.${sign(`${purpose}:${exp}`)}`;
}

function checkToken(token, purpose) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(`${purpose}:${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// ---------- Google Calendar / Meet ----------
const googleConfigured = () => Boolean(config.googleClientId && config.googleClientSecret);
const googleConnected = async () => googleConfigured() && Boolean((await store.getGoogleToken())?.refresh_token);

async function googleToken(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret, ...params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${json.error_description || json.error}`);
  return json;
}

async function getAccessToken() {
  const token = await store.getGoogleToken();
  if (!token?.refresh_token) throw new Error('Google Calendar is not connected');
  if (token.access_token && token.expires_at > Date.now() + 60e3) return token.access_token;
  const fresh = await googleToken({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
  const updated = { ...token, access_token: fresh.access_token, expires_at: Date.now() + fresh.expires_in * 1000 };
  await store.setGoogleToken(updated);
  return updated.access_token;
}

async function createMeetEvent(booking) {
  const accessToken = await getAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: `GM Web Co. × ${booking.business || booking.name} — Website Consultation`,
      description: [
        `Client: ${booking.name}`,
        `Email: ${booking.email}`,
        booking.phone && `Phone: ${booking.phone}`,
        booking.business && `Business: ${booking.business}`,
        booking.package && `Interested in: ${booking.package}`,
        booking.budget && `Budget: ${booking.budget}`,
        booking.notes && `\nNotes:\n${booking.notes}`,
        `\nNeed to change or cancel? ${manageUrl(booking)}`,
      ].filter(Boolean).join('\n'),
      start: { dateTime: booking.start, timeZone: config.timezone },
      end: { dateTime: booking.end, timeZone: config.timezone },
      attendees: [
        { email: booking.email, displayName: booking.name },
        ...config.notifyEmails.filter(e => e.toLowerCase() !== booking.email).map(email => ({ email, responseStatus: 'accepted' })),
      ],
      guestsCanSeeOtherGuests: false,
      conferenceData: { createRequest: { requestId: `${booking.id}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Calendar error: ${json.error?.message || res.status}`);
  const meet = json.hangoutLink || json.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;
  return { eventId: json.id, eventLink: json.htmlLink, meetLink: meet, meetFromGoogle: true };
}

// Moves an existing event to a new time; Google emails everyone the update.
async function moveMeetEvent(eventId, start, end) {
  const accessToken = await getAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: { dateTime: start, timeZone: config.timezone }, end: { dateTime: end, timeZone: config.timezone } }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar error: ${json.error?.message || res.status}`);
  }
}

// Removes the event from Google Calendar and emails the client a cancellation.
async function deleteMeetEvent(eventId) {
  const accessToken = await getAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const json = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar error: ${json.error?.message || res.status}`);
  }
}

// ---------- HTTP helpers ----------
function send(res, status, body, type = 'application/json', cache = 'no-store') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

async function readBody(req) {
  // Vercel pre-parses JSON bodies; the local server gives us a raw stream.
  if ('body' in req) {
    try { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { return {}; }
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const manageUrl = b => `${config.siteUrl}/manage?b=${b.id}&t=${b.manageToken}`;
const tokenMatches = (b, t) => {
  const a = Buffer.from(String(b?.manageToken || '')), g = Buffer.from(String(t || ''));
  return a.length > 0 && a.length === g.length && crypto.timingSafeEqual(a, g);
};
const publicBooking = b => ({
  id: b.id, name: b.name, start: b.start, end: b.end, status: b.status,
  meetLink: b.status === 'cancelled' ? null : b.meetLink || null,
});
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
const isHttps = req => req.headers['x-forwarded-proto'] === 'https';
const baseUrl = req => `${isHttps(req) ? 'https' : 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(([k]) => k));
}

const SESSION_HOURS = 12;
const sessionCookie = (req, value, maxAge) =>
  `gm_admin=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
const isAuthed = req => Boolean(config.adminPassword) && checkToken(parseCookies(req).gm_admin, 'admin');

function passwordMatches(input) {
  if (!config.adminPassword) return false;
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- routes ----------
async function handle(req, res, pathname) {
  const url = new URL(req.url, 'http://localhost');
  pathname = pathname || url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/slots') {
      // Cached at Vercel's edge for a few seconds so a flood of requests hits the CDN, not the function/database.
      // Booking still re-checks availability, so a slightly stale list can't cause a double booking.
      return send(res, 200, { timezone: config.timezone, slotMinutes: config.slotMinutes, days: await getSlots() },
        'application/json', 'public, s-maxage=10, stale-while-revalidate=30');
    }

    if (req.method === 'POST' && pathname === '/api/book') {
      const body = await readBody(req);
      const ip = clientIp(req);

      // Spam protection: bots fill the hidden "website" field or submit instantly
      const filledIn = Number(body.elapsedMs) || 0;
      if (clean(body.website) || filledIn < 3000) {
        return send(res, 400, { error: 'Something went wrong. Please refresh the page and try again.' });
      }
      if ((await store.hit(`book:${ip}`, 24 * 3600)) > 3) {
        return send(res, 429, { error: 'Too many bookings from this connection today. Email us and we’ll set up a time.' });
      }

      const booking = {
        id: crypto.randomUUID().replace(/-/g, ''),
        name: clean(body.name, 100),
        email: clean(body.email, 150).toLowerCase(),
        phone: clean(body.phone, 40),
        business: clean(body.business, 120),
        package: clean(body.package, 60),
        budget: clean(body.budget, 60),
        notes: clean(body.notes, 2000),
        start: clean(body.start, 40),
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        manageToken: crypto.randomBytes(18).toString('base64url'),
      };
      if (!booking.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) {
        return send(res, 400, { error: 'Please enter your name and a valid email.' });
      }
      // One upcoming call per email address
      const already = (await store.listBookings()).find(b =>
        b.email === booking.email && b.status === 'confirmed' && new Date(b.end).getTime() > Date.now());
      if (already) {
        return send(res, 409, { error: 'You already have a call booked. Use the “change or cancel” link in your confirmation to move it.' });
      }
      const validSlots = new Set((await getSlots()).flatMap(d => d.slots));
      if (!validSlots.has(booking.start) || !(await store.claimSlot(booking.start, booking.id))) {
        return send(res, 409, { error: 'That time is no longer available. Please pick another slot.' });
      }
      booking.end = new Date(new Date(booking.start).getTime() + config.slotMinutes * 60e3).toISOString();

      if (await googleConnected()) {
        try {
          Object.assign(booking, await createMeetEvent(booking));
        } catch (e) {
          console.error(e.message);
          booking.googleError = e.message;
        }
      }

      await store.saveBooking(booking);
      console.log(`New booking: ${booking.name} <${booking.email}> at ${booking.start}`);
      return send(res, 201, {
        id: booking.id, start: booking.start, end: booking.end,
        meetLink: booking.meetLink || null,
        calendarInvite: Boolean(booking.meetLink),
        manageUrl: manageUrl(booking),
      });
    }

    // ----- customer self-service: view, cancel or move their own booking -----
    if (pathname.startsWith('/api/manage')) {
      if ((await store.hit(`manage:${clientIp(req)}`, 600)) > 40) {
        return send(res, 429, { error: 'Too many requests. Please try again in a few minutes.' });
      }
      const q = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await readBody(req);
      const b = q.b && await store.getBooking(clean(q.b, 64));
      if (!b || !tokenMatches(b, q.t)) return send(res, 404, { error: 'We couldn’t find that booking. Check the link in your confirmation.' });

      if (req.method === 'GET' && pathname === '/api/manage') {
        return send(res, 200, { booking: publicBooking(b), slotMinutes: config.slotMinutes, days: await getSlots() });
      }
      if (b.status !== 'confirmed' || new Date(b.start).getTime() < Date.now()) {
        return send(res, 400, { error: 'This call can’t be changed anymore.' });
      }

      if (req.method === 'POST' && pathname === '/api/manage/cancel') {
        await store.releaseSlot(b.start);
        if (b.eventId) {
          try { await deleteMeetEvent(b.eventId); delete b.eventId; delete b.eventLink; if (b.meetFromGoogle) { b.meetLink = ''; delete b.meetFromGoogle; } }
          catch (e) { b.googleError = e.message; }
        }
        Object.assign(b, { status: 'cancelled', cancelledBy: 'client', updatedAt: new Date().toISOString() });
        await store.saveBooking(b);
        return send(res, 200, { booking: publicBooking(b) });
      }

      if (req.method === 'POST' && pathname === '/api/manage/reschedule') {
        const start = clean(q.start, 40);
        const valid = new Set((await getSlots()).flatMap(d => d.slots));
        if (!valid.has(start) || !(await store.claimSlot(start, b.id))) {
          return send(res, 409, { error: 'That time is no longer available. Please pick another one.' });
        }
        await store.releaseSlot(b.start);
        const end = new Date(new Date(start).getTime() + config.slotMinutes * 60e3).toISOString();
        if (b.eventId) {
          try { await moveMeetEvent(b.eventId, start, end); } catch (e) { b.googleError = e.message; }
        }
        Object.assign(b, { start, end, rescheduledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await store.saveBooking(b);
        return send(res, 200, { booking: publicBooking(b) });
      }
      return send(res, 405, { error: 'Method not allowed' });
    }

    // ----- admin (password protected) -----
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if ((await store.loginFailures(ip)) >= 5) {
        return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      }
      if (!config.adminPassword) {
        return send(res, 503, { error: 'Admin password is not set.' });
      }
      const { password } = await readBody(req);
      if (!passwordMatches(password || '')) {
        await store.recordLoginFailure(ip);
        return send(res, 401, { error: 'Wrong password.' });
      }
      await store.clearLoginFailures(ip);
      res.setHeader('Set-Cookie', sessionCookie(req, makeToken(SESSION_HOURS * 3600, 'admin'), SESSION_HOURS * 3600));
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
      return send(res, 200, { ok: true });
    }

    if (pathname.startsWith('/api/admin/') || pathname === '/api/auth/google') {
      if (!isAuthed(req)) {
        return pathname === '/api/auth/google' ? redirect(res, '/admin') : send(res, 401, { error: 'Not logged in' });
      }
    }

    if (pathname === '/api/admin/bookings' && req.method === 'GET') {
      const all = (await store.listBookings()).sort((a, b) => a.start.localeCompare(b.start));
      return send(res, 200, {
        bookings: all,
        timezone: config.timezone,
        google: { configured: googleConfigured(), connected: await googleConnected() },
      });
    }

    if (pathname.startsWith('/api/admin/bookings/') && req.method === 'PATCH') {
      const b = await store.getBooking(pathname.split('/').pop());
      if (!b) return send(res, 404, { error: 'Not found' });
      const body = await readBody(req);

      if (['confirmed', 'done', 'cancelled'].includes(body.status) && body.status !== b.status) {
        if (body.status === 'cancelled') await store.releaseSlot(b.start);
        if (b.status === 'cancelled' && !(await store.claimSlot(b.start, b.id))) {
          return send(res, 409, { error: 'Someone else booked that time since it was cancelled.' });
        }
        // Keep Google Calendar in sync: cancel removes the event, restore re-creates it
        if (body.status === 'cancelled' && b.eventId) {
          try {
            await deleteMeetEvent(b.eventId);
            delete b.eventId; delete b.eventLink;
            if (b.meetFromGoogle) { b.meetLink = ''; delete b.meetFromGoogle; }
          } catch (e) { b.googleError = e.message; }
        }
        if (b.status === 'cancelled' && body.status !== 'cancelled' && !b.eventId && await googleConnected()) {
          try { Object.assign(b, await createMeetEvent(b)); delete b.googleError; } catch (e) { b.googleError = e.message; }
        }
        b.status = body.status;
      }
      if (typeof body.meetLink === 'string') {
        const link = clean(body.meetLink, 300);
        if (link && !/^https:\/\//.test(link)) return send(res, 400, { error: 'Meet link must start with https://' });
        b.meetLink = link;
      }
      if (typeof body.adminNotes === 'string') b.adminNotes = clean(body.adminNotes, 2000);
      b.updatedAt = new Date().toISOString();
      await store.saveBooking(b);
      return send(res, 200, { booking: b });
    }

    if (pathname.startsWith('/api/admin/bookings/') && req.method === 'DELETE') {
      const b = await store.getBooking(pathname.split('/').pop());
      if (!b) return send(res, 404, { error: 'Not found' });
      if (b.status !== 'cancelled') return send(res, 400, { error: 'Cancel the meeting before deleting it.' });
      await store.deleteBooking(b.id);
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/google') {
      if (!googleConfigured()) {
        return send(res, 400, 'Google Calendar keys are not set up yet (see README.md).', 'text/plain');
      }
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({
        client_id: config.googleClientId,
        redirect_uri: `${baseUrl(req)}/api/oauth2callback`,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.events',
        access_type: 'offline',
        prompt: 'consent',
        state: makeToken(600, 'oauth'),
      });
      return redirect(res, auth.toString());
    }

    if (pathname === '/api/oauth2callback') {
      if (!checkToken(url.searchParams.get('state'), 'oauth')) {
        return send(res, 400, 'Invalid or expired sign-in attempt. Start again from the admin page.', 'text/plain');
      }
      const tok = await googleToken({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        redirect_uri: `${baseUrl(req)}/api/oauth2callback`,
      });
      await store.setGoogleToken({ ...tok, expires_at: Date.now() + tok.expires_in * 1000 });
      return redirect(res, '/admin?connected=1');
    }

    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    if (err.code === 'NO_DB') {
      return send(res, 503, { error: 'Online booking is temporarily unavailable. Please try again a little later.' });
    }
    return send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}

module.exports = { handle, config, googleConfigured, googleConnected, send };
