/**
 * Typed wrapper над `window.api`.
 *
 * Renderer-only модуль. Препoad-скрипт (electron/preload/index.ts) кладёт
 * объект `FloorCalcAPI` в `window.api` через `contextBridge.exposeInMainWorld`.
 * Если по какой-то причине preload не отработал (dev-misconfig, ошибка в preload),
 * `getApi()` бросит понятную ошибку вместо невнятного `undefined.storage.loadCatalog()`.
 *
 * Использование:
 *   import { api } from '@/ipc/client';
 *   const catalog = await api.storage.loadCatalog();
 */

import type { FloorCalcAPI } from '@shared/ipc-contract';

/**
 * Возвращает `window.api` с runtime-проверкой что preload отработал.
 * Бросает Error в renderer если api недоступен — это невозможно восстановить
 * без перезапуска окна, так что лучше упасть громко.
 */
function getApi(): FloorCalcAPI {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error('window.api is not available — preload script did not load');
  }
  return window.api;
}

/**
 * Прокси-фасад: ленивый доступ к window.api с проверкой на каждый property-read.
 * Это реальный объект, не mock — он каждый раз читает живой `window.api`.
 * Удобно тем, что не падает при `import` модуля до того как preload отработал
 * (импорт делает Vite на старте, а api появляется чуть позже).
 */
export const api = new Proxy({} as FloorCalcAPI, {
  get(_target, prop: string | symbol): FloorCalcAPI[keyof FloorCalcAPI] {
    const realApi = getApi();
    return realApi[prop as keyof FloorCalcAPI];
  }
});
