/**
 * Редактор активного помещения: имя + табы выбора режима геометрии
 * (прямоугольник | свободная форма) + соответствующее тело редактора.
 *
 * Кнопка удаления отображается только если в store больше одного помещения
 * (последнее не даём удалить — UX иначе странный).
 *
 * При смене режима через Tabs вызывается `setRoomLayout`:
 *  - rect → free: shape сбрасывается, width/length=0 пока пользователь не нарисует.
 *  - free → rect: shape удаляется; последний derived width/length сохраняется.
 */

import { Card } from '@/components/design-system/Card';
import { TextInput } from '@/components/design-system/TextInput';
import { NumberField } from '@/components/design-system/NumberField';
import { IconButton } from '@/components/design-system/IconButton';
import { Tabs } from '@/components/design-system/Tabs';
import { useRoomsStore, selectActiveRoom } from '@/store/roomsStore';
import { DIMENSION_MAX_MM } from '@shared/constants';
import type { Room } from '@/domain/types';
import { FreeShapeEditor } from './FreeShapeEditor';
import styles from './RoomEditor.module.css';

const LAYOUT_TABS = [
  { id: 'rect', label: 'Прямоугольник' },
  { id: 'free', label: 'Свободная форма' },
] as const;

export function RoomEditor() {
  const activeRoom = useRoomsStore(selectActiveRoom);
  const updateRoom = useRoomsStore((s) => s.updateRoom);
  const removeRoom = useRoomsStore((s) => s.removeRoom);
  const setRoomLayout = useRoomsStore((s) => s.setRoomLayout);
  const roomCount = useRoomsStore((s) => s.rooms.length);

  if (!activeRoom) return null;

  const layout = activeRoom.layout ?? 'rect';

  return (
    <Card surface="surface-1" padding="md">
      <div className={styles.editor}>
        <div className={styles.headerRow}>
          <TextInput
            value={activeRoom.name}
            placeholder="Название помещения"
            onChange={(e) => updateRoom(activeRoom.id, { name: e.target.value })}
          />
          {roomCount > 1 && (
            <IconButton
              size="sm"
              ariaLabel="Удалить помещение"
              onClick={() => removeRoom(activeRoom.id)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </IconButton>
          )}
        </div>

        <Tabs
          tabs={LAYOUT_TABS.map((t) => ({ id: t.id, label: t.label }))}
          activeId={layout}
          onChange={(id) => {
            if (id === 'rect' || id === 'free') {
              setRoomLayout(activeRoom.id, id);
            }
          }}
        />

        {layout === 'rect' ? (
          <RectDimensions room={activeRoom} />
        ) : (
          <FreeShapeEditor roomId={activeRoom.id} shape={activeRoom.shape} />
        )}
      </div>
    </Card>
  );
}

/** Прямоугольный режим — два поля ввода + swap. Логика 1:1 с предыдущей версией. */
function RectDimensions({ room }: { room: Room }) {
  const updateRoom = useRoomsStore((s) => s.updateRoom);
  return (
    <div className={styles.dimensions}>
      <label className={styles.label}>
        <span className={styles.labelText}>Ширина</span>
        <NumberField
          aria-label="Ширина помещения, м"
          valueMm={room.width}
          onChangeMm={(mm) => updateRoom(room.id, { width: mm })}
          minMm={0}
          maxMm={DIMENSION_MAX_MM}
          suffix="м"
        />
      </label>
      <div className={styles.swapWrap}>
        <IconButton
          size="sm"
          ariaLabel="Поменять ширину и длину местами"
          title="Поменять ширину и длину местами"
          onClick={() =>
            updateRoom(room.id, {
              width: room.length,
              length: room.width,
            })
          }
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2 5h10l-2.5-2.5M14 11H4l2.5 2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
      </div>
      <label className={styles.label}>
        <span className={styles.labelText}>Длина</span>
        <NumberField
          aria-label="Длина помещения, м"
          valueMm={room.length}
          onChangeMm={(mm) => updateRoom(room.id, { length: mm })}
          minMm={0}
          maxMm={DIMENSION_MAX_MM}
          suffix="м"
        />
      </label>
    </div>
  );
}
