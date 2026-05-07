/**
 * Inline-форма добавления нового типоразмера рулона: ширина / длина + «+».
 *
 * Локальный state хранится в mm (integer), чтобы не было mismatch с NumberField.
 * Submit (Enter в любом из полей или клик «+») валидирует оба значения > 0;
 * пустой submit просто игнорируется без UX-шума.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { NumberField } from '@/components/design-system/NumberField';
import { IconButton } from '@/components/design-system/IconButton';
import { useCatalogStore } from '@/store/catalogStore';
import styles from './AddRollForm.module.css';

const MIN_MM = 100;       // 0.10 м — минимально осмысленный размер
const MAX_MM = 100_000;   // 100 м — верхняя граница, аналогичная ROOM_MAX_MM

export function AddRollForm() {
  const addRoll = useCatalogStore((s) => s.addRoll);
  const [widthMm, setWidthMm] = useState(0);
  const [lengthMm, setLengthMm] = useState(0);

  const submit = useCallback(
    (e?: FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (widthMm <= 0 || lengthMm <= 0) return;
      void addRoll(widthMm, lengthMm).then(() => {
        setWidthMm(0);
        setLengthMm(0);
      });
    },
    [widthMm, lengthMm, addRoll],
  );

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <NumberField
          aria-label="Ширина нового рулона, м"
          valueMm={widthMm}
          onChangeMm={setWidthMm}
          minMm={0}
          maxMm={MAX_MM}
          suffix="м"
          placeholder="ширина"
        />
      </div>
      <div className={styles.field}>
        <NumberField
          aria-label="Длина нового рулона, м"
          valueMm={lengthMm}
          onChangeMm={setLengthMm}
          minMm={0}
          maxMm={MAX_MM}
          suffix="м"
          placeholder="длина"
        />
      </div>
      <IconButton
        type="submit"
        ariaLabel="Добавить рулон"
        size="md"
        disabled={widthMm < MIN_MM || lengthMm < MIN_MM}
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-inverse-ink)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 3v10M3 8h10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
    </form>
  );
}
