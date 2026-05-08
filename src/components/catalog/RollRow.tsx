/**
 * Одна строка каталога рулонов: цветовой swatch (цвет типоразмера на схеме) +
 * чекбокс «активен для расчёта» + размеры + кнопка удаления.
 */

import type { RollType } from '@/domain/types';
import { Checkbox } from '@/components/design-system/Checkbox';
import { IconButton } from '@/components/design-system/IconButton';
import { useCatalogStore } from '@/store/catalogStore';
import { formatMTrim } from '@/domain/units';
import { SCHEME_PALETTE } from '@/components/result/SchemeRenderer';
import styles from './RollRow.module.css';

export interface RollRowProps {
  roll: RollType;
  /** Индекс рулона в полном каталоге — определяет цвет на схеме. */
  catalogIndex: number;
}

export function RollRow({ roll, catalogIndex }: RollRowProps) {
  const isSelected = useCatalogStore((s) => s.selectedRollIds.has(roll.id));
  const toggleSelected = useCatalogStore((s) => s.toggleSelected);
  const removeRoll = useCatalogStore((s) => s.removeRoll);

  const swatchColor =
    SCHEME_PALETTE[catalogIndex % SCHEME_PALETTE.length] ?? SCHEME_PALETTE[0]!;

  return (
    <div className={styles.row}>
      <Checkbox
        checked={isSelected}
        onChange={() => {
          void toggleSelected(roll.id);
        }}
        aria-label={`Активировать рулон ${formatMTrim(roll.width)} × ${formatMTrim(roll.length)}`}
      />
      <span
        className={styles.swatch}
        style={{ background: swatchColor }}
        aria-hidden="true"
      />
      <span className={`t-body ${styles.size}`}>
        {formatMTrim(roll.width)} × {formatMTrim(roll.length)}
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
