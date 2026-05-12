/**
 * Экономный режим — greedy с банком обрезков.
 *
 * Алгоритм (план §3.4):
 * 1. Делим помещение на вертикальные полосы шириной ≤ roll.width.
 * 2. Для каждой полосы накапливаем её длину частями. Перед открытием нового
 *    рулона — пробуем найти подходящий обрезок в банке (`findBestFor`).
 * 3. После реза остатки (продольный хвост рулона + боковой обрезок)
 *    кладутся в банк через `consume()`.
 *
 * Не оптимизирует порядок укладки полос (нет глобального ILP). Это упрощённый
 * MVP: «лучший подходящий обрезок по площади + новый рулон если ничего нет».
 */

import type { CalculationResult, Piece, RollType, Room } from '../types';
import { OffcutBank } from './bank';
import { groupPiecesByLengthDescendingPerColumn } from './postProcess';
import { computeSeamCount } from './seams';
import { planStrips } from './strip';

export function calculateEconomy(room: Room, roll: RollType): CalculationResult {
  // === Граничные случаи ===
  if (room.width <= 0 || room.length <= 0) {
    return {
      mode: 'economy',
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
    throw new Error(`calculateEconomy: invalid roll dimensions ${roll.width}×${roll.length}`);
  }

  const warnings: string[] = [];
  if (room.width > roll.width) {
    warnings.push('Ширина помещения больше ширины рулона — несколько полос');
  }
  if (room.length > roll.length) {
    warnings.push('Помещение длиннее рулона — потребуются поперечные доборы');
  }

  const bank = new OffcutBank();
  const pieces: Piece[] = [];
  let rollsUsed = 0;

  const strips = planStrips(room.width, room.length, roll.width);

  for (const strip of strips) {
    let placedAtY = 0;
    let needLength = strip.needLength;

    while (needLength > 0) {
      // 1. Пробуем найти обрезок в банке.
      const offcut = bank.findBestFor(strip.stripWidth, 1);
      // Берём любую длину >= 1; ниже подгоним по min(offcut.length, needLength).

      if (offcut !== null) {
        const useLen = Math.min(offcut.length, needLength);
        pieces.push({
          rollIndex: offcut.rollIndex,
          rollTypeId: roll.id,
          sourceX: offcut.sourceX,
          sourceY: offcut.sourceY,
          width: strip.stripWidth,
          length: useLen,
          placedAtX: strip.cursorX,
          placedAtY
        });
        bank.consume(offcut, strip.stripWidth, useLen);
        placedAtY += useLen;
        needLength -= useLen;
      } else {
        // 2. Открываем новый рулон.
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

        // Боковой обрезок (если рулон шире полосы): (stripWidth, 0, roll.width-stripWidth, useLen)
        if (strip.stripWidth < roll.width) {
          bank.add({
            rollIndex,
            sourceX: strip.stripWidth,
            sourceY: 0,
            width: roll.width - strip.stripWidth,
            length: useLen
          });
        }
        // Продольный хвост рулона (если рулон длиннее used): (0, useLen, roll.width, roll.length-useLen)
        if (useLen < roll.length) {
          bank.add({
            rollIndex,
            sourceX: 0,
            sourceY: useLen,
            width: roll.width,
            length: roll.length - useLen
          });
        }

        placedAtY += useLen;
        needLength -= useLen;
      }
    }
  }

  // === Post-pass: перекомпоновка кусков внутри каждой полосы ===
  // Greedy-алгоритм укладывает offcut'ы первыми (placedAtY=0), новые рулоны —
  // позже (placedAtY>0), что даёт визуально «хаотичную» картинку. Сортируем
  // куски в каждой полосе по убыванию длины (длинные сверху, доборы снизу) —
  // только геометрия `placedAtY`, идентичность кусков не меняется → инварианты
  // `rollsUsed`/`pieceCount`/`feasible` сохранены by construction.
  const reorderedPieces = groupPiecesByLengthDescendingPerColumn(pieces);

  // === Feasibility check ===
  let coveredArea = 0;
  for (const p of reorderedPieces) coveredArea += p.width * p.length;
  const roomArea = room.width * room.length;
  const feasible = coveredArea === roomArea;

  const seamCount = computeSeamCount(reorderedPieces, room);
  const wasteAreaMm2 = bank.totalArea();

  return {
    mode: 'economy',
    roomId: room.id,
    rollTypeId: roll.id,
    rollsUsed,
    seamCount,
    pieces: reorderedPieces,
    wasteAreaMm2,
    warnings,
    feasible
  };
}
