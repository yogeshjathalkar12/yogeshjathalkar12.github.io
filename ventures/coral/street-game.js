/* Rover street game for Coral.
   Press "Start the game": the road gets three lanes, and potholes and rubbish heaps come at you.
   Up / Down arrows change lane, Right arrow speeds up, Left arrow slows down, Esc leaves.
   Three lives; each pothole or heap you hit costs one. */
(function () {
  var street = document.getElementById('street');
  if (!street) return;

  var rover = street.querySelector('.street-rover');
  var skyEls = {
    far: street.querySelector('.skyline-far'),
    mid: street.querySelector('.skyline-mid'),
    near: street.querySelector('.skyline-near')
  };

  // ── extra elements ─────────────────────────────────────────────────────────
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }

  var lanesEl = el('div', 'sg-lanes', '<i></i><i></i>');
  var layer = el('div', 'sg-layer');
  var startBtn = el('button', 'btn-primary sg-start', 'Start the game');
  startBtn.type = 'button';
  var hud = el('div', 'sg-hud', '<span>Score <b data-sg="score">0</b></span><span>Speed <b data-sg="speed">1.0</b>x</span><span class="sg-hearts" data-sg="lives"></span>');
  var help = el('div', 'sg-help', '&uarr;&darr; lane &nbsp;&middot;&nbsp; &rarr; faster &nbsp;&middot;&nbsp; &larr; slower &nbsp;&middot;&nbsp; Esc exit');
  var over = el('div', 'sg-over', '<h3>Game over</h3><p data-sg="final"></p><div class="sg-row"><button type="button" class="btn-primary" data-sg="again">Play again</button><button type="button" class="btn-ghost" data-sg="quit">Close</button></div>');
  var pad = el('div', 'sg-pad',
    '<div class="sg-pad-group"><button type="button" data-k="ArrowLeft" aria-label="Slower">&larr;</button><button type="button" data-k="ArrowRight" aria-label="Faster">&rarr;</button></div>' +
    '<div class="sg-pad-group"><button type="button" data-k="ArrowUp" aria-label="Lane up">&uarr;</button><button type="button" data-k="ArrowDown" aria-label="Lane down">&darr;</button></div>');

  street.appendChild(lanesEl);
  street.appendChild(layer);
  street.appendChild(startBtn);
  street.appendChild(hud);
  street.appendChild(help);
  street.appendChild(pad);
  street.appendChild(over);

  function q(name) { return street.querySelector('[data-sg="' + name + '"]'); }
  var scoreEl = q('score'), speedEl = q('speed'), livesEl = q('lives'), finalEl = q('final');

  // ── geometry ───────────────────────────────────────────────────────────────
  var LANE_CENTER = [106, 66, 26];   // px from the bottom of the strip, top lane first
  var ROVER_HALF_HIT = 34;
  var DUMP_SVG =
    '<svg viewBox="0 0 62 52" aria-hidden="true">' +
    '<ellipse cx="19" cy="38" rx="16" ry="12" fill="#2f3b34"/><path d="M15 27l4-6 4 6z" fill="#2f3b34"/>' +
    '<ellipse cx="43" cy="36" rx="17" ry="14" fill="#4a5d52"/><path d="M39 23l4-6 4 6z" fill="#4a5d52"/>' +
    '<ellipse cx="31" cy="22" rx="14" ry="13" fill="#1f2a25"/><path d="M27 10l4-6 4 6z" fill="#1f2a25"/>' +
    '<rect x="6" y="40" width="8" height="5" fill="#e5e7eb" transform="rotate(-20 10 42)"/>' +
    '<rect x="50" y="42" width="7" height="5" fill="#fbbf24" transform="rotate(15 53 44)"/>' +
    '<circle cx="31" cy="24" r="2" fill="#6b7f72"/></svg>';

  // ── state ──────────────────────────────────────────────────────────────────
  var playing = false, paused = false, ended = false, inView = true;
  var raf = 0, last = 0;
  var s, laneIdx, lives, traveled, dodged, nextGap, spawnedAt, elapsed, invulnUntil, now;
  var keyR = false, keyL = false;
  var offs = { far: 0, mid: 0, near: 0, lane: 0 };
  var obstacles = [];
  var W = 800;

  function width() { return street.clientWidth || 800; }

  // ── helpers ────────────────────────────────────────────────────────────────
  function score() { return Math.floor(traveled / 25) + dodged * 10; }

  function showHud() {
    scoreEl.textContent = score();
    speedEl.textContent = s.toFixed(1);
    var h = '';
    for (var i = 0; i < 3; i++) h += i < lives ? '♥' : '♡';
    livesEl.textContent = h;
  }

  function placeRover() {
    var bottom = LANE_CENTER[laneIdx] - 18;
    rover.style.bottom = bottom + 'px';
    rover.style.zIndex = 11 + laneIdx * 2;
  }

  function setLane(i) {
    laneIdx = Math.max(0, Math.min(2, i));
    placeRover();
  }

  function clearObstacles() {
    for (var i = 0; i < obstacles.length; i++) layer.removeChild(obstacles[i].node);
    obstacles = [];
  }

  function spawn() {
    var count = (elapsed > 20 && Math.random() < 0.25) ? 2 : 1;
    var lanes = [0, 1, 2].sort(function () { return Math.random() - 0.5; }).slice(0, count);
    for (var i = 0; i < lanes.length; i++) {
      var lane = lanes[i];
      var isHole = Math.random() < 0.55;
      var node = el('div', 'sg-obs ' + (isHole ? 'sg-pothole' : 'sg-dump'), isHole ? '' : DUMP_SVG);
      var w = isHole ? 84 : 62, h = isHole ? 24 : 52;
      node.style.bottom = (LANE_CENTER[lane] - (isHole ? 12 : 8)) + 'px';
      node.style.zIndex = 10 + lane * 2;
      layer.appendChild(node);
      obstacles.push({ node: node, x: W + 90 + i * 30, lane: lane, w: w, passed: false });
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────
  function reset() {
    s = 1; lives = 3; traveled = 0; dodged = 0; elapsed = 0; spawnedAt = 0; invulnUntil = 0; now = 0;
    nextGap = 520; keyR = keyL = false; ended = false; paused = false;
    offs = { far: 0, mid: 0, near: 0, lane: 0 };
    clearObstacles();
    over.classList.remove('show');
    rover.classList.remove('sg-hit', 'sg-blink');
    setLane(1);
    showHud();
  }

  function start() {
    W = width();
    playing = true;
    street.classList.add('playing');
    reset();
    try { street.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { street.scrollIntoView(); }
    last = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    clearObstacles();
    over.classList.remove('show');
    street.classList.remove('playing');
    rover.classList.remove('sg-hit', 'sg-blink');
    rover.style.bottom = '';
    rover.style.zIndex = '';
    for (var k in skyEls) { skyEls[k].style.webkitMaskPosition = ''; skyEls[k].style.maskPosition = ''; }
  }

  function gameOver() {
    ended = true;
    var best = 0;
    try { best = parseInt(localStorage.getItem('coral-street-best') || '0', 10) || 0; } catch (e) {}
    var sc = score();
    if (sc > best) { best = sc; try { localStorage.setItem('coral-street-best', String(best)); } catch (e) {} }
    finalEl.textContent = 'Score ' + sc + '  ·  Best ' + best;
    over.classList.add('show');
  }

  function hit(o) {
    lives--;
    rover.classList.remove('sg-hit');
    void rover.offsetWidth;
    rover.classList.add('sg-hit', 'sg-blink');
    invulnUntil = now + 1.3;
    o.passed = true;
    o.node.style.opacity = '0.25';
    if (lives <= 0) { lives = 0; showHud(); gameOver(); }
  }

  // ── loop ───────────────────────────────────────────────────────────────────
  function setMask(node, x) {
    var v = (-x) + 'px 100%';
    node.style.webkitMaskPosition = v;
    node.style.maskPosition = v;
  }

  function frame(t) {
    if (!playing) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (paused || ended || document.hidden || !inView) return;

    now += dt; elapsed += dt;
    if (keyR) s += 1.4 * dt;
    if (keyL) s -= 1.8 * dt;
    s = Math.max(0.4, Math.min(3.2, s));

    var v = 260 * s;                 // px per second the world slides past
    traveled += v * dt;

    offs.far += v * 0.07 * dt; offs.mid += v * 0.15 * dt; offs.near += v * 0.3 * dt; offs.lane += v * dt;
    setMask(skyEls.far, offs.far % 1200);
    setMask(skyEls.mid, offs.mid % 1200);
    setMask(skyEls.near, offs.near % 1200);
    var dashes = lanesEl.children;
    for (var d = 0; d < dashes.length; d++) dashes[d].style.backgroundPosition = (-(offs.lane % 192)) + 'px 0';

    if (traveled - spawnedAt >= nextGap) {
      spawn();
      spawnedAt = traveled;
      nextGap = Math.max(240, 420 + Math.random() * 340 - elapsed * 4);
    }

    var roverX = W * 0.25;
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.x -= v * dt;
      o.node.style.transform = 'translate3d(' + (o.x - o.w / 2) + 'px,0,0)';
      if (!o.passed && now >= invulnUntil && o.lane === laneIdx && Math.abs(o.x - roverX) < o.w / 2 + ROVER_HALF_HIT) {
        hit(o);
      } else if (!o.passed && o.x < roverX - o.w / 2 - ROVER_HALF_HIT) {
        o.passed = true; dodged++;
      }
      if (o.x < -140) { layer.removeChild(o.node); obstacles.splice(i, 1); }
    }

    if (now >= invulnUntil) rover.classList.remove('sg-blink');
    showHud();
  }

  // ── input ──────────────────────────────────────────────────────────────────
  function press(key, down) {
    if (key === 'ArrowRight') keyR = down;
    else if (key === 'ArrowLeft') keyL = down;
    else if (down && key === 'ArrowUp') setLane(laneIdx - 1);
    else if (down && key === 'ArrowDown') setLane(laneIdx + 1);
  }

  document.addEventListener('keydown', function (e) {
    if (!playing) return;
    var k = e.key;
    if (k === 'Escape') { stop(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (ended) return;
      if ((k === 'ArrowUp' || k === 'ArrowDown') && e.repeat) return;
      press(k, true);
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowRight') keyR = false;
    if (e.key === 'ArrowLeft') keyL = false;
  });

  var padButtons = pad.querySelectorAll('button');
  for (var b = 0; b < padButtons.length; b++) {
    (function (btn) {
      var k = btn.getAttribute('data-k');
      btn.addEventListener('pointerdown', function (e) { e.preventDefault(); press(k, true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
        btn.addEventListener(ev, function () { if (k === 'ArrowRight') keyR = false; if (k === 'ArrowLeft') keyL = false; });
      });
    })(padButtons[b]);
  }

  startBtn.addEventListener('click', start);
  q('again').addEventListener('click', function () { reset(); last = 0; });
  q('quit').addEventListener('click', stop);

  window.addEventListener('resize', function () { W = width(); });

  // pause while the strip is scrolled out of view, and when the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; }, { threshold: 0.3 }).observe(street);
  }
})();
