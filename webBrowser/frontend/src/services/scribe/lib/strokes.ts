import type { Stroke } from '../api';

type Point = [number, number];

/**
 * SVG path for a stroke. Freehand uses quadratic-midpoint smoothing: line to
 * the first midpoint, then each point becomes the control of a curve to the
 * next midpoint; a single point renders as a dot (round line caps). Shapes
 * (line/circle/rect) are built from the drag's [start, end] bounding box.
 */
export function strokeToPath(stroke: Stroke): string {
  const pts = stroke.points;
  if (pts.length === 0) return '';

  if (stroke.kind === 'line' && pts.length >= 2) {
    const [a, b] = endpoints(pts);
    return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
  }
  if (stroke.kind === 'rect' && pts.length >= 2) {
    const { x1, y1, x2, y2 } = bbox(pts);
    return `M ${x1} ${y1} H ${x2} V ${y2} H ${x1} Z`;
  }
  if (stroke.kind === 'circle' && pts.length >= 2) {
    const { x1, y1, x2, y2 } = bbox(pts);
    const rx = (x2 - x1) / 2;
    const ry = (y2 - y1) / 2;
    const cy = y1 + ry;
    return (
      `M ${x1} ${cy} ` +
      `A ${rx} ${ry} 0 1 0 ${x2} ${cy} ` +
      `A ${rx} ${ry} 0 1 0 ${x1} ${cy} Z`
    );
  }

  const [x0, y0] = pts[0];
  if (pts.length === 1) return `M ${x0} ${y0} L ${x0 + 0.01} ${y0}`;

  let d = `M ${x0} ${y0}`;
  d += ` L ${mid(pts[0], pts[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${mid(pts[i], pts[i + 1])}`;
  }
  const [xn, yn] = pts[pts.length - 1];
  d += ` L ${xn} ${yn}`;
  return d;
}

function mid(a: Point, b: Point): string {
  return `${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2}`;
}

function endpoints(pts: Point[]): [Point, Point] {
  return [pts[0], pts[pts.length - 1]];
}

function bbox(pts: Point[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

/**
 * A stroke's visible outline as a polyline, for hit-testing. Freehand = its
 * own points; line = both ends; rect = the four corners closed; circle = the
 * ellipse sampled (interior of shapes is NOT a hit — only the drawn border).
 */
function outline(s: Stroke): Point[] {
  if (!s.kind || s.kind === 'pen' || s.points.length < 2) return s.points;
  const [a, b] = endpoints(s.points);
  if (s.kind === 'line') return [a, b];
  const { x1, y1, x2, y2 } = bbox(s.points);
  if (s.kind === 'rect') {
    return [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ];
  }
  // circle: sample the ellipse
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = (x2 - x1) / 2;
  const ry = (y2 - y1) / 2;
  const pts: Point[] = [];
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * 2 * Math.PI;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

/** Ids of strokes within `radius` px of the point (plus half the stroke width). */
export function hitTest(strokes: Stroke[], point: Point, radius: number): string[] {
  return strokes
    .filter((s) => {
      const reach = radius + s.size / 2;
      const line = outline(s);
      if (line.length === 0) return false;
      if (line.length === 1) return dist(point, line[0]) <= reach;
      for (let i = 0; i < line.length - 1; i++) {
        if (pointToSegment(point, line[i], line[i + 1]) <= reach) return true;
      }
      return false;
    })
    .map((s) => s.id);
}

/** Ids of strokes whose outline touches the marquee rectangle (any point inside). */
export function strokesInRect(strokes: Stroke[], a: Point, b: Point): string[] {
  const x1 = Math.min(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const x2 = Math.max(a[0], b[0]);
  const y2 = Math.max(a[1], b[1]);
  return strokes
    .filter((s) =>
      outline(s).some(([x, y]) => x >= x1 && x <= x2 && y >= y1 && y <= y2),
    )
    .map((s) => s.id);
}

/** New stroke with every point shifted by (dx, dy). */
export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  return {
    ...s,
    points: s.points.map(([x, y]) => [Math.round(x + dx), Math.round(y + dy)]),
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return dist(p, a);
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, [a[0] + t * abx, a[1] + t * aby]);
}
