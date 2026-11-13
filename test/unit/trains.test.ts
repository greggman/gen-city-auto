import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Elevated} from '../../src/city/layout.ts';
import {Trains} from '../../src/game/trains.ts';
import type {VehicleRenderer} from '../../src/render/vehicles.ts';

// A straight 2 km line along +x with a tunnel from 800 m to 1200 m, and a
// renderer stand-in with one 20 m train car design.
function line(): Trains {
  const pts: [number, number][] = [];
  for (let x = 0; x <= 2000; x += 10) pts.push([x, 0]);
  const e: Elevated = {
    pts,
    heights: pts.map(() => 10),
    kind: 'rail',
    loop: false,
    stations: [],
    tunnels: [800, 1200],
  };
  const vr = {
    variantsOf: (k: string) => (k === 'train' ? [0] : []),
    variants: [{info: {size: [3, 3.65, 19.4]}}],
  } as unknown as VehicleRenderer;
  return new Trains([e], vr);
}

// Trains ran on through tunnels in plain view where the ground over them was
// shallower than a car is tall: they are drawn only out of the tunnels, cut
// at the bore going in or out.
void test('trains are hidden in tunnels and cut at the bores', () => {
  const T = line();
  const tr = T.trains[0];
  tr.dir = 1;
  tr.dwell = 1e9;
  // Front 30 m into the tunnel: the first car hidden, the second cut.
  tr.s = 830;
  T.update(0);
  assert.ok(tr.cars[0].hidden);
  const c = tr.cars[1];
  assert.ok(!c.hidden && c.clip);
  // The plane at the bore (x = 800), facing into the tunnel (+x).
  assert.ok(Math.abs(c.clip[0] - 1) < 1e-6 && Math.abs(c.clip[3] - 800) < 1e-6);
  assert.ok(tr.cars.slice(2).every(k => !k.hidden && !k.clip));
  assert.equal(T.toTunnel(0), -30);
  assert.ok(!T.inOpen(0));
  // Short of the tunnel.
  tr.s = 700;
  T.update(0);
  assert.ok(T.inOpen(0));
  assert.ok(Math.abs(T.toTunnel(0) - 100) <= 2);
  assert.ok(T.inTunnel(0, 1000) && !T.inTunnel(0, 700));
});

void test('a train scene is staged on an open approach', () => {
  const T = line();
  // A station 50 m past the tunnel: coming in from the far side only.
  assert.ok(T.openApproach(0, 1250, 220));
  const i = T.stage(0, 1250, 220);
  if (i >= 0) assert.equal(T.trains[i].dir, -1);
  // One in the tunnel never.
  assert.ok(!T.openApproach(0, 1000, 220));
  assert.equal(T.stage(0, 1000, 220), -1);
});
