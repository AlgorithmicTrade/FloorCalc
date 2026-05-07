/**
 * Корневой компонент. Один раз на mount:
 *   1) `loadCatalog()` — тянем сохранённые рулоны из main-процесса.
 *   2) `initialize()` — подписываемся на события updater'a.
 * Возвращаемая функция — unsubscribe для useEffect cleanup.
 *
 * Layout:
 *   - Левая колонка (380px): RoomEditor (редактор активного помещения) + RollCatalog.
 *   - Правая колонка: RoomTabs (переключение помещений) + RoomResultPanel (результаты).
 */

import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { RollCatalog } from '@/components/catalog/RollCatalog';
import { RoomEditor } from '@/components/rooms/RoomEditor';
import { RoomTabs } from '@/components/rooms/RoomTabs';
import { RoomResultPanel } from '@/components/rooms/RoomResultPanel';
import { UpdateBanner } from '@/components/update/UpdateBanner';
import { useCatalogStore } from '@/store/catalogStore';
import { useUpdateStore } from '@/store/updateStore';
import styles from '@/components/layout/AppShell.module.css';

export function App() {
  const loadCatalog = useCatalogStore((s) => s.load);
  const initUpdater = useUpdateStore((s) => s.initialize);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const unsubscribe = initUpdater();
    return unsubscribe;
  }, [initUpdater]);

  return (
    <>
      <AppShell
        left={
          <div className={styles.leftColumn}>
            <RoomEditor />
            <RollCatalog />
          </div>
        }
        right={
          <>
            <RoomTabs />
            <RoomResultPanel />
          </>
        }
      />
      <UpdateBanner />
    </>
  );
}
