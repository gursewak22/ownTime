import type { DropEdge } from './layout-ops';

/** Minimal rect shape — matches both DOMRect and dnd-kit's ClientRect. */
type RectLike = { left: number; top: number; width: number; height: number };

/**
 * Given a droppable's rect and the pointer position, decide which of the 5 drop
 * zones the pointer is in: the middle 50%×50% is `center` (swap), otherwise the
 * nearest of the four edges.
 */
export function computeEdge(rect: RectLike, pointerX: number, pointerY: number): DropEdge {
  const relX = (pointerX - rect.left) / rect.width; // 0..1
  const relY = (pointerY - rect.top) / rect.height; // 0..1

  if (relX > 0.25 && relX < 0.75 && relY > 0.25 && relY < 0.75) return 'center';

  const dl = relX;
  const dr = 1 - relX;
  const dt = relY;
  const db = 1 - relY;
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return 'left';
  if (min === dr) return 'right';
  if (min === dt) return 'top';
  return 'bottom';
}
