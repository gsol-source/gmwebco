// Lets a customer view, move or cancel their own call using the private link
// from their booking confirmation (?b=<booking id>&t=<secret token>).
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const auth = { b: params.get('b') || '', t: params.get('t') || '' };

const fmtTime = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const fmtLong = iso => new Date(iso).toLocaleString('en-US', {
  hour12: true, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

let data = null;
let selectedDay = null;
let selectedSlot = null;

async function call(path, body) {
  const res = body
    ? await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...auth, ...body }) })
    : await fetch(`${path}?b=${encodeURIComponent(auth.b)}&t=${encodeURIComponent(auth.t)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
  return json;
}

function show(b) {
  const upcoming = b.status === 'confirmed' && new Date(b.end).getTime() > Date.now();
  $('#mTitle').textContent = b.status === 'cancelled' ? 'Your call is cancelled.'
    : upcoming ? `Hi ${b.name.split(' ')[0]}, your call is booked.` : 'This call has already happened.';
  $('#mWhen').textContent = b.status === 'cancelled' ? 'Want to talk after all? Book a new time on our homepage.'
    : `${fmtLong(b.start)} · Google Meet with Galileo & Matthew`;
  $('#mActions').hidden = !upcoming;
  const meet = $('#mMeet');
  meet.hidden = !b.meetLink;
  if (b.meetLink) meet.href = b.meetLink;
  $('#mCancelBox').hidden = true;
  $('#mMoveBox').hidden = true;
}

async function load() {
  if (!auth.b || !auth.t) {
    $('#mTitle').textContent = 'Link not found';
    $('#mError').textContent = 'Open the “change or cancel” link from your booking confirmation or calendar invite.';
    return;
  }
  try {
    data = await call('/api/manage');
    show(data.booking);
  } catch (e) {
    $('#mTitle').textContent = 'Link not found';
    $('#mError').textContent = e.message;
  }
}

// ----- cancel -----
$('#mShowCancel').addEventListener('click', () => { $('#mMoveBox').hidden = true; $('#mCancelBox').hidden = false; });
$('#mCancelNo').addEventListener('click', () => { $('#mCancelBox').hidden = true; });
$('#mCancelYes').addEventListener('click', async e => {
  e.target.disabled = true;
  $('#mError').textContent = '';
  try { show((await call('/api/manage/cancel', {})).booking); }
  catch (err) { $('#mError').textContent = err.message; }
  finally { e.target.disabled = false; }
});

// ----- reschedule -----
function renderDays() {
  const days = $('#days');
  days.innerHTML = '';
  if (!data.days.length) { days.innerHTML = '<p class="muted small">No open times right now.</p>'; return; }
  data.days.forEach(day => {
    const first = new Date(day.slots[0]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day' + (day === selectedDay ? ' active' : '');
    btn.setAttribute('aria-pressed', day === selectedDay);
    btn.setAttribute('aria-label', first.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    btn.innerHTML = `<small>${first.toLocaleDateString('en-US', { weekday: 'short' })}</small>
      <b>${first.getDate()}</b><small>${first.toLocaleDateString('en-US', { month: 'short' })}</small>`;
    btn.addEventListener('click', () => { selectedDay = day; selectedSlot = null; renderDays(); renderTimes(); update(); $('#days .day.active').focus(); });
    days.appendChild(btn);
  });
}

function renderTimes() {
  const times = $('#times');
  times.innerHTML = '';
  selectedDay.slots.forEach(iso => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot' + (iso === selectedSlot ? ' active' : '');
    btn.style.animation = 'none';
    btn.setAttribute('aria-pressed', iso === selectedSlot);
    btn.textContent = fmtTime(iso);
    btn.addEventListener('click', () => { selectedSlot = iso; renderTimes(); update(); $('#times .slot.active').focus(); });
    times.appendChild(btn);
  });
}

function update() {
  const sel = $('#selectedText');
  sel.textContent = selectedSlot ? `New time: ${fmtLong(selectedSlot)}` : 'No time selected.';
  sel.classList.toggle('ok', Boolean(selectedSlot));
  $('#mMoveYes').disabled = !selectedSlot;
}

$('#mShowMove').addEventListener('click', () => {
  $('#mCancelBox').hidden = true;
  $('#mMoveBox').hidden = false;
  renderDays();
});

$('#mMoveYes').addEventListener('click', async e => {
  e.target.disabled = true;
  e.target.textContent = 'Moving…';
  $('#mError').textContent = '';
  try {
    const out = await call('/api/manage/reschedule', { start: selectedSlot });
    data = await call('/api/manage');
    selectedDay = null; selectedSlot = null;
    show(out.booking);
  } catch (err) {
    $('#mError').textContent = err.message;
    e.target.disabled = false;
  } finally {
    e.target.textContent = 'Move my call';
  }
});

load();
