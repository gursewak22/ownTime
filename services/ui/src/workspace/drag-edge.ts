import type { DropEdge } from './layout-ops';

/** Rect shape shared by DOMRect and dnd-kit's ClientRect. */
type RectLike = { top: number; left: number; width: number; height: number };

/**
 * Map a pointer position over a panel to a drop edge. The middle 50%×50% of the
 * panel is `center` (swap); outside that, the nearest edge wins (insert).
 */
export function computeEdge(rect: RectLike, x: number, y: number): DropEdge {
  const rx = clamp01((x - rect.left) / rect.width);
  const ry = clamp01((y - rect.top) / rect.height);

  if (rx >= 0.25 && rx <= 0.75 && ry >= 0.25 && ry <= 0.75) return 'center';

  const distances: Array<[DropEdge, number]> = [
    ['left', rx],
    ['right', 1 - rx],
    ['top', ry],
    ['bottom', 1 - ry],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
