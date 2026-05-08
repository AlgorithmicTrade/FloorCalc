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
  /**
   * Соотношение сторон помещения (room.length / room.width) для адаптации
   * высоты канваса. Применяется ТОЛЬКО на узких (мобильных) канвасах
   * (cw < 480) — там вертикальные помещения требуют большей высоты, чтобы
   * scale был достаточным для меток кусков. На десктопе (cw >= 480) ширина
   * 640px достаточно велика, чтобы любая комната помещалась с нормальным
   * масштабом при 9:16, поэтому roomAspect игнорируется и используется
   * фиксированный aspect из widthPx/heightPx.
   * Если не задан — используется фиксированный aspect из widthPx/heightPx.
   */
  roomAspect?: number;
}

const FRAME_STROKE = '#3b3d45';
const FRAME_FILL = '#1f232b';
const PIECE_STROKE = 'rgba(0,0,0,0.35)';
const ROOM_LABEL_FILL = '#b2b6bd';
const PIECE_LABEL_FILL = '#000000';
const STATS_TEXT_FILL = '#cfd2d8';
const STATS_TEXT_FILL_DETAIL = '#9aa0aa';

export const SchemeView = forwardRef<SchemeViewHandle, SchemeViewProps>(function SchemeView(
  { result, room, roll, catalog, widthPx: maxWidthPx = 640, heightPx: maxHeightPx = 360, roomAspect, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[]; pieceId: string | null } | null>(null);
  // pinned=true: tooltip открыт тапом — mouseleave его не закрывает.
  const [pinned, setPinned] = useState(false);
  // Ref для актуального значения pinned — читается в Konva-замыканиях без
  // добавления pinned в deps useEffect (перерисовка схемы дорогая операция).
  const pinnedRef = useRef(false);
  // Синхронизация pinnedRef с pinned state.
  pinnedRef.current = pinned;
  // Актуальные размеры canvas — пересчитываются ResizeObserver'ом контейнера.
  // Стартовые значения = max-bounds, чтобы первый рендер не моргал нулевым размером.
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: maxWidthPx,
    h: maxHeightPx,
  });

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
  // Размер берётся от ширины контейнера (с aspect 16:9 и cap по maxWidthPx),
  // подписан ResizeObserver — реагирует на rotate / resize / изменение layout.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Расчёт размеров от ширины контейнера, aspect maxHeightPx/maxWidthPx, capped maxWidthPx.
    // roomAspect-адаптация применяется ТОЛЬКО на узких (мобильных) канвасах
    // (cw < 480 — порог согласован с SchemeRenderer.getMargin(), мобильный
    // breakpoint). На десктопе (cw >= 480) ширина уже достаточно велика,
    // чтобы любая комната помещалась с нормальным масштабом при 9:16,
    // а растягивание канваса по roomAspect создавало пустой void и ломало
    // UX (две карточки результата занимали ~2 экрана).
    //   - На мобильном: clamp aspect в [9/16 .. 2.0] от roomAspect, чтобы
    //     вертикальные комнаты получили достаточно высоты для scale, а
    //     горизонтальные не превысили 16:9.
    //   - На десктопе: aspect = maxHeightPx / maxWidthPx (= 9/16 при дефолте 360/640).
    //   - Минимум 240×180 — иначе stats-text внизу схемы перестаёт читаться.
    const calcSize = (): { w: number; h: number } => {
      const cw = Math.max(240, Math.min(container.clientWidth, maxWidthPx));
      let aspect = maxHeightPx / maxWidthPx;
      if (roomAspect !== undefined && cw < 480) {
        // Мобильный-only: clamp aspect в [9/16 .. 2.0], чтобы канвас не стал
        // бесконечно высоким и горизонтальные комнаты не превысили 16:9.
        const minAspect = 9 / 16;   // ~0.5625 — минимум (шире чем 16:9 не делаем)
        const maxAspect = 2.0;      // максимум — 1:2 (height = 2*width)
        aspect = Math.max(minAspect, Math.min(maxAspect, roomAspect));
      }
      const ch = Math.max(180, Math.round(cw * aspect));
      return { w: cw, h: ch };
    };

    const initial = calcSize();
    setSize((prev) => (prev.w === initial.w && prev.h === initial.h ? prev : initial));

    const stage = new Konva.Stage({
      container,
      width: initial.w,
      height: initial.h,
    });
    stageRef.current = stage;

    const ro = new ResizeObserver(() => {
      const next = calcSize();
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      stageRef.current = null;
      stage.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxWidthPx, maxHeightPx, roomAspect]);

  // Перерисовываем схему при изменении данных или размера контейнера.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    // Сбрасываем tooltip при каждой перерисовке (новые данные/размер).
    setTooltip(null);
    setPinned(false);

    stage.width(size.w);
    stage.height(size.h);

    // Уничтожаем предыдущие слои перед перерисовкой.
    stage.destroyChildren();

    // Layer с listening: true — нужен для hover-событий на группах piece.
    const layer = new Konva.Layer({ listening: true });
    const layout = renderScheme(result, room, roll, catalog, size.w, size.h);
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

      // Вспомогательная функция: вычисляет позицию tooltip с clamp-ом
      // по границам контейнера, чтобы не вылезал за пределы канваса.
      const clampedPos = (rawX: number, rawY: number): { x: number; y: number } => {
        const TW = 200; // приблизительная ширина tooltip
        const TH = 60;  // приблизительная высота tooltip
        const cw = container ? container.clientWidth : stage.width();
        const ch = container ? container.clientHeight : stage.height();
        const x = rawX + 14 + TW > cw ? rawX - 14 - TW : rawX + 14;
        const y = rawY + 14 + TH > ch ? rawY - 14 - TH : rawY + 14;
        return { x, y };
      };

      // Десктоп: hover показывает tooltip без pin — mouseleave закрывает.
      group.on('mouseenter mousemove', (e) => {
        // Не перебиваем pinned-tooltip тапа.
        if (pinnedRef.current) return;
        const s = e.target.getStage();
        if (!s) return;
        const pos = s.getPointerPosition();
        if (!pos) return;
        const { x, y } = clampedPos(pos.x, pos.y);
        setTooltip({ x, y, lines: tooltipLines, pieceId: pieceId });
        if (container) container.style.cursor = 'pointer';
      });
      group.on('mouseleave', () => {
        // Pinned-tooltip (тап) не закрываем при уходе мыши.
        if (pinnedRef.current) return;
        setTooltip(null);
        if (container) container.style.cursor = 'default';
      });

      // Мобильный: tap открывает/закрывает tooltip (toggle по тому же piece).
      group.on('click tap', (e) => {
        // Останавливаем всплытие к stage-handler'у — он закрывает tooltip.
        e.cancelBubble = true;
        const s = e.target.getStage();
        if (!s) return;
        const pos = s.getPointerPosition();
        if (!pos) return;

        setTooltip((prev) => {
          // Toggle: повторный тап по тому же piece закрывает tooltip.
          if (prev?.pieceId === pieceId) {
            setPinned(false);
            if (container) container.style.cursor = 'default';
            return null;
          }
          // Переключение или первый тап: показываем новый tooltip.
          setPinned(true);
          if (container) container.style.cursor = 'pointer';
          const { x, y } = clampedPos(pos.x, pos.y);
          return { x, y, lines: tooltipLines, pieceId: pieceId };
        });
      });

      layer.add(group);
    }

    stage.add(layer);

    // Тап/клик на пустое место Stage (вне piece-группы) → закрыть tooltip.
    // Piece-группы останавливают всплытие через e.cancelBubble = true,
    // поэтому сюда доходят только события на фоне канваса.
    stage.on('click tap', (e) => {
      if (e.target === stage) {
        setTooltip(null);
        setPinned(false);
        if (container) container.style.cursor = 'default';
      }
    });

    // setTooltip / setPinned стабильны (React-гарантия для state-setter'ов), добавлены явно для линтера.
  }, [result, room, roll, catalog, size.w, size.h, setTooltip, setPinned]);

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
        fontSize: node.fontSize,
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
      // height обязателен для verticalAlign:'middle' в Konva — без явной height
      // text-box рендерится с top-edge на y, и verticalAlign игнорируется.
      return new Konva.Text({
        x: node.x,
        y: node.y,
        height: node.height,
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
