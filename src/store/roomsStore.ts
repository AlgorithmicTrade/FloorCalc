/**
 * In-memory store помещений (без persist).
 *
 * По решению из плана: помещения не сохраняются между запусками — это
 * рабочий черновик пользователя для текущей задачи. Сохраняется только
 * каталог рулонов (catalogStore).
 *
 * На старте создаётся одно пустое помещение, чтобы UI было что показать
 * и пользователь сразу мог начать вводить размеры.
 */

import { create } from 'zustand';
import type { Room } from '@/domain/types';

interface RoomsState {
  rooms: Room[];
  activeRoomId: string | null;

  addRoom: () => void;
  removeRoom: (id: string) => void;
  updateRoom: (id: string, patch: Partial<Pick<Room, 'name' | 'width' | 'length'>>) => void;
  setActive: (id: string) => void;
}

/** Счётчик для дефолтных имён «Помещение N». Живёт в module scope, чтобы
 * имена не сбрасывались при удалении/добавлении (UX: после удаления комнаты 2
 * следующая будет «Помещение 3», а не повторно «Помещение 2»). */
let roomCounter = 0;

function makeRoom(): Room {
  roomCounter += 1;
  return {
    id: `room-${Date.now()}-${roomCounter}`,
    name: `Помещение ${roomCounter}`,
    width: 0,
    length: 0
  };
}

export const useRoomsStore = create<RoomsState>((set) => {
  // На старте — одно пустое помещение, чтобы UI был не пустым.
  const first = makeRoom();
  return {
    rooms: [first],
    activeRoomId: first.id,

    addRoom: (): void =>
      set((s) => {
        const r = makeRoom();
        return { rooms: [...s.rooms, r], activeRoomId: r.id };
      }),

    removeRoom: (id: string): void =>
      set((s) => {
        const next = s.rooms.filter((r) => r.id !== id);
        // Защита: не даём удалить последнее помещение — UI всегда должен иметь контекст.
        if (next.length === 0) return s;
        const nextActive = s.activeRoomId === id ? next[0]!.id : s.activeRoomId;
        return { rooms: next, activeRoomId: nextActive };
      }),

    updateRoom: (id: string, patch: Partial<Pick<Room, 'name' | 'width' | 'length'>>): void =>
      set((s) => ({
        rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r))
      })),

    setActive: (id: string): void => set({ activeRoomId: id })
  };
});

/** Селектор: текущее активное помещение или null если store ещё не инициализирован. */
export const selectActiveRoom = (state: RoomsState): Room | null =>
  state.rooms.find((r) => r.id === state.activeRoomId) ?? null;
