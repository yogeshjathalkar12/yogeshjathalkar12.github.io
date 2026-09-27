// Vapus landing page "solar system": builds the asteroid belt, tilts the scene slightly with the pointer, and pauses when off screen.
(() => {
  const wrap = document.querySelector('.sys-wrap'), stage = document.getElementById('sys-stage'), belt = document.getElementById('sys-belt');
  if (!wrap || !stage) return;
  if (belt) {
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };       // fixed seed: the same belt every visit
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 130; i++) {
      const d = document.createElement('i'); d.className = 'sys-rock';
      d.style.setProperty('--a', (rnd() * 360).toFixed(1) + 'deg');
      d.style.setProperty('--j', ((rnd() - 0.5) * 36).toFixed(1));
      d.style.setProperty('--z', ((rnd() - 0.5) * 20).toFixed(1));
      d.style.setProperty('--sz', (2 + rnd() * rnd() * 7).toFixed(1));
      frag.appendChild(d);
    }
    belt.appendChild(frag);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => wrap.classList.toggle('sys-off', !es.some((e) => e.isIntersecting))).observe(stage);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(hover: none)').matches) return;
  const base = () => (innerWidth <= 760 ? 62 : 58);
  let cur = base(), goal = cur, raf = 0;
  const step = () => { cur += (goal - cur) * 0.08; wrap.style.setProperty('--tilt', cur.toFixed(2) + 'deg'); raf = Math.abs(goal - cur) > 0.05 ? requestAnimationFrame(step) : 0; };
  const go = (v) => { goal = v; if (!raf) raf = requestAnimationFrame(step); };
  stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); go(base() - ((e.clientY - r.top) / r.height - 0.5) * 16); });
  stage.addEventListener('pointerleave', () => go(base()));
})();
