const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

// ================= Nav, year =================
$('#year').textContent = new Date().getFullYear();
const navToggle = $('#navToggle');
const navLinks = $('#navLinks');
function setMenu(open) {
  navLinks.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open);
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
navToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
$$('#navLinks a').forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => {
  if (e.key === 'Escape' && navLinks.classList.contains('open')) { setMenu(false); navToggle.focus(); }
});

// Logo and "Back to top" go all the way to the top
$$('a[href="#top"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  setMenu(false);
  scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  history.replaceState(null, '', location.pathname);
}));

const nav = $('.nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 10), { passive: true });

// ================= Headline word-by-word reveal =================
$$('.split').forEach(el => {
  let i = 0;
  const wrap = html => `<span class="w"><span style="--i:${i++}">${html}</span></span>`;
  el.innerHTML = [...el.childNodes].map(node =>
    node.nodeType === 3
      ? node.textContent.split(/(\s+)/).map(p => (p.trim() ? wrap(p) : p)).join('')
      : wrap(node.outerHTML)
  ).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
});

// ================= Scroll reveal =================
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    io.unobserve(e.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal').forEach(el => io.observe(el));

// ================= Process timeline: line fills as you scroll =================
const timeline = $('#timeline');
const steps = $$('.step');
function updateTimeline() {
  const r = timeline.getBoundingClientRect();
  const p = Math.min(Math.max((innerHeight * 0.6 - r.top) / r.height, 0), 1);
  timeline.style.setProperty('--p', p.toFixed(3));
  steps.forEach(s => s.classList.toggle('lit', s.getBoundingClientRect().top < innerHeight * 0.6));
}
let timelineQueued = false;
addEventListener('scroll', () => {
  if (timelineQueued) return;
  timelineQueued = true;
  requestAnimationFrame(() => { timelineQueued = false; updateTimeline(); });
}, { passive: true });
addEventListener('resize', updateTimeline);
updateTimeline();

// ================= Hero card: next open times from the booking system =================
(async function heroTimes() {
  const box = $('#hcTimes');
  try {
    const res = await fetch('/api/slots');
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    const slots = d.days.flatMap(day => day.slots).slice(0, 3);
    if (!slots.length) throw new Error('none');
    box.innerHTML = slots.map(iso => {
      const t = new Date(iso);
      const day = t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `<span>${day}<small>${time}</small></span>`;
    }).join('');
  } catch {
    box.innerHTML = '<span>Evenings &amp; weekends<small>Pick a time below</small></span>';
  }
})();

// ================= Testimonials (add entries to #testimonialData in index.html) =================
(function renderTestimonials() {
  let items = [];
  try { items = JSON.parse($('#testimonialData').textContent) || []; } catch { /* leave empty */ }
  const grid = $('#quotes');
  if (!items.length) return;
  $('#proof').hidden = false;
  $('#quotesEmpty').hidden = true;
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  grid.innerHTML = items.map(q => `
    <figure class="quote reveal">
      <blockquote>“${esc(q.quote)}”</blockquote>
      <figcaption>
        ${q.photo ? `<img src="${esc(q.photo)}" alt="" width="48" height="48" loading="lazy" />` : ''}
        <span><b>${esc(q.name)}</b><small>${esc(q.business)}</small></span>
        ${q.logo ? `<img class="q-logo" src="${esc(q.logo)}" alt="${esc(q.business)} logo" loading="lazy" />` : ''}
      </figcaption>
    </figure>`).join('');
  $$('#quotes .reveal').forEach(el => io.observe(el));
})();

// Pricing links pre-select the package in the booking form
$$('[data-package]').forEach(btn =>
  btn.addEventListener('click', () => { $('#packageSelect').value = btn.dataset.package; })
);

// ================= Booking =================
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const pageLoadedAt = Date.now();
let data = null;
let selectedDay = null;
let selectedSlot = null;

// Always English, 12-hour times (e.g. 5:00 PM), whatever the visitor's phone is set to
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const fmtLong = iso => new Date(iso).toLocaleString('en-US', {
  hour12: true,
  weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

async function loadSlots() {
  try {
    const res = await fetch('/api/slots');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    $('#tzNote').textContent = `Times are shown in your time zone (${userTz}).`;
    renderDays();
  } catch {
    $('#days').innerHTML = '<p class="error">Couldn’t load available times. Please refresh.</p>';
  }
}

function renderDays() {
  const days = $('#days');
  if (!data.days.length) {
    days.innerHTML = '<p class="muted">No open times right now — please check back soon.</p>';
    return;
  }
  days.innerHTML = '';
  data.days.forEach(day => {
    const first = new Date(day.slots[0]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day' + (day === selectedDay ? ' active' : '');
    btn.setAttribute('aria-pressed', day === selectedDay);
    btn.setAttribute('aria-label', `${first.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${day.slots.length} open times`);
    btn.innerHTML = `<small>${first.toLocaleDateString('en-US', { weekday: 'short' })}</small>
      <b>${first.getDate()}</b><small>${first.toLocaleDateString('en-US', { month: 'short' })}</small>
      <em class="open-count">${day.slots.length} open</em>`;
    btn.addEventListener('click', () => {
      selectedDay = day; selectedSlot = null; renderDays(); renderTimes(true); update();
      $('#days .day.active').focus(); // re-render replaced the clicked button
    });
    days.appendChild(btn);
  });
}

function renderTimes(animate = false) {
  const times = $('#times');
  times.innerHTML = '';
  const unavailable = new Set(selectedDay.unavailable || []);
  [...selectedDay.slots, ...unavailable].sort().forEach((iso, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const taken = unavailable.has(iso);
    btn.className = 'slot' + (taken ? ' taken' : '') + (iso === selectedSlot ? ' active' : '');
    if (animate) btn.style.setProperty('--i', i); else btn.style.animation = 'none';
    btn.textContent = fmtTime(iso);
    if (taken) {
      btn.disabled = true;
      btn.title = 'Unavailable';
      btn.setAttribute('aria-label', `${fmtTime(iso)}, unavailable`);
    } else {
      btn.setAttribute('aria-pressed', iso === selectedSlot);
      btn.addEventListener('click', () => { selectedSlot = iso; renderTimes(); update(); $('#times .slot.active').focus(); });
    }
    times.appendChild(btn);
  });
}

function update() {
  const sel = $('#selectedText');
  if (selectedSlot) {
    sel.textContent = `${fmtLong(selectedSlot)} · ${data.slotMinutes}-minute Google Meet`;
    sel.classList.add('ok');
  } else {
    sel.textContent = 'No time selected.';
    sel.classList.remove('ok');
  }
  $('#submitBtn').disabled = !selectedSlot;
}

function gcalUrl(start, end) {
  const f = iso => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Website consultation with GM Web Co.',
    dates: `${f(start)}/${f(end)}`,
    details: 'Free website consultation with GM Web Co. Look for the Google Meet link in your email.',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

$('#bookForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const err = $('#formError');
  err.textContent = '';
  const { name, email } = form.elements;
  if (!name.value.trim() || !email.value || !email.checkValidity()) {
    err.textContent = 'Please enter your name and a valid email.';
    return;
  }
  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Booking…';
  try {
    const body = Object.fromEntries(new FormData(form));
    body.start = selectedSlot;
    body.elapsedMs = Date.now() - pageLoadedAt;
    const res = await fetch('/api/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!res.ok) {
      err.textContent = out.error || 'Something went wrong.';
      if (res.status === 409) { selectedSlot = null; await loadSlots(); if (selectedDay) { selectedDay = data.days.find(d => d.date === selectedDay.date) || null; selectedDay ? renderTimes() : ($('#times').innerHTML = ''); } update(); }
      return;
    }
    showConfirm(out);
    form.reset();
  } catch {
    err.textContent = 'Network error. Please try again.';
  } finally {
    btn.textContent = 'Confirm booking';
    btn.disabled = !selectedSlot;
  }
});

function showConfirm(b) {
  $('#step1').hidden = true;
  $('#bookForm').hidden = true;
  $('#confirm').hidden = false;
  $('#confirmWhen').textContent = fmtLong(b.start);
  const meet = $('#meetLink');
  if (b.meetLink) {
    meet.href = b.meetLink;
    meet.hidden = false;
    $('#confirmMsg').textContent = 'A calendar invite with the Google Meet link has been sent to your email.';
  } else {
    meet.hidden = true;
    $('#confirmMsg').textContent = 'We’ll email you the Google Meet link before the call.';
  }
  $('#gcalLink').href = gcalUrl(b.start, b.end);
  if (b.manageUrl) { $('#manageLink').href = b.manageUrl; $('#manageLink').hidden = false; }
  $('#bookCard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

$('#bookAnother').addEventListener('click', () => {
  selectedDay = null; selectedSlot = null;
  $('#confirm').hidden = true;
  $('#step1').hidden = false;
  $('#bookForm').hidden = false;
  $('#times').innerHTML = '<p class="muted small">Select a date first.</p>';
  update();
  loadSlots();
});

loadSlots();
