import { EditorContent, useEditor } from '@tiptap/react';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { v4 as uuid } from 'uuid';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useNotePdf, useRemovePdf, useSaveNote, useScribeNote, useUploadPdf } from '../hooks';
import type { ScribeComment, ScribeNote, Stroke } from '../api';
import {
  CommentPins,
  CommentSidebar,
  orderComments,
  type CommentDraft,
} from './Comments';
import { docToMarkdown } from '../lib/markdown';
import { useNoteLock, type NoteLockState } from '../lib/note-lock';
import { exportAnnotatedPdf, exportNotePdf } from '../lib/pdf-export';
import { PDF_PAGE_WIDTH } from '../lib/pdf-layout';
import { translateStroke } from '../lib/strokes';
import { DoodleOverlay, type DoodleMode, type DrawTool } from './DoodleOverlay';
import { EditorToolbar, PEN_COLORS, PEN_SIZES, type SaveStatus } from './EditorToolbar';
import { PdfPages } from './PdfPages';

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
  const lock = useNoteLock(noteId);
  const [lockEpoch, setLockEpoch] = useState(0);
  const [takingOver, setTakingOver] = useState(false);
  const prevLock = useRef<NoteLockState>('pending');

  const openFailed404 = note.error instanceof ApiError && note.error.status === 404;
  useEffect(() => {
    if (openFailed404) onNoteMissing();
  }, [openFailed404, onNoteMissing]);

  // Taking over from another panel/tab: refetch first so we seed from its
  // latest saves, then remount the body as editable (via the key below).
  const refetch = note.refetch;
  useEffect(() => {
    if (prevLock.current === 'locked' && lock === 'owned') {
      setTakingOver(true);
      void refetch().finally(() => {
        setLockEpoch((e) => e + 1);
        setTakingOver(false);
      });
    }
    prevLock.current = lock;
  }, [lock, refetch]);

  if (note.isLoading || lock === 'pending') {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading note…</div>;
  }
  if (note.isError || !note.data) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">
        Couldn’t open this note.
      </div>
    );
  }
  const readOnly = lock !== 'owned' || takingOver;
  return (
    <NoteEditorBody
      key={`${readOnly ? 'ro' : 'rw'}:${lockEpoch}`}
      noteId={noteId}
      initial={note.data}
      readOnly={readOnly}
      onNoteMissing={onNoteMissing}
    />
  );
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
  readOnly,
  onNoteMissing,
}: Props & { initial: ScribeNote; readOnly: boolean }) {
  const save = useSaveNote();

  // Live from the note cache, so an upload/removal in this session flips the
  // editor between text and PDF background without a remount.
  const hasPdf = initial.pdfName != null;

  const [strokes, setStrokes] = useState<Stroke[]>(initial.strokes ?? []);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [comments, setComments] = useState<ScribeComment[]>(initial.comments ?? []);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [mode, setMode] = useState<DoodleMode>(hasPdf ? 'draw' : 'type');
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState(PEN_COLORS[1]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const [dirty, setDirty] = useState(false);
  const [gone, setGone] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Latest content + per-channel dirty flags for the debounced autosave.
  const docRef = useRef<JSONContent | null>(null);
  const strokesRef = useRef<Stroke[]>(initial.strokes ?? []);
  const commentsRef = useRef<ScribeComment[]>(initial.comments ?? []);
  const dirtyRef = useRef({ doc: false, strokes: false, comments: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goneRef = useRef(false);
  const saveMutate = save.mutate;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const d = dirtyRef.current;
    if (goneRef.current || (!d.doc && !d.strokes && !d.comments)) return;
    const input: { doc?: JSONContent; strokes?: Stroke[]; comments?: ScribeComment[] } = {};
    if (d.doc && docRef.current) input.doc = docRef.current;
    if (d.strokes) input.strokes = strokesRef.current;
    if (d.comments) input.comments = commentsRef.current;
    dirtyRef.current = { doc: false, strokes: false, comments: false };
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
          if (input.comments) dirtyRef.current.comments = true;
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

  // PDF notes have no text layer — kick the mode out of 'type' when a PDF
  // arrives (fresh upload) so the drawing tools are usable immediately.
  useEffect(() => {
    if (hasPdf && mode === 'type') setMode('draw');
  }, [hasPdf, mode]);

  // --- comments (not part of the stroke undo history) ---
  const changeComments = useCallback(
    (next: ScribeComment[]) => {
      commentsRef.current = next;
      setComments(next);
      dirtyRef.current.comments = true;
      schedule();
    },
    [schedule],
  );

  const selectComment = useCallback((id: string) => {
    setActiveCommentId(id);
    const c = commentsRef.current.find((x) => x.id === id);
    if (c && scrollRef.current) {
      scrollRef.current.scrollTo({ top: Math.max(0, c.y - 120), behavior: 'smooth' });
    }
  }, []);

  const saveCommentDraft = useCallback(
    (text: string) => {
      if (!commentDraft) return;
      const comment: ScribeComment = {
        id: uuid(),
        x: commentDraft.x,
        y: commentDraft.y,
        text,
        createdAt: new Date().toISOString(),
      };
      changeComments([...commentsRef.current, comment]);
      setCommentDraft(null);
      setActiveCommentId(comment.id);
    },
    [commentDraft, changeComments],
  );

  const pdf = useNotePdf(noteId, hasPdf);
  const uploadPdf = useUploadPdf();
  const removePdf = useRemovePdf();
  const [exporting, setExporting] = useState(false);

  const handleAttachPdf = useCallback(
    (file: File) => {
      uploadPdf.mutate(
        { id: noteId, file },
        {
          onError: (error) =>
            window.alert(error instanceof Error ? error.message : 'Upload failed'),
        },
      );
    },
    [noteId, uploadPdf],
  );

  const handleRemovePdf = useCallback(() => {
    if (window.confirm('Remove the PDF from this note? Your drawings stay.')) {
      removePdf.mutate(noteId);
    }
  }, [noteId, removePdf]);

  const contentBoxRef = useRef<HTMLDivElement | null>(null);

  const handleExportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      let blob: Blob;
      let filename: string;
      if (hasPdf) {
        if (!pdf.data) return;
        blob = await exportAnnotatedPdf(pdf.data, strokesRef.current, commentsRef.current);
        const base = (initial.pdfName ?? 'document.pdf').replace(/\.pdf$/i, '');
        filename = `${base} (annotated).pdf`;
      } else {
        if (!contentBoxRef.current) return;
        blob = await exportNotePdf(
          contentBoxRef.current,
          strokesRef.current,
          commentsRef.current,
        );
        filename = `${initial.title || 'note'}.pdf`;
      }
      downloadBlob(blob, filename);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [exporting, hasPdf, pdf.data, initial.pdfName, initial.title]);

  const handleExportMarkdown = useCallback(() => {
    // docRef holds the latest editor state; before any edit it's the note as loaded.
    const doc = docRef.current ?? initial.doc;
    const blob = new Blob([docToMarkdown(doc)], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${initial.title || 'note'}.md`);
  }, [initial.doc, initial.title]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
    ],
    editable: !readOnly,
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
  // whenever a drawing mode is active. In type mode TipTap owns undo natively;
  // comment mode leaves the shortcut alone (typing happens in the sidebar).
  useEffect(() => {
    if (readOnly || mode === 'type' || mode === 'comment') return;
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
        readOnly={readOnly}
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
        hasPdf={hasPdf}
        onAttachPdf={handleAttachPdf}
        uploadingPdf={uploadPdf.isPending}
        onExportPdf={handleExportPdf}
        onExportMarkdown={handleExportMarkdown}
        exportingPdf={exporting || (hasPdf && pdf.isLoading)}
        onRemovePdf={handleRemovePdf}
      />
      <div className="flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        className={cn('min-h-0 flex-1', hasPdf ? 'overflow-auto' : 'overflow-y-auto')}
      >
        <div
          ref={contentBoxRef}
          className="relative min-h-full pb-32"
          style={hasPdf ? { width: PDF_PAGE_WIDTH } : undefined}
        >
          {hasPdf && (
            <>
              {pdf.isLoading && (
                <div className="grid h-40 place-items-center text-sm text-muted">
                  Loading PDF…
                </div>
              )}
              {pdf.isError && (
                <div className="grid h-40 place-items-center text-sm text-danger">
                  Couldn’t load the PDF.
                </div>
              )}
              {pdf.data && <PdfPages data={pdf.data} />}
            </>
          )}
          <EditorContent
            editor={editor}
            className={[
              hasPdf ? 'hidden' : '',
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
            mode={readOnly ? 'type' : mode}
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
            onAddCommentAt={([x, y]) => {
              setCommentDraft({ x, y });
              setActiveCommentId(null);
            }}
          />
          <CommentPins
            comments={orderComments(comments)}
            draft={commentDraft}
            activeId={activeCommentId}
            interactive={readOnly || mode === 'comment' || mode === 'type'}
            onSelect={selectComment}
          />
        </div>
      </div>
      {(mode === 'comment' || comments.length > 0 || commentDraft !== null) && (
        <CommentSidebar
          comments={orderComments(comments)}
          readOnly={readOnly}
          draft={commentDraft}
          activeId={activeCommentId}
          onSelect={selectComment}
          onSaveDraft={saveCommentDraft}
          onCancelDraft={() => setCommentDraft(null)}
          onChangeText={(id, text) =>
            changeComments(commentsRef.current.map((c) => (c.id === id ? { ...c, text } : c)))
          }
          onDelete={(id) => {
            changeComments(commentsRef.current.filter((c) => c.id !== id));
            if (activeCommentId === id) setActiveCommentId(null);
          }}
        />
      )}
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
