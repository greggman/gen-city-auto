// Straight skeleton of a small simple polygon, for hipped roofs over
// concave house plans (L, T, U, Z ...): every wall's roof plane rises from it
// at the same pitch, and the skeleton is where those planes meet (hips,
// valleys, ridges).
//
// A plain wavefront simulation (after Felkel & Obdrzalek): each wall moves
// in at unit speed; wavefront corners run along their bisectors until two
// meet (edge event) or a reflex corner runs into a wall across the plan
// (split event, which cuts the wavefront in two). O(n^3), for plans of a
// dozen corners. Degenerate input can defeat it: the faces it returns are
// checked to tile the plan, else it returns null and the caller falls back.

import {dist2, polygonArea, type Vec2} from '../math/vec.ts';

/** A skeleton face: the plan region whose roof rises from wall `edge`. */
export interface SkeletonFace {
  edge: number;
  /** CCW, starting with the wall's two corners. */
  poly: Vec2[];
}

const JITTER = 7e-4;

interface WVert {
  /** Where (and when) the corner was made. */
  o: Vec2;
  t0: number;
  /** Velocity (m per m of wall travel). */
  v: Vec2;
  /** Walls before and after the corner. */
  L: number;
  R: number;
  prev: WVert;
  next: WVert;
  alive: boolean;
}

interface Arc {
  a: Vec2;
  b: Vec2;
  e0: number;
  e1: number;
}

/**
 * Straight skeleton faces of CCW `poly`, one per wall in wall order; null if
 * the simulation fails or its faces don't tile the plan.
 */
export function straightSkeleton(poly: Vec2[]): SkeletonFace[] | null {
  const n = poly.length;
  if (n < 3 || polygonArea(poly) <= 0) return null;
  const plan = poly;
  // Square and symmetric plans meet many events at once (a rectangle's two
  // hips and ridge); nudging each corner by under a millimetre (the same
  // every time) parts them, and the faces get the true corners back.
  poly = poly.map((q, k): Vec2 => [
    q[0] + JITTER * Math.sin(k * 12.9898 + 1.3),
    q[1] + JITTER * Math.sin(k * 78.233 + 0.7),
  ]);
  // Wall k: unit direction d, inward normal nn, n.q = c on the wall.
  const d: Vec2[] = [];
  const nn: Vec2[] = [];
  const c: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = poly[k],
      b = poly[(k + 1) % n];
    const l = dist2(a, b);
    if (l < 1e-6) return null;
    const dk: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    d.push(dk);
    nn.push([-dk[1], dk[0]]);
    c.push(-dk[1] * a[0] + dk[0] * a[1]);
  }
  // Corner velocity between walls L and R: n_L.v = n_R.v = 1.
  const vel = (L: number, R: number): Vec2 | null => {
    const [a, b] = nn[L],
      [p, q] = nn[R];
    const det = a * q - b * p;
    if (Math.abs(det) < 1e-12) return null;
    return [(q - b) / det, (a - p) / det];
  };
  const pos = (w: WVert, t: number): Vec2 => [
    w.o[0] + w.v[0] * (t - w.t0),
    w.o[1] + w.v[1] * (t - w.t0),
  ];
  const arcs: Arc[] = [];
  const verts: WVert[] = [];
  const make = (o: Vec2, t: number, L: number, R: number): WVert | null => {
    const v = vel(L, R);
    if (!v) return null;
    const w = {o, t0: t, v, L, R, alive: true} as WVert;
    verts.push(w);
    return w;
  };
  for (let k = 0; k < n; k++) {
    const w = make(poly[k], 0, (k - 1 + n) % n, k);
    if (!w) return null;
  }
  for (let k = 0; k < n; k++) {
    verts[k].prev = verts[(k - 1 + n) % n];
    verts[k].next = verts[(k + 1) % n];
  }
  const end = (w: WVert, p: Vec2) => {
    w.alive = false;
    arcs.push({a: w.o, b: p, e0: w.L, e1: w.R});
  };
  // A wavefront loop of two corners (or fewer) has closed: the last ridge.
  const close = (w: WVert, t: number) => {
    if (!w.alive || w.next.next !== w) return;
    const u = w.next;
    const p = pos(w, t),
      q = pos(u, t);
    end(w, p);
    end(u, q);
    if (dist2(p, q) > 1e-6) arcs.push({a: p, b: q, e0: w.L, e1: w.R});
  };
  const eps = 1e-7;
  let now = 0;
  for (let step = 0; step < 8 * n + 16; step++) {
    const live = verts.filter(w => w.alive);
    if (!live.length) break;
    let best = Infinity;
    let ev: (() => void) | null = null;
    for (const w of live) {
      // Edge event: w and w.next meet as their wall shrinks to nothing.
      const u = w.next;
      if (u !== w) {
        const e = w.R;
        const s0 =
          d[e][0] * (pos(u, now)[0] - pos(w, now)[0]) +
          d[e][1] * (pos(u, now)[1] - pos(w, now)[1]);
        const rate = d[e][0] * (u.v[0] - w.v[0]) + d[e][1] * (u.v[1] - w.v[1]);
        if (rate < -1e-9) {
          const t = now - Math.max(s0, 0) / rate;
          if (t < best - eps) {
            best = t;
            ev = () => {
              const p = pos(w, t),
                q = pos(u, t);
              const m: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
              end(w, m);
              end(u, m);
              const x = make(m, t, w.L, u.R);
              if (!x) {
                best = NaN;
                return;
              }
              const a = w.prev,
                b = u.next;
              x.prev = a;
              x.next = b;
              a.next = x;
              b.prev = x;
              close(x, t);
            };
          }
        }
      }
      // Split event: reflex w runs into a wall across its loop.
      const cr = d[w.L][0] * d[w.R][1] - d[w.L][1] * d[w.R][0];
      if (cr >= -1e-9) continue;
      for (let s = w.next.next; s !== w && s.next !== w; s = s.next) {
        const e = s.R;
        if (e === w.L || e === w.R) continue;
        const pw = pos(w, now);
        const D = nn[e][0] * pw[0] + nn[e][1] * pw[1] - (c[e] + now);
        const rate = nn[e][0] * w.v[0] + nn[e][1] * w.v[1] - 1;
        if (rate > -1e-9 || D < -1e-6) continue;
        const t = now - Math.max(D, 0) / rate;
        if (t >= best - eps) continue;
        // Within the wall's wavefront segment then.
        const X = pos(w, t);
        const sa = pos(s, t),
          sb = pos(s.next, t);
        const along = (q: Vec2) => d[e][0] * q[0] + d[e][1] * q[1];
        const ax = along(X);
        if (ax < along(sa) - 1e-6 || ax > along(sb) + 1e-6) continue;
        best = t;
        const S = s;
        ev = () => {
          end(w, X);
          const x1 = make(X, t, w.L, e);
          const x2 = make(X, t, e, w.R);
          if (!x1 || !x2) {
            best = NaN;
            return;
          }
          const a = w.prev,
            b = w.next,
            sn = S.next;
          // a -> x1 -> sn (along wall e) ... and S -> x2 -> b.
          x1.prev = a;
          a.next = x1;
          x1.next = sn;
          sn.prev = x1;
          x2.prev = S;
          S.next = x2;
          x2.next = b;
          b.prev = x2;
          close(x1, t);
          close(x2, t);
        };
      }
    }
    if (!ev) break;
    now = best;
    ev();
    if (Number.isNaN(best)) return null;
  }
  if (verts.some(w => w.alive)) return null;
  // Every arc keeps level with both its walls (a roof hip, valley or ridge).
  const rise = (k: number, q: Vec2) => nn[k][0] * q[0] + nn[k][1] * q[1] - c[k];
  for (const a of arcs)
    for (const q of [a.a, a.b])
      if (
        Math.abs(rise(a.e0, q) - rise(a.e1, q)) > 1e-2 ||
        rise(a.e0, q) < -1e-2
      )
        return null;
  // Faces: from wall k's end corner back to its start along k's arcs.
  const faces: SkeletonFace[] = [];
  const tol = 2e-3;
  let total = 0;
  for (let k = 0; k < n; k++) {
    const mine = arcs.filter(
      a => (a.e0 === k || a.e1 === k) && dist2(a.a, a.b) > 1e-9,
    );
    const used = new Uint8Array(mine.length);
    const a0 = poly[k],
      b0 = poly[(k + 1) % n];
    const face: Vec2[] = [plan[k], plan[(k + 1) % n]];
    let cur = b0;
    for (let guard = 0; guard <= mine.length; guard++) {
      let found = -1;
      let other: Vec2 = cur;
      for (let i = 0; i < mine.length; i++) {
        if (used[i]) continue;
        if (dist2(mine[i].a, cur) < tol) other = mine[i].b;
        else if (dist2(mine[i].b, cur) < tol) other = mine[i].a;
        else continue;
        found = i;
        break;
      }
      if (found < 0) return null;
      used[found] = 1;
      cur = other;
      if (dist2(cur, a0) < tol) break;
      face.push(cur);
    }
    if (dist2(cur, a0) >= tol) return null;
    const area = polygonArea(face);
    if (area <= 0) return null;
    total += area;
    faces.push({edge: k, poly: face});
  }
  // The faces must tile the plan.
  const A = polygonArea(plan);
  if (Math.abs(total - A) > 1e-3 * A + 1e-3) return null;
  return faces;
}
