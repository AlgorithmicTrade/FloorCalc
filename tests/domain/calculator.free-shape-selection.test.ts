/**
 * Тесты выбора раскладки для свободной формы (selectMixed) — фикс sub-optimality.
 *
 * Контракт фикса: для свободной формы (room.layout='free' с валидным polygon)
 * lex-key в `selectMixed.keyOf` использует physical visible-count
 * (`countVisibleSegments(pieces, polygon)`) вместо domain `pieces.length`.
 * Для прямоугольной комнаты (polygon === null) — поведение прежнее, без регрессий.
 *
 * Бизнес-обоснование: один domain-piece, который проходит через вырез П-формы,
 * физически распадается на 2 visible-rectangles. Сравнение кандидатов по
 * domain-числу обманчиво — пользователь видит на схеме physical-куски, и
 * ровно их и нужно сравнивать в lex-key, чтобы исключить иррациональный
 * выбор кандидата с меньшим domain, но не меньшим visible.
 */

import { describe, expect, it } from 'vitest';
import { selectMixed } from '../../src/domain/calculator/selectMixed';
import {
  calculateMixedBestOrientation,
  calculateWholeStripFirst,
} from '../../src/domain/calculator/mixed';
import { buildShapePolygon, countVisibleSegments } from '../../src/domain/shape';
import type { Room, Wall } from '../../src/domain/types';
import { createRoll, createRoom } from './fixtures';

// П-форма 12×12 с вырезом 4×4 справа посередине (площадь 128 м²).
// Bbox = 12000×12000. Вырез — прямоугольник [x=8000..12000] × [y=4000..8000].
// Walls обхода CW, validateShape допускает стены любой длины >= 1 шага сетки.
const piRoomWalls: Wall[] = [
  { from: { col: 0, row: 0 }, to: { col: 0, row: 4 }, lengthMm: 12000 }, // left, vertical down
  { from: { col: 0, row: 4 }, to: { col: 4, row: 4 }, lengthMm: 12000 }, // bottom, horizontal right
  { from: { col: 4, row: 4 }, to: { col: 4, row: 3 }, lengthMm: 4000 },  // right-bottom, vertical up
  { from: { col: 4, row: 3 }, to: { col: 3, row: 3 }, lengthMm: 4000 },  // notch right→left
  { from: { col: 3, row: 3 }, to: { col: 3, row: 2 }, lengthMm: 4000 },  // notch left, vertical up
  { from: { col: 3, row: 2 }, to: { col: 4, row: 2 }, lengthMm: 4000 },  // notch left→right
  { from: { col: 4, row: 2 }, to: { col: 4, row: 0 }, lengthMm: 4000 },  // right-top, vertical up
  { from: { col: 4, row: 0 }, to: { col: 0, row: 0 }, lengthMm: 12000 }, // top, horizontal left
];

const makePiRoom = (): Room => ({
  id: 'pi-room',
  name: 'П-комната 12×12 / вырез 4×4',
  width: 12000,
  length: 12000,
  layout: 'free',
  shape: { walls: piRoomWalls },
});

describe('selectMixed для свободной формы: lex-key по visible-count', () => {
  describe('Sanity: shape валиден и polygon корректен', () => {
    const room = makePiRoom();

    it('buildShapePolygon возвращает polygon с правильным bbox 12×12', () => {
      const polygon = buildShapePolygon(room.shape!);
      expect(polygon).not.toBeNull();
      expect(polygon!.bboxWidth).toBe(12000);
      expect(polygon!.bboxLength).toBe(12000);
      expect(polygon!.vertices).toHaveLength(8);
    });
  });

  // Baseline бизнес-кейс из исходного бага: П-форма 12×12 с вырезом 4×4,
  // активные рулоны [2×15, 2×20], mode=optimal.
  describe('Baseline-кейс: П-форма 12×12 + rolls [2×15, 2×20], optimal', () => {
    const room = makePiRoom();
    const rollA = createRoll(2, 15);
    const rollB = createRoll(2, 20);

    const sr = selectMixed(room, [rollA, rollB], 'optimal');
    const polygon = buildShapePolygon(room.shape!)!.vertices;

    it('нет ошибки', () => expect('error' in sr).toBe(false));
    it('feasible=true', () => {
      if (!('error' in sr)) expect(sr.result.feasible).toBe(true);
    });
    it('покрытая bbox-площадь = bbox комнаты', () => {
      if (!('error' in sr)) {
        const covered = sr.result.pieces.reduce((s, p) => s + p.width * p.length, 0);
        expect(covered).toBe(room.width * room.length);
      }
    });
    // Контракт фикса для optimal: lex-key = [visible, cuts, rollsUsed, waste].
    // У winner visible-count должен быть <= visible-count любого другого
    // selectMixed-кандидата, иначе lex по visible выбрал бы того.
    it('у winner visible-count минимален среди {mono15, mono20}', () => {
      if ('error' in sr) return;
      const visibleWinner = countVisibleSegments(sr.result.pieces, polygon);
      const sr15 = selectMixed(room, [rollA], 'optimal');
      const sr20 = selectMixed(room, [rollB], 'optimal');
      const v15 =
        'error' in sr15 ? Infinity : countVisibleSegments(sr15.result.pieces, polygon);
      const v20 =
        'error' in sr20 ? Infinity : countVisibleSegments(sr20.result.pieces, polygon);
      expect(visibleWinner).toBeLessThanOrEqual(v15);
      expect(visibleWinner).toBeLessThanOrEqual(v20);
    });
    // Конкретный numeric-якорь: для этой геометрии greedy mono 2×15 и greedy
    // mono 2×20 дают одинаковые 8 visible (greedy = 6 piece × 2000mm полос:
    // 2 полосы попадают в вырез и распадаются на 2 visible каждая).
    // Whole-strip-first для mono 2×20 даёт 4 рулона / 8 domain / 9 visible —
    // он проигрывает по visible. greedy 2×15 и 2×20 имеют одинаковые
    // [vis=8, cuts=6, rolls=6], tie-break по waste выбирает 2×15
    // (36 000 000 < 96 000 000). После фикса winner должен иметь visible=8.
    it('visible winner = 8 (минимально возможное для bbox 12×12 / вырез 4×4)', () => {
      if (!('error' in sr)) {
        const visibleWinner = countVisibleSegments(sr.result.pieces, polygon);
        expect(visibleWinner).toBe(8);
      }
    });
  });

  // Sub-test, демонстрирующий принцип фикса: создаём искусственный сценарий
  // ручного перебора кандидатов, где domain-числа одинаковы, а visible различны.
  // Если бы lex-key использовал domain — был бы tie, выбор зависел бы только
  // от cuts/rollsUsed/waste. После фикса visible различает кандидатов первым.
  describe('Принцип фикса: visible-count разрывает tie между равными domain', () => {
    const room = makePiRoom();
    const rollA = createRoll(2, 15);
    const rollB = createRoll(2, 20);
    const polygon = buildShapePolygon(room.shape!)!.vertices;

    // Два кандидата с РАЗНЫМ visible но потенциально tie-able domain.
    // wsfOpt20: domain=8, visible=9, rollsUsed=4. greedyOpt15: domain=6, visible=8,
    // rollsUsed=6. Lex в optimal по visible: 8<9 → greedyOpt15 побеждает.
    // (До фикса lex был бы по domain: 6<8 → тоже greedyOpt15. В этом частном
    // случае результат совпадает; но фикс ВСЕГДА симметричен по физическому
    // смыслу, тогда как domain-сравнение может ввести в заблуждение в других
    // геометриях.)
    const wsfOpt20 = calculateWholeStripFirst(room, [rollB], 'optimal');
    const greedyOpt15 = calculateMixedBestOrientation(room, [rollA], 'optimal');

    it('wsfOpt20: domain=8, visible=9 (visible > domain — куски пересекают вырез)', () => {
      expect(wsfOpt20.pieces.length).toBe(8);
      expect(countVisibleSegments(wsfOpt20.pieces, polygon)).toBe(9);
    });

    it('greedyOpt15: domain=6, visible=8 (visible > domain аналогично)', () => {
      expect(greedyOpt15.pieces.length).toBe(6);
      expect(countVisibleSegments(greedyOpt15.pieces, polygon)).toBe(8);
    });
  });

  // Контроль регрессий: для прямоугольной комнаты polygon=null → keyOf
  // использует domain pieces.length как раньше. Поведение не должно отличаться
  // от состояния до фикса. Сравниваем с известным результатом greedy mono.
  describe('Контроль: прямоугольная 12×12 + rolls [2×15, 2×20], optimal — без регрессии', () => {
    const room = createRoom('rect12x12', 12, 12);
    const rollA = createRoll(2, 15);
    const rollB = createRoll(2, 20);

    const sr = selectMixed(room, [rollA, rollB], 'optimal');

    it('нет ошибки', () => expect('error' in sr).toBe(false));
    it('feasible=true', () => {
      if (!('error' in sr)) expect(sr.result.feasible).toBe(true);
    });
    // Для rect optimal lex = [domain, cuts, rolls, waste]; greedy mono даёт
    // domain=6 для обоих рулонов; tie-break по waste: 2×15 (36M) < 2×20 (96M).
    it('выбран рулон 2×15 (rect: lex по domain, tie по waste → 2×15)', () => {
      if (!('error' in sr)) {
        expect(sr.roll.id).toBe(rollA.id);
      }
    });
    it('rollsUsed=6 (rect: одна полоса = один рулон в greedy mono)', () => {
      if (!('error' in sr)) {
        expect(sr.result.rollsUsed).toBe(6);
      }
    });
    it('visible-count == pieces.length (rect → polygon=null, числа совпадают)', () => {
      if (!('error' in sr)) {
        const visible = countVisibleSegments(sr.result.pieces, null);
        expect(visible).toBe(sr.result.pieces.length);
      }
    });
  });

  // Контроль регрессий по economy: фикс симметричен и для economy.
  // Lex economy = [rollsUsed, visible, cuts, waste]. Для П-формы visible=8
  // у mono 2×20 (rollsUsed=4) — это лучший результат. Поведение economy
  // на этом кейсе не должно ухудшиться от фикса.
  describe('Регрессия economy: П-форма 12×12 + rolls [2×15, 2×20]', () => {
    const room = makePiRoom();
    const rollA = createRoll(2, 15);
    const rollB = createRoll(2, 20);

    const sr = selectMixed(room, [rollA, rollB], 'economy');

    it('feasible=true', () => {
      if (!('error' in sr)) expect(sr.result.feasible).toBe(true);
    });
    it('economy выбирает 2×20 (минимум rollsUsed = 4)', () => {
      if (!('error' in sr)) {
        expect(sr.roll.id).toBe(rollB.id);
        expect(sr.result.rollsUsed).toBe(4);
      }
    });
  });
});
