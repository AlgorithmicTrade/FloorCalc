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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { RollCatalog } from '@/components/catalog/RollCatalog';
import { RoomEditor } from '@/components/rooms/RoomEditor';
import { RoomTabs } from '@/components/rooms/RoomTabs';
import { RoomResultPanel } from '@/components/rooms/RoomResultPanel';
import { UpdateBanner } from '@/components/update/UpdateBanner';
import { ReleaseNotesModal } from '@/components/update/ReleaseNotesModal';
import { useCatalogStore } from '@/store/catalogStore';
import { useUpdateStore } from '@/store/updateStore';
import { parseReleaseNotes, findReleaseNotesByVersion } from '@/lib/releaseNotes';
import releaseNotesRaw from '../RELEASE_NOTES.md?raw';
import styles from '@/components/layout/AppShell.module.css';

const SIDEBAR_STORAGE_KEY = 'floorcalc:sidebar:collapsed:v1';
const RELEASE_NOTES_KEY_PREFIX = 'floorcalc:releaseNotesShown:v';
const RELEASE_NOTES_KEY_FOR = (version: string): string =>
  `${RELEASE_NOTES_KEY_PREFIX}${version}`;

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Префикс для всех floorcalc-ключей — используется для детекции
 * «первый запуск ever» (нет ни одного ключа приложения в localStorage).
 *
 * РАНЬШЕ детекция считала по ключам `releaseNotesShown:*`, но это was a bug:
 * v1.1.6 — первая версия с этой фичей, значит у всех существующих пользователей
 * таких ключей не было, и они получили `releaseNotesShown:v1.1.6 = true`
 * без показа модала. Теперь маркером «old user» служит наличие ЛЮБОГО
 * floorcalc-ключа (минимум — `floorcalc:catalog:v1`, который создаётся при
 * первой загрузке каталога).
 */
const FLOORCALC_KEY_PREFIX = 'floorcalc:';

/**
 * Решение, показывать ли release-notes-модал для текущей сборки.
 *
 * Правила:
 *   - Если пользователь уже видел notes для этой версии (есть ключ
 *     `floorcalc:releaseNotesShown:v<X.Y.Z>` со значением 'true') —
 *     не показывать.
 *   - Если в localStorage НЕТ НИ ОДНОГО ключа `floorcalc:*` (catalog, sidebar,
 *     releaseNotesShown и т.д.) — это первый запуск приложения вообще.
 *     Маркируем текущую версию и не открываем модал, чтобы новый пользователь
 *     не получил спам сразу при заходе.
 *   - В остальных случаях — показать.
 *
 * Возвращает `false`, если localStorage недоступен (private-режим и т.п.).
 */
function shouldShowReleaseNotes(currentVersion: string): boolean {
  try {
    const ownKey = RELEASE_NOTES_KEY_FOR(currentVersion);
    if (localStorage.getItem(ownKey) === 'true') return false;

    // First-ever launch detection: проверяем наличие ЛЮБЫХ floorcalc-ключей
    // (catalog, sidebar и т.д.). Существующий пользователь имеет хотя бы
    // `floorcalc:catalog:v1` — значит для него v1.1.x — апдейт, нужно показать
    // notes.
    let hasAnyFloorCalcKey = false;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(FLOORCALC_KEY_PREFIX)) {
        hasAnyFloorCalcKey = true;
        break;
      }
    }

    if (!hasAnyFloorCalcKey) {
      // Первый запуск: маркируем текущую версию и пропускаем модал.
      localStorage.setItem(ownKey, 'true');
      return false;
    }
    return true;
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

  /* Парсим RELEASE_NOTES.md один раз — bundle-static, без I/O. */
  const releaseEntries = useMemo(() => parseReleaseNotes(releaseNotesRaw), []);
  const currentEntry = useMemo(
    () => findReleaseNotesByVersion(releaseEntries, __APP_VERSION__),
    [releaseEntries],
  );

  /* Lazy-init: решаем при первом рендере, нужно ли показывать модал.
     Если notes для текущей версии не найдены — модал не показывается. */
  const [showReleaseNotes, setShowReleaseNotes] = useState<boolean>(() => {
    if (!currentEntry) return false;
    return shouldShowReleaseNotes(__APP_VERSION__);
  });

  const closeReleaseNotes = useCallback(() => {
    try {
      localStorage.setItem(RELEASE_NOTES_KEY_FOR(__APP_VERSION__), 'true');
    } catch {
      /* localStorage может быть недоступен — модал просто закроется,
         в следующий раз покажется снова (приемлемая degradation). */
    }
    setShowReleaseNotes(false);
  }, []);

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
    <ErrorBoundary>
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
      {showReleaseNotes && currentEntry ? (
        <ReleaseNotesModal
          version={`v${currentEntry.version}`}
          releasedOn={currentEntry.releasedOn}
          contentMd={currentEntry.contentMd}
          onClose={closeReleaseNotes}
        />
      ) : null}
    </ErrorBoundary>
  );
}
