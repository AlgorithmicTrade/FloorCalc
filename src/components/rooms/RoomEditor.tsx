/**
 * Редактор активного помещения: имя + ширина + длина.
 * Кнопка удаления отображается только если в store больше одного помещения
 * (последнее не даём удалить — UX иначе странный).
 */

import { Card } from '@/components/design-system/Card';
import { TextInput } from '@/components/design-system/TextInput';
import { NumberField } from '@/components/design-system/NumberField';
import { IconButton } from '@/components/design-system/IconButton';
import { useRoomsStore, selectActiveRoom } from '@/store/roomsStore';
import { DIMENSION_MAX_MM } from '@shared/constants';
import styles from './RoomEditor.module.css';

export function RoomEditor() {
  const activeRoom = useRoomsStore(selectActiveRoom);
  const updateRoom = useRoomsStore((s) => s.updateRoom);
  const removeRoom = useRoomsStore((s) => s.removeRoom);
  const roomCount = useRoomsStore((s) => s.rooms.length);

  if (!activeRoom) return null;

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
        <div className={styles.dimensions}>
          <label className={styles.label}>
            <span className={styles.labelText}>Ширина</span>
            <NumberField
              aria-label="Ширина помещения, м"
              valueMm={activeRoom.width}
              onChangeMm={(mm) => updateRoom(activeRoom.id, { width: mm })}
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
                updateRoom(activeRoom.id, {
                  width: activeRoom.length,
                  length: activeRoom.width,
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
              valueMm={activeRoom.length}
              onChangeMm={(mm) => updateRoom(activeRoom.id, { length: mm })}
              minMm={0}
              maxMm={DIMENSION_MAX_MM}
              suffix="м"
            />
          </label>
        </div>
      </div>
    </Card>
  );
}
