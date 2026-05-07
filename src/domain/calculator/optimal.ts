/**
 * Оптимальный режим — каждая полоса начинается с нового свежего рулона.
 *
 * Гарантирует структурный минимум стыков:
 *  - продольных = ceil(room.width / roll.width) - 1
 *  - поперечных = (ceil(room.length / roll.length) - 1) × stripCount
 *
 * Боковые обрезки в этом режиме НЕ переиспользуются (приоритет — швы, не waste).
 * wasteAreaMm2 здесь = суммарная площадь рулонов − площадь помещения.
 */

import type { CalculationResult, Piece, RollType, Room } from '../types';
import { computeSeamCount } from './seams';
import { planStrips } from './strip';

export function calculateOptimal(room: Room, roll: RollType): CalculationResult {
  if (room.width <= 0 || room.length <= 0) {
    return {
      mode: 'optimal',
      roomId: room.id,
      rollTypeId: roll.id,
      rollsUsed: 0,
      seamCount: 0,
      pieces: [],
      wasteAreaMm2: 0,
      warnings: ['Помещение не задано'],
      feasible: false
    };
  }
  if (roll.width <= 0 || roll.length <= 0) {
    throw new Error(`calculateOptimal: invalid roll dimensions ${roll.width}×${roll.length}`);
  }

  const warnings: string[] = [];
  if (room.width > roll.width) {
    warnings.push('Ширина помещения больше ширины рулона — несколько полос');
  }
  if (room.length > roll.length) {
    warnings.push('Помещение длиннее рулона — потребуются поперечные доборы');
  }

  const pieces: Piece[] = [];
  let rollsUsed = 0;

  const strips = planStrips(room.width, room.length, roll.width);

  for (const strip of strips) {
    let placedAtY = 0;
    let needLength = strip.needLength;

    while (needLength > 0) {
      // Каждый кусок — от свежего рулона.
      const rollIndex = rollsUsed;
      rollsUsed++;
      const useLen = Math.min(roll.length, needLength);

      pieces.push({
        rollIndex,
        rollTypeId: roll.id,
        sourceX: 0,
        sourceY: 0,
        width: strip.stripWidth,
        length: useLen,
        placedAtX: strip.cursorX,
        placedAtY
      });

      placedAtY += useLen;
      needLength -= useLen;
    }
  }

  // === Feasibility ===
  let coveredArea = 0;
  for (const p of pieces) coveredArea += p.width * p.length;
  const roomArea = room.width * room.length;
  const feasible = coveredArea === roomArea;

  // === Waste = площадь использованных рулонов − площадь помещения ===
  const totalRollArea = rollsUsed * roll.width * roll.length;
  const wasteAreaMm2 = totalRollArea - coveredArea;

  const seamCount = computeSeamCount(pieces, room);

  return {
    mode: 'optimal',
    roomId: room.id,
    rollTypeId: roll.id,
    rollsUsed,
    seamCount,
    pieces,
    wasteAreaMm2,
    warnings,
    feasible
  };
}
