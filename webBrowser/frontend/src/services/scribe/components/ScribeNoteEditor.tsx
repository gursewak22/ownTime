import { EditorContent, useEditor } from '@tiptap/react';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { ApiError } from '@/lib/api-client';
import { useSaveNote, useScribeNote } from '../hooks';
import type { ScribeNote, Stroke } from '../api';
import { translateStroke } from '../lib/strokes';
import { DoodleOverlay, type DoodleMode, type DrawTool } from './DoodleOverlay';
import { EditorToolbar, PEN_COLORS, PEN_SIZES, type SaveStatus } from './EditorToolbar';

const STROKE_HISTORY_LIMIT = 100;

const AUTOSAVE_DEBOUNCE_MS = 800;

type Props = {
  noteId: string;
  onNoteMissing: () => void;
};

/**
 * One open note. Mount with key={noteId}: the fetched note seeds the editor
 * once and this component owns the state until unmount. The gate below means
 * NoteEditorBody only ever mounts with data in hand, so the TipTap editor is
 * created exactly once — never recreated mid-typing.
 */
export function ScribeNoteEditor({ noteId, onNoteMissing }: Props) {
  const note = useScribeNote(noteId);

  const openFailed404 = note.error instanceof ApiError && note.error.status === 404;
  useEffect(() => {
    if (openFailed404) onNoteMissing();
  }, [openFailed404, onNoteMissing]);

  if (note.isLoading) {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading note…</div>;
  }
  if (note.isError || !note.data) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">
        Couldn’t open this note.
      </div>
    );
  }
  return <NoteEditorBody noteId={noteId} initial={note.data} onNoteMissing={onNoteMissing} />;
}

/**
 * Editor + doodle overlay in a shared scroll container, so strokes live in
 * content coordinates and scroll with the text.
 *
 * Known limitation (accepted): strokes are pixel positions in the content box;
 * resizing the panel reflows text underneath the drawing.
 */
function NoteEditorBody({
  noteId,
  initial,
  onNoteMissing,
}: Props & { initial: ScribeNote }) {
  const save = useSaveNote();

  const [strokes, setStrokes] = useState<Stroke[]>(initial.strokes ?? []);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [mode, setMode] = useState<DoodleMode>('type');
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState(PEN_COLORS[1]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const [dirty, setDirty] = useState(false);
  const [gone, setGone] = useState(false);

  // Latest content + per-channel dirty flags for the debounced autosave.
  const docRef = useRef<JSONContent | null>(null);
  const strokesRef = useRef<Stroke[]>(initial.strokes ?? []);
  const dirtyRef = useRef({ doc: false, strokes: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goneRef = useRef(false);
  const saveMutate = save.mutate;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (goneRef.current || (!dirtyRef.current.doc && !dirtyRef.current.strokes)) return;
    const input: { doc?: JSONContent; strokes?: Stroke[] } = {};
    if (dirtyRef.current.doc && docRef.current) input.doc = docRef.current;
    if (dirtyRef.current.strokes) input.strokes = strokesRef.current;
    dirtyRef.current = { doc: false, strokes: false };
    setDirty(false);
    saveMutate(
      { id: noteId, input },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.status === 404) {
            // Deleted in another panel — stop saving, let the panel fall back.
            goneRef.current = true;
            setGone(true);
            return;
          }
          // Re-mark what we tried to save and retry after another debounce.
          if (input.doc) dirtyRef.current.doc = true;
          if (input.strokes) dirtyRef.current.strokes = true;
          setDirty(true);
          schedule();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, saveMutate]);

  const schedule = useCallback(() => {
    setDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  // Flush pending work on unmount (note switch via key, or panel close).
  useEffect(() => flush, [flush]);

  useEffect(() => {
    if (gone) onNoteMissing();
  }, [gone, onNoteMissing]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    content: initial.doc,
    // v3 defaults to not re-rendering per transaction; the toolbar needs it
    // for isActive() state. Fine at this document scale.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => {
      docRef.current = e.getJSON();
      dirtyRef.current.doc = true;
      schedule();
    },
  });

  const applyStrokes = useCallback(
    (next: Stroke[]) => {
      strokesRef.current = next;
      setStrokes(next);
      dirtyRef.current.strokes = true;
      schedule();
    },
    [schedule],
  );

  // Every drawing edit (draw, erase, move, clear) snapshots the previous
  // stroke array so Cmd/Ctrl+Z can step back through it.
  const changeStrokes = useCallback(
    (updater: (cur: Stroke[]) => Stroke[]) => {
      const cur = strokesRef.current;
      const next = updater(cur);
      if (next === cur) return;
      setUndoStack((st) => [...st.slice(-(STROKE_HISTORY_LIMIT - 1)), cur]);
      setRedoStack([]);
      applyStrokes(next);
    },
    [applyStrokes],
  );

  const undoStrokes = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack([...redoStack, strokesRef.current]);
    applyStrokes(prev);
  }, [undoStack, redoStack, applyStrokes]);

  const redoStrokes = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack([...undoStack, strokesRef.current]);
    applyStrokes(next);
  }, [undoStack, redoStack, applyStrokes]);

  // Cmd/Ctrl+Z (and Shift+Z / Ctrl+Y for redo) drive the stroke history
  // whenever a drawing mode is active. In type mode TipTap owns undo natively.
  useEffect(() => {
    if (mode === 'type') return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoStrokes();
        else undoStrokes();
      } else if (key === 'y') {
        e.preventDefault();
        redoStrokes();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, undoStrokes, redoStrokes]);

  const saveStatus: SaveStatus = gone
    ? 'error'
    : save.isPending
      ? 'saving'
      : dirty
        ? 'unsaved'
        : 'saved';

  return (
    <div className="flex h-full flex-col">
      <EditorToolbar
        editor={editor}
        mode={mode}
        onModeChange={setMode}
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        penSize={penSize}
        onPenSizeChange={setPenSize}
        canUndoStroke={undoStack.length > 0}
        canRedoStroke={redoStack.length > 0}
        hasStrokes={strokes.length > 0}
        onUndoStroke={undoStrokes}
        onRedoStroke={redoStrokes}
        onClearStrokes={() => {
          if (window.confirm('Clear the whole drawing?')) changeStrokes(() => []);
        }}
        saveStatus={saveStatus}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative min-h-full pb-32">
          <EditorContent
            editor={editor}
            className={[
              'p-4',
              '[&_.ProseMirror]:min-h-[8rem] [&_.ProseMirror]:outline-none',
              '[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-1',
              '[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mt-2 [&_.ProseMirror_h2]:mb-1',
              '[&_.ProseMirror_p]:my-1',
              '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6',
              '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6',
              '[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted',
              '[&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:bg-muted/10 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-sm',
              '[&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-sm',
              '[&_.ProseMirror_mark]:rounded-sm',
            ].join(' ')}
          />
          <DoodleOverlay
            strokes={strokes}
            mode={mode}
            tool={tool}
            color={color}
            size={penSize}
            onCommitStroke={(s) => changeStrokes((cur) => [...cur, s])}
            onEraseStrokes={(ids) =>
              changeStrokes((cur) => cur.filter((s) => !ids.includes(s.id)))
            }
            onMoveStrokes={(ids, dx, dy) =>
              changeStrokes((cur) =>
                cur.map((s) => (ids.includes(s.id) ? translateStroke(s, dx, dy) : s)),
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
