import { useEffect, useRef, useState } from 'react';
import { PanelRightClose, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ScribeComment } from '../api';

/**
 * Comments are numbered in reading order (top to bottom), not creation order,
 * so pin 3 is always the third thing on the page. Pins and the sidebar share
 * this ordering.
 */
export function orderComments(comments: ScribeComment[]): ScribeComment[] {
  return [...comments].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** A draft is a placed pin whose text hasn't been saved yet. */
export type CommentDraft = { x: number; y: number };

export function CommentPins({
  comments,
  draft,
  activeId,
  interactive,
  onSelect,
  onMove,
}: {
  comments: ScribeComment[]; // pre-ordered
  draft: CommentDraft | null;
  activeId: string | null;
  interactive: boolean;
  onSelect: (id: string) => void;
  /** When set, pins can be dragged to a new spot (content-box coordinates). */
  onMove?: (id: string, x: number, y: number) => void;
}) {
  // Drag state for the one pin being moved; committed via onMove on release.
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const start = useRef<{ cx: number; cy: number } | null>(null);
  const moved = useRef(false);

  return (
    <>
      {comments.map((c, i) => {
        const pos = drag?.id === c.id ? drag : c;
        return (
        <button
          key={c.id}
          type="button"
          aria-label={`Comment ${i + 1}`}
          title={onMove ? `${c.text.slice(0, 80)} (drag to move)` : c.text.slice(0, 80)}
          data-testid="comment-pin"
          onClick={() => {
            // A drag ends with a click event — don't treat it as a select.
            if (moved.current) {
              moved.current = false;
              return;
            }
            onSelect(c.id);
          }}
          onPointerDown={(e) => {
            if (!onMove) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { cx: e.clientX, cy: e.clientY };
            moved.current = false;
          }}
          onPointerMove={(e) => {
            if (!onMove || !start.current) return;
            if (
              !moved.current &&
              Math.hypot(e.clientX - start.current.cx, e.clientY - start.current.cy) < 4
            ) {
              return; // still a click, not a drag
            }
            moved.current = true;
            // The pin's offsetParent is the content box the coordinates live in.
            const box = e.currentTarget.offsetParent;
            if (!box) return;
            const r = box.getBoundingClientRect();
            setDrag({
              id: c.id,
              x: Math.round(Math.min(Math.max(e.clientX - r.left, 0), r.width)),
              y: Math.round(Math.min(Math.max(e.clientY - r.top, 0), r.height)),
            });
          }}
          onPointerUp={() => {
            if (!onMove) return;
            start.current = null;
            if (drag?.id === c.id && moved.current) onMove(c.id, drag.x, drag.y);
            setDrag(null);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDrag(null);
          }}
          className={cn(
            'absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white shadow',
            activeId === c.id ? 'bg-accent ring-2 ring-accent/40' : 'bg-accent/70',
            interactive ? 'pointer-events-auto' : 'pointer-events-none',
            onMove && (drag?.id === c.id ? 'cursor-grabbing' : 'cursor-grab'),
          )}
          style={{ left: pos.x, top: pos.y, touchAction: onMove ? 'none' : undefined }}
        >
          {i + 1}
        </button>
        );
      })}
      {draft && (
        <span
          data-testid="comment-pin-draft"
          className="pointer-events-none absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-accent bg-bg text-[10px] font-bold text-accent"
          style={{ left: draft.x, top: draft.y }}
        >
          +
        </span>
      )}
    </>
  );
}

export function CommentSidebar({
  comments,
  readOnly = false,
  draft,
  activeId,
  onSelect,
  onSaveDraft,
  onCancelDraft,
  onChangeText,
  onDelete,
  onHide,
}: {
  comments: ScribeComment[]; // pre-ordered
  readOnly?: boolean;
  draft: CommentDraft | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onSaveDraft: (text: string) => void;
  onCancelDraft: () => void;
  onChangeText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onHide: () => void;
}) {
  const [draftText, setDraftText] = useState('');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

  // A newly placed pin wants its textarea immediately.
  useEffect(() => {
    if (draft) {
      setDraftText('');
      draftRef.current?.focus();
    }
  }, [draft]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  return (
    <div
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-border"
      data-testid="comment-sidebar"
    >
      <div className="flex items-center border-b border-border px-3 py-2 text-xs font-semibold text-muted">
        Comments
        <button
          type="button"
          aria-label="Hide comments"
          title="Hide comments"
          onClick={onHide}
          className="ml-auto rounded p-1 text-muted hover:bg-muted/10 hover:text-fg"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
      {comments.length === 0 && !draft && (
        <p className="px-3 py-4 text-xs text-muted">
          {readOnly
            ? 'No comments.'
            : 'Click on the page in Comment mode to pin a comment to that spot.'}
        </p>
      )}
      {comments.map((c, i) => (
        <div
          key={c.id}
          ref={activeId === c.id ? activeRef : undefined}
          className={cn(
            'border-b border-border px-3 py-2',
            activeId === c.id && 'bg-accent/5',
          )}
          data-testid="comment-item"
        >
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white',
                activeId === c.id ? 'bg-accent' : 'bg-accent/70',
              )}
              aria-label={`Go to comment ${i + 1}`}
              title="Jump to the pinned spot"
            >
              {i + 1}
            </button>
            <span className="text-[10px] text-muted">
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
            {!readOnly && (
              <button
                type="button"
                aria-label={`Delete comment ${i + 1}`}
                onClick={() => onDelete(c.id)}
                className="ml-auto rounded p-1 text-muted hover:bg-muted/10 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <textarea
            value={c.text}
            disabled={readOnly}
            onChange={(e) => onChangeText(c.id, e.target.value)}
            onFocus={() => onSelect(c.id)}
            rows={Math.min(6, Math.max(2, c.text.split('\n').length))}
            className="w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-fg focus:border-border focus:outline-none"
            aria-label={`Comment ${i + 1} text`}
          />
        </div>
      ))}
      {draft && (
        <div className="border-b border-border bg-accent/5 px-3 py-2" data-testid="comment-draft">
          <div className="mb-1 text-[10px] font-medium text-accent">New comment</div>
          <textarea
            ref={draftRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draftText.trim()) onSaveDraft(draftText.trim());
              } else if (e.key === 'Escape') {
                onCancelDraft();
              }
            }}
            rows={3}
            placeholder="What about this spot?"
            className="w-full resize-none rounded border border-border bg-bg px-1 py-0.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
            aria-label="New comment text"
          />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={!draftText.trim()}
              onClick={() => onSaveDraft(draftText.trim())}
              className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelDraft}
              className="rounded px-2 py-1 text-[11px] text-muted hover:bg-muted/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
