# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

**FloorCalc** — рабочий desktop-калькулятор раскроя рулонных напольных и настенных покрытий (линолеум, ковролин, обои, ПВХ). Текущий релиз — **v1.0.11** (см. `package.json:version`, `CHANGELOG.md`, `RELEASE_NOTES.md`).

- Git инициализирован, remote `origin` → `https://github.com/AlgorithmicTrade/FloorCalc.git`, основная ветка — `main`.
- Стек: Electron 32 + electron-vite 2 + React 19 + TypeScript 5 + Konva 9 + Zustand 5 + Zod 3 + jsPDF + electron-updater. Test runner — **Vitest** (`tests/domain/`).
- Package manager — **npm** (lock-файл `package-lock.json`). НЕ использовать `pnpm`/`yarn` — они в проекте не настроены.
- Distribution: один portable `.exe` без установки (см. `electron-builder.yml`, `target: portable`). Auto-update через GitHub Releases (`electron-updater` + helper `electron/main/updaterHelper.ts`).
- CI/CD: `.github/workflows/release.yml` — на push тега `v*` запускает typecheck → test → build:publish → upload `latest.yml` для auto-update feed.
- Beads (`bd`) инициализирован в `.beads/`, но БД/JSONL файлы в `.gitignore` (строка `.beads/`) — beads используется локально, без git-синхронизации (`sync-branch` не задан в `.beads/config.yaml`).
- Workspace artefacts в `.gitignore`: `node_modules/`, `out/`, `release/`, `dist/`, `coverage/`, `.tmp/`, `release-notes-current.md`, `.env*` (кроме `.env.example`), `.beads/`, `reports/`, `claude-code-orchestrator-kit/` (vendored npm-пакет, физически присутствует, но не коммитится), `release-test/`, `release-new/`, `docs/plans/agile-prancing-pnueli.md`.

## Orchestrator Pattern (главное)

Claude в этом workspace работает как **оркестратор**, а не как одиночный исполнитель. Полный контракт описан в `claude-code-orchestrator-kit/CLAUDE.md`. Ключевые правила (применять без напоминания):

1. **Сначала контекст, потом действие** — читать связанные файлы, искать существующие паттерны, проверять commit history, прежде чем делегировать или писать код.
2. **Делегировать в субагенты** для всего нетривиального; прямое выполнение допустимо только для однострочных правок, единичной установки зависимости, тривиальной правки конфига.
3. **После делегирования — ВСЕГДА верификация:** прочитать изменённые файлы, прогнать `npm run typecheck` / `npm run build` / `npm run test`. Без этого задача не считается завершённой.
4. **Атомарность**: 1 задача = 1 вызов агента. Параллельные агенты — в одном tool-call message.
5. **Library-first**: перед написанием >20 строк нового кода ищи существующую библиотеку (WebSearch + проверка bundlephobia / weekly downloads / activity).

## Project Overview

Минимально, чтобы сделать осмысленное предложение:

- **Domain-слой** (pure-TypeScript, без Electron-зависимостей) — `src/domain/calculator/`. Алгоритмы 2D-раскроя: `bank` (OffcutBank с гильотинным резом), `economy`/`optimal` (две стратегии выбора рулона с разным lex-tie-break), `mixed` (greedy с общим banky + rotation post-pass + перебор ориентаций room width↔length), `selectMixed`/`selectRoll` (выбор лучшего варианта), `seams` (число швов по группировке `placedAtX`), `strip` (низкоуровневая нарезка), `index` (фасад).
- **UI-слой** (React 19) — `src/components/{design-system,catalog,rooms,result,update,layout}` + Zustand-stores в `src/store/` (`catalogStore` с persist через IPC, `roomsStore` in-memory, `resultsCache` FIFO 64, `updateStore` для статусов обновления).
- **Electron main** — `electron/main/{index,ipc,storage,files,updater,updaterHelper,windowState}.ts`. CSP через HTTP-header (CSP-meta убран из-за конфликтов `file://` + sandbox), DevTools по `FLOORCALC_DEBUG=1` или маркеру `<userData>/.debug`.
- **Preload** (sandbox + contextIsolation) — `electron/preload/index.ts` → `contextBridge.exposeInMainWorld('api', …)`.
- **IPC contract** — `src/shared/ipc-contract.ts` + `src/shared/constants.ts` (имена каналов, GitHub owner/repo для updater). Все границы IPC валидируются через Zod.
- **Tests** — `tests/domain/{bank,seams,calculator.economy,calculator.optimal,calculator.mixed,calculator.mixed-orientation,calculator.mixed-rotation}.test.ts` + `fixtures.ts`. Только domain-слой; UI не покрыт unit-тестами (Konva/React).

Подробности по архитектуре — в `README.md` (раздел «Архитектура») и `DESIGN.md`. При изменениях в domain-слое — синхронно обновляй README/DESIGN, если меняется поведение алгоритмов.

## Common Commands

### npm scripts (`package.json`)

| Скрипт | Назначение |
|--------|-----------|
| `npm run dev` | electron-vite dev (HMR для main + preload + renderer). |
| `npm run typecheck` | `tsc -p tsconfig.electron.json --noEmit && tsc -p tsconfig.web.json --noEmit`. **Имя без дефиса** — `typecheck`, не `type-check`. |
| `npm run test` | `vitest run` (CI-режим, single pass). |
| `npm run test:watch` | `vitest` (watch-режим). |
| `npm run build` | typecheck → electron-vite build → electron-builder portable, без публикации. |
| `npm run build:safe` | `node scripts/build-safe.cjs` — kill процессов (FloorCalc.exe, electron.exe, app-builder.exe, 7z.exe, electron-builder.exe) → каскадная очистка `out/` и `release/` (`rmdir` → `fs.rmSync` → rename + async cleanup, до 5 попыток) → fallback на `release-new/` через `--config.directories.output`. Использовать при заблокированном `release/` (handle от Defender / Explorer). |
| `npm run build:publish` | typecheck → build → electron-builder с `--publish always` (требует `GH_TOKEN`). |
| `npm run preview` | electron-vite preview. |

### Slash-commands (`.claude/commands/`)

Запускать через UI Claude Code (`/имя`), не через Bash.

#### Development workflow

| Команда | Назначение |
|---------|-----------|
| `/commit [patch\|minor\|major]` | СТРОГО ДВУХШАГОВО: (1) сформировать commit message по проектному формату → (2) вызвать `/push` для релиза. Шаг 2 не запускать до полного вывода message в Шаге 1. |
| `/push [patch\|minor\|major] [-m "msg"]` | Релизный скрипт `.claude/scripts/release.sh`: bump версии в `package.json`, dual changelog (`CHANGELOG.md` + `RELEASE_NOTES.md`), git tag, push. На push тега `v*` GitHub Actions запустит `release.yml`. |
| `/worktree` | Управление git worktrees (create/remove/list/cleanup). |

#### Health workflows (inline orchestration)

Каждая команда — это «inline» скилл: главный Claude САМ оркестрирует, не спавнит отдельного orchestrator-агента. **Quality gate во всех health-командах** — `npm run typecheck && npm run build` (НЕ `pnpm type-check`, как написано в template-skill — там это дефолт оригинального шаблона; для FloorCalc нужно адаптировать на npm).

| Команда | Workers | Назначение |
|---------|---------|-----------|
| `/health-bugs` | bug-hunter, bug-fixer | Detect → fix by priority → verify (3 итерации). |
| `/health-security` | security-scanner, vulnerability-fixer | Уязвимости и их fix. |
| `/health-cleanup` | dead-code-hunter, dead-code-remover | Knip-driven dead code removal (требует установки Knip — `setup-knip` skill). |
| `/health-deps` | dependency-auditor, dependency-updater | Аудит и обновление пакетов. |
| `/health-reuse` | reuse-hunter, reuse-fixer | Дедупликация (Single Source of Truth). |
| `/health-metrics` | — | Сводный отчёт по всем health-скиллам. |
| `/record-metrics` | — | Сбор метрик в `.tmp/metrics/YYYY-MM.json`. |

#### SpecKit (планирование больших фич)

`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`.
Для интеграции с Beads: `/speckit.tobeads` (импорт tasks как Beads issues), `/speckit.taskstoissues` (в GitHub Issues).

Plan-файлы складываются в `./docs/plans/` (см. `settings.json:plansDirectory`).

#### Beads (issue tracking)

Уже инициализирован (`.beads/config.yaml` присутствует). Стандартный flow:

```bash
bd ready                                  # найти готовую задачу
bd update <id> --status in_progress
bd close <id> --reason "Done"
bd sync                                   # локальная синхронизация (sync-branch не настроен — git-коммит beads не выполняется)
```

Поскольку `.beads/` в `.gitignore`, beads используется как локальный issue tracker. Для шаринга с командой нужно либо настроить `sync-branch` в `.beads/config.yaml` и убрать `.beads/` из `.gitignore`, либо переехать на GitHub Issues.

`/beads-init` — повторная инициализация (если БД повреждена или нужно сбросить).

#### Synchronization

- `/anytype [task-id...]` — синхронизация открытых Beads-задач в Anytype space FundingBot через агента `anytype-beads-sync`.
  - Без аргументов — инкрементальная синхронизация по watermark `(updated_at, closed_at, status)`.
  - С ID — force-update указанных задач без проверки watermark.
  - Mapping-файл: `G:\Project-X\FundingBot\.claude\anytype-beads-mapping.json` (внешний, не в этом workspace; FloorCalc использует общий mapping FundingBot).
  - В Anytype синхронизируются ТОЛЬКО `open` задачи; `closed` — удаляются.

#### Misc

| Команда | Назначение |
|---------|-----------|
| `/process-logs` | Обработка error-логов (заточена под admin-panel БД из других проектов; для FloorCalc релевантна только если подключить нативный сбор `%APPDATA%/FloorCalc/debug.log`). |
| `/ultra-think` | Глубокий анализ через multi-dimensional thinking. |
| `/translate-doc` | Перевод документации EN → RU. |
| `/supabase-performance-optimizer` | Делегирование оптимизации Supabase профильным агентам — **в FloorCalc не применимо** (нет Supabase). |

## High-level Architecture

### Корневая структура

```
G:\Project-X\FloorCalc\
├── electron/
│   ├── main/                       # main process
│   │   ├── index.ts                # BrowserWindow, Menu.setApplicationMenu(null), CSP-header, file-logging
│   │   ├── ipc.ts                  # ipcMain.handle для всех каналов (см. src/shared/ipc-contract.ts)
│   │   ├── storage.ts              # data.json (atomic write + zod, default-fallback), debug.log
│   │   ├── files.ts                # вспомогательные file ops
│   │   ├── windowState.ts          # %APPDATA%/FloorCalc/window-state.json (zod)
│   │   ├── updater.ts              # electron-updater + ENOENT guard для app-update.yml
│   │   └── updaterHelper.ts        # cmd /c start /B (CREATE_BREAKAWAY_FROM_JOB) replace-helper
│   └── preload/index.ts            # contextBridge → window.api (sandbox: true, contextIsolation: true)
│
├── src/
│   ├── App.tsx, main.tsx, css-modules.d.ts
│   ├── shared/                     # IPC contract types, IPC_CHANNELS, GITHUB_OWNER/REPO, constants
│   ├── domain/                     # pure-TypeScript (no Electron)
│   │   ├── types.ts, units.ts, validation.ts
│   │   └── calculator/             # strip, bank, seams, economy, optimal, mixed, selectMixed, selectRoll, index
│   ├── components/
│   │   ├── design-system/          # Button, Card, TextInput, NumberField, Checkbox, Eyebrow, IconButton, Tabs
│   │   ├── catalog/                # AddRollForm, RollCatalog, RollRow
│   │   ├── rooms/                  # RoomTabs, RoomEditor, RoomResultPanel
│   │   ├── result/                 # ResultCard, ResultText, ResultActions, SchemeView (native Konva), SchemeRenderer
│   │   ├── update/                 # UpdateBanner
│   │   └── layout/                 # AppShell, EmptyState
│   ├── store/                      # Zustand v5: catalogStore (persist через IPC), roomsStore, resultsCache (FIFO 64), updateStore
│   ├── lib/                        # exportPng, exportPdf, copyImage, printScheme, hash
│   ├── ipc/client.ts               # ленивый Proxy на window.api
│   └── styles/                     # globals, print, tokens, typography
│
├── tests/domain/                   # Vitest: bank, seams, calculator.{economy,optimal,mixed,mixed-orientation,mixed-rotation} + fixtures
├── scripts/                        # build-safe.cjs, kill-processes.cjs (вспомогательные .cjs для Windows-friendly билда)
├── resources/                      # icon.ico, fonts/InterVariable.woff2
├── build/app-update.yml            # bundled в portable.exe (см. electron-builder.yml: extraResources)
├── .github/workflows/release.yml   # CI: typecheck → test → build:publish → upload latest.yml
├── electron.vite.config.ts         # vite config для main+preload+renderer
├── electron-builder.yml            # portable target, releaseInfo.releaseNotesFile = release-notes-current.md
├── tsconfig.{electron,web,node}.json + tsconfig.json
├── vitest.config.ts
├── package.json                    # v1.0.11
├── README.md, DESIGN.md, CHANGELOG.md, RELEASE_NOTES.md, AGENTS.md
├── docs/plans/                     # SpecKit-планы (агрегатор)
└── .claude/                        # см. ниже
```

### `.claude/` структура

```
.claude/
├── agents/                          # 50 субагентов в 11 доменах
│   ├── business/workers/                  # lead-research-assistant
│   ├── database/workers/                  # api-builder, database-architect, supabase-{auditor,fixer,realtime-optimizer,storage-optimizer}
│   ├── development/workers/               # code-reviewer, code-structure-refactorer, cost-calculator-, judge-, langgraph-, llm-service-, skill-builder-v2, stage-pipeline-, typescript-types-, utility-builder
│   ├── documentation/workers/             # technical-writer
│   ├── frontend/workers/                  # fullstack-nextjs-, nextjs-ui-designer, visual-effects-creator (Next.js-ориентированы; в Electron-проекте применимы условно)
│   ├── health/workers/                    # bug-hunter/-fixer, dead-code-hunter/-remover, dependency-auditor/-updater, reuse-hunter/-fixer, security-scanner, vulnerability-fixer
│   ├── infrastructure/workers/            # bullmq-, deployment-engineer, infrastructure-, orchestration-logic-, qdrant-, quality-validator-, rag-, server-hardening-
│   ├── integrations/workers/              # lms-integration-specialist
│   ├── meta/workers/                      # meta-agent-v3 (создаёт новых агентов)
│   ├── research/workers/                  # problem-investigator, research-specialist
│   └── testing/workers/                   # accessibility-, integration-, mobile-(responsiveness/fixes)-, performance-optimizer, test-writer (Vitest), tester-bot (Jest)
├── skills/                          # 42 переиспользуемых скилла (SKILL.md в каждой папке)
├── commands/                        # 26 slash-команд (выше)
├── hooks/
│   ├── beads-sync-trigger.py        # PostToolUse hook: ловит мутирующие `bd` Bash-вызовы, складывает FundingBot-* IDs в .claude/anytype-sync-queue.txt и через hookSpecificOutput напоминает оркестратору вызвать anytype-beads-sync только для этих ID. READ-ONLY относительно Beads.
│   ├── beads-sync-trigger.log       # лог hook (gitignored)
│   ├── __test_payloads/             # тестовые payloads для hook
│   └── __pycache__/                 # Python-cache (gitignored)
├── schemas/                         # JSON schemas для orchestrator plan-файлов
│   ├── base-plan.schema.json
│   ├── bug-plan.schema.json
│   ├── dead-code-plan.schema.json
│   ├── dependency-plan.schema.json
│   └── security-plan.schema.json
├── scripts/
│   ├── release.sh                   # release automation (используется /push)
│   └── gates/                       # check-bundle-size.sh, check-coverage.sh, check-security.sh
├── tasks/                           # архивные task-файлы (open-orders-adapters-migration, private-api-centralization — наследие от FundingBot)
├── docs/                            # beads-quickstart.{md,en.md}
├── rules/                           # проектные правила (см. ниже)
├── settings.json                    # ENABLE_TOOL_SEARCH=auto:5, plansDirectory=./docs/plans, plugins: voltagent-{dev-exp,qa-sec}@voltagent-subagents
├── settings.local.json              # локальные оверрайды (не комментировать содержимое — может быть user-specific)
├── statusline.ps1                   # PowerShell status line
└── worktrees/                       # для git worktree workflow (gitignored)
```

### Test runner selection

- **FloorCalc использует Vitest** (`vitest@^2.1.8` в `devDependencies`, `vitest.config.ts`, тесты в `tests/domain/`). Используй `test-writer` агента.
- `tester-bot` (Jest) — НЕ применять. В проекте Jest не настроен.
- E2E/browser → не настроены. При необходимости — `webapp-testing` (Playwright).
- При запуске тестов используй `npm run test` (single pass) или `npm run test:watch`.

### `claude-code-orchestrator-kit/` (upstream)

Отдельный git-репозиторий, vendored через npm-пакет `claude-code-orchestrator-kit@0.19.3`. **В `.gitignore`** — физически присутствует, но не коммитится. Используется как:

- Источник эталонных агентов/скиллов/команд (прежде чем создавать новый — проверяй upstream).
- Полная документация: `docs/ARCHITECTURE.md`, `docs/COMMANDS-GUIDE.md`, `docs/TUTORIAL-CUSTOM-AGENTS.md`, `docs/USE-CASES.md`, `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md`.
- `prompts/` — `setup-error-logging.md`, `setup-health-workflows.md`.
- `.specify/` — SpecKit memory + templates.
- `.mcp.json` — пример конфигурации (context7, sequential-thinking, supabase, playwright, shadcn, serena).

В корневом `.claude/settings.json` MCP-серверы НЕ настроены — только `ENABLE_TOOL_SEARCH=auto:5` (включает Tool Search при >5 включенных серверов) и плагины `voltagent-dev-exp` / `voltagent-qa-sec`.

## Project Rules (`.claude/rules/`)

Эти правила автоматически загружаются как project-level instructions. Соблюдай без явного напоминания:

### `commit_message.md` (КРИТИЧНО для `/commit`)

Формат коммита — conventional commit на русском с тремя ОБЯЗАТЕЛЬНЫМИ секциями:

```
<type>(<scope>): <русское summary, повелит. накл., ≤120 симв., без точки>

Решение:
- <bullet: что было изменено концептуально>

Изменения:
- <file_path>:
  - <методы / логика>

Эффект:
- <итоговое поведение, гарантии, влияние на стабильность/корректность/perf>
```

- `<type>` ∈ `feat | fix | refactor | perf | chore | docs | test`.
- `<scope>` — английский, краткое имя логического модуля. Для FloorCalc типичные: `Updater` (electron-updater + helper), `Core` (electron/main/index, IPC defense), `App` (UI hint/buttons), `Release` (release.yml, post-release verify), `Calculator` (domain), `Bank` / `Mixed` / `Optimal` / `Economy` (внутри domain/calculator/), `Catalog` (UI catalog), `Rooms` (UI rooms), `Result` (Scheme + export), `IPC`, `Storage`, `WindowState`. Подтверждается commit history (`88c5ce2..46a289e`).
- Если для секции нет содержания — поставь `—`, НЕ оставляй плейсхолдеры в `<>`.
- Маркеры списка только `-`. Никаких упоминаний AI/диалога/«этот чат».

### `quality.md` (data integrity — КРИТИЧНО)

- **Никаких mocks/stubs/fake data.** Только реальные реализации.
- Любое утверждение «бага/утечки/дубликата нет» должно ссылаться на конкретные файлы и строки прочитанного кода. Гипотезы без чтения — помечай `unverified`.
- При невозможности прочитать файл целиком — НЕ давай выводов, верни `Insufficient data: <чего не хватило>` и продолжи через grep + чтение нужных диапазонов.
- `git diff` НЕ заменяет чтение текущего состояния файла.
- Для тестов используй готовый скилл `/test-step` **только если** изменения касаются `electron/engine/` (профиль скилла) — для FloorCalc в основном тесты пишутся напрямую через Vitest в `tests/domain/`, делегируй `test-writer` агенту.

### `security.md`

- Все секреты (API keys, credentials, tokens) — ТОЛЬКО через `electron.safeStorage`. Запись на диск/в БД/в логи запрещена.
- Fallback в non-Electron средах (CI, headless tests, build scripts) — env vars без записи на диск (см. `.github/workflows/release.yml`: `GH_TOKEN` через secrets).
- Запрещено: hardcoded keys, `console.log`/file-log с `headers`/`body`, `git add .env`, секреты в `data.json` / `window-state.json`, OAuth response в логах.
- В FloorCalc единственная «секретная» поверхность — `GH_TOKEN` для `build:publish` (только в CI, не в исходниках). Всё остальное — пользовательские данные (каталог рулонов, размеры окна), не конфиденциально.

### `workflow.md`

- Перед созданием нового файла — проверь, можно ли расширить существующий. Создавай новый, только если подходящего места нет.
- Если файл слишком большой для разового чтения — НЕ делай вывод «не могу прочитать». Используй Grep/Glob, читай нужные диапазоны фрагментами.
- При ошибке чтения через `@codebase` — формулируй как «чтение не удалось (ошибка/таймаут)», предложи альтернативу (поиск или чтение фрагментами), а не «слишком большой/нет доступа».
- Все ссылки на код — точные (`file:function`/`file:line`) на основании реально прочитанного.

### `logging.md`

- Не добавляй избыточных логов. Временные debug-логи удаляй перед финальным apply. В FloorCalc файл-лог идёт в `%APPDATA%/FloorCalc/debug.log` через `electron/main/index.ts` — не дублировать его инструментацию.

### `preference.md`

- Всегда отвечай по-русски (orthography строгая: ё, ä, ü, é и т.д. — никаких ASCII-замен).

## File organization conventions

- Агенты: `.claude/agents/{domain}/workers/<name>.md`.
- Скиллы: `.claude/skills/<skill-name>/SKILL.md`.
- Команды: `.claude/commands/<name>.md`.
- Временные артефакты: `.tmp/current/` (gitignored).
- Метрики health-скиллов: `.tmp/metrics/YYYY-MM.json` (gitignored).
- Отчёты health-скиллов: `reports/` (gitignored — `reports/security-scan-report.md`, `reports/dead-code-report.md` и т.п.).
- Plan-файлы оркестратора: `./docs/plans/` (см. `settings.json:plansDirectory`).
- Test fixtures: `tests/domain/fixtures.ts` (общие типоразмеры рулонов и комнаты для domain-тестов).

## When delegating: agent selection cheat sheet

- **Bug в коде** → `/health-bugs` (или `bug-hunter` → `bug-fixer` напрямую).
- **Уязвимость** → `/health-security`.
- **Dead code** → `/health-cleanup` (требует Knip — используй скилл `setup-knip` перед первым прогоном).
- **TS-ошибки после правок** → re-delegate тому же агенту ИЛИ `typescript-types-specialist`.
- **Крупный рефакторинг** — НЕ напрямую, через `code-structure-refactorer`.
- **Архитектурные решения (>1 компонент)** — через скилл `senior-architect`.
- **Performance** — `performance-optimizer`.
- **Глубокая диагностика бага** — `problem-investigator` (root cause analysis с execution trace).
- **UI design** — `nextjs-ui-designer` ориентирован на Next.js, для FloorCalc используй скилл `frontend-aesthetics` или прямые правки в `src/components/design-system/` (стиль уже задан tokens.css + module.css per-component).
- **Создать нового агента** — `meta-agent-v3` (НЕ редактируй существующие, см. описание агента).
- **Создать новый скилл** — `skill-builder-v2`.
- **Тесты для domain** — `test-writer` агент (Vitest). НЕ `tester-bot` (Jest не настроен).
- **Updater / portable / electron-builder** — нет специализированного агента; делегируй `code-reviewer` или `problem-investigator` для диагностики, патчи пиши напрямую (или через `bug-fixer`). Изменения в `electron/main/updater*.ts` и `.github/workflows/release.yml` критичны — обязательно прогоняй `npm run build:safe` локально и проверяй CI после push тега.

## Session completion (push policy)

Default workflow по завершении сессии (см. `AGENTS.md` — «Landing the Plane»): file follow-up issues → run quality gates → update issue status → `git pull --rebase && bd sync` → push → cleanup → handoff.

В FloorCalc remote настроен (`origin` → GitHub), `bd sync` локальный (sync-branch не задан, beads в `.gitignore`). Но **auto-push НЕ безусловно разрешён**:

- Push тега `v*` запускает CI и публикует Release — это релизное действие, его делает только `/push` (через `release.sh`), не оркестратор автоматически.
- Push на `main` без тега — допустим для обычных коммитов (исправление багов/доков), если пользователь сам инициировал работу.
- В сомнительных случаях — спроси пользователя перед `git push`.

## What's gitignored vs committed (быстрая шпаргалка)

**Закоммичено**: исходники (`electron/`, `src/`, `tests/`, `scripts/`), конфиги (`tsconfig.*.json`, `electron.vite.config.ts`, `electron-builder.yml`, `vitest.config.ts`, `package.json`, `package-lock.json`), CI (`.github/workflows/release.yml`), документация (`README.md`, `DESIGN.md`, `CHANGELOG.md`, `RELEASE_NOTES.md`, `CLAUDE.md`, `AGENTS.md`), ресурсы (`resources/`, `build/app-update.yml`), плагины Claude (`.claude/` кроме исключений ниже).

**В `.gitignore`** (НЕ коммитится): `node_modules/`, `out/`, `release/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.tmp/`, `release-notes-current.md`, `*.log`, `.env*`, `.beads/`, `reports/`, `claude-code-orchestrator-kit/`, `release-test/`, `release-new/`, `.claude/anytype-sync-queue.txt`, `.claude/hooks/__pycache__/`, `.claude/hooks/beads-sync-trigger.log`, `.claude/worktrees/`, `docs/plans/agile-prancing-pnueli.md`.
