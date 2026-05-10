/* TypeScript declarations for CSS Modules and Vite asset queries.
 * Vite resolves `*.module.css` imports as JS objects with class-name strings; this
 * mirror declaration lets `tsc --noEmit` accept those imports without errors.
 * `*.ttf?url` covers font assets (Roboto-Regular.ttf используется как Cyrillic-fallback
 * для jsPDF в `src/lib/exportPdf.ts`). */

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.ttf?url' {
  const url: string;
  export default url;
}

/* Vite `?raw` query: импортирует содержимое любого файла как строку.
 * Используется для встраивания RELEASE_NOTES.md в bundle (см. App.tsx). */
declare module '*?raw' {
  const content: string;
  export default content;
}
