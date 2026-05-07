/**
 * Корневой компонент. Один раз на mount:
 *   1) `loadCatalog()` — тянем сохранённые рулоны из main-процесса.
 *   2) `initialize()` — подписываемся на события updater'a.
 * Возвращаемая функция — unsubscribe для useEffect cleanup.
 */

import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { RollCatalog } from '@/components/catalog/RollCatalog';
import { RoomTabs } from '@/components/rooms/RoomTabs';
import { RoomResultPanel } from '@/components/rooms/RoomResultPanel';
import { UpdateBanner } from '@/components/update/UpdateBanner';
import { useCatalogStore } from '@/store/catalogStore';
import { useUpdateStore } from '@/store/updateStore';

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
        left={<RollCatalog />}
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
