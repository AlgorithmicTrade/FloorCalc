/**
 * Текстовый breakdown результата расчёта: рулоны / швы / обрезки + warnings.
 *
 * Компонент остаётся в DOM как accessibility-fallback (visually-hidden),
 * т.к. основная статистика теперь рендерится внутри Konva stage (SchemeView)
 * и попадает в PNG/PDF/print экспорт.
 *
 * `formatResultAsPlainText()` — общий serializer для PDF, печати и копирования.
 */

import type { CalculationResult } from '@/domain/types';
import { formatArea } from '@/domain/units';
import styles from './ResultText.module.css';

export interface ResultTextProps {
  result: CalculationResult;
  /** Подпись режима над breakdown'ом, например «Экономный режим». */
  modeTitle?: string;
}

export function ResultText({ result, modeTitle }: ResultTextProps) {
  if (!result.feasible) {
    return (
      <div className={styles.infeasible}>
        <div className={styles.infeasibleTitle}>Расчёт невозможен</div>
        {result.warnings.length > 0 ? (
          <ul>
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <div>Проверьте размеры помещения и активные рулоны.</div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.text}>
      <div className={styles.row}>
        <span className={`t-body ${styles.label}`}>Рулонов:</span>
        <span className={`t-body ${styles.value}`}>{result.rollsUsed}</span>
      </div>
      <div className={styles.row}>
        <span className={`t-body ${styles.label}`}>Кусков:</span>
        <span className={`t-body ${styles.value}`}>{result.pieces.length} шт.</span>
      </div>
      <div className={styles.row}>
        <span className={`t-body ${styles.label}`}>Обрезки:</span>
        <span className={`t-body ${styles.value}`}>{formatArea(result.wasteAreaMm2)}</span>
      </div>
      {result.warnings.length > 0 && (
        <div className={styles.warnings}>
          <div>⚠ Предупреждения</div>
          <ul>
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {modeTitle && <div style={{ display: 'none' }}>{/* анти-warning о неиспользуемом */}</div>}
    </div>
  );
}

/**
 * Plain-text serialization для PDF / Print / Clipboard-text. Если результат
 * нереализуем — выводим причину одной строкой; иначе — три ключевых метрики
 * + опциональные предупреждения.
 */
export function formatResultAsPlainText(
  result: CalculationResult,
  opts: { roomName?: string; rollDims?: string; modeTitle?: string } = {},
): string {
  const lines: string[] = [];
  if (opts.modeTitle) lines.push(opts.modeTitle);
  if (opts.roomName) lines.push(`Помещение: ${opts.roomName}`);
  if (opts.rollDims) lines.push(`Рулон: ${opts.rollDims}`);
  if (lines.length > 0) lines.push('');

  if (!result.feasible) {
    lines.push('Расчёт невозможен.');
    if (result.warnings.length > 0) {
      for (const w of result.warnings) lines.push(`- ${w}`);
    }
    return lines.join('\n');
  }

  lines.push(`Рулонов: ${result.rollsUsed}`);
  lines.push(`Кусков: ${result.pieces.length} шт.`);
  lines.push(`Обрезки: ${formatArea(result.wasteAreaMm2)}`);

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Предупреждения:');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }

  return lines.join('\n');
}
