// Aura 3D Body Explorer.  Public page, no sign-in.  three.js + Draco, models streamed by level of detail.
// Models: BodyParts3D (DBCLS, CC BY-SA 2.1 Japan) and Z-Anatomy (CC BY-SA 4.0), modified: some structures removed,
// geometry simplified and compressed.  Generic educational anatomy. Not medical advice.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ── configuration ───────────────────────────────────────────────────────────────────────────────────
const DEFAULT_MODELS = 'https://cdn.jsdelivr.net/gh/yogeshjathalkar12/aura-body-models@v2/';
const THREE_VER = '0.171.0';
const DRACO_PATH = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/libs/draco/gltf/`;
// ?models=... is for local testing only; it may not point at some other website.
function modelsBase() {
  const q = new URLSearchParams(location.search).get('models');
  const ok = q && (q.startsWith('/') || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(q));
  return (ok ? q : DEFAULT_MODELS).replace(/\/?$/, '/');
}
const MODELS = modelsBase();

// outermost -> deepest. `rank` drives the depth slider (peeling).
const SYSTEMS = {
  muscular:       { label: 'Muscles',            rank: 0, color: '#d96a5b', on: false },
  lymphatic:      { label: 'Lymphatic',          rank: 1, color: '#7ec8a4', on: false },
  joints:         { label: 'Joints & ligaments', rank: 2, color: '#9aa9b8', on: false },
  nervous:        { label: 'Nervous system',     rank: 3, color: '#f2d15c', on: true },
  cardiovascular: { label: 'Circulation',        rank: 4, color: '#d64545', on: true },
  visceral:       { label: 'Organs',             rank: 5, color: '#e59a7a', on: true },
  skeletal:       { label: 'Skeleton',           rank: 6, color: '#e9e3d1', on: true },
};
const NSYS = Object.keys(SYSTEMS).length;
const $ = (id) => document.getElementById(id);

// ── DOM ─────────────────────────────────────────────────────────────────────────────────────────────
const stage = $('bx-stage'), canvas = $('bx-canvas'), tipEl = $('bx-tip'), labelsEl = $('bx-labels'), loadingEl = $('bx-loading'), failEl = $('bx-fail');
const hudZoom = $('bx-zoom'), hudDetail = $('bx-detail');
function fail(msg) { loadingEl.hidden = true; failEl.classList.add('show'); failEl.querySelector('[data-msg]').textContent = msg; }

// ── renderer / scene / camera ───────────────────────────────────────────────────────────────────────
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
} catch (e) { fail('Your browser could not start 3D graphics (WebGL). Try a recent Chrome, Edge, Firefox or Safari.'); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
const HOME = { pos: new THREE.Vector3(0, 0.98, 2.75), target: new THREE.Vector3(0, 0.9, 0) };
camera.position.copy(HOME.pos);
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x2a2018, 1.25));
const headlight = new THREE.DirectionalLight(0xffffff, 1.9); camera.add(headlight); headlight.position.set(0.4, 0.8, 1); scene.add(camera);
const rim = new THREE.DirectionalLight(0x8fb8ff, 0.7); rim.position.set(-1, 0.5, -1); scene.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.zoomToCursor = true;                 // zoom toward whatever is under the mouse: the heart of continuous zoom
controls.screenSpacePanning = true;
controls.minDistance = 0.03; controls.maxDistance = 6; controls.zoomSpeed = 1.15;
controls.target.copy(HOME.target);
canvas.tabIndex = 0; controls.listenToKeyEvents(canvas);

let dirty = true;
controls.addEventListener('change', () => { dirty = true; });
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
}
new ResizeObserver(resize).observe(stage); resize();

// ── loading ─────────────────────────────────────────────────────────────────────────────────────────
const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
const loader = new GLTFLoader().setDRACOLoader(draco);
let manifest = null;
const sys = {};            // per-system state
for (const [key, meta] of Object.entries(SYSTEMS)) {
  sys[key] = { key, ...meta, enabled: meta.on, group: new THREE.Group(), levels: {}, loading: {}, shown: null, opacity: 1, materials: new Set(), fullSince: 0 };
  sys[key].group.name = key; scene.add(sys[key].group);
}
const hidden = new Set();          // structure names the user hid
let pendingLoads = 0, booting = true;
// The centre overlay is only for the very first load. Later detail streams in silently (the HUD shows "loading").
function setLoading() {
  if (booting && manifest && pendingLoads === 0) booting = false;
  loadingEl.hidden = !booting;
}

function loadLevel(s, lvl) {
  if (s.levels[lvl] || s.loading[lvl]) return s.loading[lvl] || Promise.resolve();
  const info = manifest.systems[s.key]?.files?.[lvl]; if (!info) return Promise.resolve();
  pendingLoads++; setLoading();
  s.loading[lvl] = new Promise((resolve) => {
    loader.load(MODELS + info.file, (gltf) => {
      const root = gltf.scene, byName = new Map();
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.name = o.userData.za_name || o.name;
        o.matrixAutoUpdate = false; o.updateMatrixWorld(true);
        const m = o.material; if (!s.materials.has(m)) { m.roughness = 0.62; m.metalness = 0.05; s.materials.add(m); }
        if (!byName.has(o.userData.name)) byName.set(o.userData.name, []); byName.get(o.userData.name).push(o);
        o.visible = !hidden.has(o.userData.name);
      });
      root.visible = false; s.group.add(root); s.levels[lvl] = { root, byName };
      delete s.loading[lvl]; pendingLoads--; setLoading(); s.pickCache = null; applyOpacity(s); update(true); resolve();
    }, undefined, (err) => {
      delete s.loading[lvl]; pendingLoads--; setLoading(); s.failed = (s.failed || 0) + 1;
      if (!manifest || s.failed > 2 || lvl === 'lod0') fail('The anatomy files could not be loaded right now. Please check your connection and try again in a moment.');
      console.error('load failed', info.file, err); resolve();
    });
  });
  return s.loading[lvl];
}
function disposeLevel(s, lvl) {
  const l = s.levels[lvl]; if (!l) return;
  s.group.remove(l.root); l.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  delete s.levels[lvl]; s.pickCache = null; if (s.shown === lvl) s.shown = null;
}

// ── detail streaming: the level follows camera distance ─────────────────────────────────────────────
const LEVELS = ['lod0', 'lod1', 'full'];
const wantedLevel = (d) => (d > 1.5 ? 'lod0' : d > 0.55 ? 'lod1' : 'full');
const camDist = () => camera.position.distanceTo(controls.target);
function update(force) {
  if (!manifest) return;
  const d = camDist(), want = wantedLevel(d), now = performance.now();
  for (const s of Object.values(sys)) {
    const active = s.enabled && s.opacity > 0.01;
    if (active) {
      if (!s.levels[want]) loadLevel(s, want);
      let best = null;                                       // best already-loaded level at or below the wanted one
      for (let i = LEVELS.indexOf(want); i >= 0; i--) if (s.levels[LEVELS[i]]) { best = LEVELS[i]; break; }
      if (!best) for (const l of LEVELS) if (s.levels[l]) { best = l; break; }
      if (best !== s.shown || force) { for (const l of LEVELS) if (s.levels[l]) s.levels[l].root.visible = l === best; s.shown = best; s.pickCache = null; dirty = true; }
      if (best === 'full') s.fullSince = now;
    }
    s.group.visible = active;
    if (s.levels.full && want !== 'full' && d > 1.9 && now - s.fullSince > 8000) disposeLevel(s, 'full');   // free GPU memory when zoomed out
  }
}

// ── depth peeling ───────────────────────────────────────────────────────────────────────────────────
const ui = { peel: 0, auto: false, labels: true };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function peelValue() {
  if (!ui.auto) return ui.peel;
  const d = camDist(); return clamp(Math.log(2.6 / d) / Math.log(2.6 / 0.3), 0, 1);   // zooming in peels outer layers away
}
function applyOpacity(only) {
  const t = peelValue() * (NSYS - 1);
  for (const s of only ? [only] : Object.values(sys)) {
    const op = clamp(1 - (t - s.rank), 0, 1); s.opacity = op;
    for (const m of s.materials) {
      const tr = op < 0.995; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = op; m.depthWrite = op > 0.85;
    }
  }
  dirty = true;
}

// ── picking / hover / selection ─────────────────────────────────────────────────────────────────────
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pickables() {
  const list = [];
  for (const s of Object.values(sys)) {
    if (!s.enabled || s.opacity < 0.5 || !s.shown) continue;
    if (!s.pickCache) { s.pickCache = []; s.levels[s.shown].root.traverse((o) => { if (o.isMesh) s.pickCache.push(o); }); }
    for (const o of s.pickCache) if (o.visible) list.push(o);
  }
  return list;
}
function pickHitAt(ev) {
  const r = canvas.getBoundingClientRect(); mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera); return ray.intersectObjects(pickables(), false)[0] || null;
}
const pickAt = (ev) => pickHitAt(ev)?.object || null;

// Zoom and orbit toward the SURFACE under the cursor, not an empty point in space. The orbit target is moved along the
// view axis to the depth of that surface (camera and view direction unchanged, so nothing jumps). Every zoom step is a
// fraction of the remaining distance, so the camera glides toward the surface and never passes through it.
const _fwd = new THREE.Vector3(), _v = new THREE.Vector3();
let lastRefocus = 0;
function refocusAt(ev, minGapMs = 180) {
  const now = performance.now(); if (now - lastRefocus < minGapMs) return; lastRefocus = now;
  const hit = pickHitAt(ev); if (!hit) return;
  camera.getWorldDirection(_fwd);
  const depth = _v.copy(hit.point).sub(camera.position).dot(_fwd);
  if (depth > 0.01) { controls.target.copy(camera.position).addScaledVector(_fwd, depth); dirty = true; }
}
canvas.addEventListener('wheel', (ev) => refocusAt(ev), { capture: true, passive: true });
const hoverMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
const selMat = new THREE.MeshBasicMaterial({ color: 0x35e0c2, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
const overlays = { hover: [], sel: [] };
function setOverlay(kind, meshes) {
  for (const m of overlays[kind]) scene.remove(m); overlays[kind] = [];
  for (const o of meshes || []) { const m = new THREE.Mesh(o.geometry, kind === 'hover' ? hoverMat : selMat); m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.renderOrder = 5; scene.add(m); overlays[kind].push(m); }
  dirty = true;
}
const meshesNamed = (name) => { const out = []; for (const s of Object.values(sys)) if (s.shown) out.push(...(s.levels[s.shown].byName.get(name) || [])); return out; };
const nice = (n) => n.replace(/\.[lr]$/, '').replace(/\s+/g, ' ').trim();
const sideName = (n) => (/\.l$/.test(n) ? 'left' : /\.r$/.test(n) ? 'right' : '');
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let hoverName = null, lastMove = 0, downAt = null;
canvas.addEventListener('pointermove', (ev) => {
  const now = performance.now(); if (now - lastMove < 55 || ev.buttons) { if (ev.buttons) { tipEl.style.display = 'none'; } return; } lastMove = now;
  const o = pickAt(ev), name = o?.userData.name || null;
  if (name !== hoverName) { hoverName = name; setOverlay('hover', name ? meshesNamed(name) : []); }
  if (name) { const sd = sideName(name); tipEl.textContent = nice(name) + (sd ? ` (${sd})` : ''); tipEl.style.display = 'block'; const r = stage.getBoundingClientRect(); tipEl.style.left = ev.clientX - r.left + 'px'; tipEl.style.top = ev.clientY - r.top + 'px'; }
  else tipEl.style.display = 'none';
});
canvas.addEventListener('pointerleave', () => { tipEl.style.display = 'none'; hoverName = null; setOverlay('hover', []); });
canvas.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; refocusAt(ev, 0); }, { capture: true });
canvas.addEventListener('pointerup', (ev) => {                       // a click, not a drag
  if (!downAt || Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 5) return;
  const o = pickAt(ev); select(o ? o.userData.name : null);
});

let selected = null;
const selBox = $('bx-selected');
function select(name) {
  selected = name; setOverlay('sel', name ? meshesNamed(name) : []);
  if (!name) { selBox.innerHTML = '<p class="bx-empty">Click any structure to see its name. Use search to find one.</p>'; return; }
  const st = manifest.structures.find((x) => x.n === name), sd = sideName(name), label = nice(name);
  const q = encodeURIComponent(label);
  selBox.innerHTML = `<h4></h4><p class="bx-note"></p><div class="bx-btns"><button class="btn btn-primary" data-act="zoom">Zoom to</button><button class="btn btn-ghost" data-act="hide">Hide</button><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://en.wikipedia.org/w/index.php?search=${q}">Learn more</a></div>`;
  selBox.querySelector('h4').textContent = label;
  selBox.querySelector('p').textContent = [sd && titleCase(sd) + ' side', SYSTEMS[st?.sys]?.label].filter(Boolean).join(' · ');
}
selBox.addEventListener('click', (e) => {
  const act = e.target.dataset?.act; if (!act || !selected) return;
  if (act === 'zoom') flyTo(selected);
  if (act === 'hide') {
    hidden.add(selected);
    for (const s of Object.values(sys)) { s.pickCache = null; for (const l of Object.values(s.levels)) for (const o of l.byName.get(selected) || []) o.visible = false; }
    select(null); setOverlay('hover', []); $('bx-showall').hidden = false; dirty = true;
  }
});
$('bx-showall').addEventListener('click', () => { hidden.clear(); for (const s of Object.values(sys)) { s.pickCache = null; for (const l of Object.values(s.levels)) l.root.traverse((o) => { if (o.isMesh) o.visible = true; }); } $('bx-showall').hidden = true; dirty = true; });

// ── camera flights (search, "zoom to", reset) ───────────────────────────────────────────────────────
let flight = null;
function fly(toTarget, toPos, ms = 850) {
  flight = { t0: performance.now(), ms, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: toTarget, toP: toPos }; controls.enabled = false; dirty = true;
}
function flyTo(name) {
  const st = manifest.structures.filter((x) => x.n === name); if (!st.length) return;
  const box = new THREE.Box3(); for (const x of st) box.expandByPoint(new THREE.Vector3(x.b[0], x.b[1], x.b[2])).expandByPoint(new THREE.Vector3(x.b[3], x.b[4], x.b[5]));
  const c = box.getCenter(new THREE.Vector3()), size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.02);
  const dist = clamp(size * 1.9, 0.05, 3.0), dir = camera.position.clone().sub(controls.target).normalize();
  // make sure the structure's system is visible so the flight ends on something you can see
  const s = sys[st[0].sys]; if (!s.enabled) setSystem(s.key, true);
  if (!ui.auto) {                        // the depth slider must not have peeled this structure's layer away
    const maxPeel = (s.rank + 0.6) / (NSYS - 1);
    if (ui.peel > maxPeel) { ui.peel = maxPeel; $('bx-peel').value = Math.round(maxPeel * 100); }
    applyOpacity();
  }
  fly(c, c.clone().add(dir.multiplyScalar(dist)));
}
function stepFlight(now) {
  if (!flight) return false;
  const k = clamp((now - flight.t0) / flight.ms, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  controls.target.lerpVectors(flight.fromT, flight.toT, e); camera.position.lerpVectors(flight.fromP, flight.toP, e);
  if (k >= 1) { flight = null; controls.enabled = true; controls.update(); update(true); } return true;
}
$('bx-reset').addEventListener('click', () => { fly(HOME.target.clone(), HOME.pos.clone(), 700); select(null); });

// ── layers panel ────────────────────────────────────────────────────────────────────────────────────
function setSystem(key, on) { sys[key].enabled = on; const cb = document.querySelector(`[data-sys="${key}"]`); if (cb) cb.checked = on; sys[key].pickCache = null; update(true); dirty = true; }
const layersEl = $('bx-layers');
for (const s of Object.values(sys).sort((a, b) => a.rank - b.rank)) {
  const row = document.createElement('label'); row.className = 'bx-layer';
  row.innerHTML = `<input type="checkbox" data-sys="${s.key}" ${s.enabled ? 'checked' : ''}><span class="bx-dot" style="background:${s.color}"></span><span>${s.label}</span><em></em>`;
  row.querySelector('input').addEventListener('change', (e) => setSystem(s.key, e.target.checked));
  layersEl.appendChild(row);
}
$('bx-peel').addEventListener('input', (e) => { ui.peel = +e.target.value / 100; applyOpacity(); update(true); });
$('bx-auto').addEventListener('change', (e) => { ui.auto = e.target.checked; $('bx-peel').disabled = ui.auto; applyOpacity(); update(true); });
$('bx-labels-cb').addEventListener('change', (e) => { ui.labels = e.target.checked; if (!ui.labels) labelsEl.replaceChildren(); });

// ── search ──────────────────────────────────────────────────────────────────────────────────────────
const searchIn = $('bx-search'), resultsEl = $('bx-results');
searchIn.addEventListener('input', () => {
  const q = searchIn.value.trim().toLowerCase(); resultsEl.replaceChildren(); if (q.length < 2 || !manifest) return;
  const seen = new Set(), hits = [];
  for (const x of manifest.structures) { const k = x.label.toLowerCase(); if (k.includes(q) && !seen.has(x.n)) { seen.add(x.n); hits.push(x); } }
  hits.sort((a, b) => (a.label.toLowerCase().startsWith(q) ? 0 : 1) - (b.label.toLowerCase().startsWith(q) ? 0 : 1) || a.label.length - b.label.length);
  for (const x of hits.slice(0, 12)) {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
    const sd = x.side ? ` (${x.side})` : ''; b.innerHTML = '<span></span><small></small>'; b.children[0].textContent = x.label + sd; b.children[1].textContent = SYSTEMS[x.sys]?.label || '';
    b.addEventListener('click', () => { resultsEl.replaceChildren(); searchIn.value = ''; flyTo(x.n); setTimeout(() => select(x.n), 900); });
    li.appendChild(b); resultsEl.appendChild(li);
  }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.bx-search')) resultsEl.replaceChildren(); });

// ── semantic zoom: labels appear as structures get big enough on screen ─────────────────────────────
const tmp = new THREE.Vector3();
function updateLabels() {
  if (!ui.labels || !manifest) return;
  const w = stage.clientWidth, h = stage.clientHeight, fovK = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const muscleOpaque = sys.muscular.enabled && sys.muscular.opacity > 0.9;
  const cands = [];
  for (const x of manifest.structures) {
    const s = sys[x.sys]; if (!s.enabled || s.opacity < 0.3) continue;
    if (muscleOpaque && s.key !== "muscular" && s.opacity > 0.9) continue;   // opaque muscles cover everything behind them
    if (hidden.has(x.n)) continue;
    tmp.set((x.b[0] + x.b[3]) / 2, (x.b[1] + x.b[4]) / 2, (x.b[2] + x.b[5]) / 2);
    // "how big does this look": cube root of the box volume, so a long thin nerve does not outrank a bone or an organ
    const dx = x.b[3] - x.b[0], dy = x.b[4] - x.b[1], dz = x.b[5] - x.b[2];
    const size = Math.cbrt(Math.max(dx, 0.004) * Math.max(dy, 0.004) * Math.max(dz, 0.004)) * 2.4, dist = camera.position.distanceTo(tmp); if (dist < 0.005) continue;
    const px = (size / dist) * fovK; if (px < 62 || px > 1500) continue;
    tmp.project(camera); if (tmp.z > 1 || Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1) continue;
    cands.push({ x, px, sx: (tmp.x * 0.5 + 0.5) * w, sy: (-tmp.y * 0.5 + 0.5) * h });
  }
  cands.sort((a, b) => b.px - a.px); const placed = [], out = [];
  const maxLabels = clamp(Math.round(w / 80), 6, 18);          // fewer on small screens
  for (const c of cands) {
    const lw = nice(c.x.n).length * 6.4 + 22, box = { l: c.sx - lw / 2, r: c.sx + lw / 2, t: c.sy - 24, b: c.sy + 2 };
    if (box.l < 2 || box.r > w - 2 || box.t < 2) continue;
    if (placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t)) continue;      // would overlap a label already placed
    placed.push(box); out.push(c); if (out.length >= maxLabels) break;
  }
  const frag = document.createDocumentFragment();
  for (const c of out) { const el = document.createElement('div'); el.className = 'bx-label'; el.textContent = nice(c.x.n); el.style.left = c.sx + 'px'; el.style.top = c.sy + 'px'; frag.appendChild(el); }
  labelsEl.replaceChildren(frag);
}

// ── main loop: render only when something changed ───────────────────────────────────────────────────
let lastNearFar = 0, lastHud = 0, lastLabels = 0, lastStream = 0, labelsStale = true;
function tick(now) {
  requestAnimationFrame(tick);
  const flying = stepFlight(now), moved = controls.update();
  const d = camDist();
  if (Math.abs(d - lastNearFar) > lastNearFar * 0.04) { lastNearFar = d; camera.near = Math.max(0.0008, d * 0.012); camera.far = Math.max(30, d * 40); camera.updateProjectionMatrix(); dirty = true; }
  if (moved || flying) { labelsStale = true; if (ui.auto) applyOpacity(); if (now - lastStream > 140) { lastStream = now; update(false); } }
  if (labelsStale && now - lastLabels > 220) { lastLabels = now; labelsStale = false; updateLabels(); }
  if (now - lastHud > 250) {
    lastHud = now; const width = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    hudZoom.textContent = width >= 1 ? width.toFixed(1) + ' m' : Math.round(width * 100) + ' cm';
    const lv = Object.values(sys).find((s) => s.enabled && s.shown)?.shown; hudDetail.textContent = lv === 'full' ? 'full' : lv === 'lod1' ? 'medium' : lv ? 'overview' : '…';
    if (pendingLoads) hudDetail.textContent += ' · loading';
  }
  if (dirty || moved || flying) { dirty = false; labelsStale = true; renderer.render(scene, camera); }
}

// ── start ───────────────────────────────────────────────────────────────────────────────────────────
(async function start() {
  try {
    const r = await fetch(MODELS + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('manifest ' + r.status);
    manifest = await r.json();
  } catch (e) { console.error(e); fail('The anatomy files could not be loaded right now. Please check your connection and try again in a moment.'); return; }
  const counts = {}; for (const x of manifest.structures) counts[x.sys] = (counts[x.sys] || 0) + 1;
  layersEl.querySelectorAll('.bx-layer').forEach((row) => { const k = row.querySelector('input').dataset.sys; row.querySelector('em').textContent = (counts[k] || 0).toLocaleString(); });
  $('bx-count').textContent = manifest.structures.length.toLocaleString();
  applyOpacity(); update(true); select(null); setLoading(); requestAnimationFrame(tick);
  window.__bx = { THREE, scene, camera, controls, sys, get manifest() { return manifest; }, flyTo, select, renderer, update, ui, applyOpacity, setSystem };
})();
