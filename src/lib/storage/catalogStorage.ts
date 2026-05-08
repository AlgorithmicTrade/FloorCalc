/**
 * Web-реализация persist-слоя каталога рулонов.
 *
 * Источник истины — `localStorage` ключ `floorcalc:catalog:v1`.
 * Сигнатуры load/save идентичны старому IPC-контракту, чтобы переключение
 * `catalogStore` на новый адаптер сводилось к одному импорту.
 */

import { CatalogSchema, type StoredCatalog } from '@shared/catalogSchema';
import { STORAGE_SCHEMA_VERSION } from '@shared/constants';

const STORAGE_KEY = 'floorcalc:catalog:v1';

function defaultCatalog(): StoredCatalog {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    rolls: [],
    selectedRollIds: []
  };
}

export async function loadCatalog(): Promise<StoredCatalog> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return defaultCatalog();

    const parsed: unknown = JSON.parse(raw);
    const result = CatalogSchema.safeParse(parsed);
    if (!result.success) {
      console.error('[storage] schema validation failed:', result.error.message);
      return defaultCatalog();
    }
    return result.data;
  } catch (err) {
    console.error('[storage] load failed:', err);
    return defaultCatalog();
  }
}

export async function saveCatalog(catalog: StoredCatalog): Promise<void> {
  // Не глушим QuotaExceededError — пусть всплывёт в catalogStore, чтобы UX
  // мог в будущем показать предупреждение. Для текущего объёма (≤ десятки KB)
  // лимит 5–10 MB localStorage с огромным запасом.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
}
