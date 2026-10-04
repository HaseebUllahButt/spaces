import type { CanvasItem, PortSide } from "./types";

export const DEFAULT_RECT_W = 220;
export const DEFAULT_RECT_H = 140;
/** How far the first/last segment exits a port before bending. */
export const PORT_STUB = 18;

export type Pt = { x: number; y: number };

const PORTS: PortSide[] = ["n", "e", "s", "w"];

export function rectSize(item: CanvasItem): { w: number; h: number } {
  return {
    w: item.width ?? DEFAULT_RECT_W,
    h: item.height ?? DEFAULT_RECT_H,
  };
}

/** World position of a port on a rectangle (uses live x/y/width/height). */
export function portPosition(item: CanvasItem, port: PortSide, offset = 0): Pt {
  const { w, h } = rectSize(item);
  switch (port) {
    case "n":
      return { x: item.x + w / 2 + offset, y: item.y };
    case "s":
      return { x: item.x + w / 2 + offset, y: item.y + h };
    case "e":
      return { x: item.x + w, y: item.y + h / 2 + offset };
    case "w":
      return { x: item.x, y: item.y + h / 2 + offset };
  }
}

/** Step outward from a port along its normal. */
export function portOut(item: CanvasItem, port: PortSide, dist = PORT_STUB, offset = 0): Pt {
  const p = portPosition(item, port, offset);
  switch (port) {
    case "n":
      return { x: p.x, y: p.y - dist };
    case "s":
      return { x: p.x, y: p.y + dist };
    case "e":
      return { x: p.x + dist, y: p.y };
    case "w":
      return { x: p.x - dist, y: p.y };
  }
}

/** Nearest port on a rect to a world point. */
export function nearestPort(item: CanvasItem, world: Pt): PortSide {
  let best: PortSide = "e";
  let bestD = Infinity;
  for (const port of PORTS) {
    const p = portPosition(item, port);
    const d = (p.x - world.x) ** 2 + (p.y - world.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = port;
    }
  }
  return best;
}

/** Closest pair of ports for quick-connect. */
export function bestPortPair(from: CanvasItem, to: CanvasItem): [PortSide, PortSide] {
  let pair: [PortSide, PortSide] = ["e", "w"];
  let best = Infinity;
  for (const fromPort of PORTS) {
    for (const toPort of PORTS) {
      const a = portPosition(from, fromPort);
      const b = portPosition(to, toPort);
      const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (distance < best) {
        best = distance;
        pair = [fromPort, toPort];
      }
    }
  }
  return pair;
}

function flatten(pts: Pt[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}

function unflatten(arr: number[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < arr.length; i += 2) pts.push({ x: arr[i], y: arr[i + 1] });
  return pts;
}

function samePoint(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function simplify(points: Pt[]): Pt[] {
  const deduped = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  return deduped.filter((point, index) => {
    if (index === 0 || index === deduped.length - 1) return true;
    const before = deduped[index - 1];
    const after = deduped[index + 1];
    const vertical = before.x === point.x && point.x === after.x &&
      (point.y - before.y) * (after.y - point.y) >= 0;
    const horizontal = before.y === point.y && point.y === after.y &&
      (point.x - before.x) * (after.x - point.x) >= 0;
    return !vertical && !horizontal;
  });
}

type RouteRect = { left: number; right: number; top: number; bottom: number };
type Axis = "h" | "v";
type RouteSegment = { a: Pt; b: Pt };

export interface ConnectorRoutingOptions {
  fromOffset?: number;
  toOffset?: number;
  occupiedSegments?: RouteSegment[];
}

function pointInsideRect(point: Pt, rect: RouteRect): boolean {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

function segmentBlocked(a: Pt, b: Pt, rect: RouteRect): boolean {
  if (a.x === b.x) {
    return a.x > rect.left && a.x < rect.right &&
      Math.max(Math.min(a.y, b.y), rect.top) < Math.min(Math.max(a.y, b.y), rect.bottom);
  }
  return a.y > rect.top && a.y < rect.bottom &&
    Math.max(Math.min(a.x, b.x), rect.left) < Math.min(Math.max(a.x, b.x), rect.right);
}

function segmentConflict(a: Pt, b: Pt, occupied: RouteSegment): "overlap" | "cross" | null {
  const horizontal = a.y === b.y;
  const occupiedHorizontal = occupied.a.y === occupied.b.y;
  if (horizontal === occupiedHorizontal) {
    if (horizontal && a.y === occupied.a.y) {
      const overlap = Math.max(Math.min(a.x, b.x), Math.min(occupied.a.x, occupied.b.x)) <
        Math.min(Math.max(a.x, b.x), Math.max(occupied.a.x, occupied.b.x));
      return overlap ? "overlap" : null;
    }
    if (!horizontal && a.x === occupied.a.x) {
      const overlap = Math.max(Math.min(a.y, b.y), Math.min(occupied.a.y, occupied.b.y)) <
        Math.min(Math.max(a.y, b.y), Math.max(occupied.a.y, occupied.b.y));
      return overlap ? "overlap" : null;
    }
    return null;
  }
  // A grid splits candidate edges at occupied lanes. Include candidate endpoints
  // or every crossing at a grid vertex escapes the crossing penalty.
  const crosses = horizontal
    ? occupied.a.x >= Math.min(a.x, b.x) && occupied.a.x <= Math.max(a.x, b.x) &&
      a.y > Math.min(occupied.a.y, occupied.b.y) && a.y < Math.max(occupied.a.y, occupied.b.y)
    : occupied.a.y >= Math.min(a.y, b.y) && occupied.a.y <= Math.max(a.y, b.y) &&
      a.x > Math.min(occupied.a.x, occupied.b.x) && a.x < Math.max(occupied.a.x, occupied.b.x);
  return crosses ? "cross" : null;
}

function obstacleRects(from: CanvasItem, to: CanvasItem, avoidItems: CanvasItem[]): RouteRect[] {
  const padding = 10;
  const byId = new Map<string, CanvasItem>([[from._id, from], [to._id, to]]);
  for (const item of avoidItems) if (item.type === "rect") byId.set(item._id, item);
  return [...byId.values()].map((item) => {
    const { w, h } = rectSize(item);
    return {
      left: item.x - padding,
      right: item.x + w + padding,
      top: item.y - padding,
      bottom: item.y + h + padding,
    };
  });
}

function moveOutsideObstacles(point: Pt, obstacles: RouteRect[]): Pt {
  let safe = { ...point };
  for (let pass = 0; pass < obstacles.length + 1; pass++) {
    const obstacle = obstacles.find((rect) => pointInsideRect(safe, rect));
    if (!obstacle) break;
    const choices = [
      { distance: safe.x - obstacle.left, point: { x: obstacle.left, y: safe.y } },
      { distance: obstacle.right - safe.x, point: { x: obstacle.right, y: safe.y } },
      { distance: safe.y - obstacle.top, point: { x: safe.x, y: obstacle.top } },
      { distance: obstacle.bottom - safe.y, point: { x: safe.x, y: obstacle.bottom } },
    ].sort((a, b) => a.distance - b.distance);
    safe = choices[0].point;
  }
  return safe;
}

/** Small visibility-grid router around the source and target rectangles. */
function routeAroundRects(
  a: Pt,
  b: Pt,
  fromAxis: Axis,
  toAxis: Axis,
  obstacles: RouteRect[],
  occupiedSegments: RouteSegment[] = [],
): Pt[] {
  // Most adjacent cards have a clear straight lane. Avoid building a visibility
  // graph for that case, while retaining both obstacle and lane checks.
  const directAxis = a.y === b.y ? "h" : a.x === b.x ? "v" : null;
  if (directAxis === fromAxis && directAxis === toAxis &&
    !obstacles.some((rect) => segmentBlocked(a, b, rect)) &&
    !occupiedSegments.some((segment) => segmentConflict(a, b, segment))) {
    return [a, b];
  }
  const laneGap = 8;
  const outerX = obstacles.length > 0
    ? [Math.min(...obstacles.map((rect) => rect.left)) - PORT_STUB,
      Math.max(...obstacles.map((rect) => rect.right)) + PORT_STUB]
    : [];
  const outerY = obstacles.length > 0
    ? [Math.min(...obstacles.map((rect) => rect.top)) - PORT_STUB,
      Math.max(...obstacles.map((rect) => rect.bottom)) + PORT_STUB]
    : [];
  const xs = [...new Set([
    a.x,
    b.x,
    (a.x + b.x) / 2,
    ...outerX,
    ...obstacles.flatMap((rect) => [rect.left, rect.right]),
    ...occupiedSegments.flatMap((segment) => segment.a.x === segment.b.x
      ? [segment.a.x - laneGap, segment.a.x, segment.a.x + laneGap]
      : [segment.a.x, segment.b.x]),
  ])].sort((x, y) => x - y);
  const ys = [...new Set([
    a.y,
    b.y,
    (a.y + b.y) / 2,
    ...outerY,
    ...obstacles.flatMap((rect) => [rect.top, rect.bottom]),
    ...occupiedSegments.flatMap((segment) => segment.a.y === segment.b.y
      ? [segment.a.y - laneGap, segment.a.y, segment.a.y + laneGap]
      : [segment.a.y, segment.b.y]),
  ])].sort((x, y) => x - y);
  const nodes: Pt[] = [];
  for (const x of xs) {
    for (const y of ys) {
      const point = { x, y };
      if (!obstacles.some((rect) => pointInsideRect(point, rect))) nodes.push(point);
    }
  }
  const nodeKey = (point: Pt) => `${point.x}:${point.y}`;
  const byKey = new Map(nodes.map((point, index) => [nodeKey(point), index]));
  const startIndex = byKey.get(nodeKey(a));
  const endIndex = byKey.get(nodeKey(b));
  if (startIndex === undefined || endIndex === undefined) return simplify([
    a,
    { x: a.x, y: b.y },
    b,
  ]);

  const neighbors: { index: number; axis: Axis; length: number; penalty: number }[][] = nodes.map(() => []);
  const rows = new Map<number, number[]>();
  const columns = new Map<number, number[]>();
  nodes.forEach((point, index) => {
    if (!rows.has(point.y)) rows.set(point.y, []);
    if (!columns.has(point.x)) columns.set(point.x, []);
    rows.get(point.y)!.push(index);
    columns.get(point.x)!.push(index);
  });
  const connectAdjacent = (indices: number[], axis: Axis) => {
    indices.sort((left, right) =>
      axis === "h" ? nodes[left].x - nodes[right].x : nodes[left].y - nodes[right].y,
    );
    for (let position = 0; position < indices.length - 1; position++) {
      const left = indices[position];
      const right = indices[position + 1];
      if (obstacles.some((rect) => segmentBlocked(nodes[left], nodes[right], rect))) continue;
      const conflicts = occupiedSegments.map((segment) => segmentConflict(nodes[left], nodes[right], segment));
      if (conflicts.includes("overlap")) continue;
      const penalty = conflicts.includes("cross") ? 1200 : 0;
      const length = Math.abs(nodes[left].x - nodes[right].x) +
        Math.abs(nodes[left].y - nodes[right].y);
      neighbors[left].push({ index: right, axis, length, penalty });
      neighbors[right].push({ index: left, axis, length, penalty });
    }
  };
  rows.forEach((indices) => connectAdjacent(indices, "h"));
  columns.forEach((indices) => connectAdjacent(indices, "v"));

  const stateCount = nodes.length * 2;
  const distance = Array(stateCount).fill(Infinity) as number[];
  const previous = Array(stateCount).fill(-1) as number[];
  const visited = Array(stateCount).fill(false) as boolean[];
  const axisIndex = (axis: Axis) => axis === "h" ? 0 : 1;
  const startState = startIndex * 2 + axisIndex(fromAxis);
  distance[startState] = 0;
  const queue: { state: number; score: number }[] = [{ state: startState, score: 0 }];
  const queuePush = (entry: { state: number; score: number }) => {
    queue.push(entry);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent].score <= queue[index].score) break;
      [queue[parent], queue[index]] = [queue[index], queue[parent]];
      index = parent;
    }
  };
  const queuePop = () => {
    const first = queue[0];
    const last = queue.pop();
    if (queue.length > 0 && last) {
      queue[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < queue.length && queue[left].score < queue[smallest].score) smallest = left;
        if (right < queue.length && queue[right].score < queue[smallest].score) smallest = right;
        if (smallest === index) break;
        [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
        index = smallest;
      }
    }
    return first;
  };
  let bestEndScore = Infinity;
  while (queue.length > 0) {
    const next = queuePop();
    if (!next) break;
    if (next.score >= bestEndScore) break;
    const state = next.state;
    if (visited[state] || next.score !== distance[state]) continue;
    visited[state] = true;
    const nodeIndex = Math.floor(state / 2);
    const currentAxis: Axis = state % 2 === 0 ? "h" : "v";
    if (nodeIndex === endIndex) {
      bestEndScore = Math.min(bestEndScore, distance[state] + (currentAxis === toAxis ? 0 : 28));
      continue;
    }
    for (const edge of neighbors[nodeIndex]) {
      const nextState = edge.index * 2 + axisIndex(edge.axis);
      const bendCost = edge.axis === currentAxis ? 0 : 28;
      const nextDistance = distance[state] + edge.length + bendCost + edge.penalty;
      if (nextDistance < distance[nextState]) {
        distance[nextState] = nextDistance;
        previous[nextState] = state;
        queuePush({ state: nextState, score: nextDistance });
      }
    }
  }

  const endStates = (["h", "v"] as Axis[]).map((axis) => {
    const state = endIndex * 2 + axisIndex(axis);
    return { state, score: distance[state] + (axis === toAxis ? 0 : 28) };
  });
  const endState = endStates.sort((left, right) => left.score - right.score)[0].state;
  if (!Number.isFinite(distance[endState])) {
    // When lanes enclose an endpoint, allow an overlap before ever cutting
    // through a shape. Retry the full obstacle graph without lane reservations.
    if (occupiedSegments.length > 0) {
      return routeAroundRects(a, b, fromAxis, toAxis, obstacles);
    }
    // Keep the emergency path orthogonal for degenerate or overlapping geometry
    // where a free route cannot be found.
    const fallbackCandidates: Pt[][] = [
      [a, { x: a.x, y: b.y }, b],
      [a, { x: b.x, y: a.y }, b],
      ...outerX.flatMap((x) => [[a, { x, y: a.y }, { x, y: b.y }, b]]),
      ...outerY.flatMap((y) => [[a, { x: a.x, y }, { x: b.x, y }, b]]),
    ];
    const usable = fallbackCandidates.find((candidate) => candidate.every((point, index) => {
      if (index === 0) return true;
      const previousPoint = candidate[index - 1];
      return !obstacles.some((rect) => segmentBlocked(previousPoint, point, rect)) &&
        !occupiedSegments.some((segment) => segmentConflict(previousPoint, point, segment) === "overlap");
    }));
    return simplify(usable ?? fallbackCandidates[0]);
  }
  const route: Pt[] = [];
  for (let state = endState; state >= 0; state = previous[state]) {
    route.push(nodes[Math.floor(state / 2)]);
    if (state === startState) break;
  }
  return simplify(route.reverse());
}

/** Auto orthogonal route between two ports (no user bends). */
export function autoRoute(
  from: CanvasItem,
  to: CanvasItem,
  fromPort: PortSide,
  toPort: PortSide,
  avoidItems: CanvasItem[] = [],
  routing: ConnectorRoutingOptions = {},
): number[] {
  const start = portPosition(from, fromPort, routing.fromOffset);
  const end = portPosition(to, toPort, routing.toOffset);
  const a = portOut(from, fromPort, PORT_STUB, routing.fromOffset);
  const b = portOut(to, toPort, PORT_STUB, routing.toOffset);
  const fromHorizontal = fromPort === "e" || fromPort === "w";
  const toHorizontal = toPort === "e" || toPort === "w";
  const obstacles = obstacleRects(from, to, avoidItems);
  const route = routeAroundRects(
    a,
    b,
    fromHorizontal ? "h" : "v",
    toHorizontal ? "h" : "v",
    obstacles,
    routing.occupiedSegments,
  );
  return flatten(simplify([start, ...route, end]));
}

/**
 * Full path for a connector. Live ports from current node geometry;
 * optional absolute waypoints between the exit stubs.
 */
export function connectorPoints(
  from: CanvasItem | undefined,
  to: CanvasItem | undefined,
  fromPort: PortSide,
  toPort: PortSide,
  waypoints?: number[],
  avoidItems: CanvasItem[] = [],
  routing: ConnectorRoutingOptions = {},
): number[] | null {
  if (!from || !to) return null;
  if (!waypoints || waypoints.length < 2) {
    return autoRoute(from, to, fromPort, toPort, avoidItems, routing);
  }
  const start = portPosition(from, fromPort, routing.fromOffset);
  const end = portPosition(to, toPort, routing.toOffset);
  const a = portOut(from, fromPort, PORT_STUB, routing.fromOffset);
  const b = portOut(to, toPort, PORT_STUB, routing.toOffset);
  const obstacles = obstacleRects(from, to, avoidItems);
  const mids = unflatten(waypoints).map((point) => moveOutsideObstacles(point, obstacles));
  const controls = [a, ...mids, b];
  const route: Pt[] = [start, a];
  let currentAxis: Axis = fromPort === "e" || fromPort === "w" ? "h" : "v";
  for (let index = 0; index < controls.length - 1; index++) {
    const legStart = controls[index];
    const legEnd = controls[index + 1];
    const targetAxis: Axis = index === controls.length - 2
      ? (toPort === "e" || toPort === "w" ? "h" : "v")
      : (Math.abs(legEnd.x - legStart.x) >= Math.abs(legEnd.y - legStart.y) ? "h" : "v");
    const leg = routeAroundRects(
      legStart,
      legEnd,
      currentAxis,
      targetAxis,
      obstacles,
      routing.occupiedSegments,
    );
    route.push(...leg.slice(1));
    if (leg.length >= 2) {
      const before = leg[leg.length - 2];
      const last = leg[leg.length - 1];
      currentAxis = before.x === last.x ? "v" : "h";
    }
  }
  route.push(end);
  return flatten(simplify(route));
}

/**
 * Plans all connector paths together so shared ports fan out and no two connectors
 * reuse the same line segment. Earlier paths become reserved lanes for later paths.
 */
export function buildConnectorRoutes(items: CanvasItem[]): Map<string, number[]> {
  const byId = new Map(items.map((item) => [item._id, item]));
  const connectors = items
    .filter((item) =>
      item.type === "connector" && item.fromId && item.toId && item.fromPort && item.toPort,
    )
    .sort((left, right) =>
      (left.zIndex ?? 0) - (right.zIndex ?? 0) ||
      left._creationTime - right._creationTime ||
      left._id.localeCompare(right._id),
    );
  const portGroups = new Map<string, { connectorId: string; role: "from" | "to" }[]>();
  const addPort = (nodeId: string, port: PortSide, connectorId: string, role: "from" | "to") => {
    const key = `${nodeId}:${port}`;
    portGroups.set(key, [...(portGroups.get(key) ?? []), { connectorId, role }]);
  };
  for (const connector of connectors) {
    addPort(connector.fromId!, connector.fromPort!, connector._id, "from");
    addPort(connector.toId!, connector.toPort!, connector._id, "to");
  }
  portGroups.forEach((entries) => entries.sort((left, right) =>
    left.connectorId.localeCompare(right.connectorId) || left.role.localeCompare(right.role),
  ));
  const portOffset = (
    node: CanvasItem,
    port: PortSide,
    connectorId: string,
    role: "from" | "to",
  ) => {
    const entries = portGroups.get(`${node._id}:${port}`) ?? [];
    if (entries.length <= 1) return 0;
    const index = entries.findIndex((entry) => entry.connectorId === connectorId && entry.role === role);
    const { w, h } = rectSize(node);
    const sideLength = port === "n" || port === "s" ? w : h;
    const available = Math.max(0, sideLength - 2 * Math.min(14, sideLength / 4));
    const spacing = Math.min(12, available / Math.max(1, entries.length - 1));
    return (index - (entries.length - 1) / 2) * spacing;
  };

  const laneOffsets = new Map<string, { fromOffset: number; toOffset: number }>();
  const occupiedSegments: RouteSegment[] = [];
  for (const connector of connectors) {
    const from = byId.get(connector.fromId!);
    const to = byId.get(connector.toId!);
    if (!from || !to) continue;
    const fromOffset = portOffset(from, connector.fromPort!, connector._id, "from");
    const toOffset = portOffset(to, connector.toPort!, connector._id, "to");
    laneOffsets.set(connector._id, { fromOffset, toOffset });
    occupiedSegments.push({
      a: portPosition(from, connector.fromPort!, fromOffset),
      b: portOut(from, connector.fromPort!, PORT_STUB, fromOffset),
    });
    occupiedSegments.push({
      a: portOut(to, connector.toPort!, PORT_STUB, toOffset),
      b: portPosition(to, connector.toPort!, toOffset),
    });
  }

  const routes = new Map<string, number[]>();
  for (const connector of connectors) {
    const from = byId.get(connector.fromId!);
    const to = byId.get(connector.toId!);
    if (!from || !to) continue;
    const offsets = laneOffsets.get(connector._id) ?? { fromOffset: 0, toOffset: 0 };
    const points = connectorPoints(
      from,
      to,
      connector.fromPort!,
      connector.toPort!,
      undefined,
      items,
      {
        fromOffset: offsets.fromOffset,
        toOffset: offsets.toOffset,
        occupiedSegments,
      },
    );
    if (!points) continue;
    routes.set(connector._id, points);
    // Simplification can merge a stub into the shaft, including a whole straight
    // route. Reserve every rendered segment so those lanes are not lost.
    for (let index = 0; index + 3 < points.length; index += 2) {
      const a = { x: points[index], y: points[index + 1] };
      const b = { x: points[index + 2], y: points[index + 3] };
      if (!samePoint(a, b)) occupiedSegments.push({ a, b });
    }
  }
  return routes;
}

/** Bounding box of a flat points array — used for schema x/y/width/height. */
export function pointsBounds(points: number[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Midpoints of each internal segment — good drag handles for adding bends. */
export function segmentMidpoints(points: number[]): Pt[] {
  const mids: Pt[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    mids.push({
      x: (points[i] + points[i + 2]) / 2,
      y: (points[i + 1] + points[i + 3]) / 2,
    });
  }
  return mids;
}

/** Intermediate vertices only (exclude start/end attachment points). */
export function intermediateVertices(points: number[]): Pt[] {
  const pts = unflatten(points);
  if (pts.length <= 2) return [];
  // Drop first and last (on-node ports); keep route interior for bend editing.
  return pts.slice(1, -1);
}

/** Point halfway along the rendered path, used to place edge labels. */
export function pathMidpoint(points: number[]): Pt {
  const pts = unflatten(points);
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const length = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const ratio = lengths[i] === 0 ? 0 : remaining / lengths[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * ratio,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * ratio,
      };
    }
    remaining -= lengths[i];
  }
  return pts[pts.length - 1];
}
