/* Scroll depth: one scheduled frame per scroll, visible scenes only, no wheel hijacking. */
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 700px)');
  const scenes = [...document.querySelectorAll('[data-scene]')].map(el => ({
    el, layers: [...el.querySelectorAll('[data-depth]')], visible: false
  }));
  if (!scenes.length || !('IntersectionObserver' in window)) return;
  let frame = 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function render() {
    frame = 0;
    if (motion.matches || document.hidden) return;
    // Complete all geometry reads before writing transforms.
    const measurements = scenes.filter(s => s.visible).map(s => ({
      scene: s, rect: s.el.getBoundingClientRect()
    }));
    for (const {scene, rect} of measurements) {
      const p = clamp((innerHeight * .5 - rect.top - rect.height * .5) / ((innerHeight + rect.height) * .5), -1, 1);
      const amplitude = compact.matches ? .35 : 1;
      for (const layer of scene.layers) {
        const d = p * amplitude;
        const type = layer.dataset.depth;
        if (type === 'back') layer.style.transform = `translate3d(0,${d * 65}px,0) scale(${1.03 + Math.abs(d) * .015})`;
        if (type === 'image') layer.style.transform = `translate3d(0,${d * 38}px,0)`;
        if (type === 'title') layer.style.transform = `translate3d(0,${d * -35}px,28px)`;
        if (type === 'front') layer.style.transform = `translate3d(0,${d * -48}px,${25 + d * 28}px) rotateX(${d * -7}deg) rotateY(${-7 + d * 7}deg) rotateZ(${d * 1.4}deg)`;
      }
    }
  }
  function schedule() {
    if (!frame && !motion.matches && !document.hidden) frame = requestAnimationFrame(render);
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const s = scenes.find(s => s.el === entry.target);
      s.visible = entry.isIntersecting;
    }
    schedule();
  }, {rootMargin: '100px 0px'});
  scenes.forEach(s => observer.observe(s.el));
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule, {passive:true});
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    scenes.forEach(s => s.layers.forEach(l => l.style.removeProperty('transform')));
    schedule();
  });
  compact.addEventListener('change', schedule);
})();
