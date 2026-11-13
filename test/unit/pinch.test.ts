import assert from 'node:assert/strict';
import {test} from 'node:test';
import {plainParts} from '../../src/city/layout.ts';
import {polygonArea, type Vec2} from '../../src/math/vec.ts';

void test('plans pinched in two come apart, largest part first', () => {
  // Two quads touching at a corner (x = 10, z = 5), traced as one loop.
  const touch: Vec2[] = [
    [0, 0],
    [10, 5],
    [20, 2],
    [20, 9],
    [10, 5],
    [0, 8],
  ];
  // The same joined by a 0.4 m neck.
  const neck: Vec2[] = [
    [0, 0],
    [10, 4.8],
    [20, 2],
    [20, 9],
    [10, 5.2],
    [0, 8],
  ];
  for (const fp of [touch, neck]) {
    const parts = plainParts(fp);
    assert.equal(parts.length, 2);
    assert.ok(polygonArea(parts[0]) >= polygonArea(parts[1]));
    const sum = polygonArea(parts[0]) + polygonArea(parts[1]);
    assert.ok(Math.abs(sum - polygonArea(fp)) < 0.06 * polygonArea(fp));
  }
});

void test('plain plans, sharp corners and Ls stay whole', () => {
  const plans: Vec2[][] = [
    [
      [0, 0],
      [14, 0],
      [14, 8],
      [0, 8],
    ],
    // A sliver triangle's tip is a sharp corner, not a pinch.
    [
      [0, 0],
      [24, 0],
      [24, 3],
    ],
    [
      [0, 0],
      [14, 0],
      [14, 6],
      [6, 6],
      [6, 14],
      [0, 14],
    ],
  ];
  for (const fp of plans) {
    const parts = plainParts(fp);
    assert.equal(parts.length, 1);
    assert.equal(parts[0], fp);
  }
});
