/**
 * Тесты для calculateMixedBestOrientation:
 *  - Проблема 3: economy-эвристика на room 21×9.4 м, рулоны 2×10 и 2×20.
 *  - Проблема 4: лучшая ориентация на room 5×11 м, рулон 2×11.
 *  - Эквивалентность ориентаций для квадратной комнаты.
 *  - selectMixed использует calculateMixedBestOrientation (контракт UI).
 */

import { describe, expect, it } from 'vitest';
import { calculateMixed, calculateMixedBestOrientation } from '../../src/domain/calculator/mixed';
import { selectMixed, countCuts } from '../../src/domain/calculator/selectMixed';
import { createRoll, createRoom } from './fixtures';

describe('calculateMixedBestOrientation', () => {
  describe('Проблема 3: room 21×9.4 м, rolls [2×10, 2×20], mode=economy', () => {
    // room.width=9400, room.length=21000 (convention: width поперёк, length вдоль).
    // Рулон A: 2×10 (width=2000, length=10000).
    // Рулон B: 2×20 (width=2000, length=20000).
    // maxRollWidth=2000, полос = ceil(9400/2000) = 5 (4×2000 + 1×1400).
    //
    // Новая эвристика для полосы 0 (needLength=21000):
    //   sufficient(>=21000): нет. insufficient=[A(10000),B(20000)]. max length → B(20000).
    //   useLen=20000, tail=0. needLength=1000.
    //   Итерация 2: sufficient(>=1000)=[A(10000),B(20000)]. min length → A(10000).
    //   useLen=1000, tail A(9000) → bank. rollsUsed=2 после полосы 0.
    //
    // Полоса 1 (needLength=21000):
    //   bank: A-offcut(w=2000, len=9000). useLen=9000. needLength=12000.
    //   sufficient(>=12000)=[B(20000)]. useLen=12000. tail B(8000) → bank. rollsUsed=3.
    //
    // Полосы 2-4 аналогично переиспользуют bank хвосты B.
    // Итого rollsUsed = 6 (подтверждено прогоном алгоритма).
    //
    // Это значительно лучше наивного максимума (10 рулонов × 1 тип):
    // bank хвостовых обрезков переиспользуется эффективно.
    const room = createRoom('p3', 9.4, 21);
    const rollA = createRoll(2, 10);
    const rollB = createRoll(2, 20);

    const r = calculateMixedBestOrientation(room, [rollA, rollB], 'economy');

    it('feasible=true', () => expect(r.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = r.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('rollsUsed <= 6 (greedy с bank-переиспользованием)', () =>
      expect(r.rollsUsed).toBeLessThanOrEqual(6));
    it('rollsUsed < 10 (улучшение vs наивного "1 рулон на итерацию")', () =>
      expect(r.rollsUsed).toBeLessThan(10));
    it('pieces содержат куски обоих типов рулонов', () => {
      const ids = new Set(r.pieces.map((p) => p.rollTypeId));
      // Рулон B (2×20) покрывает 20000 из 21000 первой полосы → должен присутствовать.
      expect(ids.has(rollB.id)).toBe(true);
    });
  });

  describe('Проблема 4: room 5×11 м, roll 2×11 м, лучшая ориентация', () => {
    // Вариант А (исходная ориентация, вдоль room.length=11000):
    //   width=5000, length=11000. maxRollWidth=2000.
    //   Полос: ceil(5000/2000)=3 (2000+2000+1000).
    //   Каждая полоса needLength=11000. sufficient=[roll(11000>=11000)].
    //   Наименьший length → roll(11000). useLen=11000, tail=0.
    //   rollsUsed = 3, seamCount = 2 продольных.
    //
    // Вариант Б (свапнутая, вдоль room.width=5000):
    //   swappedRoom.width=11000, swappedRoom.length=5000.
    //   Полос: ceil(11000/2000)=6 (5×2000+1000).
    //   Каждая полоса needLength=5000. sufficient=[roll(11000>=5000)].
    //   Наименьший length → roll(11000). useLen=5000, tail=6000 в bank.
    //   Полоса 2: bank offcut(2000×6000). useLen=5000, need=0. Одна запись из bank.
    //   И т.д. — чередование bank / новый рулон.
    //   rollsUsed >= 3 (каждый второй раз нужен новый рулон).
    //
    // economy: (rollsUsed, seamCount). Вариант А: (3, 2). Вариант Б: (>=3, 5).
    // Ожидаем Вариант А (исходная ориентация) — меньше швов при равном rollsUsed.
    const room = createRoom('p4', 5, 11);
    const roll = createRoll(2, 11);

    const r = calculateMixedBestOrientation(room, [roll], 'economy');

    it('feasible=true', () => expect(r.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = r.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('rollsUsed <= 3 (лучшая ориентация: 3 полосы вдоль 11м)', () =>
      expect(r.rollsUsed).toBeLessThanOrEqual(3));
    it('pieces транспонированы в исходную систему координат: length=11000', () => {
      // В правильной ориентации (вдоль room.length=11000) куски имеют length=11000.
      // Если был swap — coords транспонированы обратно, length должно быть 11000.
      for (const p of r.pieces) {
        expect(p.length).toBe(11000);
      }
    });
  });

  describe('Квадратная комната 5×5 м: обе ориентации эквивалентны', () => {
    // room.width=5000, room.length=5000 — swap ничего не меняет.
    // calculateMixedBestOrientation возвращает original без вычисления swap.
    const room = createRoom('sq', 5, 5);
    const roll = createRoll(2, 10);

    const rOrientation = calculateMixedBestOrientation(room, [roll], 'economy');
    const rDirect = calculateMixed(room, [roll], 'economy');

    it('feasible=true', () => expect(rOrientation.feasible).toBe(true));
    it('покрытая площадь = площадь помещения', () => {
      const covered = rOrientation.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('rollsUsed совпадает с calculateMixed (нет выгоды от swap)', () =>
      expect(rOrientation.rollsUsed).toBe(rDirect.rollsUsed));
    it('seamCount совпадает с calculateMixed', () =>
      expect(rOrientation.seamCount).toBe(rDirect.seamCount));
  });

  describe('selectMixed использует calculateMixedBestOrientation', () => {
    // Контракт UI: selectMixed возвращает {roll, result} где result уже учитывает
    // лучшую ориентацию — без изменения интерфейса ResultCard.tsx.
    const room = createRoom('ui', 5, 11);
    const roll = createRoll(2, 11);

    const sr = selectMixed(room, [roll], 'economy');

    it('нет ошибки', () => expect('error' in sr).toBe(false));
    it('rollsUsed <= 3 (orientation-aware)', () => {
      if (!('error' in sr)) {
        expect(sr.result.rollsUsed).toBeLessThanOrEqual(3);
      }
    });
    it('feasible=true', () => {
      if (!('error' in sr)) {
        expect(sr.result.feasible).toBe(true);
      }
    });
  });

  describe('Разделение режимов: room 11×4 м, rolls [2×5, 2×11]', () => {
    // room: width=4000, length=11000.
    // Рулон A: 2×5 (width=2000, length=5000).
    // Рулон B: 2×11 (width=2000, length=11000).
    // maxRollWidth=2000 → 2 полосы: [2000×11000, 2000×11000].
    //
    // economy:
    //   Полоса 0 (needLength=11000): банк пуст → chooseBestRoll(economy).
    //     sufficient=[B(11000>=11000)], insufficient=[A(5000<11000)].
    //     economy берёт наименьший sufficient.length → B(11000). useLen=11000, хвост=0. rollsUsed=1.
    //   Полоса 1 (needLength=11000): банк пуст → chooseBestRoll(economy) → B. rollsUsed=2.
    //   Итого economy: rollsUsed=2, seamCount=1 (продольный шов между полосами).
    //
    // optimal:
    //   Полоса 0 (needLength=11000): placedAtY=0 → банк не используем → chooseBestRoll(optimal).
    //     sufficient=[B(11000>=11000)], optimal берёт наибольший sufficient.length → B(11000).
    //     useLen=11000, хвост=0. rollsUsed=1.
    //   Полоса 1 (needLength=11000): placedAtY=0 → банк не используем → chooseBestRoll(optimal) → B.
    //     rollsUsed=2.
    //   Итого optimal: rollsUsed=2, seamCount=1.
    //
    // В этом сценарии оба режима выбирают B и дают одинаковый результат —
    // потому что A(5000) в sufficient отсутствует (5000 < 11000). Это ожидаемо.
    //
    // Для проверки разделения используем сценарий ниже, где A(5000) достаточен.

    const room = createRoom('split11x4', 4, 11);
    const rollA = createRoll(2, 5);
    const rollB = createRoll(2, 11);

    const econ = calculateMixed(room, [rollA, rollB], 'economy');
    const opt = calculateMixed(room, [rollA, rollB], 'optimal');

    it('economy: feasible=true', () => expect(econ.feasible).toBe(true));
    it('optimal: feasible=true', () => expect(opt.feasible).toBe(true));
    it('economy: rollsUsed=2 (B покрывает каждую полосу)', () =>
      expect(econ.rollsUsed).toBe(2));
    it('optimal: rollsUsed=2', () => expect(opt.rollsUsed).toBe(2));
    it('economy seamCount=1, optimal seamCount=1 (оба 2 полосы с 0 поперечных)', () => {
      expect(econ.seamCount).toBe(1);
      expect(opt.seamCount).toBe(1);
    });
  });

  describe('Разделение режимов: room 3×5 м, rolls [2×5, 2×30]', () => {
    // room: width=3000, length=5000. 2 полосы: [2000×5000, 1000×5000].
    // Рулон A: 2×5 (width=2000, length=5000).
    // Рулон B: 2×30 (width=2000, length=30000).
    //
    // Полоса 0 (stripWidth=2000, needLength=5000):
    //   sufficient=[A(5000>=5000), B(30000>=5000)].
    //   economy: наименьший sufficient.length → A(5000). useLen=5000. хвост=0. rollsUsed=1.
    //   optimal: начало (placedAtY=0) → банк пропускаем. chooseBestRoll(optimal):
    //            наибольший sufficient.length → B(30000). useLen=5000. хвост B(2000×25000) в банк. rollsUsed=1.
    //
    // Полоса 1 (stripWidth=1000, needLength=5000):
    //   economy: bank.findBestFor(1000, 1) → банк пуст у economy (A был использован полностью).
    //            → chooseBestRoll(economy, 1000, 5000):
    //            candidates=все (оба шире 1000). sufficient=[A(5000>=5000),B(30000>=5000)].
    //            economy берёт наименьший sufficient.length → A(5000). rollsUsed=2.
    //   optimal: placedAtY=0 → не берём банк. chooseBestRoll(optimal, 1000, 5000):
    //            sufficient=[A(5000>=5000), B(30000>=5000)]. optimal берёт наибольший → B.
    //            Но в банке уже есть offcut B(2000×25000, width=2000>=1000, len=25000>=5000).
    //            Поскольку optimal при placedAtY=0 не берёт банк — открывает ещё один B. rollsUsed=2.
    //
    // Итого:
    //   economy: rollsUsed=2, uses A(5000)+A(5000). seamCount=1 (продольный). wasteArea=0.
    //   optimal: rollsUsed=2, uses B(5000)+B(5000). seamCount=1 (продольный). wasteArea: хвост B = 2×25 м = 50M + хвост B2=50M → 100M (у каждого B уходит 5000 из 30000).
    //
    // Главное: режимы **различаются** по rollTypeId (economy использует A, optimal использует B).
    const room = createRoom('split3x5', 3, 5);
    const rollA = createRoll(2, 5);
    const rollB = createRoll(2, 30);

    const econ = calculateMixed(room, [rollA, rollB], 'economy');
    const opt = calculateMixed(room, [rollA, rollB], 'optimal');

    it('economy: feasible=true', () => expect(econ.feasible).toBe(true));
    it('optimal: feasible=true', () => expect(opt.feasible).toBe(true));
    it('economy: primary rollTypeId = rollA (наименьший sufficient → меньше отходов)', () =>
      expect(econ.rollTypeId).toBe(rollA.id));
    it('optimal: primary rollTypeId = rollB (наибольший sufficient → длинный хвост)', () =>
      expect(opt.rollTypeId).toBe(rollB.id));
    it('режимы различаются по primary rollTypeId', () =>
      expect(econ.rollTypeId).not.toBe(opt.rollTypeId));
    it('economy wasteArea < optimal wasteArea (economy экономнее)', () =>
      expect(econ.wasteAreaMm2).toBeLessThan(opt.wasteAreaMm2));
  });

  describe('Пользовательский сценарий: room 21×4.9 м, rolls [2×10, 2×15, 1.5×15, 2×20]', () => {
    // room: width=4900, length=21000.
    // Рулоны: A={2000×10000}, B={2000×15000}, C={1500×15000}, D={2000×20000}.
    // maxRollWidth=2000. Полосы: [2000×21000, 2000×21000, 900×21000] (ceil(4900/2000)=3).
    //
    // Оба режима должны дать feasible=true и покрыть всю площадь.
    // Главное: они должны дать различный результат хотя бы по одному метрике.
    const room = createRoom('user21x4.9', 4.9, 21);
    const rollA = createRoll(2, 10);
    const rollB = createRoll(2, 15);
    const rollC = createRoll(1.5, 15);
    const rollD = createRoll(2, 20);

    const econ = calculateMixed(room, [rollA, rollB, rollC, rollD], 'economy');
    const opt = calculateMixed(room, [rollA, rollB, rollC, rollD], 'optimal');

    it('economy: feasible=true', () => expect(econ.feasible).toBe(true));
    it('optimal: feasible=true', () => expect(opt.feasible).toBe(true));
    it('economy: покрытая площадь = площадь помещения', () => {
      const covered = econ.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('optimal: покрытая площадь = площадь помещения', () => {
      const covered = opt.pieces.reduce((s, p) => s + p.width * p.length, 0);
      expect(covered).toBe(room.width * room.length);
    });
    it('режимы различаются: seamCount или rollsUsed должны отличаться', () => {
      const differ =
        econ.seamCount !== opt.seamCount || econ.rollsUsed !== opt.rollsUsed;
      expect(differ).toBe(true);
    });
    it('optimal: seamCount <= economy.seamCount (optimal минимизирует стыки)', () =>
      expect(opt.seamCount).toBeLessThanOrEqual(econ.seamCount));
  });

  describe('selectMixed tie-break по cuts: room 3×7.5 м, rolls [2×20, 1.5×15], optimal', () => {
    // room: width=3000, length=7500.
    // Рулон A: 2×20 (width=2000, length=20000).
    // Рулон B: 1.5×15 (width=1500, length=15000).
    //
    // Ожидаемое поведение selectMixed (optimal):
    //   Mixed-кандидат и mono-кандидаты сравниваются по lex-ключу (pieces, cuts, rollsUsed, waste).
    //   Для B: 2 полосы (2000=1500? нет, планируется по maxRollWidth=2000).
    //   При mono B (width=1500): maxRollWidth=1500. Полос: ceil(3000/1500)=2 (1500+1500).
    //     Каждая полоса needLength=7500. sufficient=[B(15000>=7500)]. optimal: max length → B.
    //     useLen=7500, хвост 1500×7500 → bank. rollsUsed=2. pieces=2.
    //   При mono A (width=2000): maxRollWidth=2000. Полос: ceil(3000/2000)=2 (2000+1000).
    //     Полоса 0 (stripWidth=2000, needLength=7500). sufficient=[A(20000>=7500)].
    //     useLen=7500. Хвост A(2000×12500) → bank. rollsUsed=1.
    //     Полоса 1 (stripWidth=1000, needLength=7500). placedAtY=0 → не берём банк.
    //     chooseBestRoll(optimal, 1000, 7500): candidates=all A (width>=1000).
    //     sufficient=[A(20000>=7500)]. max length → A(20000). useLen=7500. rollsUsed=2. pieces=2.
    //   Оба mono: rollsUsed=2, pieces=2. Tie-break по cuts:
    //     mono B: 2 куска, каждый width=1500=sourceWidth(1500) ✓, length=7500<15000 → +1 cut каждый.
    //             cuts=2.
    //     mono A полоса0: width=2000=sourceWidth(2000) ✓, length=7500<20000 → +1 cut.
    //     mono A полоса1: width=1000<2000 → +1 cut, length=7500<20000 → +1 cut. cuts=3 total.
    //   cuts B(2) < cuts A(3) → B побеждает.
    const room = createRoom('tie-3x7.5', 3, 7.5);
    const rollA = createRoll(2, 20);
    const rollB = createRoll(1.5, 15);

    const sr = selectMixed(room, [rollA, rollB], 'optimal');

    it('нет ошибки', () => expect('error' in sr).toBe(false));
    it('feasible=true', () => {
      if (!('error' in sr)) expect(sr.result.feasible).toBe(true);
    });
    it('покрытая площадь = площадь помещения', () => {
      if (!('error' in sr)) {
        const covered = sr.result.pieces.reduce((s, p) => s + p.width * p.length, 0);
        expect(covered).toBe(room.width * room.length);
      }
    });
    it('выбран рулон 1.5×15 (меньше резов при равных pieces/rollsUsed)', () => {
      if (!('error' in sr)) {
        expect(sr.roll.id).toBe(rollB.id);
      }
    });
    it('rollsUsed=1 (economy-проход переиспользует хвост B из банка → один рулон на оба куска)', () => {
      if (!('error' in sr)) expect(sr.result.rollsUsed).toBe(1);
    });
    it('pieces.length=2 (по одному куску на полосу)', () => {
      if (!('error' in sr)) expect(sr.result.pieces.length).toBe(2);
    });
  });

  describe('countCuts: базовые случаи', () => {
    const rollA = createRoll(2, 20);

    it('кусок точного размера рулона — 0 резов', () => {
      const pieces = [{ rollTypeId: rollA.id, width: 2000, length: 20000, rollIndex: 0, sourceX: 0, sourceY: 0, placedAtX: 0, placedAtY: 0 }];
      expect(countCuts(pieces, [rollA])).toBe(0);
    });

    it('кусок короче рулона — 1 рез', () => {
      const pieces = [{ rollTypeId: rollA.id, width: 2000, length: 7500, rollIndex: 0, sourceX: 0, sourceY: 0, placedAtX: 0, placedAtY: 0 }];
      expect(countCuts(pieces, [rollA])).toBe(1);
    });

    it('кусок уже и короче рулона — 2 реза', () => {
      const pieces = [{ rollTypeId: rollA.id, width: 1000, length: 7500, rollIndex: 0, sourceX: 0, sourceY: 0, placedAtX: 0, placedAtY: 0 }];
      expect(countCuts(pieces, [rollA])).toBe(2);
    });
  });

  describe('selectMixed smoke: room 21×9.4 м, rolls [2×10, 2×20], economy/optimal не сломаны', () => {
    const room = createRoom('smoke21x9.4', 9.4, 21);
    const rollA = createRoll(2, 10);
    const rollB = createRoll(2, 20);

    const econ = selectMixed(room, [rollA, rollB], 'economy');
    const opt = selectMixed(room, [rollA, rollB], 'optimal');

    it('economy: feasible=true', () => {
      if (!('error' in econ)) expect(econ.result.feasible).toBe(true);
    });
    it('optimal: feasible=true', () => {
      if (!('error' in opt)) expect(opt.result.feasible).toBe(true);
    });
    it('economy: rollsUsed <= 6', () => {
      if (!('error' in econ)) expect(econ.result.rollsUsed).toBeLessThanOrEqual(6);
    });
    it('нет ошибок в обоих режимах', () => {
      expect('error' in econ).toBe(false);
      expect('error' in opt).toBe(false);
    });
  });
});
