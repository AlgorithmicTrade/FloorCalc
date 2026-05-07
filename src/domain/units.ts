/**
 * Преобразование единиц измерения. Канонический формат — mm (integer).
 * UI-слой принимает / отображает метры с точностью 0.01 м (1 см).
 */

/** Метры → mm с округлением до 1 mm. */
export const mToMm = (m: number): number => Math.round(m * 1000);

/** mm → метры (точное деление, может быть дробным). */
export const mmToM = (mm: number): number => mm / 1000;

/**
 * Форматирование длины в метрах для UI: «5.00 м».
 * @param mm миллиметры (integer).
 * @param fractionDigits знаков после запятой (default 2 — точность ввода).
 */
export const formatM = (mm: number, fractionDigits = 2): string =>
  `${(mm / 1000).toFixed(fractionDigits)} м`;

/**
 * Форматирование площади в м² для UI: «12.50 м²».
 * @param mm2 квадратные миллиметры.
 * @param fractionDigits знаков после запятой (default 2).
 */
export const formatArea = (mm2: number, fractionDigits = 2): string =>
  `${(mm2 / 1_000_000).toFixed(fractionDigits)} м²`;
