/**
 * Zustand store статуса auto-updater'a.
 *
 * Источник событий — main-процесс через `api.updater.onStatus(cb)`.
 * Один раз на старте renderer (App.tsx) вызывает `initialize()`, который
 * подписывается на события и возвращает unsubscribe для cleanup.
 *
 * `isDismissed` — UI-состояние «пользователь скрыл баннер». Сбрасывается,
 * когда пришёл новый `available`-статус (новая версия — снова показываем).
 */

import { create } from 'zustand';
import type { UpdateStatus } from '@shared/ipc-contract';
import { api } from '@/ipc/client';

interface UpdateState {
  status: UpdateStatus;
  isDismissed: boolean;

  /** Подписка на события main-процесса. Возвращает unsubscribe для useEffect cleanup. */
  initialize: () => () => void;
  triggerCheck: () => Promise<void>;
  triggerDownload: () => Promise<void>;
  triggerInstall: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: { kind: 'idle' },
  isDismissed: false,

  initialize: (): (() => void) => {
    const unsubscribe = api.updater.onStatus((status: UpdateStatus): void => {
      // Каждый раз когда приходит новая 'available' — это новая версия,
      // имеет смысл показать баннер заново даже если пользователь его скрывал.
      if (status.kind === 'available') {
        set({ status, isDismissed: false });
      } else {
        set({ status });
      }
    });
    return unsubscribe;
  },

  triggerCheck: async (): Promise<void> => {
    try {
      await api.updater.checkForUpdates();
    } catch (e) {
      set({
        status: { kind: 'error', message: e instanceof Error ? e.message : String(e) }
      });
    }
  },

  triggerDownload: async (): Promise<void> => {
    try {
      await api.updater.downloadUpdate();
    } catch (e) {
      set({
        status: { kind: 'error', message: e instanceof Error ? e.message : String(e) }
      });
    }
  },

  triggerInstall: async (): Promise<void> => {
    try {
      await api.updater.installAndRestart();
    } catch (e) {
      set({
        status: { kind: 'error', message: e instanceof Error ? e.message : String(e) }
      });
    }
  },

  dismiss: (): void => set({ isDismissed: true })
}));
