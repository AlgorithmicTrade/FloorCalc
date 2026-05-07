/**
 * Mixed-type расчёт — укладка с несколькими типоразмерами рулонов.
 *
 * Алгоритм (greedy-эвристика, не глобальный ILP):
 *  1. Делим помещение на полосы шириной ≤ max(roll.width) по planStrips.
 *  2. Для каждой полосы накапливаем длину частями:
 *     a. Решение «банк или новый рулон» зависит от mode:
 *        - economy: всегда сначала ищем в банке (width >= stripWidth, length >= 1),
 *          потом новый рулон — агрессивное переиспользование обрезков.
 *        - optimal: начало полосы (placedAtY=0) — всегда новый рулон (цель: 0 швов в полосе);
 *          продолжение полосы (placedAtY>0) — банк только если есть offcut с length >= needLength
 *          (закроет остаток одним куском без лишнего реза), иначе новый рулон.
 *     b. При открытии нового рулона выбираем лучший тип:
 *        - economy: наименьший sufficient.length (минимум хвостового waste),
 *          при равенстве — наименьший width.
 *        - optimal: наибольший sufficient.length (длинный tail → покроет следующую полосу
 *          целиком без поперечного шва), при равенстве — наибольший width.
 *        Среди недостаточных в обоих режимах — наибольший length.
 *     c. После открытия нового рулона — добавляем боковой и хвостовой обрезки в банк.
 *  3. Итого: pieces[].rollTypeId могут различаться между полосами / частями.
 *
 * Greedy heuristic: не гарантирует глобального оптимума.
 * Для точного решения — ILP (планируется в будущем).
 *
 * rollTypeId результата = тип, занимающий наибольшую площадь в pieces.
 */

import type { CalculationResult, Mode, Piece, RollType, Room } from '../types';
import { OffcutBank } from './bank';
import { computeSeamCount } from './seams';
import { planStrips } from './strip';

export function calculateMixed(
  room: Room,
  activeRolls: readonly RollType[],
  mode: Mode
): CalculationResult {
  // === Граничный случай: нет активных рулонов ===
  if (activeRolls.length === 0) {
    return {
      mode,
      roomId: room.id,
      rollTypeId: '',
      rollsUsed: 0,
      seamCount: 0,
      pieces: [],
      wasteAreaMm2: 0,
      warnings: ['Нет активных рулонов'],
      feasible: false
    };
  }

  // === Граничный случай: помещение не задано ===
  if (room.width <= 0 || room.length <= 0) {
    return {
      mode,
      roomId: room.id,
      rollTypeId: activeRolls[0]!.id,
      rollsUsed: 0,
      seamCount: 0,
      pieces: [],
      wasteAreaMm2: 0,
      warnings: ['Помещение не задано'],
      feasible: false
    };
  }

  const maxRollWidth = Math.max(...activeRolls.map((r) => r.width));

  // Нет guard для room.width > maxRollWidth: planStrips разбивает помещение на полосы,
  // каждая шириной ≤ maxRollWidth — несколько полос всегда покрывают всё по ширине.
  // Невозможный случай — только если ни один рулон не достаточно широк ни для одной полосы.
  // Это отловится внутри цикла через chooseBestRoll → null → break + warning.

  const warnings: string[] = [];

  // Предупреждение если хотя бы для одной полосы может потребоваться добор по длине.
  const maxRollLength = Math.max(...activeRolls.map((r) => r.length));
  if (room.length > maxRollLength) {
    warnings.push('Помещение длиннее самого длинного активного рулона — потребуются поперечные доборы');
  }

  // rollIndexToType: глобальный индекс рулона → тип рулона.
  const rollIndexToType = new Map<number, RollType>();

  const bank = new OffcutBank();
  const pieces: Piece[] = [];
  let rollsUsed = 0;

  // Используем maxRollWidth для генерации полос — самый широкий рулон задаёт шаг.
  const strips = planStrips(room.width, room.length, maxRollWidth);

  for (const strip of strips) {
    let placedAtY = 0;
    let needLength = strip.needLength;

    while (needLength > 0) {
      // 1. Решаем: использовать банк или открыть новый рулон.
      //    economy: всегда сначала банк (агрессивное переиспользование обрезков).
      //    optimal: начало полосы → всегда новый рулон (цель — 0 поперечных швов);
      //             продолжение → банк только если offcut покрывает весь остаток.
      let offcut = null;
      if (mode === 'economy') {
        offcut = bank.findBestFor(strip.stripWidth, 1);
      } else {
        // optimal: банк только при продолжении полосы и только если хватает длины
        if (placedAtY > 0) {
          offcut = bank.findBestFor(strip.stripWidth, needLength);
        }
      }

      if (offcut !== null) {
        const useLen = Math.min(offcut.length, needLength);

        // Восстанавливаем тип рулона из rollIndexToType.
        const sourceRoll = rollIndexToType.get(offcut.rollIndex);
        const rollTypeId = sourceRoll?.id ?? activeRolls[0]!.id;

        pieces.push({
          rollIndex: offcut.rollIndex,
          rollTypeId,
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
        // 2. Открываем новый рулон — выбираем лучший тип эвристикой.
        const chosen = chooseBestRoll(activeRolls, strip.stripWidth, needLength, mode);
        if (chosen === null) {
          // Ни один рулон не подходит по ширине (не должно случиться после проверки выше,
          // но защита на случай рассинхронизации).
          warnings.push(`Нет рулона шириной ≥ ${strip.stripWidth} мм`);
          break;
        }

        const rollIndex = rollsUsed;
        rollsUsed++;
        rollIndexToType.set(rollIndex, chosen);

        const useLen = Math.min(chosen.length, needLength);

        pieces.push({
          rollIndex,
          rollTypeId: chosen.id,
          sourceX: 0,
          sourceY: 0,
          width: strip.stripWidth,
          length: useLen,
          placedAtX: strip.cursorX,
          placedAtY
        });

        // Боковой обрезок (если рулон шире полосы).
        if (strip.stripWidth < chosen.width) {
          bank.add({
            rollIndex,
            sourceX: strip.stripWidth,
            sourceY: 0,
            width: chosen.width - strip.stripWidth,
            length: useLen
          });
        }
        // Хвостовой обрезок (если рулон длиннее использованного).
        if (useLen < chosen.length) {
          bank.add({
            rollIndex,
            sourceX: 0,
            sourceY: useLen,
            width: chosen.width,
            length: chosen.length - useLen
          });
        }

        placedAtY += useLen;
        needLength -= useLen;
      }
    }
  }

  // === Rotation post-pass ===
  // После основного greedy-прохода пытаемся заменить «хвостовой ряд» — группу мелких
  // замыкающих кусков в конце каждой полосы — одним повёрнутым куском из банка.
  // Применяется в обоих режимах: алгоритм сам через lexLess выберет лучший вариант
  // при сравнении ориентаций в calculateMixedBestOrientation.
  applyRotationPass(pieces, bank, room, rollIndexToType);

  // === Compact rollIndex после rotation pass ===
  // Rotation pass может удалить ВСЕ pieces от какого-то rollIndex (например,
  // когда вспомогательный рулон, открытый под мелкий хвост, после замены rotated
  // куском из другого рулона остаётся без единой piece). Такой "phantom" rollIndex
  // фактически не использован — нужно пересчитать rollsUsed и remap'нуть индексы
  // в pieces, чтобы:
  //   1) summary "Рулонов: N" соответствовал детализации по типам;
  //   2) подписи кусков (rollIndex+1) не пропускали номер;
  //   3) wasteAreaMm2 не учитывал материал отсутствующих в раскладке рулонов.
  rollsUsed = compactRollIndices(pieces, rollsUsed, bank, rollIndexToType);

  // === Feasibility ===
  let coveredArea = 0;
  for (const p of pieces) coveredArea += p.width * p.length;
  const roomArea = room.width * room.length;
  const feasible = coveredArea === roomArea;

  const seamCount = computeSeamCount(pieces, room);
  const wasteAreaMm2 = bank.totalArea();

  // Определяем primary rollTypeId — тип, занимающий наибольшую площадь.
  const rollTypeId = pickPrimaryRollTypeId(pieces, activeRolls);

  return {
    mode,
    roomId: room.id,
    rollTypeId,
    rollsUsed,
    seamCount,
    pieces,
    wasteAreaMm2,
    warnings,
    feasible
  };
}

/**
 * Rotation post-pass: после основного greedy-прохода пытается заменить хвостовой ряд
 * (группу мелких замыкающих кусков — по одному на каждую полосу) одним повёрнутым
 * куском из банка обрезков.
 *
 * Алгоритм:
 *  1. Для каждой полосы (уникальный placedAtX) найти «хвостовой» кусок —
 *     тот, у кого `placedAtY + length === room.length` AND `placedAtY > 0`.
 *     Условие placedAtY > 0 исключает случай, когда вся полоса покрыта одним куском.
 *  2. Убедиться, что у КАЖДОЙ полосы есть ровно один такой хвостовой кусок
 *     (иначе геометрия tail-row неоднородна — упрощённый случай не применяется).
 *  3. Все хвостовые куски должны начинаться с одного и того же `cutY = placedAtY`,
 *     тогда tail-row однороден по ширине и равен `room.width × tailHeight`.
 *  4. В банке ищем rotated offcut: `width >= tailHeight AND length >= room.width`.
 *     Для повёрнутого куска ширина offcut'а покрывает tailHeight, длина — room.width.
 *  5. Если находим — удаляем все хвостовые pieces, возвращаем их обрезки в банк
 *     (как tail-offcuts по геометрии источника), consume rotated offcut, добавляем
 *     один rotated Piece.
 *
 * Условие применения: упрощённый частный случай (прагматика).
 * Не применяется если: нет tail-pieces, неоднородный cutY, банк не имеет подходящего offcut.
 */
function applyRotationPass(
  pieces: Piece[],
  bank: OffcutBank,
  room: Room,
  rollIndexToType: Map<number, RollType>
): void {
  // Шаг 1: собираем уникальные полосы (по placedAtX).
  const stripXs = [...new Set(pieces.map((p) => p.placedAtX))];
  if (stripXs.length === 0) return;

  // Для каждой полосы ищем хвостовой кусок: тот, у которого
  //   placedAtY > 0  AND  placedAtY + length === room.length
  // (замыкает полосу сверху, но не единственный в ней).
  const tailPieces: Piece[] = [];
  for (const sx of stripXs) {
    const inStrip = pieces.filter((p) => p.placedAtX === sx);
    const tailCandidates = inStrip.filter(
      (p) => p.placedAtY > 0 && p.placedAtY + p.length === room.length
    );
    // Ровно один хвостовой кусок на полосу — упрощённый случай.
    if (tailCandidates.length !== 1) return;
    tailPieces.push(tailCandidates[0]!);
  }

  // Шаг 3: все хвостовые куски должны начинаться с одного cutY.
  const cutY = tailPieces[0]!.placedAtY;
  if (!tailPieces.every((p) => p.placedAtY === cutY)) return;

  const tailHeight = room.length - cutY; // высота tail-row по оси Y

  // Шаг 4: ищем в банке rotated offcut.
  // Для повёрнутого куска: offcut.width >= tailHeight AND offcut.length >= room.width.
  const rotatedOffcut = bank.findBestFor(tailHeight, room.width);
  if (rotatedOffcut === null) return;

  // Шаг 5: применяем замену.

  // 5a. Удаляем хвостовые pieces и возвращаем их площадь в банк как offcut'ы.
  //     Каждый tail-piece возникал из offcut'а или нового рулона — его «остаток»
  //     (то, что уходило бы в tail) уже лежит в банке. Здесь мы просто убираем
  //     сами pieces из результата; waste-учёт через bank.totalArea() останется
  //     корректным, т.к. мы добавим consumed-остаток от rotatedOffcut ниже.
  //
  //     Замечание: tail-pieces сами занимали площадь в комнате; после их удаления
  //     они превращаются в «неиспользованный» материал — возвращаем в банк как offcut.
  for (const tp of tailPieces) {
    // Восстанавливаем геометрию в координатах рулона.
    // Tail-piece был взят из offcut или из нового рулона без вращения (rotated=false):
    //   sourceX, sourceY уже корректны; width×length — размер в исходном рулоне.
    bank.add({
      rollIndex: tp.rollIndex,
      sourceX: tp.sourceX,
      sourceY: tp.sourceY,
      width: tp.width,
      length: tp.length
    });
    // Удаляем piece из массива.
    const idx = pieces.indexOf(tp);
    if (idx !== -1) pieces.splice(idx, 1);
  }

  // 5b. Consume rotated offcut из банка.
  //     Повёрнутый кусок занимает в offcut'е: usedWidth=tailHeight, usedLength=room.width.
  bank.consume(rotatedOffcut, tailHeight, room.width);

  // 5c. Добавляем один rotated Piece, покрывающий весь tail-row.
  const sourceRoll = rollIndexToType.get(rotatedOffcut.rollIndex);
  const rollTypeId = sourceRoll?.id ?? '';
  pieces.push({
    rollIndex: rotatedOffcut.rollIndex,
    rollTypeId,
    sourceX: rotatedOffcut.sourceX,
    sourceY: rotatedOffcut.sourceY,
    width: room.width,
    length: tailHeight,
    placedAtX: 0,
    placedAtY: cutY,
    rotated: true
  });
}

/**
 * Compaction после rotation post-pass.
 *
 * Если rotation pass удалил все pieces, ссылавшиеся на какой-то rollIndex,
 * этот рулон фактически не использован — но `rollsUsed` всё ещё его учитывает
 * (счётчик увеличивался при открытии). Чтобы summary "Рулонов: N" соответствовал
 * детализации по типам и подписи кусков (`rollIndex+1`) шли подряд:
 *  1. Собираем уникальные rollIndex из текущих pieces.
 *  2. Если их меньше rollsUsed — строим map старых → новых индексов 0..N-1.
 *  3. Применяем map к pieces (через мутацию rollIndex).
 *  4. Применяем map к bank — обрезки phantom-рулонов удаляются.
 *  5. Применяем map к rollIndexToType — на случай дальнейших проходов.
 *
 * @returns новый rollsUsed (= число уникальных rollIndex в pieces).
 */
function compactRollIndices(
  pieces: Piece[],
  rollsUsed: number,
  bank: OffcutBank,
  rollIndexToType: Map<number, RollType>
): number {
  const usedRollIndices = new Set<number>();
  for (const p of pieces) usedRollIndices.add(p.rollIndex);
  if (usedRollIndices.size === rollsUsed) return rollsUsed;

  const sortedIndices = [...usedRollIndices].sort((a, b) => a - b);
  const indexMap = new Map<number, number>();
  sortedIndices.forEach((oldIdx, newIdx) => indexMap.set(oldIdx, newIdx));

  for (const p of pieces) {
    p.rollIndex = indexMap.get(p.rollIndex)!;
  }

  bank.remapAndFilterRollIndices(indexMap);

  const remappedTypes = new Map<number, RollType>();
  for (const [oldIdx, type] of rollIndexToType) {
    const newIdx = indexMap.get(oldIdx);
    if (newIdx !== undefined) remappedTypes.set(newIdx, type);
  }
  rollIndexToType.clear();
  for (const [k, v] of remappedTypes) rollIndexToType.set(k, v);

  return usedRollIndices.size;
}

/**
 * Эвристический выбор лучшего рулона для нового открытия в полосе.
 *
 * Из активных рулонов фильтруем те, у кого width >= stripWidth, затем делим
 * на «достаточные» (length >= needLength) и «недостаточные» (length < needLength).
 *
 * economy:
 *  - Достаточные: наименьший length (минимум хвостового waste),
 *    при равенстве — наименьший width (минимум бокового waste).
 *  - Недостаточные: наибольший length (максимум покрытия за одно открытие),
 *    при равенстве — наименьший width.
 *
 * optimal:
 *  - Достаточные: наибольший length (длинный хвост → покроет следующую полосу
 *    целиком без поперечного шва), при равенстве — наибольший width.
 *  - Недостаточные: наибольший length, при равенстве — наибольший width.
 *
 * Greedy heuristic: not globally optimal; для точного решения нужен ILP.
 */
function chooseBestRoll(
  activeRolls: readonly RollType[],
  stripWidth: number,
  needLength: number,
  mode: Mode
): RollType | null {
  const candidates = activeRolls.filter((r) => r.width >= stripWidth);
  if (candidates.length === 0) return null;

  // Разделяем на «достаточные по длине» и «недостаточные».
  const sufficient = candidates.filter((r) => r.length >= needLength);
  const insufficient = candidates.filter((r) => r.length < needLength);

  if (mode === 'economy') {
    if (sufficient.length > 0) {
      // Economy: наименьший sufficient.length (минимум хвостового waste),
      // при равенстве — наименьший width (минимум бокового waste).
      return sufficient.reduce((best, cur) => {
        if (cur.length < best.length) return cur;
        if (cur.length === best.length && cur.width < best.width) return cur;
        return best;
      });
    }
    // Недостаточные: наибольший length, при равенстве — наименьший width.
    return insufficient.reduce((best, cur) => {
      if (cur.length > best.length) return cur;
      if (cur.length === best.length && cur.width < best.width) return cur;
      return best;
    });
  }

  // optimal: наибольший sufficient.length (длинный tail → покроет следующую полосу
  // одним куском без поперечного шва), при равенстве — наибольший width.
  if (sufficient.length > 0) {
    return sufficient.reduce((best, cur) => {
      if (cur.length > best.length) return cur;
      if (cur.length === best.length && cur.width > best.width) return cur;
      return best;
    });
  }
  // Недостаточные: наибольший length, при равенстве — наибольший width.
  return insufficient.reduce((best, cur) => {
    if (cur.length > best.length) return cur;
    if (cur.length === best.length && cur.width > best.width) return cur;
    return best;
  });
}

/**
 * Рассчитывает укладку в обеих ориентациях комнаты и обоих алгоритмах
 * (economy + optimal), возвращает лучший результат по lex-ключу запрошенного
 * режима.
 *
 * «Исходная» ориентация: рулон кладётся длиной вдоль room.length (конвенция).
 * «Свапнутая» ориентация: room.width и room.length меняются местами, затем
 * pieces транспонируются обратно в исходную систему координат комнаты.
 *
 * Кросс-алгоритмическое сравнение: для каждого пользовательского режима
 * рассматриваются результаты ОБОИХ внутренних алгоритмов. Например, если
 * optimal-алгоритм после rotation post-pass даёт меньше рулонов, чем
 * economy-алгоритм, то economy-режим UI должен показать optimal-раскладку
 * (по lex-ключу `(rollsUsed, seamCount, wasteAreaMm2)` он лучше).
 *
 * Lex-ключи (меньше — лучше):
 *  - economy → (rollsUsed, seamCount, wasteAreaMm2)
 *  - optimal → (seamCount, rollsUsed, wasteAreaMm2)
 */
export function calculateMixedBestOrientation(
  room: Room,
  activeRolls: readonly RollType[],
  mode: Mode
): CalculationResult {
  const candidates: CalculationResult[] = [];

  // Исходная ориентация × оба алгоритма.
  candidates.push(calculateMixed(room, activeRolls, 'economy'));
  candidates.push(calculateMixed(room, activeRolls, 'optimal'));

  // Свапнутая ориентация — только если комната не квадратная.
  if (room.width !== room.length) {
    const swappedRoom: Room = { ...room, width: room.length, length: room.width };
    for (const m of ['economy', 'optimal'] as const) {
      const swappedRaw = calculateMixed(swappedRoom, activeRolls, m);
      // Транспонируем pieces обратно в исходную систему координат:
      //   в swappedRoom: placedAtX — вдоль room.length (исх.), placedAtY — вдоль room.width (исх.).
      //   swap: placedAtX ↔ placedAtY, width ↔ length, sourceX ↔ sourceY.
      const swappedPieces = swappedRaw.pieces.map((p) => ({
        ...p,
        placedAtX: p.placedAtY,
        placedAtY: p.placedAtX,
        width: p.length,
        length: p.width,
        sourceX: p.sourceY,
        sourceY: p.sourceX,
      }));
      candidates.push({ ...swappedRaw, pieces: swappedPieces });
    }
  }

  const keyOf = (r: CalculationResult): readonly [number, number, number] =>
    mode === 'economy'
      ? [r.rollsUsed, r.seamCount, r.wasteAreaMm2]
      : [r.seamCount, r.rollsUsed, r.wasteAreaMm2];

  let best = candidates[0]!;
  let bestKey = keyOf(best);
  for (let i = 1; i < candidates.length; i++) {
    const cand = candidates[i]!;
    const key = keyOf(cand);
    if (lexLess(key, bestKey)) {
      best = cand;
      bestKey = key;
    }
  }

  // mode в результате должен соответствовать запрошенному режиму UI,
  // даже если выбранный кандидат был посчитан другим алгоритмом.
  return best.mode === mode ? best : { ...best, mode };
}

/**
 * Лексикографическое сравнение тройки чисел (меньше = лучше).
 */
function lexLess(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

/**
 * Определяет «primary» rollTypeId — тот тип рулона, куски которого суммарно
 * покрывают наибольшую площадь. Если pieces пустой — возвращает первый активный.
 */
export function pickPrimaryRollTypeId(pieces: Piece[], activeRolls: readonly RollType[]): string {
  if (pieces.length === 0) return activeRolls[0]?.id ?? '';

  const areaByType = new Map<string, number>();
  for (const p of pieces) {
    const prev = areaByType.get(p.rollTypeId) ?? 0;
    areaByType.set(p.rollTypeId, prev + p.width * p.length);
  }

  let primaryId = '';
  let maxArea = -1;
  for (const [id, area] of areaByType) {
    if (area > maxArea) {
      maxArea = area;
      primaryId = id;
    }
  }
  return primaryId;
}
