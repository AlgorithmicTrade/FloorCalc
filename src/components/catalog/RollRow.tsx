/**
 * Одна строка каталога рулонов: чекбокс «активен для расчёта» +
 * размеры + кнопка удаления.
 */

import type { RollType } from '@shared/ipc-contract';
import { Checkbox } from '@/components/design-system/Checkbox';
import { IconButton } from '@/components/design-system/IconButton';
import { useCatalogStore } from '@/store/catalogStore';
import { formatM } from '@/domain/units';
import styles from './RollRow.module.css';

export interface RollRowProps {
  roll: RollType;
}

export function RollRow({ roll }: RollRowProps) {
  const isSelected = useCatalogStore((s) => s.selectedRollIds.has(roll.id));
  const toggleSelected = useCatalogStore((s) => s.toggleSelected);
  const removeRoll = useCatalogStore((s) => s.removeRoll);

  return (
    <div className={styles.row}>
      <Checkbox
        checked={isSelected}
        onChange={() => {
          void toggleSelected(roll.id);
        }}
        aria-label={`Активировать рулон ${formatM(roll.width)} × ${formatM(roll.length)}`}
      />
      <span className={`t-body ${styles.size}`}>
        {formatM(roll.width)} × {formatM(roll.length)}
      </span>
      <IconButton
        size="sm"
        ariaLabel="Удалить рулон"
        onClick={() => {
          void removeRoll(roll.id);
        }}
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
    </div>
  );
}
