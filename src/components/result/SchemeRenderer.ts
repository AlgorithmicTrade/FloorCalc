/**
 * Pure-функция рендеринга схемы: преобразует CalculationResult в массив
 * нод (`SchemeNode[]`) для последующей отрисовки в Konva.
 *
 * Координатная система Konva — пикселы, top-left origin. Помещение
 * масштабируется через единый `scale = min(stageInnerW/room.width, stageInnerH/room.length)`,
 * чтобы сохранить пропорции и поместиться целиком в сцену с margin для подписей.
 *
 * Палитра scheme-roll-* живёт в tokens.css как CSS-переменные, но Konva
 * читает только литеральные строки — поэтому palette продублирована тут.
 *
 * Под схемой — две строки статистики:
 *  1) общая: rollsUsed · seamCount · wasteAreaMm2;
 *  2) детальная: «WxL — N шт.» по каждому типоразмеру использованных рулонов.
 * Обе строки попадают в PNG/PDF/print экспорт. Warnings выводятся в HTML-tooltip
 * рядом с заголовком режима (см. ResultCard) — в схеме их нет.
 *
 * Размеры самих кусков не отображаются как подписи на схеме (по UX-решению):
 * визуально показывается только номер рулона. Детальные размеры доступны в
 * HTML-tooltip при hover (см. SchemeView.computeTooltipLines).
 */

import type { CalculationResult, Room, RollType } from '@/domain/types';
import { formatMTrim, formatAreaTrim } from '@/domain/units';
import {
  buildShapePolygon,
  polygonAreaMm2,
  clipRectByOrthoPolygon,
  countVisibleSegments,
} from '@/domain/shape';

export type SchemeNode =
  | { kind: 'roomFrame'; x: number; y: number; width: number; height: number }
  | {
      /** Контур свободной планировки — замкнутый ортогональный полигон в SVG-координатах. */
      kind: 'roomPolygon';
      points: readonly { x: number; y: number }[];
    }
  | {
      kind: 'piece';
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      rollIndex: number;
      /** Уникальный идентификатор куска — используется для группировки в SchemeView.
       *  При polygon-aware split (free-режим) каждый visible-part получает свой
       *  pieceId с суффиксом `-part-N`, чтобы Konva-группы и tooltip’ы могли
       *  обрабатывать каждую видимую часть независимо. */
      pieceId: string;
      /** Если задано — клипать piece по этому polygon (SVG-координаты).
       *  В free-режиме после polygon-aware partition НЕ передаётся — каждая
       *  видимая часть уже представлена отдельным rect внутри polygon. Поле
       *  оставлено для возможных fallback-сценариев. */
      clipPolygon?: readonly { x: number; y: number }[];
      /** ID исходного куска до polygon-aware split (без `-part-N`). Используется
       *  в SchemeView для агрегаций по физическому куску (suммы, leftover). */
      partOfPieceId?: string;
      /** Размер видимой части в mm (real, не SVG-pixels). Используется в tooltip
       *  для показа фактической геометрии видимой части piece. */
      partRealMm?: { width: number; length: number };
    }
  | { kind: 'roomLabel'; x: number; y: number; text: string; fontSize: number }
  | {
      kind: 'pieceLabel';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
      /** Идентификатор куска, к которому относится подпись. */
      pieceId: string;
    }
  | {
      kind: 'statsRow';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
      bold: boolean;
    }
  | {
      /** Цветной квадратик типоразмера во второй строке статистики. */
      kind: 'statsItemSwatch';
      x: number;
      y: number;
      size: number;
      fill: string;
    }
  | {
      /** Текст ячейки типоразмера во второй строке статистики. */
      kind: 'statsItemText';
      x: number;
      y: number;
      /** Высота bounding-box текста — нужна для verticalAlign:'middle' в Konva. */
      height: number;
      text: string;
      fontSize: number;
    };

export interface SchemeLayout {
  stageWidth: number;
  stageHeight: number;
  nodes: SchemeNode[];
}

/** Палитра — синхронизирована с `--scheme-roll-1..6` в tokens.css. */
export const SCHEME_PALETTE = [
  '#14c6cb',
  '#ffcf25',
  '#7b42bc',
  '#00ca8e',
  '#f24c53',
  '#1868f2',
] as const;

/** Цвет типоразмера рулона по его позиции в КАТАЛОГЕ (стабилен между расчётами). */
function getRollTypeColor(
  rollId: string,
  catalog: ReadonlyArray<{ id: string }>
): string {
  const idx = catalog.findIndex((r) => r.id === rollId);
  const safe = idx >= 0 ? idx : 0;
  return SCHEME_PALETTE[safe % SCHEME_PALETTE.length] ?? SCHEME_PALETTE[0]!;
}

/** Адаптивный отступ: на узких канвасах (< 480px) уменьшаем margin до 20px,
 *  чтобы больше площади отдать под схему. */
function getMargin(stageWidth: number): number {
  return stageWidth < 480 ? 20 : 40;
}

/** Размер шрифта roomLabel зависит от margin: при 20px нужен более мелкий шрифт,
 *  чтобы подпись умещалась в отступе. */
function getRoomLabelFontSize(stageWidth: number): number {
  return stageWidth < 480 ? 11 : 12;
}

const STATS_LINE_HEIGHT = 22;  // высота одной строки статистики
const STATS_LINES = 2;         // 2 строки: общая + детальная по типам
const STATS_BLOCK_HEIGHT = STATS_LINE_HEIGHT * STATS_LINES;
const DEFAULT_W = 800;
const DEFAULT_H = 600;

export function renderScheme(
  result: CalculationResult,
  room: Room,
  roll: RollType,
  catalog: readonly RollType[],
  stageWidth: number = DEFAULT_W,
  stageHeight: number = DEFAULT_H,
): SchemeLayout {
  const nodes: SchemeNode[] = [];

  // Защита от дегенеративных входов: если помещение не задано,
  // возвращаем только пустой stage без нод (UI обернёт в EmptyState).
  if (room.width <= 0 || room.length <= 0) {
    return { stageWidth, stageHeight, nodes };
  }

  const MARGIN = getMargin(stageWidth);

  // Зона схемы — весь stage за вычетом нижнего блока статистики.
  const schemeZoneH = stageHeight - STATS_BLOCK_HEIGHT;
  const innerW = stageWidth - MARGIN * 2;
  const innerH = schemeZoneH - MARGIN * 2;

  // Mapping: room.width → ось X сцены, room.length → ось Y сцены.
  const scale = Math.min(innerW / room.width, innerH / room.length);

  const roomPxW = room.width * scale;
  const roomPxH = room.length * scale;

  // Центрируем помещение в inner-области зоны схемы.
  const offsetX = MARGIN + (innerW - roomPxW) / 2;
  const offsetY = MARGIN + (innerH - roomPxH) / 2;

  // Свободная планировка: вычисляем polygon в SVG-координатах для клипа кусков
  // и отрисовки контура. Если shape невалиден — возвращаемся к bbox-фрейму.
  const realPolygon = room.layout === 'free' && room.shape ? buildShapePolygon(room.shape) : null;
  const svgPolygon: readonly { x: number; y: number }[] | null = realPolygon
    ? realPolygon.vertices.map((v) => ({
        x: offsetX + v.x * scale,
        y: offsetY + v.y * scale,
      }))
    : null;

  if (svgPolygon) {
    // Контур-полигон — фон под куски (заливка + обводка).
    nodes.push({
      kind: 'roomPolygon',
      points: svgPolygon,
    });
  } else {
    // Прямоугольный frame — сначала, чтобы куски рисовались поверх и видны границы.
    nodes.push({
      kind: 'roomFrame',
      x: offsetX,
      y: offsetY,
      width: roomPxW,
      height: roomPxH,
    });
  }

  // === Pieces ===
  // Цвет каждого куска — по его собственному rollTypeId (поддержка mixed-type укладки).
  // При mono-type все куски одного цвета; при mixed — каждый тип своим цветом из палитры.
  //
  // Free-режим (realPolygon !== null): применяем polygon-aware partition —
  // bbox-кусок разбивается на максимальные ortho-rectangles, лежащие ВНУТРИ
  // формы помещения. Это решает 2 UX-проблемы:
  //  1. pieceLabel рендерится в центре каждой ВИДИМОЙ части → метка не пропадает
  //     в клипнутой зоне (П-формы и т.п.).
  //  2. Tooltip показывает размер видимой части, а не вводящего в заблуждение bbox.
  // Rect-режим (realPolygon === null): один piece-node на физический Piece,
  // как и раньше — никаких visible-частей не нужно.
  for (const p of result.pieces) {
    const pieceFill = getRollTypeColor(p.rollTypeId, catalog);
    // Стабильный ID исходного куска (без -part-N) — нужен для агрегаций в tooltip.
    const basePieceId = `${p.rollTypeId}-${p.placedAtX}-${p.placedAtY}`;

    // Список видимых частей в real-mm координатах внутри bbox формы.
    // Для rect-режима — одна часть, совпадающая с самим piece (без обрезки).
    const visibleParts = realPolygon
      ? clipRectByOrthoPolygon(
          { x: p.placedAtX, y: p.placedAtY, width: p.width, height: p.length },
          realPolygon.vertices,
        )
      : [{ x: p.placedAtX, y: p.placedAtY, width: p.width, height: p.length }];

    // Piece полностью вне polygon — не рендерим (физически невозможно при
    // корректном раскрое, но защита от граничных случаев формы).
    if (visibleParts.length === 0) continue;

    for (let partIdx = 0; partIdx < visibleParts.length; partIdx++) {
      const part = visibleParts[partIdx]!;
      const x = offsetX + part.x * scale;
      const y = offsetY + part.y * scale;
      const w = part.width * scale;
      const h = part.height * scale;
      // Уникальный ID части. В rect-режиме (одна часть) суффикс не добавляется,
      // чтобы сохранить обратную совместимость с тестами и существующей логикой
      // SchemeView (pieceId == basePieceId).
      const partPieceId =
        realPolygon && visibleParts.length > 1
          ? `${basePieceId}-part-${partIdx}`
          : basePieceId;

      nodes.push({
        kind: 'piece',
        x,
        y,
        width: w,
        height: h,
        fill: pieceFill,
        rollIndex: p.rollIndex,
        pieceId: partPieceId,
        // В free-режиме clipPolygon БОЛЬШЕ НЕ передаётся — visible-part уже
        // ortho-rectangle внутри polygon. SchemeView не активирует Konva clipFunc
        // → нет двойного клипа и метки не теряются.
        ...(realPolygon
          ? { partOfPieceId: basePieceId, partRealMm: { width: part.width, length: part.height } }
          : {}),
      });

      // Номер рулона (1-based). На схеме отображается только он —
      // размеры кусков не показываются как подписи (доступны в hover-tooltip).
      //
      // Порог 5px — минимум, при котором одиночная цифра читаема при fontSize=6.
      // fontSize адаптируется к min(w, h) ВИДИМОЙ части — это и решает проблему
      // «метка пропала», т.к. центр считается от visible-rect.
      const minSide = Math.min(w, h);
      if (minSide >= 5) {
        const digits = String(p.rollIndex + 1).length;
        const baseFs = h < 12 ? 6 : h < 18 ? 8 : h < 30 ? 11 : h < 60 ? 14 : 18;
        const maxFsByWidth = Math.floor((w - 2) / (0.55 * Math.max(1, digits)));
        const maxFsByHeight = Math.floor(h - 2);
        const pieceLabelFontSize = Math.max(5, Math.min(baseFs, maxFsByWidth, maxFsByHeight));
        nodes.push({
          kind: 'pieceLabel',
          x,
          y,
          width: w,
          height: h,
          text: String(p.rollIndex + 1),
          fontSize: pieceLabelFontSize,
          pieceId: partPieceId,
        });
      }
    }
  }

  // Размер ширины помещения (сверху по центру) и длины (слева по центру).
  // Для свободной формы — обозначаем bbox-габариты с пометкой «≈», т.к. реальная
  // форма не прямоугольник; это даёт пользователю общий ориентир по масштабу.
  const roomLabelFontSize = getRoomLabelFontSize(stageWidth);
  // При уменьшенном margin (20px) корректируем вертикальный отступ подписи ширины.
  const labelTopOffset = MARGIN >= 30 ? 22 : 14;
  const widthLabel = svgPolygon ? `≈${formatMTrim(room.width)}` : formatMTrim(room.width);
  const lengthLabel = svgPolygon ? `≈${formatMTrim(room.length)}` : formatMTrim(room.length);
  nodes.push({
    kind: 'roomLabel',
    x: offsetX + roomPxW / 2 - 30,
    y: offsetY - labelTopOffset,
    text: widthLabel,
    fontSize: roomLabelFontSize,
  });
  nodes.push({
    kind: 'roomLabel',
    x: offsetX - MARGIN + 2,
    y: offsetY + roomPxH / 2 - 8,
    text: lengthLabel,
    fontSize: roomLabelFontSize,
  });

  // === Stats: 2 строки ===
  // Строка 1 — общие метрики (один statsRow, bold).
  // Для свободной планировки (если polygon валиден) добавляем waste от формы:
  // площадь bbox - площадь polygon = поверхность, которая будет отрезана при
  // подгонке прямоугольного раскроя под форму помещения.
  const polygonShapeWaste = realPolygon
    ? Math.max(0, room.width * room.length - polygonAreaMm2(realPolygon.vertices))
    : 0;
  const wasteText = polygonShapeWaste > 0
    ? `Обрезки: ${formatAreaTrim(result.wasteAreaMm2)} + ${formatAreaTrim(polygonShapeWaste)} (форма)`
    : `Обрезки: ${formatAreaTrim(result.wasteAreaMm2)}`;
  // «Кусков» — физическое число visible-сегментов после кройки по форме.
  // Для прямоугольной комнаты === result.pieces.length; для свободной формы
  // (П, T и т.д.) каждая полоса, проходящая сквозь вырез, расщепляется на 2+
  // ortho-rectangles → это правильное число для пользователя.
  const physicalPieceCount = realPolygon
    ? countVisibleSegments(result.pieces, realPolygon.vertices)
    : result.pieces.length;
  const summaryText =
    `Рулонов: ${result.rollsUsed}    Кусков: ${physicalPieceCount} шт.    ` +
    wasteText;

  nodes.push({
    kind: 'statsRow',
    x: 0,
    y: schemeZoneH,
    width: stageWidth,
    height: STATS_LINE_HEIGHT,
    text: summaryText,
    fontSize: 13,
    bold: true,
  });

  // Строка 2 — разбивка по типоразмерам: цветной квадратик + текст для каждого типа.
  // Группировка piece по rollTypeId; счёт уникальных rollIndex = число физических
  // рулонов данного типа.
  const byType = new Map<string, Set<number>>();
  for (const p of result.pieces) {
    if (!byType.has(p.rollTypeId)) byType.set(p.rollTypeId, new Set<number>());
    byType.get(p.rollTypeId)!.add(p.rollIndex);
  }

  const DETAIL_FONT_SIZE = 12;
  const SWATCH_SIZE = 10;
  // Вертикальный центр строки 2 для выравнивания квадратика.
  const row2Y = schemeZoneH + STATS_LINE_HEIGHT;
  const swatchOffsetY = (STATS_LINE_HEIGHT - SWATCH_SIZE) / 2;
  // Приблизительная ширина символа: 0.55 * fontSize.
  const CHAR_WIDTH = DETAIL_FONT_SIZE * 0.55;
  // Зазор между квадратиком и текстом, между ячейками.
  const SWATCH_TEXT_GAP = 4;
  const CELL_GAP = 16;

  // Первый проход — вычислить суммарную ширину всех ячеек для центровки.
  type DetailCell = { rollTypeId: string; text: string };
  const detailCells: DetailCell[] = [];
  for (const [rollTypeId, indices] of byType) {
    const r = catalog.find((rt) => rt.id === rollTypeId);
    if (!r) continue;
    const text = `${formatMTrim(r.width)} × ${formatMTrim(r.length)} — ${indices.size} шт.`;
    detailCells.push({ rollTypeId, text });
  }

  if (detailCells.length > 0) {
    // Суммарная ширина: каждая ячейка = swatch + gap + текст; между ячейками — CELL_GAP.
    const totalWidth =
      detailCells.reduce(
        (sum, cell) => sum + SWATCH_SIZE + SWATCH_TEXT_GAP + cell.text.length * CHAR_WIDTH,
        0,
      ) +
      (detailCells.length - 1) * CELL_GAP;

    let curX = (stageWidth - totalWidth) / 2;

    for (const cell of detailCells) {
      const swatchFill = getRollTypeColor(cell.rollTypeId, catalog);
      nodes.push({
        kind: 'statsItemSwatch',
        x: curX,
        y: row2Y + swatchOffsetY,
        size: SWATCH_SIZE,
        fill: swatchFill,
      });
      curX += SWATCH_SIZE + SWATCH_TEXT_GAP;

      const textWidth = cell.text.length * CHAR_WIDTH;
      nodes.push({
        kind: 'statsItemText',
        x: curX,
        y: row2Y,
        height: STATS_LINE_HEIGHT,
        text: cell.text,
        fontSize: DETAIL_FONT_SIZE,
      });
      curX += textWidth + CELL_GAP;
    }
  }

  return { stageWidth, stageHeight, nodes };
}
