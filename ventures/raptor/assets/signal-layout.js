// Where every signal sits in the 3D structure. Shared by the explorer (signal-brain.js) and the page backdrop (signal-bg.js) so both show
// the same shape. Pure arithmetic, no 3D library: positions come back as plain [x, y, z] arrays.
//
// Each group is a ball of evenly filled points: a golden-angle spiral of directions, with radii shuffled by a fixed permutation so the
// fill is uniform, then a short repulsion pass so that no two dots in a group ever sit closer than MIN_GAP x spacing. Everything is
// deterministic, so the structure looks the same on every visit.

export function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export const MIN_GAP = 0.8;          // closest two dots may be, in units of `spacing`

export function layout(data, { spacing = 1.2, R = 10.5 } = {}) {
  const N = data.groups.length, groups = {}, positions = {};
  let edge = 0;
  data.groups.forEach((g, i) => {
    const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), phi = i * GOLDEN;
    const center = [Math.cos(phi) * r * R, y * R * 0.9, Math.sin(phi) * r * R];
    const radius = 0.62 * spacing * Math.cbrt(g.count) + 0.35;
    groups[g.id] = { center, radius };
    const members = data.signals.filter((s) => s.group === g.id), n = members.length;
    const phase = seeded(g.id)() * Math.PI * 2;
    const pts = members.map((s, k) => {
      const j = (k * 37 + 11) % n;                                       // decorrelates radius from direction (37 is prime and larger than any group)
      const yy = 1 - 2 * (k + 0.5) / n, rr = Math.sqrt(1 - yy * yy), th = k * GOLDEN + phase;
      const dist = radius * Math.cbrt((j + 0.5) / n), rand = seeded(s.name), jit = 0.1 * spacing;
      return [Math.cos(th) * rr * dist + (rand() - 0.5) * jit, yy * dist + (rand() - 0.5) * jit, Math.sin(th) * rr * dist + (rand() - 0.5) * jit];
    });
    // push apart any pair that is too close, keeping the ball's overall size
    const dmin = MIN_GAP * spacing;
    for (let it = 0; it < 80; it++) {
      let moved = false;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        let dx = pts[b][0] - pts[a][0], dy = pts[b][1] - pts[a][1], dz = pts[b][2] - pts[a][2];
        let d = Math.hypot(dx, dy, dz);
        if (d >= dmin) continue;
        if (d < 1e-6) { dx = 1; dy = 0.3; dz = -0.2; d = Math.hypot(dx, dy, dz); }
        const push = (dmin - d) / 2 / d;
        pts[a][0] -= dx * push; pts[a][1] -= dy * push; pts[a][2] -= dz * push;
        pts[b][0] += dx * push; pts[b][1] += dy * push; pts[b][2] += dz * push;
        moved = true;
      }
      for (const p of pts) {                                              // stay inside the ball
        const d = Math.hypot(p[0], p[1], p[2]), lim = radius * 1.12;
        if (d > lim) { p[0] *= lim / d; p[1] *= lim / d; p[2] *= lim / d; }
      }
      if (!moved) break;
    }
    members.forEach((s, k) => { positions[s.name] = [center[0] + pts[k][0], center[1] + pts[k][1], center[2] + pts[k][2]]; });
    edge = Math.max(edge, Math.hypot(...center) + radius * 1.12);
  });
  return { groups, positions, sceneRadius: edge + 1.6 };
}
