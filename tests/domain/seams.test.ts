/**
 * Тесты подсчёта длины швов.
 */

import { describe, expect, it } from 'vitest';
import { computeSeamLength } from '../../src/domain/calculator/seams';
import type { Piece, Room } from '../../src/domain/types';
import { createRoom } from './fixtures';

const piece = (
  rollIndex: number,
  placedAtX: number,
  placedAtY: number,
  width: number,
  length: number
): Piece => ({
  rollIndex,
  rollTypeId: 'roll-test',
  sourceX: 0,
  sourceY: 0,
  width,
  length,
  placedAtX,
  placedAtY
});

describe('computeSeamLength', () => {
  it('returns 0 for empty pieces', () => {
    const room: Room = createRoom('r', 5, 3);
    expect(computeSeamLength([], room)).toBe(0);
  });

  it('returns 0 for single piece (no neighbours, no shared border)', () => {
    const room: Room = createRoom('r', 5, 3);
    const pieces = [piece(0, 0, 0, 5000, 3000)];
    expect(computeSeamLength(pieces, room)).toBe(0);
  });

  it('counts longitudinal seams: 3 strips 4/4/2 m × 5 m → 2 seams × 5000 mm = 10000', () => {
    // Помещение 10×5 м (width=10, length=5), 3 параллельных полосы:
    //   x=0    width=4
    //   x=4000 width=4
    //   x=8000 width=2
    // Границы placedAtX > 0 → {4000, 8000} → 2 продольных шва длиной room.length=5000.
    const room: Room = createRoom('big', 10, 5);
    const pieces = [
      piece(0, 0, 0, 4000, 5000),
      piece(1, 4000, 0, 4000, 5000),
      piece(2, 8000, 0, 2000, 5000)
    ];
    expect(computeSeamLength(pieces, room)).toBe(10_000);
  });

  it('counts transverse seam: one strip 4 m of two pieces 4×3 + 4×2 → 1 seam = 4000 mm', () => {
    // Помещение 4×5 м, рулон 4×3 → одна полоса x=0 width=4 длины 5,
    // составленная из двух кусков (4×3) + (4×2).
    const room: Room = createRoom('long', 4, 5);
    const pieces = [
      piece(0, 0, 0, 4000, 3000), // верх 4×3
      piece(0, 0, 3000, 4000, 2000) // добор 4×2 ниже
    ];
    // placedAtX > 0 → нет (всё в одной колонке) → 0 продольных.
    // Соседние pieces в колонке x=0: placedAtY=0 length=3000 + placedAtY=3000 length=2000.
    // 0 + 3000 == 3000 → шов длиной width=4000.
    expect(computeSeamLength(pieces, room)).toBe(4000);
  });

  it('combines longitudinal and transverse seams correctly', () => {
    // Помещение 8×5, две полосы по 4 м, в каждой — добор по длине 3+2.
    const room: Room = createRoom('combo', 8, 5);
    const pieces = [
      // первая полоса x=0
      piece(0, 0, 0, 4000, 3000),
      piece(0, 0, 3000, 4000, 2000),
      // вторая полоса x=4000
      piece(1, 4000, 0, 4000, 3000),
      piece(1, 4000, 3000, 4000, 2000)
    ];
    // Продольный: 1 граница (x=4000) × room.length 5000 = 5000.
    // Поперечные: 2 шва × ширина 4000 = 8000.
    expect(computeSeamLength(pieces, room)).toBe(5000 + 8000);
  });
});
