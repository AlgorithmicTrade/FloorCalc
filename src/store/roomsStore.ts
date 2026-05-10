/**
 * In-memory store помещений (без persist).
 *
 * По решению из плана: помещения не сохраняются между запусками — это
 * рабочий черновик пользователя для текущей задачи. Сохраняется только
 * каталог рулонов (catalogStore).
 *
 * На старте создаётся одно пустое помещение, чтобы UI было что показать
 * и пользователь сразу мог начать вводить размеры.
 *
 * Поддерживается два режима задания геометрии (Room.layout):
 *  - 'rect' (default) — пользователь вводит width × length напрямую.
 *  - 'free' — пользователь рисует ортогональный полигон в FreeShapeEditor;
 *    width/length derived из bounding box полигона при каждом обновлении shape.
 */

import { create } from 'zustand';
import type { Room, RoomShape } from '@/domain/types';
import { buildShapePolygon } from '@/domain/shape';

interface RoomsState {
  rooms: Room[];
  activeRoomId: string | null;

  addRoom: () => void;
  removeRoom: (id: string) => void;
  updateRoom: (
    id: string,
    patch: Partial<Pick<Room, 'name' | 'width' | 'length'>>,
  ) => void;
  /** Переключить режим задания геометрии активного помещения. При смене rect→free
   *  shape сбрасывается; при free→rect shape удаляется, width/length сохраняются
   *  как последний bbox (если был валидный shape). */
  setRoomLayout: (id: string, layout: 'rect' | 'free') => void;
  /** Обновить shape (free-layout). Автоматически пересчитывает width/length
   *  из bbox полигона; если shape невалиден — width/length=0. */
  setRoomShape: (id: string, shape: RoomShape) => void;
  setActive: (id: string) => void;
}

/** Вычисляет следующий номер для дефолтного имени «Помещение N» из текущих имён,
 * чтобы счётчик не сбрасывался при удалении/добавлении (UX: после удаления
 * комнаты 2 следующая будет «Помещение 3», а не повторно «Помещение 2»). */
const DEFAULT_NAME_RE = /^Помещение\s+(\d+)$/;
function nextRoomNumber(existing: Room[]): number {
  let max = 0;
  for (const r of existing) {
    const m = DEFAULT_NAME_RE.exec(r.name);
    if (m) {
      const n = Number.parseInt(m[1]!, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function makeRoom(existing: Room[]): Room {
  const n = nextRoomNumber(existing);
  return {
    id: `room-${Date.now()}-${n}`,
    name: `Помещение ${n}`,
    width: 0,
    length: 0,
    layout: 'rect',
  };
}

export const useRoomsStore = create<RoomsState>((set) => {
  // На старте — одно пустое помещение, чтобы UI был не пустым.
  const first = makeRoom([]);
  return {
    rooms: [first],
    activeRoomId: first.id,

    addRoom: (): void =>
      set((s) => {
        const r = makeRoom(s.rooms);
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

    updateRoom: (
      id: string,
      patch: Partial<Pick<Room, 'name' | 'width' | 'length'>>,
    ): void =>
      set((s) => ({
        rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),

    setRoomLayout: (id: string, layout: 'rect' | 'free'): void =>
      set((s) => ({
        rooms: s.rooms.map((r) => {
          if (r.id !== id) return r;
          if (layout === 'rect') {
            // free→rect: удаляем shape, width/length сохраняем (если был bbox).
            const { shape: _shape, ...rest } = r;
            return { ...rest, layout: 'rect' };
          }
          // rect→free: сбрасываем shape (пользователь нарисует с нуля),
          // width/length=0 пока контур не задан.
          return { ...r, layout: 'free', shape: undefined, width: 0, length: 0 };
        }),
      })),

    setRoomShape: (id: string, shape: RoomShape): void =>
      set((s) => ({
        rooms: s.rooms.map((r) => {
          if (r.id !== id) return r;
          // Derived width/length из bbox полигона; если shape невалиден — 0.
          const polygon = buildShapePolygon(shape);
          return {
            ...r,
            layout: 'free',
            shape,
            width: polygon?.bboxWidth ?? 0,
            length: polygon?.bboxLength ?? 0,
          };
        }),
      })),

    setActive: (id: string): void => set({ activeRoomId: id }),
  };
});

/** Селектор: текущее активное помещение или null если store ещё не инициализирован. */
export const selectActiveRoom = (state: RoomsState): Room | null =>
  state.rooms.find((r) => r.id === state.activeRoomId) ?? null;
