/**
 * Левая панель приложения: заголовок «КАТАЛОГ РУЛОНОВ», список RollRow,
 * форма добавления. Загрузка каталога — в App.tsx (вызывается один раз
 * при mount всего приложения).
 */

import { Card } from '@/components/design-system/Card';
import { Eyebrow } from '@/components/design-system/Eyebrow';
import { useCatalogStore } from '@/store/catalogStore';
import { RollRow } from './RollRow';
import { AddRollForm } from './AddRollForm';
import styles from './RollCatalog.module.css';

export function RollCatalog() {
  const rolls = useCatalogStore((s) => s.rolls);
  const error = useCatalogStore((s) => s.error);

  return (
    <Card surface="surface-1" padding="md">
      <Eyebrow>Каталог рулонов</Eyebrow>
      {rolls.length === 0 ? (
        <div className={`t-body-sm ${styles.hint}`}>
          Добавьте первый типоразмер ниже.
        </div>
      ) : (
        <div className={styles.list}>
          {rolls.map((roll, index) => (
            <RollRow key={roll.id} roll={roll} catalogIndex={index} />
          ))}
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <AddRollForm />
    </Card>
  );
}
