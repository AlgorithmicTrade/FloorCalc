/**
 * Подготовка HTML-документа для печати (схема + breakdown) и вызов
 * системного диалога печати браузера.
 *
 * Реализация — скрытый iframe, в который мы записываем собранный HTML и
 * вызываем `contentWindow.print()`. iframe выбран вместо `window.open` —
 * последний триггерит popup-blocker (даже из click-handler в некоторых
 * конфигурациях Chromium/Safari). Same-origin iframe такого ограничения не
 * имеет.
 *
 * dataURL встраивается inline (PNG → base64) — это исключает зависимость
 * от ассет-резолвинга при печати.
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

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const cw = iframe.contentWindow;
  if (!cw) {
    iframe.remove();
    throw new Error('Не удалось открыть окно печати');
  }

  cw.document.open();
  cw.document.write(html);
  cw.document.close();

  // Дожидаемся, пока document и встроенная картинка догрузятся.
  await waitForIframeReady(iframe, cw);

  cw.focus();
  cw.print();

  // Chrome блокирует синхронное удаление iframe в момент печати —
  // оставляем небольшой запас, чтобы диалог печати успел появиться.
  setTimeout(() => iframe.remove(), 1000);
}

async function waitForIframeReady(iframe: HTMLIFrameElement, cw: Window): Promise<void> {
  if (cw.document.readyState !== 'complete') {
    await new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
    });
  }
  // Дополнительный фрейм — гарантирует, что layout (включая <img src=dataURL>) применён.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
