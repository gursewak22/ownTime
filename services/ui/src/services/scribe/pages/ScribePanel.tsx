import { NotebookPen } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { usePreference } from '@/preferences/use-preference';
import type { PanelComponentProps } from '../../registry';
import { NoteSwitcher } from '../components/NoteSwitcher';
import { ScribeNoteEditor } from '../components/ScribeNoteEditor';
import { useCreateNote, useScribeNotes } from '../hooks';

/**
 * Scribe panel: rough notes you can type in AND doodle over. Which note this
 * panel shows is a per-panel preference (same pattern as the clock's mode).
 */
export function ScribePanel({ instanceId }: PanelComponentProps) {
  const pref = usePreference<string | null>('scribe', `note:${instanceId}`, null);
  const notes = useScribeNotes();
  const createNote = useCreateNote();

  const setNoteId = pref.setValue;

  // Resolve which note to show once both the pref and the list are in:
  // stale pref (note deleted elsewhere / other user's id) falls back to the
  // most recently updated note; the corrected id is persisted back.
  const list = notes.data;
  const prefId = pref.value ?? null;
  const resolvedId = list && prefId && list.some((n) => n.id === prefId) ? prefId : null;

  const listSettled = !notes.isLoading && !notes.isFetching;
  useEffect(() => {
    if (pref.isLoading || !list) return;
    if (prefId && !list.some((n) => n.id === prefId)) {
      // Only treat the pref as stale once the list is settled — while a
      // refetch is in flight the note may simply not have arrived yet.
      if (listSettled) setNoteId(list[0]?.id ?? null);
    } else if (!prefId && list.length > 0) {
      setNoteId(list[0].id);
    }
  }, [pref.isLoading, list, prefId, setNoteId, listSettled]);

  const handleNoteMissing = useCallback(() => {
    setNoteId(null);
  }, [setNoteId]);

  if (pref.isLoading || notes.isLoading) {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>;
  }

  if (!list || list.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-xs space-y-3 text-center">
          <NotebookPen className="mx-auto h-8 w-8 text-muted" />
          <h2 className="text-base font-semibold">No notes yet</h2>
          <p className="text-sm text-muted">
            Type rough notes and doodle right on top of them.
          </p>
          <Button
            onClick={() => createNote.mutate(undefined, { onSuccess: (n) => setNoteId(n.id) })}
            disabled={createNote.isPending}
          >
            Create your first note
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <NoteSwitcher
          notes={list}
          currentId={resolvedId ?? list[0].id}
          onSelect={setNoteId}
        />
      </div>
      <div className="min-h-0 flex-1">
        {resolvedId ? (
          <ScribeNoteEditor
            key={resolvedId}
            noteId={resolvedId}
            onNoteMissing={handleNoteMissing}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>
        )}
      </div>
    </div>
  );
}
