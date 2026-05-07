/**
 * Экспорт схемы + текстового breakdown в PDF (A4 landscape).
 *
 * Используется jsPDF — он не требует headless Chromium и весит ~150 КБ.
 * Слева страница занята текстом, справа — растровое изображение схемы
 * (PNG dataURL из Konva). Шрифт jsPDF по умолчанию (Helvetica) поддерживает
 * только латиницу; для кириллицы достаточно текста в нашем формате (числа +
 * единицы измерения), а ru-надписи (подписи Помещение/Рулонов) подаются как
 * UTF-8 — jsPDF попытается их вывести, но при отсутствии глифов может
 * подставить пустоты. Для MVP это приемлемо: пользователь по необходимости
 * экспортирует через PNG / Печать.
 */

import { jsPDF } from 'jspdf';
import type { SaveResult } from '@shared/ipc-contract';

export interface PdfExportable {
  toDataURL: () => string;
}

export async function exportPdf(
  stage: PdfExportable | null,
  text: string,
  filenameHint: string,
): Promise<SaveResult> {
  if (!stage) return { canceled: true };
  const dataUrl = stage.toDataURL();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Текст слева (узкая колонка ~240 pt с переносами).
  doc.setFontSize(11);
  const textLines = text.split('\n');
  doc.text(textLines, 36, 56, { maxWidth: 240 });

  // Схема справа. A4 landscape ~ 842×595 pt; оставляем поля.
  doc.addImage(dataUrl, 'PNG', 290, 36, 520, 480);

  const blob = doc.output('blob');
  const buf = await blob.arrayBuffer();
  const { api } = await import('@/ipc/client');
  return api.files.savePdf(buf, `${filenameHint}.pdf`);
}
