const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionPreference.matches;
$('#year').textContent = new Date().getFullYear();

// Mobile navigation is a regular disclosure, with native link and keyboard behavior.
const menu = $('#menu');
const menuBtn = $('#menuBtn');
function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  const opening = menu.hidden;
  menu.hidden = !opening;
  menuBtn.setAttribute('aria-expanded', String(opening));
});
$$('#menu a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); }
});
document.addEventListener('click', e => {
  if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
});
matchMedia('(min-width: 541px)').addEventListener('change', e => { if (e.matches) closeMenu(); });

// Once-only reveals; content remains visible if JavaScript is unavailable.
const revealTargets = $$('.reveal');
const revealIO = new IntersectionObserver(entries => {
  entries.filter(e => e.isIntersecting).forEach(({ target }, index) => {
    target.style.transitionDelay = `${Math.min(index * 65, 195)}ms`;
    target.classList.add('in');
    revealIO.unobserve(target);
  });
}, { rootMargin: '0px 0px -4% 0px', threshold: 0 });
revealTargets.forEach(el => {
  if (reduceMotion || el.getBoundingClientRect().top < innerHeight * .96) el.classList.add('in');
  else { el.classList.add('pending'); revealIO.observe(el); }
});
document.addEventListener('focusin', e => {
  const el = e.target.closest('.pending');
  if (el) { el.style.transitionDelay = '0ms'; el.classList.add('in'); revealIO.unobserve(el); }
});

// Load the hero film near the viewport; decode only while it is on screen.
const videos = $$('[data-film]');
const visibleFilms = new Set();
function syncFilms() {
  videos.forEach(video => {
    if (!reduceMotion && !document.hidden && visibleFilms.has(video)) {
      const source = video.querySelector('source[data-src]');
      if (source) { source.src = source.dataset.src; source.removeAttribute('data-src'); video.load(); }
      video.play().catch(() => {});
    } else video.pause();
  });
}
const filmIO = new IntersectionObserver(entries => {
  entries.forEach(({ target, isIntersecting }) => isIntersecting ? visibleFilms.add(target) : visibleFilms.delete(target));
  syncFilms();
});
videos.forEach(video => filmIO.observe(video));
document.addEventListener('visibilitychange', syncFilms);
motionPreference.addEventListener('change', e => {
  reduceMotion = e.matches;
  if (reduceMotion) { revealIO.disconnect(); revealTargets.forEach(el => el.classList.add('in')); }
  syncFilms();
});

// A small amount of depth on the featured project, without moving the text.
const heroBrowser = $('.hero-browser');
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  heroBrowser.addEventListener('pointermove', e => {
    if (reduceMotion) return;
    const rect = heroBrowser.getBoundingClientRect();
    heroBrowser.style.setProperty('--rx', `${-((e.clientY - rect.top) / rect.height - .5) * 5}deg`);
    heroBrowser.style.setProperty('--ry', `${((e.clientX - rect.left) / rect.width - .5) * 6}deg`);
  });
  heroBrowser.addEventListener('pointerleave', () => {
    heroBrowser.style.setProperty('--rx', '0deg'); heroBrowser.style.setProperty('--ry', '0deg');
  });
}
let scrollQueued = false;
function updateNav() { scrollQueued = false; $('#nav').classList.toggle('scrolled', scrollY > 10); }
addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateNav); } }, { passive: true });
updateNav();

$$('[data-package]').forEach(a => a.addEventListener('click', () => { $('#packageSelect').value = a.dataset.package; }));
function updateClock() {
  const time = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  $$('[data-clock]').forEach(el => { el.textContent = `${time} · Mon–Fri 5–9 pm / Weekends 10 am–8 pm`; });
}
updateClock();
setInterval(updateClock, 60000);
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
    $('#tzNote').textContent = `Times shown in your time zone (${userTz}).`;
    renderDays();
  } catch {
    $('#days').innerHTML = '<p class="error">Couldn’t load open times. Please refresh, or call us.</p>';
  }
}

function renderDays() {
  const days = $('#days');
  if (!data.days.length) {
    days.innerHTML = '<p class="muted">No open times right now — please call or check back soon.</p>';
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
  $('#times').innerHTML = '<p class="muted">Select a day first.</p>';
  update();
  loadSlots();
});

loadSlots();
