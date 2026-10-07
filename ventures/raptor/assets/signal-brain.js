// Raptor "signal brain": every signal Raptor reads about a prospect, as a point in a 3D map you can rotate, search and click.
// All content comes from signals.json, which is exported from the product's own code (raptor/prospects/signals.py and
// raptor/patterns/conversion_model.py). Nothing here is sample data: there are no prospects, scores or results on this page,
// only the list of things Raptor looks at and the structure of the model that reads them.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { layout } from './signal-layout.js?v=11';

const root = document.getElementById('sb');
const stage = document.getElementById('sb-stage');
const canvas = document.getElementById('sb-canvas');
if (!root || !stage || !canvas) throw new Error('signal brain markup missing');

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = { fit: '#7c3aed', trigger: '#ec4899', size: '#f59e0b', web: '#10b981', tech: '#0ea5e9', need: '#ef4444', industry: '#8b5cf6', news: '#14b8a6', contact: '#f97316' };
const EVENT_LABEL = { pitch: 'Pitch sent', reply_engaged: 'Engaged reply', reply_positive: 'Positive reply', opt_out: 'Opt-out', bounce: 'Bounce', meeting: 'Meeting booked' };

function fail(msg) {
  stage.classList.add('sb-failed');
  const f = $('sb-fail');
  if (f) { f.hidden = false; f.querySelector('[data-msg]').textContent = msg; }
}

let data;
try {
  data = await (await fetch('/ventures/raptor/assets/signals.json', { cache: 'no-cache' })).json();
} catch (e) { fail('The signal list could not be loaded.'); throw e; }

// ---- deterministic placement so the map looks the same every visit -------------------------------------------------
function rng(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

let renderer, labels;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) { fail('Your browser could not start 3D graphics. The full list of signals is below.'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
labels = new CSS2DRenderer();
labels.domElement.className = 'sb-labels';
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const VIEW_DIR = new THREE.Vector3(0, 0.2, 1).normalize();
const L = layout(data);          // where every dot sits (shared with the page backdrop)
const SCENE_RADIUS = L.sceneRadius;
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 60;
controls.enablePan = false;
controls.enabled = false;           // switched on by the "click to explore" gate so the page still scrolls normally
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.5;

const groups = Object.fromEntries(data.groups.map((g, i) => [g.id, { ...g, index: i, color: new THREE.Color(COLORS[g.id] || '#888'), meshes: [] }]));
data.groups.forEach((g) => {
  groups[g.id].center = new THREE.Vector3(...L.groups[g.id].center);
  groups[g.id].radius = L.groups[g.id].radius;
});

const geo = new THREE.SphereGeometry(0.2, 14, 12);
const meshes = [];
for (const s of data.signals) {
  const g = groups[s.group];
  const rand = rng(s.name);
  const mat = new THREE.MeshBasicMaterial({ color: g.color, transparent: true, opacity: 0.95 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...L.positions[s.name]);
  m.userData = { signal: s, group: g, baseScale: 0.9 + rand() * 0.25 };
  m.scale.setScalar(m.userData.baseScale);
  scene.add(m); g.meshes.push(m); meshes.push(m);
}

// cluster halos, names, and the lines that carry each group into the estimate
const lineMat = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.22 });
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), new THREE.MeshBasicMaterial({ color: '#a855f7', wireframe: true, transparent: true, opacity: 0.8 }));
scene.add(core);
const coreLabel = document.createElement('div'); coreLabel.className = 'sb-label sb-core'; coreLabel.innerHTML = '<b>Estimate</b><span>chance of a positive outcome</span>';
const coreObj = new CSS2DObject(coreLabel); coreObj.position.set(0, -1.5, 0); scene.add(coreObj);

for (const g of Object.values(groups)) {
  const halo = new THREE.Mesh(new THREE.SphereGeometry(g.radius * 1.15, 24, 18), new THREE.MeshBasicMaterial({ color: g.color, transparent: true, opacity: 0.045, depthWrite: false }));
  halo.position.copy(g.center); scene.add(halo); g.halo = halo;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([g.center, new THREE.Vector3()]), lineMat(g.color)); scene.add(line); g.line = line;
  const el = document.createElement('div'); el.className = 'sb-label'; el.style.setProperty('--c', COLORS[g.id]);
  el.innerHTML = `<b>${g.title}</b><span>${g.count} signals</span>`;
  const o = new CSS2DObject(el); o.position.copy(g.center).addScaledVector(g.center.clone().normalize(), g.radius * 1.15 + 0.5).add(new THREE.Vector3(0, 0.25, 0)); scene.add(o); g.labelEl = el;
}

// the six kinds of event the network reads about what has happened so far
const ring = new THREE.Group(); scene.add(ring);
data.model.event_types.forEach((e, i, a) => {
  const t = (i / a.length) * Math.PI * 2;
  const p = new THREE.Vector3(Math.cos(t) * 3.6, 0, Math.sin(t) * 3.6);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: '#e5e7eb' }));
  dot.position.copy(p); ring.add(dot);
  ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, new THREE.Vector3()]), lineMat('#9ca3af')));
  const el = document.createElement('div'); el.className = 'sb-label sb-event'; el.textContent = EVENT_LABEL[e] || e;
  const o = new CSS2DObject(el); o.position.copy(p).add(new THREE.Vector3(0, 0.32, 0)); ring.add(o);
});
const ringHead = document.createElement('div'); ringHead.className = 'sb-label sb-core sb-ringhead'; ringHead.innerHTML = '<b>What has happened so far</b><span>read in order by a recurrent network</span>';
const rh = new CSS2DObject(ringHead); rh.position.set(0, 1.5, 0); ring.add(rh);

// ---- sizing --------------------------------------------------------------------------------------------------------
function fitDistance() {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return SCENE_RADIUS / (tanHalf * Math.min(1, camera.aspect));      // a tall, narrow stage needs the camera farther back
}
let userMoved = false;
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); labels.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!userMoved) camera.position.copy(VIEW_DIR).multiplyScalar(fitDistance());
}
new ResizeObserver(resize).observe(stage); addEventListener('resize', resize); resize();

// ---- state: focus group, search, selection ---------------------------------------------------------------------------
let focus = null, query = '', selected = null;
const legend = $('sb-legend'), search = $('sb-search'), count = $('sb-count'), detail = $('sb-detail');

function matches(m) {
  const s = m.userData.signal;
  if (focus && s.group !== focus) return false;
  if (query && !(s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query) || m.userData.group.title.toLowerCase().includes(query))) return false;
  return true;
}
function refresh() {
  let shown = 0;
  for (const m of meshes) {
    const on = matches(m); if (on) shown++;
    m.material.opacity = on ? 0.95 : 0.08;
    m.scale.setScalar(m.userData.baseScale * (m === selected ? 2.4 : on && (query || focus) ? 1.25 : 1));
  }
  for (const g of Object.values(groups)) {
    const on = !focus || focus === g.id;
    g.halo.material.opacity = on ? 0.045 : 0.01; g.line.material.opacity = on ? 0.22 : 0.05; g.labelEl.style.opacity = on ? 1 : 0.25;
  }
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

function select(m) {
  selected = m;
  if (!m) { showGroup(focus); refresh(); return; }
  const s = m.userData.signal, g = m.userData.group;
  detail.innerHTML = `<h4 style="color:${COLORS[g.id]}">${s.description}</h4>
    <p class="sb-small">${g.title} &middot; <code>${s.name}</code></p>
    <p>A number from 0 to 1 that Raptor calculates for every prospect from what it can see. If the data is not there, it is 0.</p>`;
  refresh();
}

// ---- pointer: hover tooltip + click select (only while the gate is open) ------------------------------------------------
const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); const tip = $('sb-tip');
let moved = false, down = null, hover = null, active = false;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(meshes.filter(matches), false)[0];
  return hit ? hit.object : null;
}
canvas.addEventListener('pointermove', (ev) => {
  if (!active) return;
  const m = pick(ev);
  if (m !== hover) { hover = m; canvas.style.cursor = m ? 'pointer' : 'grab'; }
  if (m) { tip.hidden = false; tip.textContent = m.userData.signal.description; const r = stage.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 220) + 'px'; tip.style.top = (ev.clientY - r.top + 14) + 'px'; }
  else tip.hidden = true;
});
canvas.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; controls.autoRotate = false; userMoved = true; });
canvas.addEventListener('pointerup', (ev) => {
  if (!active || !down) return;
  const far = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5; down = null;
  if (far) return;                       // it was a drag to rotate, not a click
  select(pick(ev));
});

// ---- the gate ----------------------------------------------------------------------------------------------------------
const act = $('sb-activate'), done = $('sb-done');
function setActive(on) {
  active = on; controls.enabled = on; stage.classList.toggle('sb-idle', !on); act.hidden = on; done.hidden = !on;
  if (!on) { tip.hidden = true; controls.autoRotate = !reduceMotion; }
}
act.addEventListener('click', () => setActive(true));
done.addEventListener('click', () => setActive(false));
addEventListener('keydown', (e) => { if (e.key === 'Escape') setActive(false); });
$('sb-reset').addEventListener('click', () => { focus = null; query = ''; search.value = ''; select(null); userMoved = false; controls.target.set(0, 0, 0); camera.position.copy(VIEW_DIR).multiplyScalar(fitDistance()); detail.innerHTML = defaultDetail(); refresh(); });
setActive(false); refresh();

// ---- render only while visible --------------------------------------------------------------------------------------------
let visible = true;
new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(stage);
let last = 0, lastW = 0, lastH = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!visible || document.hidden) return;
  if (stage.clientWidth !== lastW || stage.clientHeight !== lastH) { lastW = stage.clientWidth; lastH = stage.clientHeight; resize(); }
  const dt = Math.min((t - last) / 1000, 0.1); last = t;
  core.rotation.y += dt * 0.35; core.rotation.x += dt * 0.12;
  if (!reduceMotion) ring.rotation.y += dt * 0.12;
  controls.update();
  renderer.render(scene, camera); labels.render(scene, camera);
}
requestAnimationFrame(frame);
stage.classList.add('sb-ready');
$('sb-loading').hidden = true;
