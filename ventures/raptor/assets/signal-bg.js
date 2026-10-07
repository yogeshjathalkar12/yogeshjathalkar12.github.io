// Raptor page backdrop: the signal structure, faint, behind the page. It turns slowly by itself and also spins, tilts and
// zooms with scrolling. It is decoration only, and it can be switched off with the button at the bottom left (the choice is remembered).
// Same data and layout as the interactive map (signals.json, signal-layout.js): no sample data.
//
// Care taken: it loads after the page is idle, pauses when the tab is hidden, caps the pixel ratio, switches itself off on a slow
// device, stays still (turning only as you scroll) for people who prefer reduced motion, and starts off when data saving is on.
const canvas = document.getElementById('sb-bg-canvas'), btn = document.getElementById('sb-bg-toggle');
if (canvas && btn) {
  const KEY = 'raptor-bg3d';
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const COLORS = { fit: '#7c3aed', trigger: '#ec4899', size: '#f59e0b', web: '#10b981', tech: '#0ea5e9', need: '#ef4444', industry: '#8b5cf6', news: '#14b8a6', contact: '#f97316' };
  let want = store.get() ? store.get() === 'on' : !saveData;
  let state = 'idle', slow = false, raf = 0, api = null;

  const label = () => {
    btn.setAttribute('aria-pressed', String(want && !slow));
    btn.querySelector('span').textContent = slow ? '3D backdrop: off (slow device)' : '3D backdrop: ' + (want ? 'on' : 'off');
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
      const [THREE, data, lay] = await Promise.all([
        import('three'), fetch('/ventures/raptor/assets/signals.json').then((r) => r.json()), import('./signal-layout.js?v=11'),
      ]);
      const L = lay.layout(data);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200), world = new THREE.Group();
      scene.add(world);

      // dots: one soft round sprite per signal, coloured by group
      const pos = new Float32Array(data.signals.length * 3), col = new Float32Array(data.signals.length * 3);
      data.signals.forEach((s, i) => {
        pos.set(L.positions[s.name], i * 3);
        const c = new THREE.Color(COLORS[s.group] || '#888'); col.set([c.r, c.g, c.b], i * 3);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
      world.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.62, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true })));

      // the lines that carry each group into the estimate, and the core
      const lp = [], lc = [];
      for (const g of data.groups) { const c = L.groups[g.id].center, k = new THREE.Color(COLORS[g.id] || '#888'); lp.push(...c, 0, 0, 0); lc.push(k.r, k.g, k.b, k.r, k.g, k.b); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
      world.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 })));
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), new THREE.MeshBasicMaterial({ color: '#a855f7', wireframe: true, transparent: true, opacity: 0.9 }));
      world.add(core);

      const fit = () => {
        const w = innerWidth, h = innerHeight;
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        // a little closer than "whole structure fits" so it fills the screen like a backdrop should
        const wide = camera.aspect > 1.15;                                   // on a phone or a narrow window it stays centred
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const dist = L.sceneRadius / (tanHalf * Math.min(1, camera.aspect)) * (wide ? 1.08 : 0.82);
        camera.position.set(0, 0, dist);
        // on a wide screen, sit it right of centre (about four fifths across), under the Download button: it pivots there, so it turns in place
        world.position.set(wide ? 0.31 * 2 * dist * tanHalf * camera.aspect : 0, wide ? -0.03 * 2 * dist * tanHalf : 0, 0);
      };
      addEventListener('resize', fit); fit();

      let yaw = 0, impulse = 0, lastY = scrollY, last = performance.now(), frames = 0, slowFrames = 0;
      api = {
        draw(dt) {
          const y = scrollY, dy = y - lastY; lastY = y;
          const k = dt / 16.7;                                                            // frame-rate independent: same feel at 30 or 144 fps
          impulse += Math.max(-90, Math.min(90, dy)) * 0.000008; impulse *= Math.pow(0.96, k);   // scrolling gives it a gentle nudge, and it drifts to a stop
          yaw += (reduced ? 0 : dt * 0.000007) + impulse * k;                                // about one full turn in fifteen minutes
          const prog = y / Math.max(1, document.documentElement.scrollHeight - innerHeight);
          world.rotation.y = yaw + y * 0.00012;
          world.rotation.x = 0.32 + Math.sin(y * 0.0004) * 0.14;                           // it tips slowly as you move down the page
          world.scale.setScalar(1 + prog * 0.12);                                          // and swells a little towards the end
          core.rotation.y += dt * 0.00005; core.rotation.x += dt * 0.00002;
          renderer.render(scene, camera);
          frames++; canvas.dataset.frames = frames; canvas.dataset.yaw = world.rotation.y.toFixed(5);
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
      state = 'failed'; canvas.dataset.state = 'failed'; btn.hidden = true; console.error('Raptor 3D backdrop unavailable:', e);
    }
  }

  function frame(now) {
    raf = 0;
    if (!(want && !slow && state === 'ready') || document.hidden) return;
    if (api.step(now)) raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf && !reduced && state === 'ready' && want && !slow) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });

  // start after the page has settled, so the backdrop never delays what people came to read
  const start = () => { if (want) init(); };
  if (document.readyState === 'complete') (window.requestIdleCallback || setTimeout)(start, 300);
  else addEventListener('load', () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 600)));
}
