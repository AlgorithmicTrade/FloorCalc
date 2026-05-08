/**
 * Корневой компонент. Один раз на mount:
 *   1) `loadCatalog()` — тянем сохранённые рулоны из main-процесса.
 *   2) `initialize()` — подписываемся на события updater'a.
 * Возвращаемая функция — unsubscribe для useEffect cleanup.
 *
 * Layout:
 *   - Левая колонка (380px): RoomEditor (редактор активного помещения) + RollCatalog.
 *   - Правая колонка: RoomTabs (переключение помещений) + RoomResultPanel (результаты).
 *
 * sidebarCollapsed — состояние сворачивания боковой панели.
 *   Сохраняется в localStorage под ключом SIDEBAR_STORAGE_KEY.
 *   Применяется только в двухколоночном режиме (≥768px); на мобильном
 *   portrait кнопка скрыта через CSS и layout фиксирован single-column.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { RollCatalog } from '@/components/catalog/RollCatalog';
import { RoomEditor } from '@/components/rooms/RoomEditor';
import { RoomTabs } from '@/components/rooms/RoomTabs';
import { RoomResultPanel } from '@/components/rooms/RoomResultPanel';
import { UpdateBanner } from '@/components/update/UpdateBanner';
import { useCatalogStore } from '@/store/catalogStore';
import { useUpdateStore } from '@/store/updateStore';
import styles from '@/components/layout/AppShell.module.css';

const SIDEBAR_STORAGE_KEY = 'floorcalc:sidebar:collapsed:v1';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function App() {
  const loadCatalog = useCatalogStore((s) => s.load);
  const initUpdater = useUpdateStore((s) => s.initialize);

  /* Lazy-initializer — читаем localStorage до первого рендера,
     чтобы не «мигать» состоянием после mount. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebarCollapsed);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        /* localStorage может быть недоступен (private-режим, iframe) — молча игнорируем. */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const unsubscribe = initUpdater();
    return unsubscribe;
  }, [initUpdater]);

  return (
    <>
      <span className={styles.versionBadge} aria-label="Версия приложения">
        v{__APP_VERSION__}
      </span>
      {/* Кнопка видна только при ≥768px (CSS: display:none на мобильном portrait). */}
      <button
        type="button"
        className={`${styles.sidebarToggle}${sidebarCollapsed ? ` ${styles.sidebarToggleCollapsed}` : ''}`}
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
        aria-expanded={!sidebarCollapsed}
        aria-controls="sidebar-aside"
      >
        {/* Inline-SVG chevron: › при collapsed, ‹ при expanded. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          {sidebarCollapsed ? (
            /* Шеврон вправо — развернуть */
            <polyline
              points="5,3 11,8 5,13"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            /* Шеврон влево — свернуть */
            <polyline
              points="11,3 5,8 11,13"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </button>
      <AppShell
        sidebarCollapsed={sidebarCollapsed}
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
