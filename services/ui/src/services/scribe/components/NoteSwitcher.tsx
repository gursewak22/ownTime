import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { ScribeNoteSummary } from '../api';
import { useCreateNote, useDeleteNote, useRenameNote } from '../hooks';

type Props = {
  notes: ScribeNoteSummary[];
  currentId: string;
  onSelect: (id: string | null) => void;
};

export function NoteSwitcher({ notes, currentId, onSelect }: Props) {
  const createNote = useCreateNote();
  const renameNote = useRenameNote();
  const deleteNote = useDeleteNote();
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const current = notes.find((n) => n.id === currentId);

  function submitRename() {
    const title = draftTitle.trim();
    if (title && title !== current?.title) {
      renameNote.mutate({ id: currentId, title });
    }
    setRenaming(false);
  }

  function handleDelete() {
    if (!current) return;
    if (!window.confirm(`Delete “${current.title}”? This can’t be undone.`)) return;
    deleteNote.mutate(currentId, {
      onSuccess: () => {
        const rest = notes.filter((n) => n.id !== currentId);
        onSelect(rest[0]?.id ?? null);
      },
    });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {renaming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <Input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            maxLength={200}
            className="h-7 min-w-0 flex-1 text-sm"
            aria-label="Note title"
          />
          <Button type="submit" variant="ghost" size="icon" className="h-7 w-7" aria-label="Save title">
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Cancel rename"
            onClick={() => setRenaming(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <>
          <Select
            value={currentId}
            onChange={(e) => onSelect(e.target.value)}
            className="h-7 min-w-0 flex-1 text-sm"
            aria-label="Open note"
          >
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Rename note"
            title="Rename note"
            onClick={() => {
              setDraftTitle(current?.title ?? '');
              setRenaming(true);
            }}
          >
            <Pencil className="h-4 w-4 text-muted" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Delete note"
            title="Delete note"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-muted" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 shrink-0"
            onClick={() =>
              createNote.mutate(undefined, { onSuccess: (n) => onSelect(n.id) })
            }
            disabled={createNote.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </>
      )}
    </div>
  );
}
