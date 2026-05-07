/**
 * Правая основная панель: редактор активного помещения + две карточки
 * результатов (economy + optimal).
 *
 * Если у активного помещения не заданы размеры (width=0 || length=0) —
 * вместо ResultCard'ов показываем EmptyState.
 */

import { useRoomsStore, selectActiveRoom } from '@/store/roomsStore';
import { useCatalogStore, selectActiveRolls } from '@/store/catalogStore';
import { Card } from '@/components/design-system/Card';
import { EmptyState } from '@/components/layout/EmptyState';
import { RoomEditor } from './RoomEditor';
import { ResultCard } from '@/components/result/ResultCard';
import styles from './RoomResultPanel.module.css';

export function RoomResultPanel() {
  const activeRoom = useRoomsStore(selectActiveRoom);
  const activeRolls = useCatalogStore(selectActiveRolls);

  if (!activeRoom) return null;

  const hasGeometry = activeRoom.width > 0 && activeRoom.length > 0;

  return (
    <div className={styles.panel}>
      <RoomEditor />
      {!hasGeometry ? (
        <Card surface="surface-1" padding="md">
          <EmptyState
            title="Введите размеры помещения"
            hint="Ширина (поперёк рулона) и длина (вдоль рулона) в метрах."
          />
        </Card>
      ) : (
        <>
          <ResultCard mode="economy" room={activeRoom} activeRolls={activeRolls} />
          <ResultCard mode="optimal" room={activeRoom} activeRolls={activeRolls} />
        </>
      )}
    </div>
  );
}
