/**
 * Вкладки помещений + кнопка «+» для добавления нового помещения.
 * Селекция активного — делегируется в roomsStore.
 */

import { Tabs } from '@/components/design-system/Tabs';
import { IconButton } from '@/components/design-system/IconButton';
import { useRoomsStore } from '@/store/roomsStore';

export function RoomTabs() {
  const rooms = useRoomsStore((s) => s.rooms);
  const activeId = useRoomsStore((s) => s.activeRoomId);
  const setActive = useRoomsStore((s) => s.setActive);
  const addRoom = useRoomsStore((s) => s.addRoom);

  if (!activeId) return null;

  const tabs = rooms.map((r) => ({
    id: r.id,
    label: r.name.trim().length > 0 ? r.name : 'Без названия',
  }));

  return (
    <Tabs
      tabs={tabs}
      activeId={activeId}
      onChange={setActive}
      endSlot={
        <IconButton size="sm" ariaLabel="Добавить помещение" onClick={addRoom}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      }
    />
  );
}
