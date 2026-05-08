/**
 * Экспорт схемы + текстового breakdown в PDF (A4 landscape).
 *
 * Используется jsPDF — он не требует headless Chromium и весит ~150 КБ.
 * Слева страница занята текстом, справа — растровое изображение схемы
 * (PNG dataURL из Konva).
 *
 * Cyrillic support: jsPDF из коробки рендерит только Helvetica (latin only),
 * поэтому кириллица превращалась в «крокозябры» (вопрос/потерянные глифы).
 * Решение — встраиваем Roboto-Regular.ttf (поддерживает Latin + Cyrillic)
 * через jsPDF Virtual File System (`addFileToVFS` + `addFont`). TTF лежит
 * в `resources/fonts/Roboto-Regular.ttf` и подгружается лениво при первом
 * экспорте; результат кэшируется в module-scope.
 *
 * Save: используем `doc.save(name)` — jsPDF сам инициирует browser-download
 * через `<a download>`. На iOS Safari PDF откроется в новой вкладке (норма
 * для Apple, см. jsPDF README) — пользователь сохраняет через системное share.
 */

import { jsPDF } from 'jspdf';
import robotoRegularUrl from '../../resources/fonts/Roboto-Regular.ttf?url';
import type { SaveResult } from './exportPng';
import type { DataUrlExportable } from './printScheme';

const PDF_FONT_VFS_NAME = 'Roboto-Regular.ttf';
const PDF_FONT_FAMILY = 'Roboto';

let cachedFontBase64: string | null = null;
let fontLoadPromise: Promise<string> | null = null;

async function loadEmbeddedFontBase64(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;
  if (fontLoadPromise) return fontLoadPromise;
  fontLoadPromise = (async () => {
    const res = await fetch(robotoRegularUrl);
    if (!res.ok) {
      throw new Error(`Не удалось загрузить шрифт PDF (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    cachedFontBase64 = base64;
    return base64;
  })();
  try {
    return await fontLoadPromise;
  } catch (e) {
    fontLoadPromise = null;
    throw e;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export async function exportPdf(
  stage: DataUrlExportable | null,
  text: string,
  filenameHint: string,
): Promise<SaveResult> {
  if (!stage) return { canceled: true };
  const dataUrl = stage.toDataURL();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const fontBase64 = await loadEmbeddedFontBase64();
  doc.addFileToVFS(PDF_FONT_VFS_NAME, fontBase64);
  doc.addFont(PDF_FONT_VFS_NAME, PDF_FONT_FAMILY, 'normal');
  doc.setFont(PDF_FONT_FAMILY, 'normal');
  doc.setFontSize(11);

  const textLines = text.split('\n');
  doc.text(textLines, 36, 56, { maxWidth: 240 });

  doc.addImage(dataUrl, 'PNG', 290, 36, 520, 480);

  doc.save(`${filenameHint}.pdf`);
  return { canceled: false };
}
