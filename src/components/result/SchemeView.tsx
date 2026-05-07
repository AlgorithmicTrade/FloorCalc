/**
 * Konva Stage с отрисовкой схемы помещения и кусков покрытия.
 *
 * Через `useImperativeHandle` экспонируем 3 метода:
 *  - `toCanvas()`  — для каких-то нативных операций (не используется напрямую,
 *                     но удобно для тестов / future-fyodor).
 *  - `toDataURL()` — PDF и Print используют это для встраивания PNG в документ.
 *  - `toBlob()`    — Copy и SavePNG получают `Blob` (clipboard / IPC).
 *
 * Тип ref Konva `Stage` мы достаём через `import Konva from 'konva'`
 * (а не из `react-konva`) — react-konva сама пробрасывает Stage-instance
 * в forwardRef через `KonvaNodeComponent`.
 */

import { forwardRef, useImperativeHandle, useRef, type ReactElement } from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { CalculationResult, Room } from '@/domain/types';
import { renderScheme, type SchemeNode } from './SchemeRenderer';
import styles from './SchemeView.module.css';

export interface SchemeViewHandle {
  toCanvas: () => HTMLCanvasElement;
  toDataURL: () => string;
  toBlob: () => Promise<Blob | null>;
}

export interface SchemeViewProps {
  result: CalculationResult;
  room: Room;
  widthPx?: number;
  heightPx?: number;
  className?: string;
}

const FRAME_STROKE = '#3b3d45';
const FRAME_FILL = '#1f232b';
const PIECE_STROKE = 'rgba(0,0,0,0.35)';
const ROOM_LABEL_FILL = '#b2b6bd';
const PIECE_LABEL_FILL = '#000000';

export const SchemeView = forwardRef<SchemeViewHandle, SchemeViewProps>(function SchemeView(
  { result, room, widthPx = 480, heightPx = 360, className = '' },
  ref,
) {
  const stageRef = useRef<Konva.Stage | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      toCanvas: (): HTMLCanvasElement => {
        const stage = stageRef.current;
        if (!stage) {
          // Возвращаем пустой canvas-фолбэк, чтобы вызывающая сторона не падала
          // на null (UI и так должен быть скрыт пока stage не смонтирован).
          return document.createElement('canvas');
        }
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

  const layout = renderScheme(result, room, widthPx, heightPx);

  return (
    <div className={`${styles.wrap} ${className}`} data-print-target>
      <Stage
        ref={stageRef}
        width={layout.stageWidth}
        height={layout.stageHeight}
        className={styles.canvas}
      >
        <Layer listening={false}>
          {layout.nodes.map((n, idx) => renderNode(n, idx))}
        </Layer>
      </Stage>
    </div>
  );
});

function renderNode(node: SchemeNode, idx: number): ReactElement | null {
  switch (node.kind) {
    case 'roomFrame':
      return (
        <Rect
          key={`frame-${idx}`}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          stroke={FRAME_STROKE}
          strokeWidth={2}
          fill={FRAME_FILL}
        />
      );
    case 'piece':
      return (
        <Rect
          key={`piece-${idx}`}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          fill={node.fill}
          stroke={PIECE_STROKE}
          strokeWidth={1}
        />
      );
    case 'pieceLabel':
      return (
        <Text
          key={`pl-${idx}`}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          text={node.text}
          fontSize={12}
          fontStyle="600"
          fill={PIECE_LABEL_FILL}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      );
    case 'roomLabel':
      return (
        <Text
          key={`rl-${idx}`}
          x={node.x}
          y={node.y}
          text={node.text}
          fontSize={12}
          fill={ROOM_LABEL_FILL}
          listening={false}
        />
      );
    default:
      return null;
  }
}
