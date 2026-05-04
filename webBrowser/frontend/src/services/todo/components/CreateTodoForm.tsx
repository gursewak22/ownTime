import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCreateTodo } from '../hooks';

export function CreateTodoForm() {
  const [title, setTitle] = useState('');
  const create = useCreateTodo();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed },
      {
        onSuccess: () => setTitle(''),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        placeholder="What's the one thing?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={create.isPending}
      />
      <Button type="submit" disabled={!title.trim() || create.isPending}>
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </form>
  );
}
