import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { cn } from '@/lib/cn';
import type { Stroke, StrokeKind } from '../api';
import { hitTest, strokesInRect, strokeToPath } from '../lib/strokes';

export type DoodleMode = 'type' | 'draw' | 'erase' | 'select' | 'comment';
export type DrawTool = StrokeKind;

type Props = {
  strokes: Stroke[];
  mode: DoodleMode;
  tool: DrawTool;
  color: string;
  size: number;
  onCommitStroke: (stroke: Stroke) => void;
  onEraseStrokes: (ids: string[]) => void;
  onMoveStrokes: (ids: string[], dx: number, dy: number) => void;
  onAddCommentAt: (point: [number, number]) => void;
};

const ERASE_RADIUS = 8;
const SELECT_RADIUS = 6;
const MIN_POINT_DISTANCE = 2;
const MIN_SHAPE_DRAG = 3;
const MAX_COMMENT_TAP_DRIFT = 6;
/** Marker strokes are this much wider than the picked pen size. */
export const HIGHLIGHT_WIDTH_FACTOR = 4;
const HIGHLIGHT_OPACITY = 0.4;

const isShapeTool = (t: DrawTool) => t === 'line' || t === 'circle' || t === 'rect';

/**
 * The drawing layer over the note text. Pointer events give one code path for
 * mouse, touch, and stylus; `touch-none` in draw/erase/select modes stops the
 * browser from scrolling instead of drawing (type mode keeps normal touch
 * scrolling, and the whole layer is click-through so the editor gets the
 * pointer). Coordinates are relative to this element, which lives inside the
 * scrolling content box — so strokes are stored in content coordinates and
 * scroll with the text.
 *
 * Draw mode honors `tool`: pen is freehand; line/circle/rect drag out a shape
 * (hold Shift for a perfect square/circle or a 45°-snapped line). Select mode:
 * click a stroke (Shift-click toggles), drag empty space for a marquee, drag a
 * selected stroke to move the selection, Delete/Backspace removes it.
 */
export function DoodleOverlay({
  strokes,
  mode,
  tool,
  color,
  size,
  onCommitStroke,
  onEraseStrokes,
  onMoveStrokes,
  onAddCommentAt,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ a: [number, number]; b: [number, number] } | null>(
    null,
  );
  const [dragOffset, setDragOffset] = useState<[number, number] | null>(null);
  const activePointerId = useRef<number | null>(null);
  const erasing = useRef(false);
  const dragStart = useRef<[number, number] | null>(null);
  const marqueeAdditive = useRef(false);
  const commentDown = useRef<[number, number] | null>(null);

  // Leaving select mode, or strokes disappearing (undo, other panel), drops
  // any selection that no longer applies.
  useEffect(() => {
    if (mode !== 'select') {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((cur) => cur.filter((id) => strokes.some((s) => s.id === id)));
  }, [mode, strokes]);

  // Delete/Backspace removes the selection; Escape clears it.
  useEffect(() => {
    if (mode !== 'select' || selectedIds.length === 0) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onEraseStrokes(selectedIds);
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, selectedIds, onEraseStrokes]);

  function toPoint(e: React.PointerEvent): [number, number] {
    const r = svgRef.current!.getBoundingClientRect();
    return [Math.round(e.clientX - r.left), Math.round(e.clientY - r.top)];
  }

  function shapeEnd(start: [number, number], p: [number, number], shift: boolean): [number, number] {
    if (!shift) return p;
    const dx = p[0] - start[0];
    const dy = p[1] - start[1];
    if (tool === 'line') {
      // snap to the nearest 45°
      const len = Math.hypot(dx, dy);
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      return [Math.round(start[0] + len * Math.cos(angle)), Math.round(start[1] + len * Math.sin(angle))];
    }
    // square / perfect circle
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return [start[0] + Math.sign(dx || 1) * m, start[1] + Math.sign(dy || 1) * m];
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (mode === 'type' || activePointerId.current !== null) return;
    activePointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail (e.g. the pointer was already released); drawing
      // still works from the events that bubble to this element.
    }
    const p = toPoint(e);
    if (mode === 'comment') {
      commentDown.current = p;
    } else if (mode === 'draw') {
      setActiveStroke({
        id: uuid(),
        color,
        size: tool === 'highlight' ? size * HIGHLIGHT_WIDTH_FACTOR : size,
        ...(tool === 'pen' ? {} : { kind: tool }),
        points: isShapeTool(tool) ? [p, p] : [p],
      });
    } else if (mode === 'erase') {
      erasing.current = true;
      eraseAt(p);
    } else {
      // select mode
      const hits = hitTest(strokes, p, SELECT_RADIUS);
      const hit = hits[hits.length - 1]; // topmost (last drawn)
      if (hit) {
        let next: string[];
        if (e.shiftKey) {
          next = selectedIds.includes(hit)
            ? selectedIds.filter((id) => id !== hit)
            : [...selectedIds, hit];
        } else {
          next = selectedIds.includes(hit) ? selectedIds : [hit];
        }
        setSelectedIds(next);
        if (next.includes(hit)) {
          dragStart.current = p;
          setDragOffset([0, 0]);
        }
      } else {
        marqueeAdditive.current = e.shiftKey;
        if (!e.shiftKey) setSelectedIds([]);
        setMarquee({ a: p, b: p });
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerId !== activePointerId.current) return;
    const p = toPoint(e);
    if (mode === 'draw') {
      setActiveStroke((cur) => {
        if (!cur) return cur;
        if (cur.kind && cur.kind !== 'highlight') {
          return { ...cur, points: [cur.points[0], shapeEnd(cur.points[0], p, e.shiftKey)] };
        }
        const last = cur.points[cur.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_POINT_DISTANCE) return cur;
        return { ...cur, points: [...cur.points, p] };
      });
    } else if (mode === 'erase' && erasing.current) {
      eraseAt(p);
    } else if (mode === 'select') {
      if (dragStart.current) {
        setDragOffset([p[0] - dragStart.current[0], p[1] - dragStart.current[1]]);
      } else if (marquee) {
        setMarquee({ a: marquee.a, b: p });
      }
    }
  }

  function handlePointerEnd(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerId !== activePointerId.current) return;
    activePointerId.current = null;
    erasing.current = false;
    if (commentDown.current) {
      const down = commentDown.current;
      commentDown.current = null;
      const p = toPoint(e);
      // A tap places a comment; a drag (or a cancelled touch scroll) doesn't.
      if (e.type === 'pointerup' && Math.hypot(p[0] - down[0], p[1] - down[1]) <= MAX_COMMENT_TAP_DRIFT) {
        onAddCommentAt(down);
      }
    }
    if (activeStroke) {
      const isShape = activeStroke.kind && activeStroke.kind !== 'highlight';
      const keep =
        !isShape ||
        Math.hypot(
          activeStroke.points[1][0] - activeStroke.points[0][0],
          activeStroke.points[1][1] - activeStroke.points[0][1],
        ) >= MIN_SHAPE_DRAG;
      if (keep) onCommitStroke(activeStroke);
      setActiveStroke(null);
    }
    if (dragStart.current) {
      const [dx, dy] = dragOffset ?? [0, 0];
      if ((dx !== 0 || dy !== 0) && selectedIds.length > 0) {
        onMoveStrokes(selectedIds, dx, dy);
      }
      dragStart.current = null;
      setDragOffset(null);
    }
    if (marquee) {
      const inRect = strokesInRect(strokes, marquee.a, marquee.b);
      setSelectedIds((cur) =>
        marqueeAdditive.current ? [...new Set([...cur, ...inRect])] : inRect,
      );
      setMarquee(null);
    }
  }

  function eraseAt(p: [number, number]) {
    const hits = hitTest(strokes, p, ERASE_RADIUS);
    if (hits.length > 0) onEraseStrokes(hits);
  }

  const [dx, dy] = dragOffset ?? [0, 0];
  const moving = dragOffset !== null && (dx !== 0 || dy !== 0);

  return (
    <svg
      ref={svgRef}
      className={cn(
        'absolute inset-0 h-full w-full',
        mode === 'type' && 'pointer-events-none',
        mode === 'draw' && 'touch-none cursor-crosshair',
        mode === 'erase' && 'touch-none cursor-cell',
        mode === 'select' && (moving ? 'touch-none cursor-move' : 'touch-none cursor-default'),
        // comment mode keeps touch scrolling — a tap places, a swipe scrolls
        mode === 'comment' && 'cursor-copy',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      data-testid="doodle-overlay"
    >
      {[...strokes, ...(activeStroke ? [activeStroke] : [])].map((s) => {
        const selected = mode === 'select' && selectedIds.includes(s.id);
        const transform =
          selected && dragOffset ? `translate(${dx}, ${dy})` : undefined;
        return (
          <g key={s.id} transform={transform}>
            {selected && (
              <path
                d={strokeToPath(s)}
                className="text-accent"
                stroke="currentColor"
                strokeWidth={s.size + 6}
                strokeOpacity={0.35}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                data-testid="stroke-selection"
              />
            )}
            <path
              d={strokeToPath(s)}
              stroke={s.color}
              strokeWidth={s.size}
              strokeOpacity={s.kind === 'highlight' ? HIGHLIGHT_OPACITY : undefined}
              fill="none"
              strokeLinecap={s.kind === 'highlight' ? 'butt' : 'round'}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
      {marquee && (
        <rect
          x={Math.min(marquee.a[0], marquee.b[0])}
          y={Math.min(marquee.a[1], marquee.b[1])}
          width={Math.abs(marquee.b[0] - marquee.a[0])}
          height={Math.abs(marquee.b[1] - marquee.a[1])}
          className="text-accent"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 3"
          fill="currentColor"
          fillOpacity={0.08}
        />
      )}
    </svg>
  );
}
