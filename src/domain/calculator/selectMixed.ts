/**
 * selectMixed — обёртка над calculateMixedBestOrientation для UI-совместимости.
 *
 * Возвращает { roll, result } как selectBestRoll, где roll — primary-тип
 * (тот, что занимает наибольшую площадь в pieces), либо первый активный,
 * если pieces пустые.
 *
 * Стратегия перебора кандидатов:
 *  1) Mixed-вариант: все activeRolls вместе — алгоритм сам смешивает типы.
 *  2) Mono-вариант: для каждого типа отдельно (только [single]).
 * Из всех кандидатов выбирается лучший по lex-ключу с tie-break по cuts.
 *
 * Это позволяет, например, для room 3×7.5 м, rolls [2×20, 1.5×15], optimal
 * предпочесть 1.5×15 (меньше резов) перед 2×20, несмотря на одинаковые
 * rollsUsed и pieces.length.
 */

import type { CalculationResult, Mode, Piece, RollType, Room } from '../types';
import { buildShapePolygon, countVisibleSegments } from '../shape';
import {
  calculateMixedBestOrientation,
  calculateWholeStripFirst,
  pickPrimaryRollTypeId
} from './mixed';
import { reorderStripsEdgeFirst } from './reorder';

/** Вершина polygon свободной формы (real-mm координаты). */
type PolygonVertex = { x: number; y: number };

/**
 * Возвращает «физическое» число кусков для сравнения кандидатов.
 *
 * Для прямоугольной комнаты (`polygon === null`) — это просто `pieces.length`.
 * Для свободной формы — это число visible-rectangles после клипа bbox-pieces по
 * polygon (см. `countVisibleSegments`). Один domain-piece, прошитый сквозь
 * вырез П-формы, физически распадается на 2 куска — именно столько и нужно
 * учитывать в lex-key, иначе разные типоразмеры рулонов сравниваются
 * несимметрично (mono 2×15 даёт 6 domain → 8 visible, mono 2×20 даёт 8 domain →
 * 8 visible, и optimal иррационально предпочитает первый).
 */
function visibleOrDomainCount(
  result: CalculationResult,
  polygon: readonly PolygonVertex[] | null,
): number {
  if (polygon === null) return result.pieces.length;
  return countVisibleSegments(result.pieces, polygon);
}

export type SelectMixedResult =
  | { roll: RollType; result: CalculationResult }
  | { error: 'no-active-rolls' };

/**
 * Эвристический подсчёт «резов» для tie-break между вариантами раскладки.
 *
 * Каждый кусок, у которого хоть одна сторона меньше соответствующего размера
 * рулона-источника, добавляет рез. Это эвристика (не точный гильотинный счёт),
 * но достаточна для сравнения кандидатов с одинаковыми rollsUsed/pieces.
 */
export function countCuts(pieces: readonly Piece[], rolls: readonly RollType[]): number {
  const rollById = new Map(rolls.map((r) => [r.id, r]));
  let cuts = 0;
  for (const p of pieces) {
    const roll = rollById.get(p.rollTypeId);
    if (!roll) continue;
    // При rotated=true ориентация куска в рулоне свапнута: ширина куска шла вдоль length рулона.
    const sourceWidth = p.rotated ? roll.length : roll.width;
    const sourceLength = p.rotated ? roll.width : roll.length;
    if (p.width < sourceWidth) cuts++;
    if (p.length < sourceLength) cuts++;
  }
  return cuts;
}

/**
 * Лексикографическое сравнение массивов чисел произвольной длины.
 * Возвращает true если a строго меньше b.
 */
function lexLessN(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return (a[i]!) < (b[i]!);
  }
  return false;
}

/**
 * Lex-ключ кандидата для сравнения раскладок.
 *
 * economy:  (rollsUsed, pieceCount, cuts, wasteAreaMm2)
 * optimal:  (pieceCount, rollsUsed, cuts, wasteAreaMm2)
 *
 * Для свободной формы (`polygon !== null`) `pieceCount` — число visible-кусков
 * после клипа по polygon (физическая реальность). Для прямоугольной комнаты —
 * `pieces.length` (числа равны, поведение не меняется → нет регрессии для rect).
 *
 * В optimal `rollsUsed` поставлен ВЫШЕ `cuts` (поменяли местами): при равном
 * числе видимых кусков предпочитается меньше рулонов, а не меньше «лишних
 * резов». Это соответствует ожиданию пользователя «не открывать лишний рулон,
 * если кол-во кусков одинаково». Cuts остаётся вторичным tie-break: при равных
 * (visible, rolls) предпочитается раскладка с меньшим числом резов.
 */
function keyOf(
  result: CalculationResult,
  mode: Mode,
  rolls: readonly RollType[],
  polygon: readonly PolygonVertex[] | null,
): readonly number[] {
  const cuts = countCuts(result.pieces, rolls);
  const pieceCount = visibleOrDomainCount(result, polygon);
  return mode === 'economy'
    ? [result.rollsUsed, pieceCount, cuts, result.wasteAreaMm2]
    : [pieceCount, result.rollsUsed, cuts, result.wasteAreaMm2];
}

/**
 * Сгенерировать «whole-strip-first» кандидаты для обеих ориентаций комнаты.
 * Pieces из swap-ориентации транспонируются обратно в исходную систему координат
 * (аналогично calculateMixedBestOrientation).
 */
function wholeStripFirstCandidates(
  room: Room,
  rolls: readonly RollType[],
  mode: Mode
): CalculationResult[] {
  const out: CalculationResult[] = [];

  // Исходная ориентация.
  out.push(calculateWholeStripFirst(room, rolls, mode));

  // Свапнутая — только если комната не квадратная.
  if (room.width !== room.length) {
    const swappedRoom: Room = { ...room, width: room.length, length: room.width };
    const raw = calculateWholeStripFirst(swappedRoom, rolls, mode);
    const swappedPieces = raw.pieces.map((p) => ({
      ...p,
      placedAtX: p.placedAtY,
      placedAtY: p.placedAtX,
      width: p.length,
      length: p.width,
      sourceX: p.sourceY,
      sourceY: p.sourceX,
    }));
    out.push({ ...raw, pieces: swappedPieces });
  }

  return out;
}

export function selectMixed(
  room: Room,
  activeRolls: readonly RollType[],
  mode: Mode
): SelectMixedResult {
  if (activeRolls.length === 0) {
    return { error: 'no-active-rolls' };
  }

  // Кандидат 1: mixed-вариант со всеми активными рулонами (greedy).
  const candidates: CalculationResult[] = [
    calculateMixedBestOrientation(room, activeRolls, mode),
  ];

  // Кандидаты 2..N: каждый тип рулона по отдельности (greedy).
  for (const single of activeRolls) {
    candidates.push(calculateMixedBestOrientation(room, [single], mode));
  }

  // Дополнительные кандидаты: «whole-strip-first» стратегия для обеих ориентаций.
  // Снижает фрагментацию pieces в economy, когда комната помещается в целый
  // рулон по длине (пример: 16×16 / 2×20 → 11 кусков вместо 13).
  // Lex-key выбора (economy: rollsUsed → pieces → cuts → waste) сам отбросит
  // её, если она проигрывает по rollsUsed.
  for (const wsfCand of wholeStripFirstCandidates(room, activeRolls, mode)) {
    candidates.push(wsfCand);
  }
  for (const single of activeRolls) {
    for (const wsfCand of wholeStripFirstCandidates(room, [single], mode)) {
      candidates.push(wsfCand);
    }
  }

  // Polygon свободной формы — вычисляем один раз и переиспользуем во всех keyOf().
  // Для rect-комнат (или невалидной shape) → null, тогда keyOf берёт domain
  // pieces.length и сохраняет прежнее поведение для прямоугольных тестов.
  const polygon: readonly PolygonVertex[] | null =
    room.layout === 'free' && room.shape
      ? (buildShapePolygon(room.shape)?.vertices ?? null)
      : null;

  // Применяем reorder edge-first ко ВСЕМ кандидатам ДО lex-сравнения.
  // Reorder перемещает multi-piece полосы (составленные из обрезков) к краю
  // помещения — это меняет placedAtX, что для свободной формы влияет на число
  // visible-сегментов после polygon-clip (полоса в крайней позиции может иначе
  // пересекаться с вырезом формы). Если применять reorder ПОСЛЕ выбора
  // (как раньше), keyOf видит «до-reorder» visible-числа, и WSF-кандидат с
  // меньшими rollsUsed может ошибочно проиграть greedy из-за +1 visible на
  // не-edge-позиции. Применение ДО — даёт честное сравнение по реальной физике.
  // Для rect-режима reorder тоже применяется, но visible == domain не зависит
  // от X — keyOf даёт идентичный результат, нет регрессии.
  const reorderedCandidates = candidates.map((c) => ({
    ...c,
    pieces: reorderStripsEdgeFirst(c.pieces, room.width),
  }));

  // Выбираем лучший по lex-ключу.
  let bestIdx = 0;
  let bestKey = keyOf(reorderedCandidates[0]!, mode, activeRolls, polygon);
  for (let i = 1; i < reorderedCandidates.length; i++) {
    const key = keyOf(reorderedCandidates[i]!, mode, activeRolls, polygon);
    if (lexLessN(key, bestKey)) {
      bestIdx = i;
      bestKey = key;
    }
  }

  const result = reorderedCandidates[bestIdx]!;

  // Определяем roll — primary тип из каталога активных.
  // pickPrimaryRollTypeId не зависит от placedAtX, корректен на reordered pieces.
  const primaryId = pickPrimaryRollTypeId(result.pieces, activeRolls);
  const primaryRoll = activeRolls.find((r) => r.id === primaryId) ?? activeRolls[0]!;

  return { roll: primaryRoll, result };
}
