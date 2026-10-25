// Vapus landing page backdrop: a faint, slowly turning 3D human body behind the page (the explorer's starting layers, lowest detail, about 3.4 MB).
// Models: BodyParts3D (DBCLS, CC BY-SA 2.1 Japan) and Z-Anatomy (CC BY-SA 4.0), modified; credited on the 3D Body Explorer page. Generic educational anatomy.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODELS = 'https://cdn.jsdelivr.net/gh/yogeshjathalkar12/aura-body-models@v2/';
// A page may set window.AURA_BG_OPTIONS = { extraLayers: ['muscular'], spin: 0.00008, overlay: 'images/space.png' } before this loads. Vapus sets nothing, so it is unchanged.
const OPT = window.AURA_BG_OPTIONS || {};
const FILES = ['skeletal', 'visceral', 'cardiovascular', 'nervous', 'joints', 'lymphatic', ...(OPT.extraLayers || [])].map((k) => k + '.lod0.glb');   // the same layers the explorer starts with (no muscles)
const HIDE = /penis|penile|scrot|testis|testic|epididym|glans|spermatic|prostat|genital|cremast|cavernos|spongios|urethra/i;   // never shown in the backdrop
const KEY = 'aura-bg-body';

// Optional (OPT.overlay): the body becomes a window onto a picture. The picture is fixed to the screen behind him, so as he turns,
// different parts of it show through his shape, with a soft glowing edge. Every layer gets one flat, unshiny material so no model's own colours show.
const ovRes = { value: new THREE.Vector2(1, 1) };
function applyOverlay(root, texture) {
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    if (!cache.has(old)) {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uOverlay = { value: texture };
        sh.uniforms.uRes = ovRes;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uOverlay;\nuniform vec2 uRes;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            // the picture's middle square covers the body's height, centred on him
            vec2 ovP = (gl_FragCoord.xy - 0.5 * uRes) / (0.9 * uRes.y);
            vec2 ovUv = vec2(0.5 + ovP.x * 0.488, 0.5 + ovP.y);
            vec3 ovCol = texture2D(uOverlay, ovUv).rgb;
            float ovRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
            totalEmissiveRadiance += ovCol * 1.35 + vec3(0.3, 0.55, 1.0) * ovRim * 1.1;
            diffuseColor.rgb = ovCol * 0.25;`);
      };
      m.customProgramCacheKey = () => 'aura-overlay-screen';
      cache.set(old, m);
    }
    o.material = cache.get(old);
  });
}
const canvas = document.getElementById('aura-bg-canvas'), btn = document.getElementById('aura-bg-toggle');
if (canvas && btn) {
  const store = { get() { try { return localStorage.getItem(KEY); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  let onScreen = true;
  let want = store.get() ? store.get() === 'on' : !saveData;          // on by default, unless the visitor asked their browser to save data
  let renderer, scene, camera, body, raf = 0, state = 'idle';        // idle | loading | ready | failed

  const label = () => { btn.setAttribute('aria-pressed', String(want)); btn.querySelector('span').textContent = want ? '3D body backdrop: on' : '3D body backdrop: off'; };

  function size() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    ovRes.value.set(canvas.width, canvas.height);
    // keep the whole body in view on tall and wide screens alike
    const fov = camera.fov * Math.PI / 180, need = 1.05 * 1.9 / 2 / Math.tan(fov / 2), needW = 1.05 * 0.9 / 2 / Math.tan(fov / 2) / camera.aspect;
    camera.position.set(0, 0.92, Math.max(need, needW)); camera.lookAt(0, 0.92, 0);
  }
  function frame(t) {
    raf = 0;
    if (!want || document.hidden || !onScreen) return;
    body.rotation.y = (reduced ? 0 : t * (OPT.spin || 0.00005)) + scrollY * 0.0007;
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
    const overlayTex = OPT.overlay ? new THREE.TextureLoader().load(OPT.overlay) : null;
    if (overlayTex) overlayTex.colorSpace = THREE.SRGBColorSpace;
    Promise.all(FILES.map((f) => loader.loadAsync(MODELS + f))).then((gs) => {
      for (const g of gs) { g.scene.traverse((o) => { if (o.isMesh && HIDE.test(o.userData.za_name || o.name || '')) o.visible = false; }); if (overlayTex) applyOverlay(g.scene, overlayTex); body.add(g.scene); }
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
  // stop drawing while the canvas is scrolled out of view (on the Vapus page it is always in view, so nothing changes there)
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) run(); }).observe(canvas);
  addEventListener('scroll', () => { if (want && state === 'ready' && reduced) { body.rotation.y = scrollY * 0.0007; renderer.render(scene, camera); } }, { passive: true });
  label();
  if (want) (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => boot(), { timeout: 3000 });
}
