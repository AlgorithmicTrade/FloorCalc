/**
 * Формирование человекочитаемого текстового снимка схемы расчёта.
 *
 * Используется для копирования в системный буфер обмена при клике пользователя
 * на пустую (фоновую) область схемы — чтобы быстро отправить разработчику
 * текстовое описание схемы вместо ручного описания / скриншота.
 *
 * Pure-функция: не имеет побочных эффектов, не зависит от React/DOM.
 * Все размеры читаем из integer mm (domain-convention) и форматируем через
 * `formatM` / `formatArea` (с 2 знаками — нагляднее для отладки, чем *Trim).
 */

import type {
  CalculationResult,
  Mode,
  Piece,
  RollType,
  Room,
  Wall,
} from '@/domain/types';
import { formatArea, formatM } from '@/domain/units';
import {
  buildShapePolygon,
  clipRectByOrthoPolygon,
  countVisibleSegments,
  polygonAreaMm2,
  wallDirection,
} from '@/domain/shape';

export interface SchemeDebugTextArgs {
  mode: Mode;
  /** Человекочитаемое название режима, например «Экономный режим». */
  modeTitle: string;
  /** Активное помещение (rect или free). */
  room: Room;
  /** Результат раскроя (содержит pieces, wasteAreaMm2, warnings). */
  result: CalculationResult;
  /** Полный каталог типоразмеров — нужен для корректных имён в сводке. */
  catalog: readonly RollType[];
}

/**
 * Возвращает стрелку направления стены (`→`, `←`, `↓`, `↑`) либо `?` если
 * стена не ортогональна. Используем символы Unicode: они компактны и читаются
 * в любом моноширинном шрифте.
 */
function wallArrow(wall: Wall): string {
  const dir = wallDirection(wall);
  if (dir === null) return '?';
  if (dir === 'horizontal') {
    return wall.to.col > wall.from.col ? '→' : '←';
  }
  return wall.to.row > wall.from.row ? '↓' : '↑';
}

/**
 * Человекочитаемое русское название направления — для подсказки в скобках
 * рядом со стрелкой.
 */
function wallDirectionLabel(wall: Wall): string {
  const dir = wallDirection(wall);
  if (dir === 'horizontal') return 'горизонтальная';
  if (dir === 'vertical') return 'вертикальная';
  return 'диагональная';
}

/**
 * Дополняет число пробелами слева до заданной ширины — для выравнивания
 * нумерации списка кусков (`  1.`, ` 10.`, `100.`).
 */
function padNum(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

/**
 * Формирует стабильный человекочитаемый «id типоразмера» для сводки.
 * Если у RollType id выглядит как `preset-2x20` — отрезаем префикс, иначе
 * возвращаем сам id. Это избавляет вывод от шумных префиксов, не теряя
 * уникальности (внутри сводки id используется лишь для подписи `(id: ...)`).
 */
function shortRollId(roll: RollType): string {
  const id = roll.id;
  if (id.startsWith('preset-')) return id.slice('preset-'.length);
  return id;
}

/**
 * Форматирует одну строку списка кусков:
 * `  1. рулон #1, 2.00×20.00 м, позиция (0.00, 0.00), размер 2.00 × 16.00 м`.
 *
 * `markCutoff` — true, если piece помечен как «обрезок» (вырезка не от начала
 * исходного рулона: sourceX != 0 || sourceY != 0). Используем именно этот
 * критерий — он устойчив к порядку перебора рулонов в bank.
 */
function formatPieceLine(
  index: number,
  piece: Piece,
  rollType: RollType | undefined,
  totalCount: number,
): string {
  const numberWidth = String(totalCount).length;
  const num = padNum(index + 1, numberWidth);
  const isCutoff = piece.sourceX !== 0 || piece.sourceY !== 0;
  const cutoffMark = isCutoff ? ' (обрезок)' : '';
  const rollDims = rollType
    ? `${formatM(rollType.width)} × ${formatM(rollType.length)}`
    : '— тип не найден';
  const pos = `(${formatM(piece.placedAtX)}, ${formatM(piece.placedAtY)})`;
  const size = `${formatM(piece.width)} × ${formatM(piece.length)}`;
  const rotated = piece.rotated ? ', повёрнут 90°' : '';
  return `${num}. рулон #${piece.rollIndex + 1}${cutoffMark}, ${rollDims}, позиция ${pos}, размер ${size}${rotated}`;
}

/**
 * Главная функция модуля: собирает многострочный текст-снимок схемы расчёта.
 *
 * Структура вывода (см. JSDoc на спецификации фичи):
 *  1. Заголовок с названием режима.
 *  2. Описание помещения (rect или free со списком стен и площадью полигона).
 *  3. Сводка (рулонов / кусков / швов / обрезки рулона / отрезано формой).
 *  4. Сводка использованных типоразмеров (id + габариты + кол-во кусков).
 *  5. Подробный список кусков с координатами и габаритами.
 *  6. Опциональная секция предупреждений (если warnings.length > 0).
 */
export function formatSchemeDebugText(args: SchemeDebugTextArgs): string {
  const { mode, modeTitle, room, result, catalog } = args;

  const lines: string[] = [];

  // ── Заголовок ──────────────────────────────────────────────────────────
  // Дублируем technical Mode в скобках — для разработчика, кому передаётся
  // дамп: он видит и человекочитаемое название, и enum-значение.
  lines.push(`=== Схема расчёта (${modeTitle}, mode=${mode}) ===`);

  // ── Описание помещения ─────────────────────────────────────────────────
  const isFree = room.layout === 'free' && room.shape !== undefined;
  const bboxDims = `${formatM(room.width)} × ${formatM(room.length)}`;
  if (isFree) {
    lines.push(`Помещение: «${room.name}», bbox ${bboxDims} (свободная форма)`);
    const walls = room.shape!.walls;
    lines.push(`  Контур (${walls.length} стен):`);
    walls.forEach((wall, i) => {
      const arrow = wallArrow(wall);
      const label = wallDirectionLabel(wall);
      const len = formatM(wall.lengthMm ?? 0);
      lines.push(`    ${i + 1}. ${arrow} ${len} (${label})`);
    });
    // Площадь полигона — реальная площадь помещения (без bbox-«пустот»).
    // Если shape некорректен (validateShape != complete) — buildShapePolygon
    // вернёт null; в этом случае секцию «Площадь полигона» опускаем.
    const polygon = buildShapePolygon(room.shape!);
    if (polygon !== null) {
      const areaMm2 = polygonAreaMm2(polygon.vertices);
      lines.push(`  Площадь полигона: ${formatArea(areaMm2)}`);
    }
  } else {
    lines.push(`Помещение: «${room.name}», ${bboxDims} (прямоугольник)`);
  }
  lines.push('');

  // ── Сводка ─────────────────────────────────────────────────────────────
  // «Кусков» — физическое число (после polygon-clip для свободной формы).
  // Для rect / простых free без разрезов оно === pieces.length. Если число
  // отличается от domain — указываем обоих в скобках для отладки.
  const isFreeWithPolygon = isFree && buildShapePolygon(room.shape!);
  const physicalCount = isFreeWithPolygon
    ? countVisibleSegments(result.pieces, isFreeWithPolygon.vertices)
    : result.pieces.length;
  const piecesLine = physicalCount === result.pieces.length
    ? `  Кусков: ${physicalCount}`
    : `  Кусков: ${physicalCount} (domain: ${result.pieces.length})`;
  lines.push('Сводка:');
  lines.push(`  Рулонов: ${result.rollsUsed}`);
  lines.push(piecesLine);
  lines.push(`  Швов: ${result.seamCount}`);
  lines.push(`  Обрезки рулона: ${formatArea(result.wasteAreaMm2)}`);
  // Для free-формы дополнительно показываем «отрезано формой» — площадь bbox
  // минус площадь полигона (то, что попадает в waste из-за clip по форме).
  if (isFree) {
    const polygon = buildShapePolygon(room.shape!);
    if (polygon !== null) {
      const polyArea = polygonAreaMm2(polygon.vertices);
      const bboxArea = room.width * room.length;
      const cutByShape = bboxArea - polyArea;
      if (cutByShape > 0) {
        lines.push(`  Отрезано формой: ${formatArea(cutByShape)}`);
      }
    }
  }
  lines.push('');

  // ── Сводка типоразмеров ────────────────────────────────────────────────
  // Группируем pieces по rollTypeId — показываем сколько кусков из какого типа.
  const rollById = new Map<string, RollType>();
  for (const r of catalog) rollById.set(r.id, r);
  const piecesByType = new Map<string, number>();
  for (const p of result.pieces) {
    piecesByType.set(p.rollTypeId, (piecesByType.get(p.rollTypeId) ?? 0) + 1);
  }
  // Стабильный порядок: по первому вхождению в pieces (как пользователь видит
  // на схеме слева-направо).
  const orderedTypeIds: string[] = [];
  for (const p of result.pieces) {
    if (!orderedTypeIds.includes(p.rollTypeId)) orderedTypeIds.push(p.rollTypeId);
  }
  lines.push(`Типы рулонов (${orderedTypeIds.length}):`);
  for (const typeId of orderedTypeIds) {
    const roll = rollById.get(typeId);
    const count = piecesByType.get(typeId) ?? 0;
    if (roll) {
      const dims = `${formatM(roll.width)} × ${formatM(roll.length)}`;
      lines.push(`  - ${dims} (id: ${shortRollId(roll)}) — ${count} шт.`);
    } else {
      // Тип, отсутствующий в каталоге (например, удалён после расчёта) —
      // показываем сам id, чтобы пользователь мог сопоставить.
      lines.push(`  - id: ${typeId} (нет в каталоге) — ${count} шт.`);
    }
  }
  lines.push('');

  // ── Список кусков ──────────────────────────────────────────────────────
  lines.push(
    `Куски (${result.pieces.length}) — placedAtX, placedAtY в метрах от верх-лев:`,
  );
  result.pieces.forEach((piece, i) => {
    const roll = rollById.get(piece.rollTypeId);
    lines.push('  ' + formatPieceLine(i, piece, roll, result.pieces.length));
  });

  // ── Видимые сегменты после кройки по контуру (только для free-формы) ───
  // Для свободной планировки physically-cut сегменты полигоном МОГУТ отличаться
  // от bbox-кусков калькулятора: один piece, проходящий через вырез формы,
  // монтажник режет на несколько ortho-rectangles. Эта секция даёт монтажнику
  // прямой план физической нарезки.
  // Не выводим, если ни один piece не разбивается (полностью внутри полигона).
  if (isFree) {
    const polygon = buildShapePolygon(room.shape!);
    if (polygon !== null) {
      type VisiblePart = {
        sourcePieceIndex: number;
        rollIndex: number;
        x: number;
        y: number;
        width: number;
        length: number;
      };
      const visibleParts: VisiblePart[] = [];
      let anySplit = false;
      result.pieces.forEach((piece, i) => {
        const parts = clipRectByOrthoPolygon(
          {
            x: piece.placedAtX,
            y: piece.placedAtY,
            width: piece.width,
            height: piece.length,
          },
          polygon.vertices,
        );
        if (parts.length !== 1) anySplit = true;
        for (const part of parts) {
          visibleParts.push({
            sourcePieceIndex: i,
            rollIndex: piece.rollIndex,
            x: part.x,
            y: part.y,
            width: part.width,
            length: part.height,
          });
        }
      });

      if (anySplit && visibleParts.length > 0) {
        lines.push('');
        lines.push(
          `Видимые сегменты после кройки по контуру (${visibleParts.length}) — что физически уляжется в комнате:`,
        );
        const numberWidth = String(visibleParts.length).length;
        visibleParts.forEach((part, i) => {
          const num = padNum(i + 1, numberWidth);
          const fromPiece = part.sourcePieceIndex + 1;
          const pos = `(${formatM(part.x)}, ${formatM(part.y)})`;
          const size = `${formatM(part.width)} × ${formatM(part.length)}`;
          lines.push(
            `  ${num}. сегмент рулона #${part.rollIndex + 1} (из куска ${fromPiece}), позиция ${pos}, размер ${size}`,
          );
        });
      }
    }
  }

  // ── Предупреждения (опционально) ───────────────────────────────────────
  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Предупреждения:');
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  return lines.join('\n');
}
