// Shows real screenshots of the Raptor app, one step at a time. A step is shown only if its image file really exists:
// with no screenshots yet the whole section stays hidden, so this page never shows a mock-up or placeholder.
(async () => {
  const sec = document.getElementById('in-product'); if (!sec) return;
  let manifest; try { manifest = await (await fetch('/ventures/raptor/assets/product/manifest.json', { cache: 'no-cache' })).json(); } catch (e) { return; }
  const has = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; });
  const base = '/ventures/raptor/assets/product/';
  const found = (await Promise.all(manifest.steps.map(async (s) => (await has(base + s.file)) ? s : null))).filter(Boolean);
  if (!found.length) return;
  const list = document.getElementById('ip-steps'), shot = document.getElementById('ip-shot'), where = document.getElementById('ip-where'), cap = document.getElementById('ip-cap');
  const show = (i) => {
    const s = found[i];
    shot.src = base + s.file; shot.alt = s.title + ': ' + s.caption; where.textContent = s.where; cap.textContent = s.caption;
    list.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
  };
  found.forEach((s, i) => {
    const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b><span></span>'; b.querySelector('span').textContent = s.title;
    b.addEventListener('click', () => show(i)); li.appendChild(b); list.appendChild(li);
  });
  show(0); sec.hidden = false;
})();
