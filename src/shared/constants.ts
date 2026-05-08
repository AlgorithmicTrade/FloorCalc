import type { RollType } from '../domain/types';

export const APP_NAME = 'FloorCalc';
export const STORAGE_FILE = 'data.json';
export const STORAGE_SCHEMA_VERSION = 1 as const;
export const UPDATE_CHECK_DELAY_MS = 30_000;

/** Минимально осмысленный размер (рулона/помещения), mm. 0.10 м. */
export const DIMENSION_MIN_MM = 100;
/** Верхняя граница размера (рулона/помещения), mm. 100 м. */
export const DIMENSION_MAX_MM = 100_000;

/**
 * Предустановленные типоразмеры рулонов — загружаются в каталог при первом
 * запуске (когда в localStorage отсутствует ключ `floorcalc:catalog:v1`).
 * id-ы стабильные (`preset-WxL`), чтобы при удалении пользователем рулон
 * не возвращался при перезагрузке.
 */
export const PRESET_ROLLS: readonly RollType[] = [
  { id: 'preset-2x20', width: 2000, length: 20000 },
  { id: 'preset-2x15', width: 2000, length: 15000 },
  { id: 'preset-2x10', width: 2000, length: 10000 },
  { id: 'preset-1_8x15', width: 1800, length: 15000 },
  { id: 'preset-1_5x15', width: 1500, length: 15000 },
];
