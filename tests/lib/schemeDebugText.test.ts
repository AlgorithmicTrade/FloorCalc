/**
 * Тесты для `formatSchemeDebugText` — pure-функции формирования текстового
 * снимка схемы для copy-debug-info. Проверяем структурные строки в выводе:
 * наличие заголовков секций, корректный формат описания помещения для rect/free,
 * стрелки направления стен, подсчёт типоразмеров, опциональность секции
 * «Предупреждения» и формат строки конкретного piece.
 *
 * Convention: используем РЕАЛЬНЫЕ объекты Room/RollType/CalculationResult
 * (никаких mocks) — domain-слой и формирование текста полностью pure.
 */

import { describe, expect, it } from 'vitest';
import { formatSchemeDebugText } from '../../src/lib/schemeDebugText';
import { calculateEconomy } from '../../src/domain/calculator/economy';
import { selectMixed } from '../../src/domain/calculator/selectMixed';
import { createRoll, createRoom } from '../domain/fixtures';
import type {
  CalculationResult,
  Piece,
  RollType,
  Room,
  Wall,
} from '../../src/domain/types';

describe('formatSchemeDebugText', () => {
  describe('Прямоугольная комната 5×3 м, рулон 4×30 м (1 piece)', () => {
    const room = createRoom('s1', 3, 5);
    const roll = createRoll(4, 30);
    const result = calculateEconomy(room, roll);
    const text = formatSchemeDebugText({
      mode: 'economy',
      modeTitle: 'Экономный режим',
      room,
      result,
      catalog: [roll],
    });

    it('содержит заголовок с режимом', () => {
      expect(text).toContain('=== Схема расчёта (Экономный режим, mode=economy) ===');
    });
    it('помещение отображается как прямоугольник с именем и габаритами', () => {
      // formatM по умолчанию даёт 2 знака после запятой → «3.00 м × 5.00 м».
      expect(text).toContain('Помещение: «s1», 3.00 м × 5.00 м (прямоугольник)');
    });
    it('содержит секцию «Сводка:» с метриками', () => {
      expect(text).toContain('Сводка:');
      expect(text).toContain('Рулонов: 1');
      expect(text).toContain('Кусков: 1');
      expect(text).toContain('Швов: 0');
      expect(text).toContain('Обрезки рулона:');
    });
    it('содержит секцию «Типы рулонов» с количеством', () => {
      // У createRoll id = 'roll-4x30', shortRollId оставит как есть (не preset-).
      expect(text).toMatch(/Типы рулонов \(1\):/);
      expect(text).toContain('4.00 м × 30.00 м');
      expect(text).toContain('— 1 шт.');
    });
    it('содержит секцию «Куски (1)» с одной строкой piece', () => {
      expect(text).toContain('Куски (1)');
      // Piece: rollIndex=0 → «#1», pos (0.00, 0.00), размер 3.00 × 5.00.
      expect(text).toContain('1. рулон #1');
      expect(text).toContain('позиция (0.00 м, 0.00 м)');
      expect(text).toContain('размер 3.00 м × 5.00 м');
    });
    it('НЕ содержит метку «(обрезок)» для piece из начала рулона', () => {
      // sourceX=0 && sourceY=0 → не «обрезок».
      expect(text).not.toContain('(обрезок)');
    });
  });

  describe('Опциональная секция «Предупреждения:»', () => {
    it('опускается, когда warnings.length === 0', () => {
      const room = createRoom('no-warn', 3, 5);
      const roll = createRoll(4, 30);
      const result = calculateEconomy(room, roll);
      // Гарантия предусловия теста: проверяемый сценарий действительно без warnings.
      expect(result.warnings).toHaveLength(0);
      const text = formatSchemeDebugText({
        mode: 'economy',
        modeTitle: 'Экономный режим',
        room,
        result,
        catalog: [roll],
      });
      expect(text).not.toContain('Предупреждения:');
    });

    it('присутствует, когда warnings.length > 0', () => {
      // Конструируем result вручную, чтобы гарантировать наличие warning без
      // зависимости от поведения domain-генератора warnings.
      const room: Room = createRoom('with-warn', 3, 5);
      const roll: RollType = createRoll(4, 30);
      const piece: Piece = {
        rollIndex: 0,
        rollTypeId: roll.id,
        sourceX: 0,
        sourceY: 0,
        width: 3000,
        length: 5000,
        placedAtX: 0,
        placedAtY: 0,
      };
      const result: CalculationResult = {
        mode: 'economy',
        roomId: room.id,
        rollTypeId: roll.id,
        rollsUsed: 1,
        seamCount: 0,
        pieces: [piece],
        wasteAreaMm2: 0,
        warnings: ['Тестовое предупреждение'],
        feasible: true,
      };
      const text = formatSchemeDebugText({
        mode: 'economy',
        modeTitle: 'Экономный режим',
        room,
        result,
        catalog: [roll],
      });
      expect(text).toContain('Предупреждения:');
      expect(text).toContain('- Тестовое предупреждение');
    });
  });

  describe('Свободная форма (free layout) — L-образная комната', () => {
    // L-образная форма: bbox 5 м × 5 м с вырезанным правым-верхним 3×3-углом.
    // Vertices (walk-алгоритм buildShapePolygon, начиная с (0,0)):
    //   (0,0) → (2,0) → (2,3) → (5,3) → (5,5) → (0,5) → замыкание в (0,0).
    // Площадь полигона = 5*5 - 3*3 = 16 м² (вырезанный угол 3 м × 3 м = 9 м²).
    // Walls (топология сетки col,row не масштабирует длину; lengthMm — реальный размер):
    //   1. → (0,0)→(2,0)  : 2 м (горизонт. вправо, верхний край левой части)
    //   2. ↓ (2,0)→(2,1)  : 3 м (вниз, правая граница левой части до полки)
    //   3. → (2,1)→(4,1)  : 3 м (вправо, по полке)  — внутренний угол
    //   4. ↓ (4,1)→(4,4)  : 2 м (вниз, правый край нижней части)
    //   5. ← (4,4)→(0,4)  : 5 м (влево, нижний край)
    //   6. ↑ (0,4)→(0,0)  : 5 м (вверх, левый край)
    const walls: Wall[] = [
      { from: { col: 0, row: 0 }, to: { col: 2, row: 0 }, lengthMm: 2000 },
      { from: { col: 2, row: 0 }, to: { col: 2, row: 1 }, lengthMm: 3000 },
      { from: { col: 2, row: 1 }, to: { col: 4, row: 1 }, lengthMm: 3000 },
      { from: { col: 4, row: 1 }, to: { col: 4, row: 4 }, lengthMm: 2000 },
      { from: { col: 4, row: 4 }, to: { col: 0, row: 4 }, lengthMm: 5000 },
      { from: { col: 0, row: 4 }, to: { col: 0, row: 0 }, lengthMm: 5000 },
    ];
    const room: Room = {
      id: 'free-L',
      name: 'L-комната',
      width: 5000,
      length: 5000,
      layout: 'free',
      shape: { walls },
    };
    const roll = createRoll(2, 20);
    const selection = selectMixed(room, [roll], 'economy');
    if ('error' in selection) {
      throw new Error('selectMixed unexpectedly returned error for L-room fixture');
    }
    const text = formatSchemeDebugText({
      mode: 'economy',
      modeTitle: 'Экономный режим',
      room,
      result: selection.result,
      catalog: [roll],
    });

    it('содержит описание свободной формы с bbox', () => {
      expect(text).toContain('Помещение: «L-комната», bbox 5.00 м × 5.00 м (свободная форма)');
    });
    it('содержит секцию «Контур» с числом стен', () => {
      expect(text).toContain('Контур (6 стен):');
    });
    it('содержит стрелки направления стен (→, ↓, ←, ↑)', () => {
      expect(text).toContain('→');
      expect(text).toContain('↓');
      expect(text).toContain('←');
      expect(text).toContain('↑');
    });
    it('содержит подписи направления (горизонтальная/вертикальная)', () => {
      expect(text).toContain('(горизонтальная)');
      expect(text).toContain('(вертикальная)');
    });
    it('содержит «Площадь полигона» (для валидной free-формы)', () => {
      expect(text).toContain('Площадь полигона:');
      // Для нашей L-формы 5×5 минус 3×3 = 16 м². formatArea даёт «16.00 м²».
      expect(text).toContain('Площадь полигона: 16.00 м²');
    });
    it('содержит «Отрезано формой» в сводке (bbox > polygon)', () => {
      // 25 - 16 = 9 м².
      expect(text).toContain('Отрезано формой: 9.00 м²');
    });

    it('НЕ содержит «Видимые сегменты» — у L-формы вырез сбоку, polygon-clip не делит ни одну полосу пополам (каждая bbox-полоса даёт ровно одну visible-часть)', () => {
      expect(text).not.toContain('Видимые сегменты');
    });
  });

  describe('П-форма (вырез посередине, разбивает полосы) — секция «Видимые сегменты» выводится', () => {
    // Bbox 12×12 с вырезом 4×4 справа посередине (между y=4 и y=8, x=8..12).
    // Walk: (0,0)→(0,12)→(12,12)→(12,8)→(8,8)→(8,4)→(12,4)→(12,0)→замыкание.
    // Полосы 5 (x=8..10) и 6 (x=10..12) проходят сквозь вырез — каждая разбивается
    // polygon-clip на 2 видимые части (y=0..4 и y=8..12). Гарантирует anySplit=true.
    const walls: Wall[] = [
      { from: { col: 0, row: 0 }, to: { col: 0, row: 4 }, lengthMm: 12000 },
      { from: { col: 0, row: 4 }, to: { col: 4, row: 4 }, lengthMm: 12000 },
      { from: { col: 4, row: 4 }, to: { col: 4, row: 3 }, lengthMm: 4000 },
      { from: { col: 4, row: 3 }, to: { col: 3, row: 3 }, lengthMm: 4000 },
      { from: { col: 3, row: 3 }, to: { col: 3, row: 2 }, lengthMm: 4000 },
      { from: { col: 3, row: 2 }, to: { col: 4, row: 2 }, lengthMm: 4000 },
      { from: { col: 4, row: 2 }, to: { col: 4, row: 0 }, lengthMm: 4000 },
      { from: { col: 4, row: 0 }, to: { col: 0, row: 0 }, lengthMm: 12000 },
    ];
    const room: Room = {
      id: 'free-pi',
      name: 'П-комната',
      width: 12000,
      length: 12000,
      layout: 'free',
      shape: { walls },
    };
    const roll = createRoll(2, 15);
    const selection = selectMixed(room, [roll], 'optimal');
    if ('error' in selection) {
      throw new Error('selectMixed unexpectedly returned error for П fixture');
    }
    const text = formatSchemeDebugText({
      mode: 'optimal',
      modeTitle: 'Оптимальный режим',
      room,
      result: selection.result,
      catalog: [roll],
    });

    it('содержит секцию «Видимые сегменты»', () => {
      expect(text).toContain('Видимые сегменты после кройки по контуру');
    });
    it('содержит формат строки сегмента с отсылкой на исходный кусок', () => {
      expect(text).toMatch(/сегмент рулона #\d+ \(из куска \d+\)/);
    });
    it('число сегментов больше числа исходных кусков (минимум 2 split-куска × 2 части = +2)', () => {
      const segHeader = text.match(/Видимые сегменты после кройки по контуру \((\d+)\)/);
      expect(segHeader).not.toBeNull();
      const segCount = Number.parseInt(segHeader![1]!, 10);
      expect(segCount).toBeGreaterThan(selection.result.pieces.length);
    });
    it('в сводке «Кусков:» отображает физическое число с пометкой domain', () => {
      // Для П-формы с расщеплением полос: physical=8, domain=6.
      const physMatch = text.match(/Кусков: (\d+) \(domain: (\d+)\)/);
      expect(physMatch).not.toBeNull();
      const physical = Number.parseInt(physMatch![1]!, 10);
      const domain = Number.parseInt(physMatch![2]!, 10);
      expect(physical).toBeGreaterThan(domain);
      expect(domain).toBe(selection.result.pieces.length);
    });
  });

  describe('Прямоугольная комната — секция «Видимые сегменты» НЕ выводится', () => {
    // Для rect-режима polygon отсутствует, partition не применяется,
    // секция visible-segments не нужна (была бы 1:1 с обычным списком кусков).
    const room = createRoom('rect', 3, 5);
    const roll = createRoll(4, 30);
    const result = calculateEconomy(room, roll);
    const text = formatSchemeDebugText({
      mode: 'economy',
      modeTitle: 'Экономный режим',
      room,
      result,
      catalog: [roll],
    });

    it('не содержит «Видимые сегменты» для rect', () => {
      expect(text).not.toContain('Видимые сегменты');
    });
  });

  describe('Free-форма без выреза (квадрат) — секция «Видимые сегменты» НЕ выводится', () => {
    // Если все pieces полностью внутри polygon (нет разрезов), секция избыточна.
    const walls: Wall[] = [
      { from: { col: 0, row: 0 }, to: { col: 1, row: 0 }, lengthMm: 4000 },
      { from: { col: 1, row: 0 }, to: { col: 1, row: 1 }, lengthMm: 4000 },
      { from: { col: 1, row: 1 }, to: { col: 0, row: 1 }, lengthMm: 4000 },
      { from: { col: 0, row: 1 }, to: { col: 0, row: 0 }, lengthMm: 4000 },
    ];
    const room: Room = {
      id: 'free-sq',
      name: 'Квадрат',
      width: 4000,
      length: 4000,
      layout: 'free',
      shape: { walls },
    };
    const roll = createRoll(2, 20);
    const selection = selectMixed(room, [roll], 'economy');
    if ('error' in selection) {
      throw new Error('selectMixed unexpectedly returned error for square fixture');
    }
    const text = formatSchemeDebugText({
      mode: 'economy',
      modeTitle: 'Экономный режим',
      room,
      result: selection.result,
      catalog: [roll],
    });

    it('не содержит «Видимые сегменты» для квадрата (нет выреза)', () => {
      expect(text).not.toContain('Видимые сегменты');
    });
  });

  describe('Помечает piece как «обрезок» когда sourceX != 0 || sourceY != 0', () => {
    // Прямой unit-test форматирования: конструируем result с двумя piece —
    // первый из начала рулона (целый), второй из обрезка (sourceY > 0).
    const room = createRoom('cut', 2, 8);
    const roll = createRoll(2, 20);
    const piece1: Piece = {
      rollIndex: 0,
      rollTypeId: roll.id,
      sourceX: 0,
      sourceY: 0,
      width: 2000,
      length: 8000,
      placedAtX: 0,
      placedAtY: 0,
    };
    const piece2: Piece = {
      rollIndex: 0,
      rollTypeId: roll.id,
      sourceX: 0,
      sourceY: 8000, // вырезка не от начала → должна быть помечена «(обрезок)»
      width: 2000,
      length: 8000,
      placedAtX: 0,
      placedAtY: 0,
    };
    const result: CalculationResult = {
      mode: 'economy',
      roomId: room.id,
      rollTypeId: roll.id,
      rollsUsed: 1,
      seamCount: 1,
      pieces: [piece1, piece2],
      wasteAreaMm2: 16_000_000,
      warnings: [],
      feasible: true,
    };
    const text = formatSchemeDebugText({
      mode: 'economy',
      modeTitle: 'Экономный режим',
      room,
      result,
      catalog: [roll],
    });

    it('первый piece (sourceX=0,sourceY=0) — без метки «(обрезок)»', () => {
      // Извлекаем первую строку списка кусков.
      const line1 = text.split('\n').find((l) => l.trimStart().startsWith('1. рулон'));
      expect(line1).toBeDefined();
      expect(line1).not.toContain('(обрезок)');
    });
    it('второй piece (sourceY > 0) — с меткой «(обрезок)»', () => {
      const line2 = text.split('\n').find((l) => l.trimStart().startsWith('2. рулон'));
      expect(line2).toBeDefined();
      expect(line2).toContain('(обрезок)');
    });
  });
});
