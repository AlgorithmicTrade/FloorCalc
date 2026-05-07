/* TypeScript declarations for CSS Modules.
 * Vite resolves `*.module.css` imports as JS objects with class-name strings; this
 * mirror declaration lets `tsc --noEmit` accept those imports without errors. */

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
