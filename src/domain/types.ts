/**
 * Доменные типы FloorCalc.
 *
 * Convention: все геометрические размеры хранятся как **integer mm**
 * (миллиметры, целые), чтобы исключить накопление floating-point ошибок.
 * Преобразование в метры — только на UI-слое (см. units.ts).
 *
 * Convention направления: все полосы укладываются вдоль `room.length`
 * (длина рулона == длина полосы). `room.width` — короткая сторона помещения,
 * поперёк рулона. `roll.width` — ширина рулона (полосы), `roll.length` — длина.
 */

export type RollType = {
  /** Уникальный идентификатор типоразмера рулона. */
  id: string;
  /** Ширина рулона, mm (integer). */
  width: number;
  /** Длина рулона, mm (integer). */
  length: number;
};

export type Room = {
  /** Уникальный идентификатор помещения. */
  id: string;
  /** Имя для UI (например, «Комната 1»). */
  name: string;
  /** Ширина помещения (короткая сторона, поперёк рулона), mm (integer). */
  width: number;
  /** Длина помещения (длинная сторона, вдоль рулона), mm (integer). */
  length: number;
};

export type Mode = 'economy' | 'optimal';

/**
 * Один уложенный кусок покрытия.
 * source*: координаты выреза в исходном рулоне (если бы рулон лежал плашмя).
 * placedAt*: координаты в помещении (0,0 — левый верх).
 */
export type Piece = {
  /** Индекс рулона из числа использованных в этом расчёте (0..rollsUsed-1). */
  rollIndex: number;
  /** Тип рулона, из которого вырезан кусок. */
  rollTypeId: string;
  /** Координата X выреза в исходном рулоне, mm. */
  sourceX: number;
  /** Координата Y выреза в исходном рулоне, mm. */
  sourceY: number;
  /** Ширина куска, mm (поперёк рулона). */
  width: number;
  /** Длина куска, mm (вдоль рулона). */
  length: number;
  /** Координата X в помещении (0..room.width), mm. */
  placedAtX: number;
  /** Координата Y в помещении (0..room.length), mm. */
  placedAtY: number;
};

/**
 * Прямоугольный обрезок в банке. Координаты — внутри исходного рулона.
 */
export type Offcut = {
  /** Индекс исходного рулона. */
  rollIndex: number;
  /** Координата X прямоугольника в рулоне, mm. */
  sourceX: number;
  /** Координата Y прямоугольника в рулоне, mm. */
  sourceY: number;
  /** Ширина обрезка, mm. */
  width: number;
  /** Длина обрезка, mm. */
  length: number;
};

export type CalculationResult = {
  mode: Mode;
  roomId: string;
  rollTypeId: string;
  /** Сколько целых рулонов использовано для покрытия помещения. */
  rollsUsed: number;
  /** Суммарная длина всех швов (продольных + поперечных), mm. */
  totalSeamLengthMm: number;
  /** Все уложенные куски в порядке их размещения. */
  pieces: Piece[];
  /** Площадь обрезков (то, что ушло в waste / банк), mm². */
  wasteAreaMm2: number;
  /** Текстовые предупреждения для пользователя (например, «помещение длиннее рулона»). */
  warnings: string[];
  /** false — расчёт невозможен (помещение не задано / геометрия некорректна). */
  feasible: boolean;
};
