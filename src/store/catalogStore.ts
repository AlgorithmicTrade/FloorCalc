/**
 * Zustand store каталога рулонов с persist через IPC.
 *
 * Источник истины — `%APPDATA%\FloorCalc\data.json` (см. electron/main/storage.ts).
 * При старте renderer вызывает `load()`, который тянет каталог из main-процесса.
 * Любая мутация (add/remove/toggle) сразу пишет обновлённый каталог обратно
 * через `api.storage.saveCatalog`. Если запись падает — мы логируем ошибку,
 * но in-memory state не откатываем (UX: пользователь видит свой ввод).
 *
 * Канонический тип StoredCatalog лежит в @shared/ipc-contract — намеренно
 * импортируем оттуда, а не из src/domain/validation.ts (там legacy-копия,
 * см. CLAUDE.md / план — Phase 1 создавал свою копию параллельно).
 */

import { create } from 'zustand';
import type { RollType, StoredCatalog } from '@shared/ipc-contract';
import { api } from '@/ipc/client';

interface CatalogState {
  rolls: RollType[];
  /** id рулонов, активных для расчёта. Set для O(1) проверки. */
  selectedRollIds: Set<string>;
  /** false до завершения первого `load()`. UI может показать skeleton. */
  isLoaded: boolean;
  /** Текст ошибки если не удалось прочитать data.json. null = всё ок. */
  error: string | null;

  load: () => Promise<void>;
  addRoll: (widthMm: number, lengthMm: number) => Promise<void>;
  removeRoll: (id: string) => Promise<void>;
  toggleSelected: (id: string) => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  rolls: [],
  selectedRollIds: new Set<string>(),
  isLoaded: false,
  error: null,

  load: async (): Promise<void> => {
    try {
      const catalog = await api.storage.loadCatalog();
      set({
        rolls: catalog.rolls,
        selectedRollIds: new Set(catalog.selectedRollIds),
        isLoaded: true,
        error: null
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Не удалось загрузить каталог',
        isLoaded: true
      });
    }
  },

  addRoll: async (widthMm: number, lengthMm: number): Promise<void> => {
    if (widthMm <= 0 || lengthMm <= 0) return;
    const id = `roll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next: RollType[] = [...get().rolls, { id, width: widthMm, length: lengthMm }];
    const nextSel = new Set(get().selectedRollIds);
    nextSel.add(id); // новый рулон по умолчанию выбран
    set({ rolls: next, selectedRollIds: nextSel });
    await persist(get());
  },

  removeRoll: async (id: string): Promise<void> => {
    const next = get().rolls.filter((r) => r.id !== id);
    const nextSel = new Set(get().selectedRollIds);
    nextSel.delete(id);
    set({ rolls: next, selectedRollIds: nextSel });
    await persist(get());
  },

  toggleSelected: async (id: string): Promise<void> => {
    const nextSel = new Set(get().selectedRollIds);
    if (nextSel.has(id)) nextSel.delete(id);
    else nextSel.add(id);
    set({ selectedRollIds: nextSel });
    await persist(get());
  }
}));

/** Сериализует текущий state в StoredCatalog и пишет его в main через IPC. */
async function persist(state: CatalogState): Promise<void> {
  const catalog: StoredCatalog = {
    schemaVersion: 1,
    rolls: state.rolls,
    selectedRollIds: Array.from(state.selectedRollIds)
  };
  try {
    await api.storage.saveCatalog(catalog);
  } catch (e) {
    // Ошибку не пробрасываем наверх: in-memory state уже обновлён,
    // повторная запись произойдёт при следующей мутации.
    console.error('Не удалось сохранить каталог', e);
  }
}

/** Селектор: список активных рулонов (отфильтрованных по `selectedRollIds`). */
export const selectActiveRolls = (state: CatalogState): RollType[] =>
  state.rolls.filter((r) => state.selectedRollIds.has(r.id));
