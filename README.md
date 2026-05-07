# FloorCalc

Desktop-калькулятор расхода рулонных напольных покрытий (линолеум, ковролин, ПВХ). Принимает каталог типоразмеров рулонов и набор прямоугольных помещений, выдаёт два расчёта одновременно — экономный (минимум рулонов) и оптимальный (минимум стыков), со схемой раскроя и текстовым breakdown'ом.

Один portable `.exe`, без установки, на любом Windows 10 (x64).

## Системные требования

- Windows 10 x64 или новее.
- Никаких runtime-зависимостей: всё bundled.
- Для функции «Печать» — стандартный Windows Print Dialog (Microsoft Print to PDF подходит).

## Запуск

Скачайте свежий `FloorCalc-X.Y.Z-portable.exe` со страницы [GitHub Releases](https://github.com/AlgorithmicTrade/FloorCalc/releases) и просто запустите. Каталог рулонов сохраняется в `%APPDATA%\FloorCalc\data.json`.

## Возможности

- Каталог типоразмеров рулонов с сохранением между запусками; чекбоксы для выбора активных в расчёте.
- Несколько помещений во вкладках, каждое со своим набором расчётов.
- Два режима расчёта одновременно для каждого помещения: **экономный** и **оптимальный**.
- Визуальная схема раскроя (canvas) + текстовый breakdown.
- Копирование схемы в буфер обмена, сохранение PNG, экспорт PDF, печать.
- Auto-update через GitHub Releases (электрон-updater + PowerShell-helper для replace + restart).

## Разработка

```bash
# Установка зависимостей
npm install

# Dev (electron-vite + HMR)
npm run dev

# Type-check (electron + renderer)
npm run typecheck

# Unit-тесты (Vitest, domain layer)
npm run test

# Production build (portable .exe в release/)
npm run build

# Production build + публикация в GitHub Release (требует GH_TOKEN)
npm run build:publish
```

### Релизы

Auto-publish настроен через `.github/workflows/release.yml`: push тега `v*` → workflow собирает portable.exe, заливает в GitHub Release вместе с `latest.yml` (manifest для electron-updater).

```bash
# bump версии вручную через npm
npm version patch  # 0.1.0 → 0.1.1
git push --follow-tags
```

### Архитектура

- `electron/main/` — main process: окно, IPC handlers, storage в `%APPDATA%`, updater (electron-updater + PowerShell-helper).
- `electron/preload/` — contextBridge → `window.api` (sandbox: true, contextIsolation: true).
- `src/domain/` — pure-TypeScript: типы, валидация, алгоритм раскроя (greedy + банк обрезков для economy; свежий рулон на полосу для optimal).
- `src/components/design-system/` — UI primitives на CSS-Modules + tokens из `DESIGN.md`.
- `src/components/{catalog,rooms,result,update,layout}/` — feature components.
- `src/store/` — Zustand stores.
- `tests/domain/` — Vitest unit-тесты алгоритма (без mocks, по правилу `quality.md`).

Подробный план реализации: `docs/plans/agile-prancing-pnueli.md`.

## TODO перед первым релизом

- Положить `resources/icon.ico` (256×256 multi-res). Сейчас electron-builder использует дефолтную иконку Electron.
- Собрать первый release `v0.1.0` через GitHub Actions: `git tag v0.1.0 && git push --follow-tags`.

## Лицензия

Internal use, AlgorithmicTrade.
