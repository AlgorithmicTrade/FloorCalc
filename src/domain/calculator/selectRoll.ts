/**
 * Выбор лучшего рулона из активных по результату расчёта.
 *
 * Лексикографический порядок (план §3.3):
 *  - economy → (rollsUsed, seamCount, wasteAreaMm2)
 *  - optimal → (seamCount, rollsUsed, wasteAreaMm2)
 *
 * Ориентация укладки фиксированная: рулон всегда укладывается длиной вдоль
 * `room.length` (полосы шириной `roll.width` идут поперёк, по `room.width`).
 */

import type { CalculationResult, Mode, RollType, Room } from '../types';
import { calculateEconomy } from './economy';
import { calculateOptimal } from './optimal';

export type SelectBestRollResult =
  | { roll: RollType; result: CalculationResult }
  | { error: 'no-active-rolls' };

export function selectBestRoll(
  room: Room,
  activeRolls: readonly RollType[],
  mode: Mode
): SelectBestRollResult {
  if (activeRolls.length === 0) {
    return { error: 'no-active-rolls' };
  }

  const calc = mode === 'economy' ? calculateEconomy : calculateOptimal;
  const compareKey = (r: CalculationResult): readonly [number, number, number] =>
    mode === 'economy'
      ? [r.rollsUsed, r.seamCount, r.wasteAreaMm2]
      : [r.seamCount, r.rollsUsed, r.wasteAreaMm2];

  let bestRoll: RollType = activeRolls[0]!;
  let bestResult: CalculationResult = calc(room, bestRoll);
  let bestKey = compareKey(bestResult);

  for (let i = 1; i < activeRolls.length; i++) {
    const roll = activeRolls[i]!;
    const result = calc(room, roll);
    const key = compareKey(result);
    if (lexLess(key, bestKey)) {
      bestRoll = roll;
      bestResult = result;
      bestKey = key;
    }
  }

  return { roll: bestRoll, result: bestResult };
}

function lexLess(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}
