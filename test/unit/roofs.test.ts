import assert from 'node:assert/strict';
import {test} from 'node:test';
import {building, solidTop, useCityRoofs} from '../../src/city/gen-tile.ts';
import {CM, CMesh, VERTEX_WORDS} from '../../src/city/cmesh.ts';
import {LightList} from '../../src/city/gen-base.ts';
import type {Building} from '../../src/city/layout.ts';
import {
  pointInPolygon,
  pointSegment,
  polygonArea,
  type Vec2,
} from '../../src/math/vec.ts';

/** Plans house lots come in (CCW): square-ish, odd, concave, slivers. */
const PLANS: Record<string, Vec2[]> = {
  rect: [
    [0, 0],
    [14, 0],
    [14, 8],
    [0, 8],
  ],
  rotatedRect: [
    [0, 0],
    [8, 6],
    [3.2, 12.4],
    [-4.8, 6.4],
  ],
  triangle: [
    [0, 0],
    [16, 0],
    [2, 11],
  ],
  trapezoid: [
    [0, 0],
    [15, 0],
    [11, 9],
    [3, 9],
  ],
  parallelogram: [
    [0, 0],
    [12, 0],
    [19, 8],
    [7, 8],
  ],
  pentagon: [
    [0, 0],
    [12, -2],
    [15, 7],
    [6, 13],
    [-2, 8],
  ],
  ell: [
    [0, 0],
    [14, 0],
    [14, 6],
    [6, 6],
    [6, 14],
    [0, 14],
  ],
  notch: [
    [0, 0],
    [16, 0],
    [16, 10],
    [9, 10],
    [8, 4],
    [7, 10],
    [0, 10],
  ],
  sliver: [
    [0, 0],
    [24, 0],
    [24, 3],
  ],
};

function house(fp: Vec2[], style: number): Building {
  return {
    id: 0,
    kind: 'house',
    footprint: fp,
    base: 10,
    low: 9,
    height: 3 * 2.9 + 1.5,
    floorH: 2.9,
    style,
    front: 0,
    frontage: fp.map((_, i) => i === 0),
    seed: 12345 + style,
    density: 0.1,
  };
}

const outside = (p: Vec2, poly: Vec2[]) => {
  if (pointInPolygon(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, pointSegment(p, poly[i], poly[(i + 1) % poly.length])[0]);
  return d;
};

for (const [name, fp] of Object.entries(PLANS))
  void test(`house roof on a ${name} plan sits on its walls`, () => {
    assert.ok(polygonArea(fp) > 0);
    // New York: every house pitched. Style bits 5-6 pick a hip over a
    // gable on near-rectangles.
    useCityRoofs('metro');
    for (const style of [0, 32])
      for (const lod of [0, 1]) {
        const b = house(fp, style);
        const m = new CMesh(256, 512);
        building(b, m, lod, new LightList(), 0);
        const eaves = solidTop(b);
        const V = (i: number) => {
          const o = i * VERTEX_WORDS;
          return {
            p: [m.f32[o], m.f32[o + 1], m.f32[o + 2]],
            mat: m.u32[o + 6] & 0xff,
          };
        };
        const roof: number[][][] = [];
        for (let t = 0; t < m.icount; t += 3) {
          const v = [0, 1, 2].map(k => V(m.idx[t + k]));
          if (v.some(q => q.p[1] < eaves - 1)) continue;
          // Nothing over the eaves (the roof, its gable walls) reaches more
          // than an eave's overhang past the walls.
          for (const q of v)
            assert.ok(
              outside([q.p[0], q.p[2]], fp) < 0.6,
              `${name} style ${style} lod ${lod}: corner ${q.p.map(x => x.toFixed(2))} past the walls`,
            );
          if (v.every(q => q.mat === CM.tile)) roof.push(v.map(q => q.p));
        }
        // And the roof covers the whole plan, never below the eaves.
        let x0 = Infinity,
          x1 = -Infinity,
          z0 = Infinity,
          z1 = -Infinity;
        for (const q of fp) {
          x0 = Math.min(x0, q[0]);
          x1 = Math.max(x1, q[0]);
          z0 = Math.min(z0, q[1]);
          z1 = Math.max(z1, q[1]);
        }
        for (let x = x0 + 0.13; x < x1; x += 0.5)
          for (let z = z0 + 0.17; z < z1; z += 0.5) {
            if (outside([x, z], fp) > 0) continue;
            let y = -Infinity;
            for (const [a, c, d] of roof) {
              const det =
                (c[0] - a[0]) * (d[2] - a[2]) - (d[0] - a[0]) * (c[2] - a[2]);
              if (Math.abs(det) < 1e-9) continue;
              const s =
                ((x - a[0]) * (d[2] - a[2]) - (d[0] - a[0]) * (z - a[2])) / det;
              const r =
                ((c[0] - a[0]) * (z - a[2]) - (x - a[0]) * (c[2] - a[2])) / det;
              if (s < -1e-6 || r < -1e-6 || s + r > 1 + 1e-6) continue;
              y = Math.max(y, a[1] + (c[1] - a[1]) * s + (d[1] - a[1]) * r);
            }
            assert.ok(
              y >= eaves - 1e-3,
              `${name} style ${style} lod ${lod}: roof ${y} under the eaves ${eaves} at ${x.toFixed(2)},${z.toFixed(2)}`,
            );
          }
      }
  });

void test('flat house roofs keep inside their walls', () => {
  // Hong Kong: style bits 9-12 under 12 give a flat roof, bit 13 a stair hut.
  useCityRoofs('harbour');
  for (const [name, fp] of Object.entries(PLANS))
    for (const style of [0, 1 << 13])
      for (const lod of [0, 1]) {
        const b = house(fp, style);
        const m = new CMesh(256, 512);
        building(b, m, lod, new LightList(), 0);
        const eaves = solidTop(b);
        for (let i = 0; i < m.vcount; i++) {
          const o = i * VERTEX_WORDS;
          assert.notEqual(m.u32[o + 6] & 0xff, CM.tile, `${name}: tiles`);
          if (m.f32[o + 1] < eaves - 1) continue;
          assert.ok(
            outside([m.f32[o], m.f32[o + 2]], fp) < 0.3,
            `${name} style ${style} lod ${lod}: past the walls`,
          );
        }
      }
});
