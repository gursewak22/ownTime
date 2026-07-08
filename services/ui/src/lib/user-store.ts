import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UserState = {
  currentUserId: string;
  knownUserIds: string[];
  setCurrentUserId: (id: string) => void;
  addKnownUserId: (id: string) => void;
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      currentUserId: 'demo',
      knownUserIds: ['demo', 'alice', 'bob'],
      setCurrentUserId: (id) =>
        set((s) => ({
          currentUserId: id,
          knownUserIds: s.knownUserIds.includes(id)
            ? s.knownUserIds
            : [...s.knownUserIds, id],
        })),
      addKnownUserId: (id) =>
        set((s) => ({
          knownUserIds: s.knownUserIds.includes(id)
            ? s.knownUserIds
            : [...s.knownUserIds, id],
        })),
    }),
    { name: 'owntime.user' },
  ),
);

export function getCurrentUserId(): string {
  return useUserStore.getState().currentUserId;
}
