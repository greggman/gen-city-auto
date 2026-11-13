// Pitched roofs hanging past their walls.
//   node tools/roofcheck.ts [cities=neon,metro,harbour,river] [seeds=1,2] [lod=1]
// Builds every house alone and takes its roof: the triangles wholly above
// 1 m under its eaves (solidTop), so the overhang's drop is in. Counts the roof vertices and roof area (sampled on a 0.25 m
// grid) more than EAVE m outside the footprint, the houses with any, the
// worst overhang, roof corners inside the walls but below the eaves (the
// roof dipping under the ceiling), and the houses' triangle count.
import {PRESETS, type CityType} from '../src/city/config.ts';
import {building, solidTop, useCityRoofs} from '../src/city/gen-tile.ts';
import {CM, CMesh, VERTEX_WORDS} from '../src/city/cmesh.ts';
import {LightList} from '../src/city/gen-base.ts';
import {generateLayout} from '../src/city/layout.ts';
import {pointInPolygon, pointSegment, type Vec2} from '../src/math/vec.ts';

// Overhang allowed past the walls (m); EAVE=1 node tools/roofcheck.ts ...
const EAVE = Number(process.env.EAVE ?? 0.6);
const cities = (process.argv[2] ?? 'neon,metro,harbour,river').split(
  ',',
) as CityType[];
const seeds = (process.argv[3] ?? '1,2').split(',').map(Number);
const lod = Number(process.argv[4] ?? 1);

/** How far `p` lies outside `poly` (0 inside). */
function outside(p: Vec2, poly: Vec2[]) {
  return pointInPolygon(p, poly) ? 0 : edgeDist(p, poly);
}

/** Distance from `p` to the nearest edge of `poly`. */
function edgeDist(p: Vec2, poly: Vec2[]) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, pointSegment(p, poly[i], poly[(i + 1) % poly.length])[0]);
  return d;
}

for (const city of cities)
  for (const seed of seeds) {
    const L = generateLayout(PRESETS[city], seed);
    useCityRoofs(city);
    let houses = 0,
      flat = 0,
      bad = 0,
      verts = 0,
      badVerts = 0,
      area = 0,
      badArea = 0,
      tris = 0,
      roofTris = 0,
      sag = 0,
      worst = {id: -1, d: 0};
    for (const b of L.buildings) {
      if (b.kind !== 'house') continue;
      houses++;
      const m = new CMesh(256, 512);
      building(b, m, lod, new LightList(), 0, L.terrain.heights);
      tris += m.icount / 3;
      let pitched = false;
      for (let i = 0; i < m.vcount && !pitched; i++)
        pitched = (m.u32[i * VERTEX_WORDS + 6] & 0xff) === CM.tile;
      if (!pitched) flat++;
      const y0 = solidTop(b) - 1;
      const f = m.f32;
      const P = (i: number): [number, number, number] => {
        const o = i * VERTEX_WORDS;
        return [f[o], f[o + 1], f[o + 2]];
      };
      let hBad = false;
      const seen = new Set<number>();
      for (let t = 0; t < m.icount; t += 3) {
        const ids = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
        const v = ids.map(P);
        if (v.some(q => q[1] < y0)) continue;
        roofTris++;
        for (const [k, q] of v.entries()) {
          if (seen.has(ids[k])) continue;
          seen.add(ids[k]);
          verts++;
          const d = outside([q[0], q[2]], b.footprint);
          // A roof corner well inside the walls but under the eaves.
          if (
            d === 0 &&
            q[1] < y0 + 0.99 &&
            edgeDist([q[0], q[2]], b.footprint) > 0.05
          )
            sag++;
          if (d > EAVE + 1e-3) {
            badVerts++;
            hBad = true;
          }
          if (d > worst.d) worst = {id: b.id, d};
        }
        // Plan area of the triangle, sampled.
        const ax = v[1][0] - v[0][0],
          az = v[1][2] - v[0][2];
        const bx = v[2][0] - v[0][0],
          bz = v[2][2] - v[0][2];
        const ta = Math.abs(ax * bz - az * bx) / 2;
        if (ta < 1e-4) continue;
        const la = Math.hypot(ax, az),
          lb = Math.hypot(bx, bz);
        const nu = Math.max(1, Math.ceil(la / 0.25)),
          nv = Math.max(1, Math.ceil(lb / 0.25));
        let n = 0,
          o = 0;
        for (let i = 0; i < nu; i++)
          for (let j = 0; j < nv; j++) {
            const s = (i + 0.5) / nu,
              r = (j + 0.5) / nv;
            if (s + r > 1) continue;
            n++;
            const p: Vec2 = [
              v[0][0] + ax * s + bx * r,
              v[0][2] + az * s + bz * r,
            ];
            if (outside(p, b.footprint) > EAVE + 1e-3) o++;
          }
        area += ta;
        if (n) badArea += (ta * o) / n;
      }
      if (hBad) bad++;
    }
    console.log(
      `${city} seed ${seed}: ${houses} houses (${flat} flat-roofed), ${bad} with roof past walls+${EAVE} m; ` +
        `roof verts ${badVerts}/${verts} out; roof area ${Math.round(badArea)}/${Math.round(area)} m^2 out; ` +
        `worst ${worst.d.toFixed(1)} m (id ${worst.id}); roof corners under the eaves ${sag}; ` +
        `house tris ${tris} (roof ${roofTris})`,
    );
  }
