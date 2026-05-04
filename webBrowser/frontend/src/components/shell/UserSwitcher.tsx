import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useUserStore } from '@/lib/user-store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export function UserSwitcher() {
  const { currentUserId, knownUserIds, setCurrentUserId } = useUserStore();
  const queryClient = useQueryClient();
  const [newUserId, setNewUserId] = useState('');

  function switchTo(id: string) {
    setCurrentUserId(id);
    queryClient.invalidateQueries();
  }

  function addAndSwitch() {
    const trimmed = newUserId.trim();
    if (!trimmed) return;
    setNewUserId('');
    switchTo(trimmed);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">user</span>
      <Select
        value={currentUserId}
        onChange={(e) => switchTo(e.target.value)}
        aria-label="Current user"
      >
        {knownUserIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </Select>
      <Input
        className="h-9 w-32"
        placeholder="new user id"
        value={newUserId}
        onChange={(e) => setNewUserId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addAndSwitch();
        }}
      />
      <Button variant="secondary" size="sm" onClick={addAndSwitch} disabled={!newUserId.trim()}>
        Add
      </Button>
    </div>
  );
}
