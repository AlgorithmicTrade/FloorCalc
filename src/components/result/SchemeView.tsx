/**
 * Konva Stage с отрисовкой схемы помещения и кусков покрытия.
 *
 * Через `useImperativeHandle` экспонируем 3 метода:
 *  - `toCanvas()`  — для нативных операций и экспорта.
 *  - `toDataURL()` — PDF и Print используют это для встраивания PNG в документ.
 *  - `toBlob()`    — Copy и SavePNG получают `Blob` (clipboard / IPC).
 *
 * Рендеринг — нативный Konva API (без react-konva / its-fine), чтобы исключить
 * бесконечный render-цикл React error #185.
 *
 * Под схемой — две строки статистики (общая + разбивка по типоразмерам), они
 * попадают в любой экспорт. Warnings выводятся в HTML-tooltip над картинкой.
 *
 * На самих кусках отображается только номер рулона. Размеры куска и площадь
 * остатка обрезка для всего рулона показываются в HTML-tooltip при hover —
 * на схеме их нет, чтобы не перегружать вид и экспорт.
 */

import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import type { CalculationResult, Room, RollType, Piece } from '@/domain/types';
import { renderScheme, type SchemeNode } from './SchemeRenderer';
import { formatMTrim, formatAreaTrim } from '@/domain/units';
import styles from './SchemeView.module.css';

export interface SchemeViewHandle {
  toCanvas: () => HTMLCanvasElement;
  toDataURL: () => string;
  toBlob: () => Promise<Blob | null>;
}

export interface SchemeViewProps {
  result: CalculationResult;
  room: Room;
  roll: RollType;
  /** Полный каталог рулонов — нужен для стабильных цветов по типоразмеру и
   *  для разбивки в строке статистики. */
  catalog: readonly RollType[];
  widthPx?: number;
  heightPx?: number;
  className?: string;
}

const FRAME_STROKE = '#3b3d45';
const FRAME_FILL = '#1f232b';
const PIECE_STROKE = 'rgba(0,0,0,0.35)';
const ROOM_LABEL_FILL = '#b2b6bd';
const PIECE_LABEL_FILL = '#000000';
const STATS_TEXT_FILL = '#cfd2d8';
const STATS_TEXT_FILL_DETAIL = '#9aa0aa';

export const SchemeView = forwardRef<SchemeViewHandle, SchemeViewProps>(function SchemeView(
  { result, room, roll, catalog, widthPx = 640, heightPx = 360, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      toCanvas: (): HTMLCanvasElement => {
        const stage = stageRef.current;
        if (!stage) return document.createElement('canvas');
        return stage.toCanvas();
      },
      toDataURL: (): string => {
        const stage = stageRef.current;
        if (!stage) return '';
        return stage.toDataURL({ pixelRatio: 2 });
      },
      toBlob: (): Promise<Blob | null> => {
        const stage = stageRef.current;
        if (!stage) return Promise.resolve(null);
        return stage.toBlob({ pixelRatio: 2 }) as Promise<Blob | null>;
      },
    }),
    [],
  );

  // Создаём Stage один раз при монтировании, уничтожаем при размонтировании.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = new Konva.Stage({
      container,
      width: widthPx,
      height: heightPx,
    });
    stageRef.current = stage;

    return () => {
      stageRef.current = null;
      stage.destroy();
    };
    // widthPx/heightPx намеренно не в deps — размеры фиксированы на весь жизненный цикл
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Перерисовываем схему при изменении данных.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    stage.width(widthPx);
    stage.height(heightPx);

    // Уничтожаем предыдущие слои перед перерисовкой.
    stage.destroyChildren();

    // Layer с listening: true — нужен для hover-событий на группах piece.
    const layer = new Konva.Layer({ listening: true });
    const layout = renderScheme(result, room, roll, catalog, widthPx, heightPx);
    const container = containerRef.current;

    // Группируем ноды по pieceId: piece + pieceLabel → Konva.Group.
    // Ноды без pieceId (roomFrame, roomLabel, statsRow, statsItemSwatch/Text)
    // добавляются в layer напрямую без группировки.
    const pieceGroups = new Map<string, {
      pieceRect: Konva.Rect | null;
      pieceLabel: Konva.Text | null;
    }>();

    // Маппинг pieceId → Piece для формирования строк tooltip при hover.
    const pieceById = new Map<string, Piece>();
    for (const p of result.pieces) {
      const pid = `${p.rollTypeId}-${p.placedAtX}-${p.placedAtY}`;
      pieceById.set(pid, p);
    }

    // Маппинг rollTypeId → RollType для быстрого поиска типа рулона.
    const rollByTypeId = new Map<string, RollType>();
    for (const r of catalog) {
      rollByTypeId.set(r.id, r);
    }

    // Первый проход — инициализируем группы для всех piece-нод.
    for (const node of layout.nodes) {
      if (node.kind === 'piece' || node.kind === 'pieceLabel') {
        const pid = node.pieceId;
        if (!pieceGroups.has(pid)) {
          pieceGroups.set(pid, { pieceRect: null, pieceLabel: null });
        }
      }
    }

    // Второй проход — строим Konva-объекты и раскладываем по группам / layer.
    for (const node of layout.nodes) {
      if (node.kind === 'piece') {
        const grp = pieceGroups.get(node.pieceId)!;
        grp.pieceRect = new Konva.Rect({
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          fill: node.fill,
          stroke: PIECE_STROKE,
          strokeWidth: 1,
        });
        continue;
      }

      if (node.kind === 'pieceLabel') {
        const grp = pieceGroups.get(node.pieceId)!;
        grp.pieceLabel = new Konva.Text({
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          text: node.text,
          fontSize: node.fontSize,
          fontStyle: '700',
          fill: PIECE_LABEL_FILL,
          align: 'center',
          verticalAlign: 'middle',
          listening: false,
        });
        continue;
      }

      // Остальные ноды — в layer напрямую.
      const shape = buildStaticKonvaNode(node);
      if (shape) layer.add(shape);
    }

    // Третий проход — собираем Konva.Group для каждого piece и вешаем hover.
    // HTML-tooltip (следует за курсором) показывает размеры куска и обрезка
    // — на схеме самих подписей с размерами нет.
    for (const [pieceId, grp] of pieceGroups) {
      if (!grp.pieceRect) continue;

      const group = new Konva.Group({ listening: true });
      group.add(grp.pieceRect);
      if (grp.pieceLabel) group.add(grp.pieceLabel);

      const piece = pieceById.get(pieceId);
      const tooltipLines = piece
        ? computeTooltipLines(piece, result.pieces, rollByTypeId, roll)
        : [];

      group.on('mouseenter mousemove', (e) => {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        setTooltip({ x: pos.x + 14, y: pos.y + 14, lines: tooltipLines });
        if (container) container.style.cursor = 'pointer';
      });
      group.on('mouseleave', () => {
        setTooltip(null);
        if (container) container.style.cursor = 'default';
      });

      layer.add(group);
    }

    stage.add(layer);
    // setTooltip стабилен (React-гарантия для state-setter'ов), добавлен явно для линтера.
  }, [result, room, roll, catalog, widthPx, heightPx, setTooltip]);

  return (
    <div
      ref={containerRef}
      className={`${styles.wrap} ${className}`}
      data-print-target
      style={{ position: 'relative' }}
    >
      {tooltip && (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * Формирует массив строк для HTML-tooltip при hover на piece.
 * Показывает размеры куска и площадь остатка обрезка для всего рулона,
 * из которого этот кусок был вырезан (агрегируется по piece.rollIndex).
 *
 * @param piece     - кусок покрытия.
 * @param allPieces - все pieces расчёта (для суммирования по rollIndex).
 * @param rollMap   - маппинг rollTypeId → RollType из каталога.
 * @param fallback  - резервный тип рулона, если rollTypeId не найден в каталоге.
 */
function computeTooltipLines(
  piece: Piece,
  allPieces: readonly Piece[],
  rollMap: ReadonlyMap<string, RollType>,
  fallback: RollType,
): string[] {
  const pieceRoll = rollMap.get(piece.rollTypeId) ?? fallback;
  const lines: string[] = [
    `Кусок: ${formatMTrim(piece.width)} × ${formatMTrim(piece.length)}`,
  ];
  // Суммарная использованная площадь рулона (все pieces с тем же rollIndex).
  let usedArea = 0;
  for (const p of allPieces) {
    if (p.rollIndex === piece.rollIndex) {
      usedArea += p.width * p.length;
    }
  }
  const leftoverArea = pieceRoll.width * pieceRoll.length - usedArea;
  if (leftoverArea > 0) {
    lines.push(`Обрезок: ${formatAreaTrim(leftoverArea)}`);
  }
  return lines;
}

/**
 * Строит Konva-объект для «статичных» нод (не piece/pieceLabel).
 * Эти ноды добавляются в layer напрямую, без группировки и без hover.
 */
function buildStaticKonvaNode(
  node: SchemeNode,
): Konva.Shape | Konva.Text | null {
  switch (node.kind) {
    case 'roomFrame':
      return new Konva.Rect({
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        stroke: FRAME_STROKE,
        strokeWidth: 2,
        fill: FRAME_FILL,
        listening: false,
      });

    case 'roomLabel':
      return new Konva.Text({
        x: node.x,
        y: node.y,
        text: node.text,
        fontSize: 12,
        fill: ROOM_LABEL_FILL,
        listening: false,
      });

    case 'statsRow':
      // Горизонтальная строка статистики под схемой. Bold = главная (1-я строка).
      return new Konva.Text({
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        text: node.text,
        fontSize: node.fontSize,
        fontStyle: node.bold ? '600' : 'normal',
        fill: node.bold ? STATS_TEXT_FILL : STATS_TEXT_FILL_DETAIL,
        align: 'center',
        verticalAlign: 'middle',
        listening: false,
      });

    case 'statsItemSwatch':
      // Цветной квадратик типоразмера во второй строке stats.
      return new Konva.Rect({
        x: node.x,
        y: node.y,
        width: node.size,
        height: node.size,
        fill: node.fill,
        stroke: '#444',
        strokeWidth: 1,
        cornerRadius: 2,
        listening: false,
      });

    case 'statsItemText':
      // Текст ячейки типоразмера во второй строке stats.
      return new Konva.Text({
        x: node.x,
        y: node.y,
        text: node.text,
        fontSize: node.fontSize,
        fill: STATS_TEXT_FILL_DETAIL,
        verticalAlign: 'middle',
        listening: false,
      });

    // piece/pieceLabel обрабатываются в основном useEffect — здесь не нужны.
    case 'piece':
    case 'pieceLabel':
      return null;

    default:
      return null;
  }
}
