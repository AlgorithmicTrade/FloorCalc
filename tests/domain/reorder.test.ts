/**
 * Тесты post-process reorderStripsEdgeFirst.
 *
 * Проверяем:
 *  - Edge cases: empty / single piece / single strip / все single / все multi.
 *  - Перестановка multi-piece полосы из середины в край.
 *  - Сохранение инвариантов: суммарная площадь, placedAtY внутри полосы,
 *    сумма ширин полос, корректные новые placedAtX.
 *  - Покрытие всей области без пробелов и наложений после reorder.
 */

import { describe, expect, it } from 'vitest';
import { reorderStripsEdgeFirst } from '../../src/domain/calculator/reorder';
import type { Piece } from '../../src/domain/types';

/** Удобная фабрика piece для тестов. Только обязательные геометрические поля. */
function makePiece(
  rollIndex: number,
  placedAtX: number,
  placedAtY: number,
  width: number,
  length: number,
  rollTypeId = 'roll-test',
): Piece {
  return {
    rollIndex,
    rollTypeId,
    sourceX: 0,
    sourceY: placedAtY,
    width,
    length,
    placedAtX,
    placedAtY,
  };
}

describe('reorderStripsEdgeFirst', () => {
  it('пустой массив → []', () => {
    expect(reorderStripsEdgeFirst([], 10000)).toEqual([]);
  });

  it('один piece (одна полоса) → копия, placedAtX без изменений', () => {
    const pieces: Piece[] = [makePiece(0, 0, 0, 2000, 16000)];
    const out = reorderStripsEdgeFirst(pieces, 2000);
    expect(out).toHaveLength(1);
    expect(out[0]!.placedAtX).toBe(0);
    // Не тот же объект — но эквивалентен.
    expect(out[0]).not.toBe(pieces[0]);
  });

  it('одна single-piece полоса → возвращает как есть (копия, размеры неизменны)', () => {
    const pieces: Piece[] = [makePiece(0, 5000, 0, 2000, 16000)];
    const out = reorderStripsEdgeFirst(pieces, 2000);
    // Поскольку всего одна полоса — placedAtX оставляем (5000), но это покрывается
    // веткой `byX.size <= 1`. Для одной полосы reorder бессмысленен.
    expect(out).toHaveLength(1);
    expect(out[0]!.placedAtX).toBe(5000);
    expect(out[0]!.width).toBe(2000);
    expect(out[0]!.length).toBe(16000);
  });

  it('все single-piece полосы → возвращает в исходном порядке (стабильность)', () => {
    // 3 полосы по 2000mm × 16000mm, расположены подряд.
    const pieces: Piece[] = [
      makePiece(0, 0, 0, 2000, 16000),
      makePiece(1, 2000, 0, 2000, 16000),
      makePiece(2, 4000, 0, 2000, 16000),
    ];
    const out = reorderStripsEdgeFirst(pieces, 6000);
    expect(out).toHaveLength(3);
    // Все single — нет multi для перемещения, ветка early-return.
    expect(out.map((p) => p.placedAtX)).toEqual([0, 2000, 4000]);
    expect(out.map((p) => p.rollIndex)).toEqual([0, 1, 2]);
  });

  it('все multi-piece полосы → возвращает как есть (нет single для перестановки)', () => {
    // 2 полосы, обе из 2 кусков по 2000×8000 каждая.
    const pieces: Piece[] = [
      makePiece(0, 0, 0, 2000, 8000),
      makePiece(0, 0, 8000, 2000, 8000),
      makePiece(1, 2000, 0, 2000, 8000),
      makePiece(1, 2000, 8000, 2000, 8000),
    ];
    const out = reorderStripsEdgeFirst(pieces, 4000);
    expect(out).toHaveLength(4);
    // Все multi — reorder не двигает ничего (early-return по второй ветке).
    const xs = new Set(out.map((p) => p.placedAtX));
    expect(xs).toEqual(new Set([0, 2000]));
  });

  it('1 multi посередине + 4 single → multi в конец, single сначала', () => {
    // Сценарий: 5 полос по 2000mm каждая, длина 16000mm.
    //   Strip A (x=0):     1 piece            → single
    //   Strip B (x=2000):  1 piece            → single
    //   Strip C (x=4000):  4 pieces (2000×4000) → multi
    //   Strip D (x=6000):  1 piece            → single
    //   Strip E (x=8000):  1 piece            → single
    // После reorder: [A, B, D, E, C] с placedAtX [0, 2000, 4000, 6000, 8000].
    const pieces: Piece[] = [
      // A — single, x=0
      makePiece(0, 0, 0, 2000, 16000),
      // B — single, x=2000
      makePiece(1, 2000, 0, 2000, 16000),
      // C — multi (4 куска по 4000), x=4000
      makePiece(2, 4000, 0, 2000, 4000),
      makePiece(3, 4000, 4000, 2000, 4000),
      makePiece(4, 4000, 8000, 2000, 4000),
      makePiece(5, 4000, 12000, 2000, 4000),
      // D — single, x=6000
      makePiece(6, 6000, 0, 2000, 16000),
      // E — single, x=8000
      makePiece(7, 8000, 0, 2000, 16000),
    ];
    const out = reorderStripsEdgeFirst(pieces, 10000);
    expect(out).toHaveLength(8);

    // Группируем результат по placedAtX.
    const byX = new Map<number, Piece[]>();
    for (const p of out) {
      const arr = byX.get(p.placedAtX) ?? [];
      arr.push(p);
      byX.set(p.placedAtX, arr);
    }

    // Ожидаемые позиции: 4 single (0, 2000, 4000, 6000), затем multi (8000).
    expect([...byX.keys()].sort((a, b) => a - b)).toEqual([0, 2000, 4000, 6000, 8000]);

    // Multi-полоса (4 piece) должна быть в позиции x=8000 (последняя).
    const multiX = [...byX.entries()].filter(([, ps]) => ps.length > 1).map(([x]) => x);
    expect(multiX).toEqual([8000]);

    // Single-полосы — на местах 0, 2000, 4000, 6000 (в исходном порядке rollIndex 0,1,6,7).
    expect(byX.get(0)?.[0]?.rollIndex).toBe(0);
    expect(byX.get(2000)?.[0]?.rollIndex).toBe(1);
    expect(byX.get(4000)?.[0]?.rollIndex).toBe(6);
    expect(byX.get(6000)?.[0]?.rollIndex).toBe(7);
  });

  it('сумма площадей сохраняется', () => {
    const pieces: Piece[] = [
      makePiece(0, 0, 0, 2000, 16000),
      makePiece(1, 2000, 0, 2000, 8000),
      makePiece(1, 2000, 8000, 2000, 8000),
      makePiece(2, 4000, 0, 2000, 16000),
    ];
    const before = pieces.reduce((s, p) => s + p.width * p.length, 0);
    const out = reorderStripsEdgeFirst(pieces, 6000);
    const after = out.reduce((s, p) => s + p.width * p.length, 0);
    expect(after).toBe(before);
  });

  it('placedAtX каждой полосы соответствует sum(widths) предыдущих', () => {
    // Полосы разной ширины: 1500 + 2000 + 500 = 4000 (multi в середине).
    const pieces: Piece[] = [
      makePiece(0, 0, 0, 1500, 10000),
      // multi: x=1500, ширина 2000, 2 куска по 5000.
      makePiece(1, 1500, 0, 2000, 5000),
      makePiece(2, 1500, 5000, 2000, 5000),
      // single: x=3500, ширина 500.
      makePiece(3, 3500, 0, 500, 10000),
    ];
    const out = reorderStripsEdgeFirst(pieces, 4000);
    // После reorder: [single(1500), single(500), multi(2000)].
    // placedAtX: 0, 1500, 2000.
    const byX = new Map<number, Piece[]>();
    for (const p of out) {
      const arr = byX.get(p.placedAtX) ?? [];
      arr.push(p);
      byX.set(p.placedAtX, arr);
    }
    const xsSorted = [...byX.keys()].sort((a, b) => a - b);
    expect(xsSorted).toEqual([0, 1500, 2000]);
    // Полоса x=0: исходная single шириной 1500 (rollIndex 0).
    expect(byX.get(0)?.[0]?.rollIndex).toBe(0);
    expect(byX.get(0)?.[0]?.width).toBe(1500);
    // Полоса x=1500: исходная single шириной 500 (rollIndex 3).
    expect(byX.get(1500)?.[0]?.rollIndex).toBe(3);
    expect(byX.get(1500)?.[0]?.width).toBe(500);
    // Полоса x=2000: multi, 2 куска шириной 2000.
    expect(byX.get(2000)).toHaveLength(2);
    expect(byX.get(2000)?.[0]?.width).toBe(2000);
  });

  it('внутри полосы порядок placedAtY сохраняется', () => {
    // Multi-полоса с 3 кусками; проверим, что после reorder Y-порядок не нарушен.
    const pieces: Piece[] = [
      makePiece(0, 0, 0, 2000, 16000), // single слева
      // multi с 3 piece: y = 0, 5000, 11000 (длины 5000, 6000, 5000).
      makePiece(1, 2000, 0, 2000, 5000),
      makePiece(2, 2000, 5000, 2000, 6000),
      makePiece(3, 2000, 11000, 2000, 5000),
      makePiece(4, 4000, 0, 2000, 16000), // single справа
    ];
    const out = reorderStripsEdgeFirst(pieces, 6000);
    // Multi должен оказаться в конце (placedAtX=4000).
    const multiPieces = out.filter((p) => p.placedAtX === 4000);
    expect(multiPieces).toHaveLength(3);
    // Порядок placedAtY должен быть тем же: 0, 5000, 11000 (стабильно).
    expect(multiPieces.map((p) => p.placedAtY)).toEqual([0, 5000, 11000]);
    expect(multiPieces.map((p) => p.length)).toEqual([5000, 6000, 5000]);
    // rollIndex также сохранены — критично для трекинга источника материала.
    expect(multiPieces.map((p) => p.rollIndex)).toEqual([1, 2, 3]);
  });

  it('input не мутируется', () => {
    const pieces: Piece[] = [
      makePiece(0, 0, 0, 2000, 16000),
      makePiece(1, 2000, 0, 2000, 8000),
      makePiece(1, 2000, 8000, 2000, 8000),
      makePiece(2, 4000, 0, 2000, 16000),
    ];
    const before = pieces.map((p) => ({ ...p }));
    reorderStripsEdgeFirst(pieces, 6000);
    expect(pieces).toEqual(before);
  });

  it('guard: разная width в одной группе byX → no-op (swap-back layout)', () => {
    // Эмулируем swap-back layout: pieces из swappedRoom (13×7.6),
    // транспонированные обратно. У pieces разных свап-полос совпадает
    // placedAtX=0 (это бывший placedAtY=0 — начало каждой свап-полосы),
    // но width разный (это бывшая length их свап-полос — куски разной длины).
    //
    // Без guard: reorder группировал такие pieces в одну "strip", брал
    // width у первого, cursorX накапливался → placedAtX >> room.width.
    // С guard: layout не vertical-strip, возвращаем копию без изменений.
    const pieces: Piece[] = [
      // «Свап-полоса 0»: placedAtY=0, pieces по placedAtX 0/11000 — но это
      // для теста guard важен только тот факт, что в группе placedAtX=0
      // окажутся pieces с разной width.
      makePiece(0, 0, 0, 11000, 1500),
      makePiece(1, 11000, 0, 2000, 1500),
      // «Свап-полоса 1»: placedAtY=1500.
      makePiece(2, 0, 1500, 9000, 1500),
      makePiece(3, 9000, 1500, 4000, 1500),
      // «Свап-полоса 2»: placedAtY=3000.
      makePiece(4, 0, 3000, 7000, 1500),
      makePiece(5, 7000, 3000, 6000, 1500),
    ];
    const roomWidth = 13000;
    const out = reorderStripsEdgeFirst(pieces, roomWidth);

    // No-op: длина та же, координаты pieces те же (placedAtX/placedAtY).
    expect(out).toHaveLength(pieces.length);
    for (let i = 0; i < pieces.length; i++) {
      expect(out[i]!.placedAtX).toBe(pieces[i]!.placedAtX);
      expect(out[i]!.placedAtY).toBe(pieces[i]!.placedAtY);
      expect(out[i]!.width).toBe(pieces[i]!.width);
      expect(out[i]!.length).toBe(pieces[i]!.length);
    }
    // И — важная проверка: все pieces остаются в bounds [0, roomWidth].
    for (const p of out) {
      expect(p.placedAtX + p.width).toBeLessThanOrEqual(roomWidth);
    }
  });

  it('покрытие без пробелов и наложений после reorder (baseline 16×16/2×20)', () => {
    // Эмулируем результат whole-strip-first для 16×16 / 2×20:
    //   7 single-полос (целые куски 2×16) + 1 multi-полоса (4 куска 2×4).
    // Multi посередине (x=8000 в исходной раскладке).
    const pieces: Piece[] = [
      // single x=0..6000 (4 полосы)
      makePiece(0, 0, 0, 2000, 16000),
      makePiece(1, 2000, 0, 2000, 16000),
      makePiece(2, 4000, 0, 2000, 16000),
      makePiece(3, 6000, 0, 2000, 16000),
      // multi x=8000 (4 куска 2×4)
      makePiece(0, 8000, 0, 2000, 4000),
      makePiece(1, 8000, 4000, 2000, 4000),
      makePiece(2, 8000, 8000, 2000, 4000),
      makePiece(3, 8000, 12000, 2000, 4000),
      // single x=10000..14000 (3 полосы)
      makePiece(4, 10000, 0, 2000, 16000),
      makePiece(5, 12000, 0, 2000, 16000),
      makePiece(6, 14000, 0, 2000, 16000),
    ];
    const out = reorderStripsEdgeFirst(pieces, 16000);
    expect(out).toHaveLength(11);

    // Multi должна быть в позиции x=14000 (последняя при roomWidth=16000).
    const multiPieces = out.filter((p) => p.placedAtX === 14000);
    expect(multiPieces).toHaveLength(4);

    // Полное покрытие: суммарная площадь = 16000 × 16000.
    const covered = out.reduce((s, p) => s + p.width * p.length, 0);
    expect(covered).toBe(16000 * 16000);

    // Все strip-X в наборе [0..14000], шаг 2000.
    const xs = new Set(out.map((p) => p.placedAtX));
    expect([...xs].sort((a, b) => a - b)).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000, 14000]);
  });
});
