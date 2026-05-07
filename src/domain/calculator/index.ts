/**
 * Public API доменного calculator-слоя.
 */

import type { CalculationResult, Mode, RollType, Room } from '../types';
import { calculateEconomy } from './economy';
import { calculateOptimal } from './optimal';

export function calculate(room: Room, roll: RollType, mode: Mode): CalculationResult {
  return mode === 'economy' ? calculateEconomy(room, roll) : calculateOptimal(room, roll);
}

export { calculateEconomy } from './economy';
export { calculateOptimal } from './optimal';
export { selectBestRoll } from './selectRoll';
export type { SelectBestRollResult } from './selectRoll';
export { OffcutBank } from './bank';
export { computeSeamLength } from './seams';
export { planStrips } from './strip';
export type { Strip } from './strip';
