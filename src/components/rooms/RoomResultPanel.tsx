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
import { validateShape } from '@/domain/shape';
import styles from './RoomResultPanel.module.css';

export function RoomResultPanel() {
  const activeRoom = useRoomsStore(selectActiveRoom);
  // useShallow обязателен: selectActiveRolls возвращает новый array каждый вызов
  // (через .filter), а React 19 + zustand 5 (useSyncExternalStore) на нестабильную
  // ссылку из getSnapshot выбрасывает Maximum update depth (React error #185).
  const activeRolls = useCatalogStore(useShallow(selectActiveRolls));

  if (!activeRoom) return null;

  const hasGeometry = activeRoom.width > 0 && activeRoom.length > 0;
  const isFree = (activeRoom.layout ?? 'rect') === 'free';

  // Для свободной формы: если shape присутствует и контур замкнут, но размеры
  // не сошлись — пользователь видит конкретную причину, а не общее «завершите».
  let freeTitle = 'Завершите планировку';
  let freeHint = 'Замкните контур по точкам сетки и задайте размер каждой стены.';
  if (isFree && activeRoom.shape && activeRoom.shape.walls.length > 0) {
    const v = validateShape(activeRoom.shape);
    if (v.closed && v.allSized && !v.consistent) {
      freeTitle = 'Размеры стен не согласованы';
      freeHint =
        'Суммы противоположных стен должны совпадать. Проверьте размеры — иначе схема не построится.';
    } else if (v.closed && !v.allSized) {
      freeTitle = 'Заполните размеры стен';
      freeHint = 'Контур замкнут, но не у всех стен задан размер.';
    }
  }

  return (
    <div className={styles.panel}>
      {!hasGeometry ? (
        <Card surface="surface-1" padding="md">
          {isFree ? (
            <EmptyState title={freeTitle} hint={freeHint} />
          ) : (
            <EmptyState
              title="Введите размеры помещения"
              hint="Ширина и длина в метрах."
            />
          )}
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
