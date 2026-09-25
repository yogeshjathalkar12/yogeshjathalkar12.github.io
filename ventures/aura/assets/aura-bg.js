// Aura landing page backdrop: a faint, slowly turning 3D human body behind the page (skeleton + organs, lowest detail, about 0.8 MB).
// Models: BodyParts3D (DBCLS, CC BY-SA 2.1 Japan) and Z-Anatomy (CC BY-SA 4.0), modified; credited on the 3D Body Explorer page. Generic educational anatomy.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODELS = 'https://cdn.jsdelivr.net/gh/yogeshjathalkar12/aura-body-models@v2/';
const FILES = ['skeletal.lod0.glb', 'visceral.lod0.glb'];
const KEY = 'aura-bg-body';
const canvas = document.getElementById('aura-bg-canvas'), btn = document.getElementById('aura-bg-toggle');
if (canvas && btn) {
  const store = { get() { try { return localStorage.getItem(KEY); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  let want = store.get() ? store.get() === 'on' : !saveData;          // on by default, unless the visitor asked their browser to save data
  let renderer, scene, camera, body, raf = 0, state = 'idle';        // idle | loading | ready | failed

  const label = () => { btn.setAttribute('aria-pressed', String(want)); btn.querySelector('span').textContent = want ? '3D body backdrop: on' : '3D body backdrop: off'; };

  function size() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    // keep the whole body in view on tall and wide screens alike
    const fov = camera.fov * Math.PI / 180, need = 1.05 * 1.9 / 2 / Math.tan(fov / 2), needW = 1.05 * 0.9 / 2 / Math.tan(fov / 2) / camera.aspect;
    camera.position.set(0, 0.92, Math.max(need, needW)); camera.lookAt(0, 0.92, 0);
  }
  function frame(t) {
    raf = 0;
    if (!want || document.hidden) return;
    body.rotation.y = (reduced ? 0 : t * 0.00005) + scrollY * 0.0007;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf && state === 'ready' && want) raf = requestAnimationFrame(frame); }

  function boot() {
    if (state !== 'idle') return;
    state = 'loading';
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch { return giveUp(); }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(0.5, 1, 1.2); scene.add(key);
    body = new THREE.Group(); scene.add(body); size(); addEventListener('resize', size);
    const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.171.0/examples/jsm/libs/draco/gltf/');
    const loader = new GLTFLoader().setDRACOLoader(draco);
    Promise.all(FILES.map((f) => loader.loadAsync(MODELS + f))).then((gs) => {
      for (const g of gs) body.add(g.scene);
      state = 'ready'; draco.dispose(); canvas.classList.toggle('on', want); run();
    }).catch(giveUp);
  }
  function giveUp() { state = 'failed'; canvas.remove(); btn.remove(); }     // never leave a broken control on the page

  function set(on) {
    want = on; store.set(on ? 'on' : 'off'); label(); canvas.classList.toggle('on', on && state === 'ready');
    if (on) { boot(); run(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  btn.addEventListener('click', () => set(!want));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  addEventListener('scroll', () => { if (want && state === 'ready' && reduced) { body.rotation.y = scrollY * 0.0007; renderer.render(scene, camera); } }, { passive: true });
  label();
  if (want) (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => boot(), { timeout: 3000 });
}
