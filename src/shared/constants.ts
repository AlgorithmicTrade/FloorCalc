export const APP_NAME = 'FloorCalc';
export const STORAGE_FILE = 'data.json';
export const STORAGE_SCHEMA_VERSION = 1 as const;
export const UPDATE_CHECK_DELAY_MS = 30_000;

/** Минимально осмысленный размер (рулона/помещения), mm. 0.10 м. */
export const DIMENSION_MIN_MM = 100;
/** Верхняя граница размера (рулона/помещения), mm. 100 м. */
export const DIMENSION_MAX_MM = 100_000;
