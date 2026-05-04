import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/cn';
import type { Todo } from '../api';

type Props = {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
};

export function TodoItem({ todo, onToggle, onDelete }: Props) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-2 last:border-b-0">
      <Checkbox
        className="mt-1"
        checked={todo.done}
        onChange={() => onToggle(todo)}
        aria-label={`Mark "${todo.title}" as ${todo.done ? 'not done' : 'done'}`}
      />
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm', todo.done && 'text-muted line-through')}>
          {todo.title}
        </div>
        {todo.notes && (
          <div className="mt-0.5 truncate text-xs text-muted">{todo.notes}</div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(todo)}
        aria-label={`Delete "${todo.title}"`}
      >
        <Trash2 className="h-4 w-4 text-muted" />
      </Button>
    </li>
  );
}
