// Raptor page graphic: the signal structure, small, in the lower right corner (beside the assistant). It turns slowly by itself and
// also spins and tilts with scrolling. It is decoration only, and it can be switched off with the button at the bottom left (the
// choice is remembered). Same data and layout as the interactive map (signals.json, signal-layout.js): no sample data.
//
// It is drawn on a plain 2D canvas with a few lines of projection maths, NOT with WebGL / three.js. That is deliberate: it needs no
// 3D library download (the old version fetched about 600 KB of it), it works on computers where the browser has 3D graphics switched
// off or blocked, and it costs very little to draw.
//
// Care taken: it loads after the page is idle, pauses when the tab is hidden, caps the pixel ratio, switches itself off on a slow
// device, stays still (turning only as you scroll) for people who prefer reduced motion, and is not loaded at all on phones or
// when data saving is on.
const canvas = document.getElementById('sb-bg-canvas'), btn = document.getElementById('sb-bg-toggle');
if (canvas && btn) {
  const KEY = 'raptor-bg3d';
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const phone = matchMedia('(max-width: 700px)').matches;   // the corner graphic is hidden on phones: do not even download the data
  const COLORS = { fit: '#7c3aed', trigger: '#ec4899', size: '#f59e0b', web: '#10b981', tech: '#0ea5e9', need: '#ef4444', industry: '#8b5cf6', news: '#14b8a6', contact: '#f97316' };
  let want = !phone && (store.get() ? store.get() === 'on' : !saveData);
  let state = 'idle', slow = false, raf = 0, api = null;

  const label = () => {
    btn.setAttribute('aria-pressed', String(want && !slow));
    btn.querySelector('span').textContent = slow ? '3D graphic: off (slow device)' : '3D graphic: ' + (want ? 'on' : 'off');
    btn.title = 'Show or hide the small turning 3D graphic';
  };
  const apply = () => {
    const on = want && !slow && state === 'ready';
    canvas.classList.toggle('on', on);
    document.body.classList.toggle('has-3d-bg', on);
    if (want && !slow && state === 'idle') init();
    if (on) run();
  };
  btn.addEventListener('click', () => { want = !want; slow = false; store.set(want ? 'on' : 'off'); label(); apply(); });
  label();

  async function init() {
    state = 'loading';
    try {
      const [data, lay] = await Promise.all([
        fetch('/ventures/raptor/assets/signals.json').then((r) => r.json()), import('./signal-layout.js?v=11'),
      ]);
      const L = lay.layout(data);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');

      // dots (one per signal, coloured by group), the lines that carry each group into the estimate, and the core
      const dots = data.signals.map((s) => ({ p: L.positions[s.name], color: COLORS[s.group] || '#888' }));
      const spokes = data.groups.map((g) => ({ p: L.groups[g.id].center, color: COLORS[g.id] || '#888' }));
      // the core: a small wireframe diamond
      const CORE = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => v.map((n) => n * 1.5));
      const CORE_EDGES = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];

      let W = 1, H = 1, scale = 1, dpr = 1;
      const fit = () => {
        W = Math.max(canvas.clientWidth, 1); H = Math.max(canvas.clientHeight, 1);
        dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        scale = (Math.min(W, H) / 2) / (L.sceneRadius * 1.12);   // the whole structure sits inside the box, with room to tip
      };
      addEventListener('resize', fit); fit();

      const FOCAL = 4;   // gentle perspective: nearer dots a little bigger
      let yaw = 0, impulse = 0, lastY = scrollY, last = performance.now(), frames = 0, slowFrames = 0, coreSpin = 0;

      function project(p, cy, sy, cx, sx, k) {
        // rotate about Y (yaw), then tip about X, then perspective
        const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy, y1 = p[1];
        const y2 = y1 * cx - z1 * sx, z2 = y1 * sx + z1 * cx;
        const f = FOCAL * L.sceneRadius / (FOCAL * L.sceneRadius + z2);
        return [W / 2 + x1 * scale * k * f, H / 2 - y2 * scale * k * f, f, z2];
      }

      api = {
        draw(dt) {
          const y = scrollY, dy = y - lastY; lastY = y;
          const k = dt / 16.7;                                                            // frame-rate independent: same feel at 30 or 144 fps
          impulse += Math.max(-90, Math.min(90, dy)) * 0.000008; impulse *= Math.pow(0.96, k);   // scrolling gives it a gentle nudge, and it drifts to a stop
          yaw += (reduced ? 0 : dt * 0.000007) + impulse * k;                                // about one full turn in fifteen minutes
          const prog = y / Math.max(1, document.documentElement.scrollHeight - innerHeight);
          const ry = yaw + y * 0.00012, rx = 0.32 + Math.sin(y * 0.0004) * 0.14;           // it tips slowly as you move down the page
          const sw = 1 + prog * 0.06;                                                      // and swells a little towards the end
          coreSpin += dt * 0.00005;
          const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);

          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, W, H);
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5;
          const o = project([0, 0, 0], cy, sy, cx, sx, sw);
          for (const s of spokes) {
            const e = project(s.p, cy, sy, cx, sx, sw);
            ctx.strokeStyle = s.color; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
          }
          // core, spinning on its own
          const cc = Math.cos(coreSpin), cs = Math.sin(coreSpin);
          const cp = CORE.map((v) => project([v[0] * cc + v[2] * cs, v[1], -v[0] * cs + v[2] * cc], cy, sy, cx, sx, sw));
          ctx.globalAlpha = 0.9; ctx.strokeStyle = '#a855f7'; ctx.beginPath();
          for (const [a, b] of CORE_EDGES) { ctx.moveTo(cp[a][0], cp[a][1]); ctx.lineTo(cp[b][0], cp[b][1]); }
          ctx.stroke();
          // dots, far ones first so near ones sit on top
          const pts = dots.map((d) => ({ q: project(d.p, cy, sy, cx, sx, sw), color: d.color })).sort((a, b) => b.q[3] - a.q[3]);
          ctx.globalAlpha = 0.95;
          for (const d of pts) {
            const r = Math.max(1.2, 0.3 * scale * d.q[2]);
            ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.q[0], d.q[1], r, 0, 6.2832); ctx.fill();
          }
          ctx.globalAlpha = 1;
          frames++; canvas.dataset.frames = frames; canvas.dataset.yaw = ry.toFixed(5);
        },
        step(now) {
          const dt = Math.min(now - last, 100); last = now;
          if (frames > 20 && frames <= 140) { if (dt > 45) slowFrames++; if (frames === 140 && slowFrames > 60) { slow = true; label(); apply(); return false; } }
          this.draw(dt); return true;
        },
      };
      if (reduced) addEventListener('scroll', () => { if (want && !slow && state === 'ready') api.draw(16); }, { passive: true });
      state = 'ready'; canvas.dataset.state = 'ready';
      api.draw(16); apply();
    } catch (e) {
      state = 'failed'; canvas.dataset.state = 'failed'; btn.hidden = true; console.error('Raptor graphic unavailable:', e);
    }
  }

  function frame(now) {
    raf = 0;
    if (!(want && !slow && state === 'ready') || document.hidden) return;
    if (api.step(now)) raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf && !reduced && state === 'ready' && want && !slow) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });

  // start after the page has settled, so the graphic never delays what people came to read
  const start = () => { if (want) init(); };
  if (document.readyState === 'complete') (window.requestIdleCallback || setTimeout)(start, 300);
  else addEventListener('load', () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600)));
}
