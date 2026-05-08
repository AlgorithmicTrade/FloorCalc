/**
 * Zustand store индикатора версии приложения.
 *
 * Web-реализация (без electron-updater): раз в 10 минут пуллим
 * `${BASE_URL}version.json` (генерируется CI на каждый деплой). Если на
 * сервере другая строка — показываем banner «обновите страницу». Сравнение
 * строкой намеренно: семантика «отличается от текущей сборки» точнее,
 * чем semver-сравнение, и не требует парсера.
 *
 * Дополнительно к 10-минутному `setInterval` версия проверяется
 * опортунистически по событиям `focus`, `visibilitychange` (при возврате
 * вкладки в `visible`) и `online` — это ускоряет детект новой версии,
 * когда вкладка долго была свёрнута или соединение временно пропадало.
 * Чтобы при быстрых focus/blur и переключении вкладок не было спама,
 * опортунистические запуски ограничены throttle-окном 30 секунд.
 *
 * `__APP_VERSION__` — vite-define из `package.json:version`, заменяется
 * на литерал в build-time.
 */

import { create } from 'zustand';

const POLL_MS = 10 * 60 * 1000;
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

interface VersionPayload {
  version?: unknown;
}

interface UpdateState {
  current: string;
  next: string | null;
  isDismissed: boolean;

  /** Подписка на polling. Возвращает unsubscribe для useEffect cleanup. */
  initialize: () => () => void;
  dismiss: () => void;
}

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as VersionPayload;
    return typeof j.version === 'string' ? j.version : null;
  } catch {
    return null;
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  current: __APP_VERSION__,
  next: null,
  isDismissed: false,

  initialize: (): (() => void) => {
    let lastTickAt = 0;
    const THROTTLE_MS = 30_000;

    const tick = async (): Promise<void> => {
      lastTickAt = Date.now();
      const remote = await fetchRemoteVersion();
      if (!remote) return;
      const state = get();
      if (remote !== state.current && remote !== state.next) {
        set({ next: remote, isDismissed: false });
      }
    };

    // Опортунистический tick по событиям, с throttle 30с.
    const opportunisticTick = (): void => {
      if (Date.now() - lastTickAt < THROTTLE_MS) return;
      void tick();
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') opportunisticTick();
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    window.addEventListener('focus', opportunisticTick);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', opportunisticTick);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', opportunisticTick);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', opportunisticTick);
    };
  },

  dismiss: (): void => set({ isDismissed: true })
}));
