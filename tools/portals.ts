// Tunnel mouths of every rail line: node tools/portals.ts [preset] [seed] [--json]
// Lists each mouth (position, which way the hill is), whether it has a
// portal, and the ground over the deck at the points round it (* in the
// tunnel). --json prints them for the screenshot scripts instead.
import {PRESETS, type CityType} from '../src/city/config.ts';
import {generateLayout} from '../src/city/layout.ts';
import {carriageway, tunnelPlan} from '../src/city/gen-base.ts';
import {computeRoadGeom} from '../src/city/roadgeom.ts';

const type = (process.argv[2] ?? 'harbour') as CityType;
const seed = Number(process.argv[3] ?? 1);
const json = process.argv.includes('--json');
const L = generateLayout(PRESETS[type], seed);
const hf = L.terrain.heights;
const inRoad = carriageway(L, computeRoadGeom(L));
const out: unknown[] = [];
let rail = -1;
L.elevated.forEach((e, ei) => {
  if (e.kind !== 'rail') return;
  rail++;
  const {under, noPortal, portals} = tunnelPlan(e, hf, inRoad);
  const over = (i: number) =>
    e.heights[i] - hf.sample(e.pts[i][0], e.pts[i][1]);
  const arc = [0];
  for (let i = 1; i < e.pts.length; i++)
    arc.push(
      arc[i - 1] +
        Math.hypot(
          e.pts[i][0] - e.pts[i - 1][0],
          e.pts[i][1] - e.pts[i - 1][1],
        ),
    );
  for (let b = 1; b < e.pts.length; b++) {
    if (under[b] === under[b - 1]) continue;
    const t = under[b] ? 1 : -1;
    const p0 = t > 0 ? b - 1 : b;
    const a = e.pts[b - 1];
    const c = e.pts[b];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const f = portals.find(p => p.i === b - 1)?.t ?? 0.5;
    out.push({
      rail,
      line: ei,
      b,
      arc: arc[b - 1] + (arc[b] - arc[b - 1]) * f,
      mid: [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f],
      h: e.heights[b - 1] + (e.heights[b] - e.heights[b - 1]) * f,
      into: [((c[0] - a[0]) / l) * t, ((c[1] - a[1]) / l) * t],
      dir: t,
      portal: !noPortal.has(b),
    });
    if (json) continue;
    const cover: string[] = [];
    for (let j = -3; j <= 10; j++) {
      const k = p0 + t * j;
      if (k < 0 || k >= e.pts.length) continue;
      cover.push((-over(k)).toFixed(1) + (under[k] ? '*' : ''));
    }
    const q = e.pts[p0];
    console.log(
      `line ${ei} mouth ${b} at (${q[0].toFixed(0)},${q[1].toFixed(0)}) ` +
        `deck ${e.heights[p0].toFixed(1)}` +
        `${noPortal.has(b) ? ' NO PORTAL' : ''}\n    cover: ${cover.join(' ')}`,
    );
  }
});
if (json) console.log(JSON.stringify(out));
