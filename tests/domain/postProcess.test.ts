/**
 * Тесты post-process утилит, перекомпонующих pieces.
 *
 * Проверяемые инварианты `groupPiecesByLengthDescendingPerColumn`:
 *   - pieceCount не меняется;
 *   - идентичность куска (rollIndex, sourceX/Y, width, length, rollTypeId, rotated)
 *     сохраняется;
 *   - placedAtX не меняется, placedAtY переписывается монотонно возрастающе;
 *   - внутри каждой полосы длина куска убывает от верха к низу;
 *   - rotated-куски пропускаются и оставляются как есть.
 */

import { describe, expect, it } from 'vitest';
import { groupPiecesByLengthDescendingPerColumn } from '../../src/domain/calculator/postProcess';
import type { Piece } from '../../src/domain/types';

const p = (
  rollIndex: number,
  placedAtX: number,
  placedAtY: number,
  width: number,
  length: number,
  rotated?: true
): Piece => {
  const base: Piece = {
    rollIndex,
    rollTypeId: `roll-${rollIndex}`,
    sourceX: 0,
    sourceY: 0,
    width,
    length,
    placedAtX,
    placedAtY,
  };
  return rotated ? { ...base, rotated: true } : base;
};

describe('groupPiecesByLengthDescendingPerColumn', () => {
  it('пустой массив → пустой результат', () => {
    expect(groupPiecesByLengthDescendingPerColumn([])).toEqual([]);
  });

  it('одиночный кусок остаётся в той же позиции', () => {
    const piece = p(0, 1500, 0, 1500, 13000);
    const out = groupPiecesByLengthDescendingPerColumn([piece]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(piece);
  });

  it('в полосе с 2 кусками длинный кладётся сверху, короткий — снизу', () => {
    // Хаотичный «как-в-economy» вход: короткий offcut на y=0, длинный main снизу.
    const offcutTop = p(0, 1500, 0, 1500, 2000);
    const mainBottom = p(1, 1500, 2000, 1500, 11000);
    const out = groupPiecesByLengthDescendingPerColumn([offcutTop, mainBottom]);
    expect(out).toHaveLength(2);
    // [0] — длинный сверху (rollIndex=1, length=11000), placedAtY=0
    expect(out[0]?.rollIndex).toBe(1);
    expect(out[0]?.length).toBe(11000);
    expect(out[0]?.placedAtY).toBe(0);
    // [1] — короткий снизу (rollIndex=0, length=2000), placedAtY=11000
    expect(out[1]?.rollIndex).toBe(0);
    expect(out[1]?.length).toBe(2000);
    expect(out[1]?.placedAtY).toBe(11000);
  });

  it('сохраняет sourceX/sourceY/rollTypeId/width/rotated при перестановке', () => {
    const original: Piece = {
      rollIndex: 7,
      rollTypeId: 'roll-7',
      sourceX: 1500,
      sourceY: 4000,
      width: 1500,
      length: 4000,
      placedAtX: 3000,
      placedAtY: 0,
    };
    const longer: Piece = {
      rollIndex: 8,
      rollTypeId: 'roll-8',
      sourceX: 0,
      sourceY: 0,
      width: 1500,
      length: 9000,
      placedAtX: 3000,
      placedAtY: 4000,
    };
    const out = groupPiecesByLengthDescendingPerColumn([original, longer]);
    // длинный (9000) сверху
    expect(out[0]?.sourceX).toBe(0);
    expect(out[0]?.sourceY).toBe(0);
    expect(out[0]?.rollTypeId).toBe('roll-8');
    expect(out[0]?.placedAtY).toBe(0);
    // короткий (4000) снизу — sourceX/Y/rollTypeId оригинала сохранены
    expect(out[1]?.sourceX).toBe(1500);
    expect(out[1]?.sourceY).toBe(4000);
    expect(out[1]?.rollTypeId).toBe('roll-7');
    expect(out[1]?.placedAtY).toBe(9000);
  });

  it('rotated-кусок пропускается (не сортируется внутри полосы)', () => {
    const rotated: Piece = { ...p(0, 0, 5000, 6000, 8000), rotated: true };
    const verticalShort = p(1, 0, 0, 1500, 3000);
    const verticalLong = p(2, 0, 3000, 1500, 2000);
    const out = groupPiecesByLengthDescendingPerColumn([rotated, verticalShort, verticalLong]);
    expect(out).toHaveLength(3);
    // Вертикальные куски в полосе x=0 переупорядочены: длинный (3000) сверху,
    // короткий (2000) снизу.
    expect(out[0]?.length).toBe(3000);
    expect(out[0]?.placedAtY).toBe(0);
    expect(out[1]?.length).toBe(2000);
    expect(out[1]?.placedAtY).toBe(3000);
    // Rotated сохранён без изменений в конце массива.
    const rotatedOut = out[2]!;
    expect(rotatedOut.rotated).toBe(true);
    expect(rotatedOut.placedAtY).toBe(5000);
  });

  it('многополосный кейс: каждая полоса сортируется независимо', () => {
    // Полоса A (x=0): один main 1500×13000.
    // Полоса B (x=1500): offcut 1500×2000 + main 1500×11000.
    // Полоса C (x=3000): offcut 1500×4000 + main 1500×9000.
    const a = p(0, 0, 0, 1500, 13000);
    const bOffcut = p(0, 1500, 0, 1500, 2000);
    const bMain = p(1, 1500, 2000, 1500, 11000);
    const cOffcut = p(1, 3000, 0, 1500, 4000);
    const cMain = p(2, 3000, 4000, 1500, 9000);

    const out = groupPiecesByLengthDescendingPerColumn([a, bOffcut, bMain, cOffcut, cMain]);
    expect(out).toHaveLength(5);

    // Полоса A — без изменений.
    expect(out[0]).toMatchObject({ placedAtX: 0, placedAtY: 0, length: 13000 });

    // Полоса B — длинный сверху.
    expect(out[1]).toMatchObject({ placedAtX: 1500, placedAtY: 0, length: 11000 });
    expect(out[2]).toMatchObject({ placedAtX: 1500, placedAtY: 11000, length: 2000 });

    // Полоса C — длинный сверху.
    expect(out[3]).toMatchObject({ placedAtX: 3000, placedAtY: 0, length: 9000 });
    expect(out[4]).toMatchObject({ placedAtX: 3000, placedAtY: 9000, length: 4000 });
  });

  it('инвариант: суммарная площадь не меняется', () => {
    const input: Piece[] = [
      p(0, 0, 0, 1500, 13000),
      p(0, 1500, 0, 1500, 2000),
      p(1, 1500, 2000, 1500, 11000),
      p(1, 3000, 0, 1500, 4000),
      p(2, 3000, 4000, 1500, 9000),
    ];
    const inArea = input.reduce((s, x) => s + x.width * x.length, 0);
    const out = groupPiecesByLengthDescendingPerColumn(input);
    const outArea = out.reduce((s, x) => s + x.width * x.length, 0);
    expect(outArea).toBe(inArea);
  });

  it('инвариант: pieceCount по rollIndex сохраняется', () => {
    const input: Piece[] = [
      p(0, 0, 0, 1500, 13000),
      p(0, 1500, 0, 1500, 2000),
      p(1, 1500, 2000, 1500, 11000),
      p(1, 3000, 0, 1500, 4000),
      p(2, 3000, 4000, 1500, 9000),
    ];
    const out = groupPiecesByLengthDescendingPerColumn(input);
    const inByRoll = new Map<number, number>();
    for (const x of input) inByRoll.set(x.rollIndex, (inByRoll.get(x.rollIndex) ?? 0) + 1);
    const outByRoll = new Map<number, number>();
    for (const x of out) outByRoll.set(x.rollIndex, (outByRoll.get(x.rollIndex) ?? 0) + 1);
    expect(outByRoll).toEqual(inByRoll);
  });
});
