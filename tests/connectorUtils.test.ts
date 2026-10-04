import test from 'node:test';
import assert from 'node:assert/strict';
import { autoRoute, buildConnectorRoutes, portPosition, pathMidpoint } from '../src/connectorUtils.ts';
import type { CanvasItem, PortSide } from '../src/types.ts';

const rect = (id: string, x: number, y: number, width = 120, height = 80): CanvasItem =>
  ({ _id: id, _creationTime: 0, type: 'rect', x, y, width, height, content: '' });
const edge = (id: string, from: string, to: string): CanvasItem =>
  ({ _id: id, _creationTime: 0, type: 'connector', x: 0, y: 0, content: '', fromId: from, toId: to, fromPort: 'e', toPort: 'w' });
const ports: PortSide[] = ['n', 'e', 's', 'w'];
function orthogonal(points: number[]) {
  assert.ok(points.length >= 4);
  assert.ok(points.every(Number.isFinite));
  for (let i = 0; i + 3 < points.length; i += 2) {
    assert.ok(points[i] === points[i + 2] || points[i + 1] === points[i + 3], `Diagonal segment: ${points}`);
  }
}
function avoids(points: number[], obstacle: CanvasItem) {
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x, y, nx, ny] = points.slice(i, i + 4);
    const crosses = x === nx
      ? x > obstacle.x && x < obstacle.x + obstacle.width! && Math.max(y, ny) > obstacle.y && Math.min(y, ny) < obstacle.y + obstacle.height!
      : y > obstacle.y && y < obstacle.y + obstacle.height! && Math.max(x, nx) > obstacle.x && Math.min(x, nx) < obstacle.x + obstacle.width!;
    assert.ok(!crosses, `Path crosses ${obstacle._id}: ${points}`);
  }
}

test('all 16 port combinations remain attached, orthogonal, and outside cards', () => {
  const a = rect('a', 0, 0), b = rect('b', 340, 180);
  for (const from of ports) for (const to of ports) {
    const points = autoRoute(a, b, from, to);
    orthogonal(points);
    const start = portPosition(a, from), end = portPosition(b, to);
    assert.deepEqual(points.slice(0, 2), [start.x, start.y]);
    assert.deepEqual(points.slice(-2), [end.x, end.y]);
    avoids(points, a); avoids(points, b);
  }
});

test('clear facing ports produce a straight shaft', () => {
  assert.deepEqual(autoRoute(rect('a', 0, 0), rect('b', 340, 0), 'e', 'w'), [120, 40, 340, 40]);
});

test('routes avoid intervening shapes before and after moving and resizing them', () => {
  const a = rect('a', 0, 0), b = rect('b', 600, 0);
  for (const obstacle of [rect('o', 280, 0), rect('o', 200, -120, 260, 300)]) {
    const points = autoRoute(a, b, 'e', 'w', [obstacle]);
    orthogonal(points); avoids(points, obstacle);
  }
});

test('crowded ports stay on the sides of tiny shapes', () => {
  const a = rect('a', 0, 0, 5, 5), b = rect('b', 340, 0, 5, 5);
  const routes = buildConnectorRoutes([a, b, ...Array.from({ length: 4 }, (_, i) => edge(`c${i}`, 'a', 'b'))]);
  assert.equal(routes.size, 4);
  for (const points of routes.values()) {
    orthogonal(points);
    assert.equal(points[0], 5);
    assert.ok(points[1] >= 0 && points[1] <= 5);
    assert.equal(points.at(-2), 340);
    assert.ok(points.at(-1)! >= 0 && points.at(-1)! <= 5);
  }
});

test('later connectors avoid crossing a simplified straight shaft', () => {
  const a = rect('a', 0, 0), b = rect('b', 500, 0);
  const c = rect('c', 220, -200), d = rect('d', 220, 240);
  const second = { ...edge('second', 'c', 'd'), fromPort: 's' as const, toPort: 'n' as const };
  const routes = buildConnectorRoutes([a, b, c, d, edge('first', 'a', 'b'), second]);
  for (const points of routes.values()) {
    orthogonal(points);
    for (const obstacle of [a, b, c, d]) avoids(points, obstacle);
  }
  // The second edge takes a detour to avoid crossing the already reserved shaft.
  assert.ok(routes.get('second')!.length > 4);
  avoids(routes.get('second')!, rect('reserved shaft', 120, 39.99, 380, 0.02));
});

test('missing endpoints are omitted and labels use length along the path', () => {
  assert.equal(buildConnectorRoutes([rect('a', 0, 0), edge('c', 'a', 'gone')]).size, 0);
  assert.deepEqual(pathMidpoint([0, 0, 100, 0, 100, 300]), { x: 100, y: 100 });
});
