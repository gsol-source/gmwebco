// GM Web Co. — scroll depth. Moves [data-depth] layers at a fraction of scroll speed so
// planes separate (plate behind, copy at 1:1, card in front). transform only, one rAF per
// scroll batch, nothing runs while a layer is off screen. No dependencies.
(() => {
  const layers = [...document.querySelectorAll('[data-depth]')];
  if (!layers.length) return;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const items = layers.map(el => ({ el, k: parseFloat(el.dataset.depth) * (coarse ? 0.55 : 1), mid: 0, on: false }));
  let queued = false, active = false;

  function measure() {
    items.forEach(it => {
      const anchor = it.el.parentElement.getBoundingClientRect();     // parent is never transformed by us
      it.mid = anchor.top + scrollY + anchor.height / 2;
    });
  }
  function frame() {
    queued = false;
    if (!active) return;                                              // reduced motion: layers stay put
    const vmid = scrollY + innerHeight / 2, lim = innerHeight * 1.2;
    for (const it of items) {
      if (!it.on) continue;
      const d = Math.max(-lim, Math.min(lim, vmid - it.mid));
      it.el.style.transform = `translate3d(0, ${(d * it.k).toFixed(1)}px, 0)`;
    }
  }
  function request() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  function start() {
    if (active) return; active = true; measure(); request();
    addEventListener('scroll', request, { passive: true });
  }
  function stop() {
    active = false; removeEventListener('scroll', request);
    items.forEach(it => { it.el.style.transform = ''; });
  }

  const io = new IntersectionObserver(es => es.forEach(e => {
    items.forEach(i => { if (i.el.parentElement === e.target) i.on = e.isIntersecting; });
    if (e.isIntersecting) request();
  }), { rootMargin: '20% 0px' });
  new Set(items.map(i => i.el.parentElement)).forEach(p => io.observe(p));

  const sync = () => (mq.matches ? stop() : start());
  mq.addEventListener('change', sync);
  addEventListener('resize', () => { if (active) { measure(); request(); } });
  addEventListener('load', () => { if (active) { measure(); request(); } });
  sync();
})();
