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
import { calculateMixedBestOrientation, pickPrimaryRollTypeId } from './mixed';

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
 * economy:  (rollsUsed, pieces.length, cuts, wasteAreaMm2)
 * optimal:  (pieces.length, cuts, rollsUsed, wasteAreaMm2)
 */
function keyOf(result: CalculationResult, mode: Mode, rolls: readonly RollType[]): readonly number[] {
  const cuts = countCuts(result.pieces, rolls);
  return mode === 'economy'
    ? [result.rollsUsed, result.pieces.length, cuts, result.wasteAreaMm2]
    : [result.pieces.length, cuts, result.rollsUsed, result.wasteAreaMm2];
}

export function selectMixed(
  room: Room,
  activeRolls: readonly RollType[],
  mode: Mode
): SelectMixedResult {
  if (activeRolls.length === 0) {
    return { error: 'no-active-rolls' };
  }

  // Кандидат 1: mixed-вариант со всеми активными рулонами.
  const candidates: CalculationResult[] = [
    calculateMixedBestOrientation(room, activeRolls, mode),
  ];

  // Кандидаты 2..N: каждый тип рулона по отдельности.
  for (const single of activeRolls) {
    candidates.push(calculateMixedBestOrientation(room, [single], mode));
  }

  // Выбираем лучший по lex-ключу.
  let bestIdx = 0;
  let bestKey = keyOf(candidates[0]!, mode, activeRolls);
  for (let i = 1; i < candidates.length; i++) {
    const key = keyOf(candidates[i]!, mode, activeRolls);
    if (lexLessN(key, bestKey)) {
      bestIdx = i;
      bestKey = key;
    }
  }

  const result = candidates[bestIdx]!;

  // Определяем roll — primary тип из каталога активных.
  const primaryId = pickPrimaryRollTypeId(result.pieces, activeRolls);
  const primaryRoll = activeRolls.find((r) => r.id === primaryId) ?? activeRolls[0]!;

  return { roll: primaryRoll, result };
}
