// Raptor "signal brain", 2D version. signal-brain.js hands over to this when the browser cannot give it WebGL (3D graphics switched
// off, blocked by policy or by a remote desktop, or a very old GPU). Same data and the same layout as the 3D map (signals.json,
// signal-layout.js), same panel on the right (search, groups, details): the points are projected by hand and drawn on a normal
// 2D canvas. You can still drag to turn it, scroll to zoom, hover for the description and click a point. No sample data.
const COLORS = { fit: '#7c3aed', trigger: '#ec4899', size: '#f59e0b', web: '#10b981', tech: '#0ea5e9', need: '#ef4444', industry: '#8b5cf6', news: '#14b8a6', contact: '#f97316' };
const EVENT_LABEL = { pitch: 'Pitch sent', reply_engaged: 'Engaged reply', reply_positive: 'Positive reply', opt_out: 'Opt-out', bounce: 'Bounce', meeting: 'Meeting booked' };

export function start({ data, L, stage, canvas, rng }) {
  const $ = (id) => document.getElementById(id);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const groups = Object.fromEntries(data.groups.map((g) => [g.id, { ...g, color: COLORS[g.id] || '#888', center: L.groups[g.id].center, radius: L.groups[g.id].radius }]));
  const dots = data.signals.map((s) => ({ signal: s, group: groups[s.group], p: L.positions[s.name], base: 0.9 + rng(s.name)() * 0.25, q: null }));
  const events = data.model.event_types.map((e, i, a) => { const t = (i / a.length) * Math.PI * 2; return { label: EVENT_LABEL[e] || e, p: [Math.cos(t) * 3.6, 0, Math.sin(t) * 3.6] }; });

  // ---- view: turn, tilt, zoom ---------------------------------------------------------------------------------------
  const HOME = { yaw: 0.5, pitch: 0.25, zoom: 1 };
  let yaw = HOME.yaw, pitch = HOME.pitch, zoom = HOME.zoom, auto = !reduceMotion, ringSpin = 0, coreSpin = 0;
  let W = 1, H = 1, dpr = 1, base = 1;
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight; if (!W || !H) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    base = (Math.min(W, H) / 2) / (L.sceneRadius * 1.1);
  }
  new ResizeObserver(resize).observe(stage); addEventListener('resize', resize); resize();

  const FOCAL = 5;
  function project(p, cy, sy, cx, sx) {
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    const y2 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx;
    const f = (FOCAL * L.sceneRadius) / (FOCAL * L.sceneRadius + z2);
    const k = base * zoom * f;
    return { x: W / 2 + x1 * base * zoom * f, y: H / 2 - y2 * base * zoom * f, f, z: z2, k };
  }

  // ---- state: focus group, search, selection (same behaviour as the 3D map) ---------------------------------------------
  let focus = null, query = '', selected = null, hover = null, active = false;
  const legend = $('sb-legend'), search = $('sb-search'), count = $('sb-count'), detail = $('sb-detail'), tip = $('sb-tip');
  const matches = (d) => {
    const s = d.signal;
    if (focus && s.group !== focus) return false;
    if (query && !(s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || d.group.title.toLowerCase().includes(query))) return false;
    return true;
  };
  function refresh() {
    const shown = dots.filter(matches).length;
    count.textContent = (query || focus) ? `${shown} of ${data.total} signals` : `${data.total} signals`;
    legend.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.group === focus)));
  }
  for (const g of data.groups) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.group = g.id; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<i style="background:${COLORS[g.id]}"></i>${g.title}<small>${g.count}</small>`;
    b.addEventListener('click', () => { focus = focus === g.id ? null : g.id; showGroup(focus); refresh(); });
    legend.appendChild(b);
  }
  function showGroup(id) {
    if (!id) { detail.innerHTML = defaultDetail(); return; }
    const g = groups[id];
    detail.innerHTML = `<h4 style="color:${COLORS[id]}">${g.title}</h4><p>${g.blurb}</p><p class="sb-small">${g.count} signals in this group. Click any point to see exactly what it measures.</p>`;
  }
  function defaultDetail() {
    const m = data.model;
    return `<h4>How to read this</h4>
    <p>Each point is one thing Raptor measures about a prospect, always a number from 0 to 1, and zero when Raptor has no data for it. Points are grouped into ${data.groups.length} families.</p>
    <p>The signals feed one estimate, together with the history of what has happened to that prospect: ${m.event_types.length} kinds of event across ${m.channels.length} channels (${m.channels.join(', ')}), with the day of the week and the gap between touches. A small recurrent network (${m.hidden_units} units, the last ${m.max_history} events) reads that history.</p>
    <p class="sb-small">It learns from your own results and only switches on after ${m.min_prospects} answered prospects, ${m.min_positives} of them converting, and only if it beats chance on prospects it never trained on. Until then Raptor uses plain starting weights and labels the estimate that way.</p>`;
  }
  detail.innerHTML = defaultDetail();
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); refresh(); });
  function select(d) {
    selected = d;
    if (!d) { showGroup(focus); refresh(); return; }
    const s = d.signal, g = d.group;
    detail.innerHTML = `<h4 style="color:${COLORS[g.id]}">${s.description}</h4>
    <p class="sb-small">${g.title} &middot; <code>${s.name}</code></p>
    <p>A number from 0 to 1 that Raptor calculates for every prospect from what it can see. If the data is not there, it is 0.</p>`;
    refresh();
  }

  // ---- pointer: turn, zoom, hover, click (only while the gate is open) -----------------------------------------------------
  function pick(ev) {
    const r = canvas.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = null, bd = 1e9;
    for (const d of dots) {
      if (!d.q || !matches(d)) continue;
      const rad = Math.max(7, 0.2 * d.q.k * d.base * 1.4), dist = Math.hypot(d.q.x - mx, d.q.y - my);
      if (dist <= rad && (dist < bd || (best && d.q.z < best.q.z && dist < bd + 4))) { best = d; bd = dist; }
    }
    return best;
  }
  let down = null, last = null, dragged = false;
  canvas.addEventListener('pointerdown', (ev) => { if (!active) return; down = [ev.clientX, ev.clientY]; last = [ev.clientX, ev.clientY]; dragged = false; auto = false; canvas.setPointerCapture(ev.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (ev) => {
    if (!active) return;
    if (down) {
      yaw += (ev.clientX - last[0]) * 0.006; pitch = Math.max(-1.3, Math.min(1.3, pitch + (ev.clientY - last[1]) * 0.006));
      last = [ev.clientX, ev.clientY];
      if (Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) dragged = true;
      tip.hidden = true; return;
    }
    const d = pick(ev);
    if (d !== hover) { hover = d; canvas.style.cursor = d ? 'pointer' : 'grab'; }
    if (d) { tip.hidden = false; tip.textContent = d.signal.description; const r = stage.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 220) + 'px'; tip.style.top = (ev.clientY - r.top + 14) + 'px'; }
    else tip.hidden = true;
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (!active || !down) return;
    down = null; canvas.style.cursor = 'grab';
    if (!dragged) select(pick(ev));
  });
  canvas.addEventListener('wheel', (ev) => { if (!active) return; ev.preventDefault(); zoom = Math.max(0.6, Math.min(3, zoom * Math.exp(-ev.deltaY * 0.0012))); }, { passive: false });

  // ---- the gate ------------------------------------------------------------------------------------------------------------
  const act = $('sb-activate'), done = $('sb-done');
  const actLabel = act.querySelector('span'); if (actLabel) actLabel.textContent = 'Click to explore the map';
  function setActive(on) {
    active = on; stage.classList.toggle('sb-idle', !on); act.hidden = on; done.hidden = !on;
    canvas.style.cursor = on ? 'grab' : '';
    if (!on) { tip.hidden = true; down = null; auto = !reduceMotion; }
  }
  act.addEventListener('click', () => setActive(true));
  done.addEventListener('click', () => setActive(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setActive(false); });
  $('sb-reset').addEventListener('click', () => { focus = null; query = ''; search.value = ''; selected = null; yaw = HOME.yaw; pitch = HOME.pitch; zoom = HOME.zoom; detail.innerHTML = defaultDetail(); refresh(); });
  setActive(false); refresh();

  // ---- drawing --------------------------------------------------------------------------------------------------------------
  const CORE = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => v.map((n) => n * 1.05));
  const CORE_EDGES = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
  const text = (s, x, y, size, color, alpha, bold) => {
    ctx.font = `${bold ? 600 : 400} ${size}px 'DM Mono', ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha * 0.85; ctx.lineWidth = 3.5; ctx.strokeStyle = document.body.classList.contains('dark-mode') ? '#14121a' : '#f2eeea'; ctx.strokeText(s, x, y);   // a halo so a label stays readable over dots
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillText(s, x, y);
  };
  function draw(dt) {
    if (auto) yaw += dt * 0.00012;
    coreSpin += dt * 0.00035; if (!reduceMotion) ringSpin += dt * 0.00012;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    const ink = document.body.classList.contains('dark-mode') ? '#e5e7eb' : '#374151';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const o = project([0, 0, 0], cy, sy, cx, sx);

    // halos + lines from each group into the estimate
    for (const g of Object.values(groups)) {
      const on = !focus || focus === g.id, c = project(g.center, cy, sy, cx, sx);
      g.q = c;
      const rad = g.radius * 1.15 * c.k;
      ctx.globalAlpha = on ? 0.07 : 0.015; ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = on ? 0.3 : 0.06; ctx.strokeStyle = g.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    // the ring of events
    const rc = Math.cos(ringSpin), rs = Math.sin(ringSpin);
    const ev = events.map((e) => ({ e, q: project([e.p[0] * rc + e.p[2] * rs, 0, -e.p[0] * rs + e.p[2] * rc], cy, sy, cx, sx) }));
    ctx.strokeStyle = '#9ca3af'; ctx.globalAlpha = 0.25;
    for (const { q } of ev) { ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    // the core
    const cc = Math.cos(coreSpin), cs = Math.sin(coreSpin);
    const cp = CORE.map((v) => project([v[0] * cc + v[2] * cs, v[1], -v[0] * cs + v[2] * cc], cy, sy, cx, sx));
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#a855f7'; ctx.beginPath();
    for (const [a, b] of CORE_EDGES) { ctx.moveTo(cp[a].x, cp[a].y); ctx.lineTo(cp[b].x, cp[b].y); }
    ctx.stroke();

    // dots, far to near
    for (const d of dots) d.q = project(d.p, cy, sy, cx, sx);
    const order = dots.slice().sort((a, b) => b.q.z - a.q.z);
    for (const d of order) {
      const on = matches(d), sel = d === selected, hot = d === hover;
      const r = Math.max(1.6, 0.2 * d.q.k * d.base * (sel ? 2.4 : hot ? 1.8 : on && (query || focus) ? 1.25 : 1));
      ctx.globalAlpha = on ? 0.95 : 0.08; ctx.fillStyle = d.group.color; ctx.beginPath(); ctx.arc(d.q.x, d.q.y, r, 0, 6.2832); ctx.fill();
      if (sel || hot) { ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke(); }
    }
    for (const { e, q } of ev) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#9ca3af'; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2, 0.13 * q.k), 0, 6.2832); ctx.fill(); ctx.stroke(); if (zoom >= 1.4) text(e.label, q.x, q.y - 9, 10.5, ink, 0.7, false); }   // the event names only once you have zoomed in: at the start they crowd the middle

    // labels
    for (const g of Object.values(groups)) {
      const on = !focus || focus === g.id;
      const out = project([g.center[0] * (1 + (g.radius * 1.15 + 0.5) / Math.hypot(...g.center)), g.center[1] * (1 + (g.radius * 1.15 + 0.5) / Math.hypot(...g.center)) + 0.25, g.center[2] * (1 + (g.radius * 1.15 + 0.5) / Math.hypot(...g.center))], cy, sy, cx, sx);
      text(g.title, out.x, out.y, 11.5, g.color, on ? 1 : 0.25, true);
      text(`${g.count} signals`, out.x, out.y + 13, 10, ink, on ? 0.6 : 0.15, false);
    }
    text('Estimate', o.x, o.y + 1.5 * o.k + 4, 12, ink, 0.9, true);
    ctx.globalAlpha = 1;
  }

  let visible = true, prev = performance.now();
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(stage);
  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || !W || !H) return;
    const dt = Math.min(t - prev, 100); prev = t;
    draw(dt);
  }
  requestAnimationFrame(frame);
  stage.classList.add('sb-ready');
  $('sb-loading').hidden = true;
  stage.dataset.renderer = '2d';
}
