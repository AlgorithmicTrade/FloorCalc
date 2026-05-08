/**
 * Подготовка HTML-документа для печати (схема + breakdown) и отправка
 * его в main-процесс через IPC. Main вызывает `webContents.print()` на
 * скрытом BrowserWindow с этим HTML.
 *
 * dataURL встраивается inline (PNG → base64) — это исключает зависимость
 * от webContents-сессии и ассет-резолвинга при печати.
 */

export interface DataUrlExportable {
  toDataURL: () => string;
}

export async function printScheme(
  stage: DataUrlExportable | null,
  text: string,
): Promise<void> {
  if (!stage) return;
  const dataUrl = stage.toDataURL();
  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>FloorCalc — печать</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #000; background: #fff; }
  .row { display: flex; gap: 24px; }
  .text { flex: 0 0 240px; white-space: pre-wrap; font-size: 12px; }
  .scheme { flex: 1; }
  .scheme img { max-width: 100%; height: auto; }
  @media print { @page { size: A4 landscape; margin: 12mm; } }
</style></head>
<body>
  <div class="row">
    <div class="text">${escapeHtml(text)}</div>
    <div class="scheme"><img src="${dataUrl}" alt="Схема"></div>
  </div>
</body></html>`;
  const { api } = await import('@/ipc/client');
  await api.files.print(html);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}
