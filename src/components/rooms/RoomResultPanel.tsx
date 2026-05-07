/**
 * Правая основная панель: две карточки результатов (economy + optimal).
 *
 * Редактор помещения (`RoomEditor`) перенесён в левую колонку (`App.tsx`),
 * поэтому здесь только условный вывод результатов или EmptyState.
 *
 * Если у активного помещения не заданы размеры (width=0 || length=0) —
 * вместо ResultCard'ов показываем EmptyState.
 */

import { useShallow } from 'zustand/shallow';
import { useRoomsStore, selectActiveRoom } from '@/store/roomsStore';
import { useCatalogStore, selectActiveRolls } from '@/store/catalogStore';
import { Card } from '@/components/design-system/Card';
import { EmptyState } from '@/components/layout/EmptyState';
import { ResultCard } from '@/components/result/ResultCard';
import styles from './RoomResultPanel.module.css';

export function RoomResultPanel() {
  const activeRoom = useRoomsStore(selectActiveRoom);
  // useShallow обязателен: selectActiveRolls возвращает новый array каждый вызов
  // (через .filter), а React 19 + zustand 5 (useSyncExternalStore) на нестабильную
  // ссылку из getSnapshot выбрасывает Maximum update depth (React error #185).
  const activeRolls = useCatalogStore(useShallow(selectActiveRolls));

  if (!activeRoom) return null;

  const hasGeometry = activeRoom.width > 0 && activeRoom.length > 0;

  return (
    <div className={styles.panel}>
      {!hasGeometry ? (
        <Card surface="surface-1" padding="md">
          <EmptyState
            title="Введите размеры помещения"
            hint="Ширина (поперёк рулона) и длина (вдоль рулона) в метрах."
          />
        </Card>
      ) : (
        <>
          <ResultCard mode="optimal" room={activeRoom} activeRolls={activeRolls} />
          <ResultCard mode="economy" room={activeRoom} activeRolls={activeRolls} />
        </>
      )}
    </div>
  );
}
