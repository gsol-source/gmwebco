const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { bookings: [], tz: 'America/New_York', google: {}, tab: 'upcoming', query: '', open: new Set(), known: null, loadedAt: 0 };

// ================= Auth =================
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401 && !path.endsWith('/login')) { showLogin(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function showLogin() {
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  $('#password').focus();
}

function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginBtn');
  const err = $('#loginError');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = '';
    await load();
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    const card = $('.login-card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    $('#password').select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  state.known = null;
  showLogin();
});

// ================= Data =================
async function load({ silent = false } = {}) {
  const data = await api('/api/admin/bookings');
  state.bookings = data.bookings;
  state.tz = data.timezone || state.tz;
  state.google = data.google;
  state.loadedAt = Date.now();

  // Notify about bookings that came in since the last refresh
  const ids = new Set(data.bookings.map(b => b.id));
  if (state.known && silent) {
    const fresh = data.bookings.filter(b => !state.known.has(b.id));
    if (fresh.length) toast(fresh.length === 1 ? `New meeting booked: ${fresh[0].name}` : `${fresh.length} new meetings booked`);
  }
  state.known = ids;
  render();
}

const now = () => Date.now();
const category = b => b.status === 'cancelled' ? 'cancelled' : (new Date(b.end).getTime() < now() || b.status === 'done') ? 'past' : 'upcoming';

// ================= Formatting (in Miami time) =================
const fmt = (iso, o) => new Date(iso).toLocaleString('en-US', { timeZone: state.tz, hour12: true, ...o });
const dayKey = iso => fmt(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
function dayLabel(iso) {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(now() + 864e5).toISOString());
  const yesterday = dayKey(new Date(now() - 864e5).toISOString());
  const pretty = fmt(iso, { weekday: 'long', month: 'short', day: 'numeric' });
  if (key === today) return `<b>Today</b> · ${pretty}`;
  if (key === tomorrow) return `<b>Tomorrow</b> · ${pretty}`;
  if (key === yesterday) return `Yesterday · ${pretty}`;
  return pretty;
}
function relative(b) {
  const s = new Date(b.start).getTime(), e = new Date(b.end).getTime(), t = now();
  if (b.status === 'cancelled') return { text: 'Cancelled' };
  if (b.status === 'done') return { text: 'Done' };
  if (t >= s && t < e) return { text: 'Happening now', soon: true };
  if (t >= e) return { text: 'Past' };
  const mins = Math.round((s - t) / 60e3);
  if (mins < 60) return { text: `in ${mins} min`, soon: true };
  if (mins < 60 * 24) return { text: `in ${Math.round(mins / 60)} h`, soon: mins < 180 };
  return { text: `in ${Math.round(mins / 1440)} days` };
}

// ================= Render =================
function render() {
  const all = state.bookings;
  const cats = { upcoming: [], past: [], cancelled: [] };
  all.forEach(b => cats[category(b)].push(b));

  // Stats
  const today = dayKey(new Date().toISOString());
  const weekEnd = now() + 7 * 864e5;
  const active = all.filter(b => b.status !== 'cancelled');
  $('#stToday').textContent = active.filter(b => dayKey(b.start) === today).length;
  $('#stWeek').textContent = cats.upcoming.filter(b => new Date(b.start).getTime() < weekEnd).length;
  $('#stUpcoming').textContent = cats.upcoming.length;
  $('#stTotal').textContent = active.length;
  $('#cUpcoming').textContent = cats.upcoming.length || '';
  $('#cPast').textContent = cats.past.length || '';
  $('#cCancelled').textContent = cats.cancelled.length || '';
  $('#cAll').textContent = all.length || '';

  // Google status
  const banner = $('#googleBanner');
  if (state.google.connected) {
    banner.hidden = true;
  } else {
    banner.hidden = false;
    banner.innerHTML = state.google.configured
      ? `<span><b>Google Calendar isn’t connected.</b> Meet links won’t be created automatically.</span><a class="btn btn-sm" href="/api/auth/google">Connect Google</a>`
      : `<span><b>Meet links are manual for now.</b> Open a meeting, paste a Google Meet link, then email it to the client. See README.md to automate this.</span>`;
  }

  // List
  let items = state.tab === 'all' ? [...all] : cats[state.tab];
  const q = state.query.trim().toLowerCase();
  if (q) items = items.filter(b => [b.name, b.business, b.email, b.phone, b.notes, b.package].join(' ').toLowerCase().includes(q));
  items.sort((a, b) => state.tab === 'upcoming' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start));

  const list = $('#list');
  if (!items.length) {
    const msg = q ? ['No matches', 'Try a different search.']
      : state.tab === 'upcoming' ? ['No upcoming meetings', 'New bookings from the website will show up here.']
      : ['Nothing here yet', ''];
    list.innerHTML = `<div class="a-empty"><b>${msg[0]}</b>${msg[1]}</div>`;
  } else {
    let lastDay = '';
    list.innerHTML = items.map((b, i) => {
      const d = dayKey(b.start);
      const header = d !== lastDay ? `<p class="a-day">${dayLabel(b.start)}</p>` : '';
      lastDay = d;
      return header + card(b, i);
    }).join('');
  }
  updateStamp();
}

function card(b, i) {
  const cat = category(b);
  const rel = relative(b);
  const open = state.open.has(b.id);
  const statusChip = (b.status === 'done' ? '<span class="chip status-done">Done</span>'
    : b.status === 'cancelled' ? `<span class="chip status-cancelled">${b.cancelledBy === 'client' ? 'Cancelled by client' : 'Cancelled'}</span>` : '')
    + (b.rescheduledAt && b.status !== 'cancelled' ? '<span class="chip">Moved by client</span>' : '');
  const meetBtn = b.status === 'cancelled' ? ''
    : b.meetLink ? `<a class="btn" href="${esc(b.meetLink)}" target="_blank" rel="noopener" data-stop>Join Meet</a>`
    : `<button class="btn btn-ghost" data-act="toggle">Add Meet link</button>`;

  return `
  <article class="m is-${cat} ${open ? 'open' : ''}" data-id="${b.id}" style="animation-delay:${Math.min(i, 10) * 30}ms">
    <div class="m-row" data-act="toggle">
      <div class="m-time">
        <b>${esc(fmt(b.start, { hour: 'numeric', minute: '2-digit' }))}</b>
        <small class="${rel.soon ? 'soon' : ''}">${esc(rel.text)}</small>
      </div>
      <div>
        <div class="m-name">${esc(b.name)}${b.business ? ` <span>· ${esc(b.business)}</span>` : ''}</div>
        <div class="m-sub">
          <span>${esc(b.email)}</span>
          ${b.package ? `<span class="chip">${esc(b.package)}</span>` : ''}
          ${b.budget ? `<span class="chip">${esc(b.budget)}</span>` : ''}
          ${statusChip}
        </div>
      </div>
      <div class="m-actions">${meetBtn}<button class="caret-btn" aria-label="Details" aria-expanded="${open}" data-act="toggle">⌄</button></div>
    </div>

    <div class="m-body">
      <div>
        <h4>Client</h4>
        <dl>
          <dt>Email</dt><dd><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></dd>
          ${b.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></dd>` : ''}
          ${b.business ? `<dt>Business</dt><dd>${esc(b.business)}</dd>` : ''}
          <dt>Package</dt><dd>${esc(b.package || 'Not sure yet')}</dd>
          <dt>Budget</dt><dd>${esc(b.budget || 'Prefer to discuss')}</dd>
          <dt>When</dt><dd>${esc(fmt(b.start, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))}</dd>
          <dt>Booked</dt><dd>${esc(fmt(b.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</dd>
        </dl>
        <h4 style="margin-top:20px">About their project</h4>
        <p class="m-notes">${b.notes ? esc(b.notes) : '<span class="muted">No notes left.</span>'}</p>
      </div>
      <div>
        <h4>Google Meet link</h4>
        <div class="m-field">
          <input type="url" placeholder="https://meet.google.com/…" value="${esc(b.meetLink || '')}" data-field="meetLink" />
          <button class="btn btn-sm" data-act="saveLink">Save</button>
        </div>
        <p class="m-help">Need one? <a href="https://meet.new" target="_blank" rel="noopener">Create a Meet ↗</a>, paste it here, then email it to the client.</p>
        <h4>Private notes</h4>
        <textarea rows="4" placeholder="Only you and Matthew see this — prices discussed, next steps…" data-field="adminNotes">${esc(b.adminNotes || '')}</textarea>
      </div>
      <div class="m-foot">
        <a class="btn btn-ghost" href="${mailto(b)}">Email client</a>
        <button class="btn btn-ghost" data-act="copy">Copy email</button>
        ${b.status === 'cancelled'
          ? `<button class="btn btn-ghost" data-act="status" data-status="confirmed">Restore meeting</button>
             <button class="btn btn-danger" data-act="delete">Delete permanently</button>`
          : `${b.status === 'done'
              ? `<button class="btn btn-ghost" data-act="status" data-status="confirmed">Mark as not done</button>`
              : `<button class="btn btn-ghost" data-act="status" data-status="done">Mark as done</button>`}
             <button class="btn btn-danger" data-act="status" data-status="cancelled">Cancel meeting</button>`}
      </div>
    </div>
  </article>`;
}

function mailto(b) {
  const when = fmt(b.start, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const body = [
    `Hi ${b.name.split(' ')[0]},`,
    '',
    `Thanks for booking a call with GM Web Co.! We're confirmed for ${when}.`,
    '',
    b.meetLink ? `Google Meet link: ${b.meetLink}` : 'We’ll send the Google Meet link shortly.',
    '',
    'Talk soon,',
    'Galileo & Matthew',
    'GM Web Co.',
  ].join('\n');
  return `mailto:${encodeURIComponent(b.email)}?subject=${encodeURIComponent('Your GM Web Co. consultation')}&body=${encodeURIComponent(body)}`;
}

// ================= Interactions =================
async function patch(id, changes, msg) {
  try {
    const { booking } = await api(`/api/admin/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
    Object.assign(state.bookings.find(b => b.id === id), booking);
    if (msg) toast(msg);
    render();
  } catch (e) {
    if (e.message !== 'unauthorized') toast(e.message);
  }
}

$('#list').addEventListener('click', e => {
  if (e.target.closest('[data-stop], a')) return;
  const el = e.target.closest('[data-act]');
  const m = e.target.closest('.m');
  if (!el || !m) return;
  const id = m.dataset.id;
  const b = state.bookings.find(x => x.id === id);

  switch (el.dataset.act) {
    case 'toggle':
      if (e.target.closest('.m-body')) return;
      state.open.has(id) ? state.open.delete(id) : state.open.add(id);
      m.classList.toggle('open');
      m.querySelector('.caret-btn').setAttribute('aria-expanded', m.classList.contains('open'));
      if (m.classList.contains('open') && !b.meetLink) m.querySelector('[data-field="meetLink"]')?.focus();
      break;
    case 'saveLink':
      patch(id, { meetLink: m.querySelector('[data-field="meetLink"]').value.trim() }, 'Meet link saved');
      break;
    case 'copy':
      navigator.clipboard.writeText(b.email).then(() => toast('Email copied'));
      break;
    case 'delete':
      if (!confirm(`Permanently delete the meeting with ${b.name}? This can’t be undone.`)) return;
      api(`/api/admin/bookings/${id}`, { method: 'DELETE' })
        .then(() => { state.bookings = state.bookings.filter(x => x.id !== id); state.open.delete(id); toast('Meeting deleted'); render(); })
        .catch(err => { if (err.message !== 'unauthorized') toast(err.message); });
      break;
    case 'status': {
      const s = el.dataset.status;
      if (s === 'cancelled' && !confirm(`Cancel the meeting with ${b.name}? The time slot will open up again.${b.eventId ? '\n\nAlso delete the event in Google Calendar.' : ''}`)) return;
      patch(id, { status: s }, { done: 'Marked as done', cancelled: 'Meeting cancelled', confirmed: 'Meeting restored' }[s]);
      break;
    }
  }
});

$('#list').addEventListener('change', e => {
  if (e.target.dataset.field !== 'adminNotes') return;
  patch(e.target.closest('.m').dataset.id, { adminNotes: e.target.value }, 'Notes saved');
});

$('#list').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.dataset.field === 'meetLink') {
    e.preventDefault();
    e.target.closest('.m').querySelector('[data-act="saveLink"]').click();
  }
});

$('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  document.querySelectorAll('#tabs button').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.setAttribute('aria-pressed', b === btn);
  });
  render();
});

$('#search').addEventListener('input', e => { state.query = e.target.value; render(); });

$('#refreshBtn').addEventListener('click', async () => {
  await load();
  toast('Up to date');
});

// ================= Misc =================
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function updateStamp() {
  const secs = Math.round((Date.now() - state.loadedAt) / 1000);
  $('#updated').textContent = `Updated ${secs < 10 ? 'just now' : secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)} min ago`} · times in Miami time`;
}

// Auto-refresh every 30s while the dashboard is open (skip while typing)
setInterval(() => {
  if ($('#appView').hidden) return;
  const typing = document.activeElement?.matches('#list input, #list textarea');
  if (!typing) load({ silent: true }).catch(() => {});
  else updateStamp();
}, 30e3);
setInterval(() => { if (!$('#appView').hidden) updateStamp(); }, 10e3);

if (new URLSearchParams(location.search).get('connected')) {
  history.replaceState(null, '', '/admin');
  setTimeout(() => toast('Google Calendar connected'), 600);
}

// Start: try loading — the server tells us if we need to log in
load().then(showApp).catch(() => {});
