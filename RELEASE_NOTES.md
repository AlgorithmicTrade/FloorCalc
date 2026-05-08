# Release Notes

User-facing release notes for all versions.

## v1.0.13

_Released on 2026-05-08_

### 🐛 Bug Fixes

- **PDF**: встроить Roboto TTF и убрать кириллические «крокозябры» в exportPdf

---

_This release was automatically generated from 1 commits._

## v1.0.12

_Released on 2026-05-08_

### 🔒 Security & Hardening

- **Security**: закрыть IPC validation gap и усилить CI release pipeline

  Решение:
  - Закрыть HIGH архитектурный пробел: каналы FILES_SAVE_PNG/PDF/PRINT принимали renderer-payload через TypeScript type-cast без runtime-проверок (контракт требует Zod-валидации всех IPC-границ; STORAGE_SAVE был единственным валидируемым).
  - Усилить supply-chain устойчивость release.yml: SHA-pin GitHub Actions (mutable @v4 → commit SHA), сужение permissions с workflow-уровня до job-level (default-deny), concurrency guard от race condition при force-push тега, npm audit для production-зависимостей.
  - Зафиксировать package manager (npm@10.8.2) и engines.npm — детерминизм CI и локальной сборки.
  - Актуализировать CLAUDE.md: устаревший bootstrap-блок заменён на описание реального проекта (стек, архитектура, npm-скрипты, slash-команды, Beads workflow, project rules).

  Изменения:
  - electron/main/ipc.ts:
    - Добавлены SaveBufferArgs (z.tuple ArrayBuffer ≤50MB + filename regex `/^[^\\/:*?"<>|\x00-\x1f]+$/u`) и PrintHtmlArg (`z.string().max(5_000_000)`).
    - FILES_SAVE_PNG/PDF/PRINT handlers применяют `.parse(args)` / `.parse(html)` до downstream-вызовов savePng/savePdf/printHtml. Закрывает SEC-H01, побочно SEC-M03 (path traversal в defaultPath) и SEC-L10 (HTML size DoS).
  - .github/workflows/release.yml:
    - concurrency: `group=release-${{ github.ref }}`, `cancel-in-progress: false` (SEC-L07).
    - `permissions: {}` на workflow + `permissions.contents: write` только в job `build` (SEC-M05).
    - actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1, actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8 # v4.0.2 (SEC-M04).
    - Шаг "npm audit (production deps)" после npm ci с `continue-on-error: true` (SEC-L08).
  - package.json:
    - `packageManager: "npm@10.8.2"` (Corepack).
    - `engines.npm: ">=10.0.0"` добавлено к существующему engines.node.
  - CLAUDE.md:
    - Полная актуализация: bootstrap-блок заменён описанием Electron 32 + React 19 + TS 5 стека, обзора слоёв (domain/UI/main/preload/IPC), npm-скриптов, slash-команд, health-workflows с правильным quality-gate для FloorCalc, Beads-флоу, project rules.

  Эффект:
  - Защитная поверхность IPC-границы соответствует инварианту проекта; renderer-payload строго валидируется до достижения savePng/savePdf/printHtml. Регрессий нет: typecheck PASS, vitest 171/171 PASS.
  - CI-pipeline release устойчив к compromise upstream-actions (SHA-pinning), least-privilege на job-уровне, защита от race condition при force-push, видимость уязвимостей зависимостей в логах CI.
  - Reproducibility сборки повышена через зафиксированный package manager.
  - Документация CLAUDE.md соответствует фактическому состоянию проекта v1.0.11.

---

_This release was automatically generated from 1 commits._

## v1.0.11

_Released on 2026-05-08_

### 🐛 Bug Fixes

- **Updater**: встроить app-update.yml в portable.exe и переключить verify_autoupdate на authenticated GitHub API

  Решение:
  - Корневая причина «у меня запущена 1.0.9, обновление до 1.0.10 не предлагается» — electron-builder@25.1.8 для target:portable не встраивает app-update.yml внутрь portable.exe (verified 7z-extraction трёх портаблов: GitHub v1.0.10, GitHub v1.0.9, локальный v1.0.9 — во всех в resources/ есть только app.asar и elevate.exe). На клиенте isUpdateConfigPresent() в electron/main/updater.ts:19-21 возвращает false, и автоапдейтер тихо отключается с записью «[updater] disabled: app-update.yml not found». Так было во всех релизах — фикс универсальный.
  - Решение: статичный build/app-update.yml в репозитории + extraResources в electron-builder.yml копирует его в resources/app-update.yml ДО упаковки в 7z. После пересборки app-update.yml оказывается внутри \$PLUGINSDIR/app-64.7z portable'а, при runtime-распаковке попадает в process.resourcesPath и проходит existsSync-чек.
  - Параллельно: verify_autoupdate в release.sh при предыдущем /push выгорел на rate-limit (60 req/час для анонимных запросов к api.github.com — за один прогон ~40 запросов). Curl с -fsSL молча проглатывает HTTP 403, скрипт печатает misleading «GitHub API not reachable». Перевёл на gh_api_get() helper с тремя режимами: gh CLI (5000/час), GITHUB_TOKEN curl (5000/час), anon-fallback с честной диагностикой по HTTP-кодам (403→rate-limit, 404→repo/path, 5xx→transient, 000→network). Для CDN-ассетов (releases/download/.../latest.yml) curl сохранён — там лимита нет, но добавлен --write-out '%{http_code}' для surfacing реальной причины ошибки.
  
  Изменения:
  - build/app-update.yml:
    - Новый файл (140 байт): provider:github, owner:AlgorithmicTrade, repo:FloorCalc, releaseType:release, vPrefixedTagName:true, updaterCacheDirName:floorcalc-updater. Значения зеркалят publish-секцию electron-builder.yml.
  - electron-builder.yml:
    - Между секциями files: и asar: добавлен extraResources с from:build/app-update.yml → to:app-update.yml. Кладёт файл в <resources>/ финального portable.
  - scripts/build-safe.cjs:
    - Шаг 7 (Конфиг autoupdate): код функционально не изменён, переписан комментарий — основной путь теперь через extraResources, ручная generateAppUpdateYml(...) осталась как fallback (срабатывает только если файла нет; ветка existsSync(...) логирует «уже на месте» и пропускает).
  - .claude/scripts/release.sh:
    - Новые строки 1361-1429: detect _gh_api_mode (gh / token / anon) с one-time warning для anon-режима, helper gh_api_get(path) с 3 ветками execution.
    - Строка 1445: curl call для actions/runs заменён на gh_api_get(...).
    - Строка 1503: curl call для releases/tags заменён на gh_api_get(...).
    - Строки 1487-1490: misleading сообщение «GitHub API not reachable» убрано — теперь точная причина выводится из helper'а в stderr.
    - Строки 1535-1547: latest.yml CDN запрос — добавлен --write-out '%{http_code}' и tmp-файлы для surfacing HTTP-кода в варнинге, без переключения на gh (CDN не лимитится).
  
  Эффект:
  - Verified локальной пересборкой (npm run build:safe, 68 секунд): release/FloorCalc-1.0.10-portable.exe теперь содержит resources/app-update.yml внутри \$PLUGINSDIR/app-64.7z (140 байт, корректный YAML). Запуск нового portable показал в debug.log отсутствие строки «[updater] disabled: app-update.yml not found» — autoupdater активируется штатно.
  - После релиза этого фикса (и публикации v1.0.11 через CI с --publish always) на машине пользователя нужно ОДИН раз вручную скачать v1.0.11 portable с GitHub Releases и заменить им запущенную v1.0.9/v1.0.10 — старые бинарники физически не имеют app-update.yml. С v1.0.11 → v1.0.12+ автоапдейт пойдёт автоматически.
  - verify_autoupdate в release.sh теперь не выгорит на двух подряд /push: gh CLI (установлен через scoop) аутентифицирует запросы к api.github.com, лимит 5000/час вместо 60. Если gh не залогинен и нет GITHUB_TOKEN — скрипт продолжает работать в anon-режиме, но теперь печатает реальную причину ошибки (rate-limit / 404 / 5xx) вместо misleading «not reachable».
  - typecheck и tests не затрагивались правкой (изменены только build-config и shell-скрипт); смоук-тест gh_api_get на реальном API: exit=0 на v1.0.10, exit=1 + чёткое «HTTP 404» на несуществующем теге.


---

_This release was automatically generated from 1 commits._

## v1.0.10

_Released on 2026-05-08_

### ✨ New Features

- **Release**: добавить post-release verification autoupdate-feed

  Решение:
  - Добавлен в release.sh шаг verify_autoupdate, который после push tag дожидается завершения GitHub Actions workflow и проверяет, что в Release опубликованы portable.exe и latest.yml, а advertised version в latest.yml совпадает с релизной — без этого electron-updater на установленных клиентах не получит обновление, и команда никак об этом не сигнализирует.
  - Аудит /commit и /push через скилл prompt-guidance-audit показал, что в push-команде отсутствует verification loop (rule H1) для high-risk операции «push tag → CI publish»; шаг закрывает этот gap.
  - На FAIL шаг graceful: тег уже на remote, поэтому печатается чёткое предупреждение и URL для ручной проверки, без rollback (последствия push необратимы).
  
  Изменения:
  - .claude/scripts/release.sh:
    - Новая функция verify_autoupdate(version): парсит electron-builder.yml (provider:github), поллит GitHub Actions API (таймаут 600s, интервал 15s) пока workflow run на head_branch=tag не получит conclusion, проверяет ассеты Release (portable.exe + latest.yml), валидирует «version:» в latest.yml.
    - В main(): добавлен флаг --no-verify-autoupdate (env RELEASE_SKIP_AUTOUPDATE_VERIFY=true) для отключения; вызов verify_autoupdate сразу после execute_release.
    - Usage-строка обновлена.
  - .claude/commands/push.md:
    - description расширен «and autoupdate verification».
    - argument-hint включает [--no-verify-autoupdate].
    - Features list: добавлен пункт про post-release autoupdate verification с описанием поведения и опции отключения.
  - .claude/settings.local.json:
    - allow-list дополнен двумя git-show командами на `electron-builder.yml` для исследования diff'а publish-конфига между тегами.
  
  Эффект:
  - Релизный pipeline теперь fail-loud при поломке autoupdate-feed: если CI упал или забыл загрузить latest.yml — команда сразу пишет, что autoupdate сломан, и подсказывает URL для починки, вместо тихого «RELEASE SUCCESSFUL».
  - Smoke-test verify_autoupdate на уже выпущенном v1.0.9 проходит: workflow detected → success → assets present → latest.yml advertises correct version.
  - Скрипт graceful: для проектов без electron-builder.yml или без provider:github проверка пропускается; для FAIL-сценариев релиз не откатывается (тег уже опубликован).


### 🐛 Bug Fixes

- **Core**: закрыть IPC defense-gap, очистить debug-логи и добавить autoupdate-feed генератор

  Решение:
  - Удалён мёртвый IPC-handler APP_SHOW_IN_FOLDER (renderer его не вызывал) — устранён единственный канал, принимавший произвольный path от renderer без zod-валидации (defense-in-depth gap).
  - Диагностические debug-блоки в main обёрнуты в флаг debugEnabled, добавлен size-cap для debug.log (1 MB truncate-by-rewrite) и cleanup устаревших updater-логов в os.tmpdir() с TTL 7 дней; четыре console.log из updater переведены на единый канал diagLog.
  - Добавлен .catch на app.whenReady() с показом dialog.showErrorBox при ошибке инициализации, и .catch на loadURL/loadFile для диагностики не-стартующего окна.
  - Resource-leak исправлен в ResultActions.tsx (setTimeout очищается в useEffect-cleanup и перед повторным запуском), roomCounter в roomsStore переведён на derived-state из текущего списка комнат, удалён мёртвый файл electron/main/menu.ts.
  - Скрипт scripts/build-safe.cjs научился генерировать app-update.yml для win-unpacked сборок из publish-секции electron-builder.yml — позволяет post-release verification находить feed для portable-сборок без --publish always.
  - README расширен под v1.0.9 (mixed-type раскладка, swap-кнопка, hover-tooltip, файловая раскладка userData, корректные dev-команды); package.json: в build добавлен флаг --publish never для исключения случайной публикации при локальной сборке.
  
  Изменения:
  - electron/main/ipc.ts:
    - Удалён ipcMain.handle(APP_SHOW_IN_FOLDER) и неиспользуемый импорт shell.
  - electron/preload/index.ts:
    - Удалён showItemInFolder из api.app.
  - src/shared/ipc-contract.ts:
    - Убрана сигнатура showItemInFolder и константа APP_SHOW_IN_FOLDER.
  - electron/main/index.ts:
    - diagLog: size cap 1 MB через truncate-by-rewrite перед appendFileSync.
    - cleanupStaleUpdaterLogs(): новая функция вызывается в app.whenReady(), удаляет floorcalc-spawn.log и floorcalc-update-*.log старше 7 дней (без throw).
    - app.whenReady().then(...).catch(...): dialog.showErrorBox + app.quit при ошибке инициализации; импортирован dialog из electron.
    - createWindow(): executeJavaScript-диагностика теперь работает только при debugEnabled; console-message listener фильтрует level >= 3 (только error); .catch на loadURL и loadFile с diagLog.
  - electron/main/updater.ts:
    - 4x console.log('[updater] ...') заменены на diagLog(...) с импортом из ./index.js.
  - electron/main/menu.ts:
    - Файл удалён целиком (buildMenu нигде не использовался; Menu.setApplicationMenu(null) подавляет меню).
  - src/components/result/ResultActions.tsx:
    - copyTimeoutRef: useRef для setTimeout; useEffect-cleanup при unmount; clearTimeout перед повторным запуском таймера.
  - src/store/roomsStore.ts:
    - module-level roomCounter удалён; nextRoomNumber(existing) считает следующий номер по regex /^Помещение\s+(\d+)$/ с max+1; makeRoom принимает текущий список комнат.
  - scripts/build-safe.cjs:
    - generateAppUpdateYml(targetPath): парсит publish-секцию electron-builder.yml без js-yaml и собирает минимальный app-update.yml (provider/owner/repo + опциональные releaseType/vPrefixedTagName/updaterCacheDirName).
  - package.json:
    - В скрипт build добавлен флаг --publish never (защита от случайной публикации локальной сборки).
  - README.md:
    - Расширено описание v1.0.9 — новые возможности (mixed-type, swap-кнопка, hover-tooltip), файловая раскладка userData, корректные dev-команды и Node-требование >=20.
  - .gitignore:
    - Добавлены .beads/ и reports/ (Beads-артефакты и health-check отчёты не коммитятся).
  - AGENTS.md (создан bd init):
    - Landing-the-plane инструкции для агентов, использующих bd issue tracker.
  
  Эффект:
  - IPC-поверхность атаки сужена: defense-in-depth gap устранён полностью — renderer больше не имеет канала с произвольным path-input в shell.
  - Production-сборка перестаёт писать debug-инфо в console на каждый dom-ready, debug.log не растёт без границ, tmpdir-логи updater после многократных апгрейдов не накапливаются.
  - Тихие startup-ошибки теперь показывают пользователю dialog с причиной, упрощая диагностику; renderer-warning «set state on unmounted component» при быстром переключении вкладок устранён; roomCounter не теряет счётчик при HMR.
  - post-release verification получает рабочий app-update.yml в win-unpacked, что позволяет валидировать autoupdate-feed после локальной (--publish never) сборки.
  - typecheck (electron + web) + 171/171 Vitest tests — всё green; 0 регрессий.


---

_This release was automatically generated from 2 commits._

## v1.0.9

_Released on 2026-05-07_

### ✨ New Features

- **App**: упростить hint, добавить swap-кнопку, обновить tooltip обрезка и safe-build

  Решение:
  - В EmptyState панели результатов убрать пояснения «(поперёк рулона)/(вдоль рулона)» — оставить чистое «Ширина и длина в метрах».
  - Добавить компактную IconButton-стрелку свапа между полями ширины и длины (один patch updateRoom меняет оба значения местами).
  - В hover-tooltip схемы заменить две дельтовые строки «Обрезок: −X (длина/ширина)» одной строкой с площадью остатка для всего рулона целиком (агрегация по rollIndex через formatAreaTrim) — корректно работает в economy / optimal / mixed.
  - Добавить Windows-friendly скрипт build:safe для обхода EBUSY на release\win-unpacked\resources\app.asar (типичный handle от Defender / Explorer).
  
  Изменения:
  - src/components/rooms/RoomResultPanel.tsx:
    - EmptyState.hint: упрощён текст подсказки.
  - src/components/rooms/RoomEditor.tsx:
    - dimensions: между двумя <label> добавлен .swapWrap с IconButton (size="sm") и SVG-стрелкой; onClick меняет width/length местами одним patch'ем updateRoom.
  - src/components/rooms/RoomEditor.module.css:
    - .swapWrap: flex-column align-items: flex-end — кнопка прижата к низу, на одной линии с input'ами.
  - src/components/result/SchemeView.tsx:
    - computeTooltipLines: принимает result.pieces, считает usedArea по piece.rollIndex, выводит leftoverArea = roll.area − usedArea одной строкой «Обрезок: X.YY м²»; импорт formatAreaTrim; обновлён header-комментарий.
  - scripts/kill-processes.cjs:
    - taskkill для FloorCalc.exe / electron.exe / app-builder.exe / 7z.exe / electron-builder.exe (silent на «не найдено»).
  - scripts/build-safe.cjs:
    - Pipeline: kill-процессы → каскадная очистка out/ и release/ (cmd rmdir → fs.rmSync → rename + async cleanup, до 5 попыток с kill+sleep между ними) → fallback на release-new/ или release-<ts>/ через --config.directories.output → typecheck → electron-vite build → electron-builder.
  - package.json:
    - scripts.build:safe → node scripts/build-safe.cjs.
  - .gitignore:
    - release-new/ добавлен в локальные test-build outputs.
  - .claude/settings.local.json:
    - расширен allow-list permissions для git push/tag/checkout и cleanup-команд updater'а (локальный конфиг сессии).
  
  Эффект:
  - UX редактора помещения чище: меньше текста в подсказке, мгновенный свап ориентации одним кликом.
  - Tooltip схемы даёт более полезную метрику — реальная площадь остатка рулона, а не дельты сторон одного куска (171 unit-test зелёный, type-check OK).
  - Сборка под Windows надёжнее: при заблокированном release/ автоматически переключается на release-new/, не требует ручного закрытия Explorer/Defender и не падает с EBUSY на app.asar.


---

_This release was automatically generated from 1 commits._

## v1.0.8

_Released on 2026-05-07_

### Bug Fix

- Окончательно исправлен запуск приложения после обновления. В v1.0.7 PowerShell-launcher запускался успешно, но **наследовал Windows job-object Electron'а** и убивался при `app.quit()` до того как успевал стартовать cmd. Аналогичная проблема была у v1.0.4 (PowerShell -File). Возврат к проверенному pattern v1.0.5 — `cmd /c start "" /MIN /B bat` — где встроенная команда `start.exe` использует `CREATE_BREAKAWAY_FROM_JOB` для отрыва helper'а от job-object.
- Зависимости только встроенные: `cmd.exe`. Нет зависимости от WSH (отключён на части систем) или PowerShell (привязан к job).
- На экране helper-cmd мелькнёт минимизированным (не разворачиваясь). Полное скрытие окна без WSH или подписанных native-launcher'ов на Windows 10/11 невозможно — компромисс ради надёжности.
- Все улучшения 1.0.6 сохранены: rename файла на актуальную версию, отсутствие ошибки «The batch file cannot be found».

## v1.0.7

_Released on 2026-05-07_

### Bug Fix

- Исправлено падение обновления с ошибкой `Windows Script Host — Отсутствует исполняющее ядро для расширения имени файла ".vbs"`. На части Windows 10/11 систем Windows Script Host отключён по умолчанию (Defender ASR / GroupPolicy / будет deprecated в Win11 24H2), и `.vbs`-launcher из v1.0.6 не выполнялся.
- VBS заменён на PowerShell 5.1 (встроен во все Windows 10/11 без установки). PowerShell используется только как launcher для скрытого запуска cmd — вся логика обновления остаётся в нативном cmd-bat.
- Принцип «работа без установки доп. софта на Windows 10/11» полностью соблюдён: используются только встроенные `cmd.exe` и `powershell.exe`.
- Скрытие cmd-окна, переименование файла после обновления и устранение «The batch file cannot be found» из v1.0.6 сохранены.

## v1.0.6

_Released on 2026-05-07_

### Improved

- **Скрыто чёрное cmd-окно.** При нажатии «Перезапустить и обновить» больше не мелькает консольное окно. Helper-скрипт теперь запускается через `wscript.exe` + VBS-launcher, который стартует cmd в hidden mode.
- **Имя файла в `release/` подхватывает версию.** После обновления `FloorCalc-0.2.0-portable.exe` автоматически переименовывается в `FloorCalc-1.0.6-portable.exe`. При следующих апдейтах имя продолжит отражать актуальную версию.
- **Убрана ошибка «The batch file cannot be found».** Используется стандартная идиома self-deleting bat (`(goto) 2>nul & del`) — cmd не пытается читать файл после его удаления.

## v1.0.5

_Released on 2026-05-07_

### Bug Fix

- Окончательно починен запуск приложения после обновления. В v1.0.4 helper-скрипт пытался вызывать PowerShell внутри bat-файла через `^`-continuation, и cmd падал с ошибкой `^ : Имя ^ не распознано как имя командлета` — exe не заменялся, новая версия не стартовала.
- Helper переписан полностью на cmd (без PowerShell): `copy /Y` для замены файла, `tasklist` для ожидания родительского процесса, `start ""` для детачнутого запуска. Никаких внешних интерпретаторов — нет проблем с экранированием.
- Файл генерируется с CRLF line-endings — обязательно для надёжной работы cmd.exe.
- Лог `%TEMP%\floorcalc-update-<uuid>.log` теперь пишется на каждом шаге без потерь.

## v1.0.4

_Released on 2026-05-07_

### Bug Fix

- Исправлен запуск приложения после обновления. В версии 1.0.3 приложение закрывалось при нажатии «Перезапустить и обновить», но новая версия не запускалась. Причина: helper-процесс обновления (PowerShell) убивался вместе с Electron из-за наследования Windows job-object. Теперь helper запускается через `cmd.exe /c start "" /B` в полностью независимом процессе — portable-exe корректно заменяется и запускается.
- Добавлен spawn-лог `%TEMP%\floorcalc-spawn.log` для диагностики процесса запуска хелпера.
- Обновление с версии 0.2.0 (и 1.0.3) на 1.0.4 через кнопку «Перезапустить и обновить» теперь работает корректно.

## v1.0.3

_Released on 2026-05-07_

### 🐛 Bug Fix

- Исправлена замена portable.exe при автообновлении. Раньше приложение закрывалось после нажатия «Перезапустить и обновить», но не запускалось обратно на новой версии. Причина: helper-скрипт пытался заменить временно распакованный `FloorCalc.exe` в `%TEMP%`, который удалялся бутстраппером при выходе. Теперь скрипт заменяет исходный `portable.exe` (через `PORTABLE_EXECUTABLE_FILE`) и корректно перезапускает приложение.
- Добавлено логирование процесса обновления в `%TEMP%\floorcalc-update-<uuid>.log` — для диагностики, если что-то пойдёт не так.
- Copy-Item с retry-loop (10 × 1s) надёжнее чем одна попытка Move-Item — даёт антивирусу/индексатору время освободить лок на exe.

## v1.0.2

_Released on 2026-05-07_

### 🛠️ Release Fix

- Включено auto-update для portable target. electron-builder для `target: portable` не создаёт `latest.yml`, без которого electron-updater не может проверить наличие новой версии. Workflow `Release` теперь после сборки сам считает sha512 portable-exe и заливает `latest.yml` в release через `gh release upload`.
- Это закрывает gap между portable-distribution и кастомным auto-update flow (helper-скрипт замены exe, который уже работает в приложении).

### 🔄 Auto-update

- `FloorCalc-0.2.0-portable.exe` (собранный с `app-update.yml` в resources) увидит `latest.yml@1.0.2` и предложит обновление через UpdateBanner.
- Все будущие релизы будут автоматически содержать `latest.yml` без ручных действий.

## v1.0.1

_Released on 2026-05-07_

### 🛠️ Release Fix

- Восстановлена публикация артефактов на GitHub Releases. В предыдущем релизе `v1.0.0` workflow `Build & publish` упал на загрузке `.exe` из-за активного ruleset *Immutable Releases* (`422: Cannot upload assets to an immutable release`). Ruleset отключён, релиз перевыпущен под версией `1.0.1` (тег `v1.0.0` сохраняется по политике запрета удаления тегов).
- Содержательная функциональность приложения идентична `v1.0.0` — это релиз-фикс CI, не код-изменение.
- Версии `package.json` и `package-lock.json` синхронизированы (в `1.0.0` lock остался на `0.2.0`).

### 🔄 Auto-update

- `FloorCalc-0.2.0-portable.exe`, собранный с вшитым `app-update.yml`, при первом запуске обнаружит `latest.yml` от `1.0.1` и предложит обновление через `UpdateBanner`.

## v1.0.0

_Released on 2026-05-07_

### ✨ New Features

- **App**: Mixed-type раскладка с rotation, дифференциация режимов и переработка UI

  Решение:
  - Реализован mixed-type алгоритм: одна схема комбинирует разные типоразмеры рулонов из активного каталога.
  - Добавлен rotation post-pass — горизонтальные и вертикальные куски в одной схеме (замена однородного tail-row одним повёрнутым piece из подходящего offcut'а).
  - calculateMixedBestOrientation перебирает обе ориентации комнаты (width↔length swap), pieces транспонируются обратно в исходную систему координат.
  - Режимы economy/optimal теперь дают разные результаты: economy агрессивно реюзит обрезки → меньше рулонов; optimal предпочитает целые куски при placedAtY=0 → меньше резов.
  - selectMixed перебирает mixed + N single-type кандидатов и выбирает лучший по lex-ключу с tie-break по cuts.
  - UI полностью переработан: stats и схема внутри одного Konva-stage (попадают в экспорт PNG/PDF/print/copy), HTML hover-tooltip у курсора, цветные swatch для типоразмеров, layout с RoomEditor+RollCatalog в левой колонке.
  - Electron: окно уменьшено на 30%, версия в заголовке, application/context menu убраны, file-logging диагностики, persistence размера окна, защита от ENOENT app-update.yml в локальном portable build.
  - Renderer-CSP перенесён из meta-тега в HTTP-header (file:// + meta + script-src 'self' блокировал ES-модули → чёрное окно).
  - react-konva апгрейд 18.2 → 19.2.3 (совместимость с React 19, фикс ReactCurrentBatchConfig).

  Изменения:
  - src/domain/calculator/mixed.ts (новый):
    - calculateMixed: greedy с общим OffcutBank и rollIndexToType для разных типов.
    - chooseBestRoll: mode-aware выбор (economy=min sufficient.length, optimal=max sufficient.length, fallback=max insufficient).
    - calculateMixedBestOrientation: перебор обеих ориентаций + транспонирование pieces.
    - applyRotationPass: детект однородного tail-row → замена одним rotated piece из offcut'а.
    - pickPrimaryRollTypeId: primary type по площади.
  - src/domain/calculator/selectMixed.ts (новый):
    - countCuts: эвристика числа резов по piece-size vs source-roll (учитывает rotated).
    - selectMixed: mixed + N single-type кандидатов, lex-key (rollsUsed/pieces.length/cuts/waste для economy, pieces.length/cuts/rollsUsed/waste для optimal).
  - src/domain/calculator/seams.ts:
    - computeSeamCount (новая) — кол-во дискретных швов.
    - computeSeamLength помечена @deprecated.
  - src/domain/calculator/{economy,optimal,selectRoll,bank,index}.ts:
    - миграция на seamCount, findBestFor с min-length параметром, экспорты mixed/selectMixed/countCuts.
  - src/domain/types.ts:
    - Piece.rotated?: boolean.
    - CalculationResult.seamCount вместо totalSeamLengthMm.
  - src/domain/units.ts:
    - formatMTrim, formatAreaTrim — без trailing zeros.
  - src/components/result/SchemeRenderer.ts:
    - getRollTypeColor по позиции в каталоге, stats-block внутри stage (rollsUsed/Кусков/waste + цветные swatch на 2-й строке), cut-labels с pieceId (vertical+horizontal), поддержка rotated в источнике, threshold pieceLabel снижен до 14×14, formatMTrim/formatAreaTrim для размеров.
  - src/components/result/SchemeView.tsx:
    - native Konva (без react-konva), Group по pieceId с hover-listener, HTML overlay-tooltip за курсором (mousemove), useImperativeHandle с временным visible(true) cutLabel перед toCanvas/toDataURL/toBlob, поддержка rotated piece в tooltip lines.
  - src/components/result/ResultCard.tsx:
    - ResultActions перенесён в header (рядом с warnMark), MODE_TOOLTIPS на Eyebrow, fullCatalog → SchemeView, ResultText скрыт через .visuallyHidden.
  - src/components/result/ResultText.tsx:
    - «Стыков» → «Кусков», result.pieces.length, formatResultAsPlainText обновлён.
  - src/components/rooms/RoomEditor.tsx:
    - убраны пояснения «(поперёк/вдоль рулона)».
  - src/components/rooms/RoomResultPanel.tsx:
    - RoomEditor вынесен в App.tsx, useShallow(selectActiveRolls) — фикс React error #185 (zustand 5 + useSyncExternalStore).
  - src/App.tsx:
    - layout: left = RoomEditor + RollCatalog, right = RoomTabs + RoomResultPanel.
  - src/components/layout/AppShell.module.css:
    - leftColumn class, ширина 400px.
  - src/components/catalog/{AddRollForm,RollCatalog,RollRow}.tsx:
    - MAX_MM до 100м, formatMTrim для каталога, color-swatch + catalogIndex.
  - electron/main/index.ts:
    - setTitle(`${APP_NAME} v${app.getVersion()}`) + page-title-updated preventDefault, Menu.setApplicationMenu(null), spellcheck:false, context-menu preventDefault.
    - openDevTools только при FLOORCALC_DEBUG=1 или маркере <userData>/.debug.
    - file-logging diagLog в %APPDATA%/FloorCalc/debug.log + handlers did-fail-load/render-process-gone/preload-error/console-message.
    - CSP через session.webRequest.onHeadersReceived (file: добавлен ко всем директивам).
    - размер окна 900×560/720×500 minimum, restoreWindowState/persistWindowState.
  - electron/main/windowState.ts (новый): persist размера/позиции окна в %APPDATA%/FloorCalc/window-state.json, zod-валидация.
  - electron/main/updater.ts: isUpdateConfigPresent — skip checkForUpdates/downloadUpdate если app-update.yml отсутствует.
  - electron.vite.config.ts: removeCrossoriginPlugin (transformIndexHtml убирает crossorigin из script/link для file:// + sandbox).
  - index.html: CSP meta-тег удалён.
  - electron-builder.yml: явный win.icon = resources/icon.ico.
  - package.json: react-konva 19.2.3 (peer react ^19.2).
  - resources/icon.ico: обновлена иконка.
  - tests/domain/: calculator.mixed.test.ts (новый, 32), calculator.mixed-orientation.test.ts (новый, 19), calculator.mixed-rotation.test.ts (новый, 16); обновлены economy/optimal/seams под seamCount.

  Эффект:
  - Mixed-type расчёт с двумя ориентациями + rotation post-pass: на сценарии 21×4.9 м pieces.length снизился с 6 до 4 (rotated piece заменил три tail-куска).
  - На сценарии 3×7.5 м с активными 2×20 и 1.5×15 в optimal выбирается 1.5×15 (2 куска, 2 реза vs прежние 3 реза с 2×20).
  - Режимы economy и optimal реально различаются по rollsUsed/pieces/cuts/waste.
  - Корректно отображаются rotated куски, цветные swatch у типоразмеров, hover-tooltip следует за курсором; cut-labels попадают в экспорт PNG/PDF/print/copy.
  - Чёрное окно при запуске устранено (CSP-fix + react-konva апгрейд + crossorigin remove).
  - Размер окна −30%, заголовок «FloorCalc v1.0.0», нет application/context menu.
  - Диагностика — в %APPDATA%/FloorCalc/debug.log; DevTools опциональный (FLOORCALC_DEBUG=1).
  - Размер и позиция окна сохраняются между сессиями.
  - Локальная portable-сборка не показывает «Ошибка обновления» в отсутствии app-update.yml.
  - Тесты: 156 → 171 зелёные.


---

_This release was automatically generated from 1 commits._

## v0.2.0

_Released on 2026-05-07_

### ✨ New Features

- **App**: реализовать bootstrap FloorCalc — портабл-калькулятор раскроя рулонов

  Решение:
  - Поднята с нуля архитектура Electron + React + TypeScript + Vite по плану docs/plans/agile-prancing-pnueli.md.
  - Реализован pure-TS алгоритм 2D-раскроя в двух режимах (economy = greedy + банк обрезков, optimal = свежий рулон на полосу) с unit-тестами на реальных Room/RollType (без mocks).
  - Подключена design-система HashiCorp dark из DESIGN.md через CSS-tokens + 8 базовых компонентов на CSS-Modules; accent = Waypoint Cyan #14c6cb.
  - Настроена portable-сборка через electron-builder + auto-update через electron-updater + GitHub Releases с PowerShell-helper для replace+restart портабла.
  - Storage каталога рулонов в %APPDATA%\FloorCalc\data.json через atomic write + zod-валидация.
  
  Изменения:
  - package.json, .gitignore:
    - bump версии 0.0.0 → 0.1.0, добавлены runtime/dev deps, scripts dev/build/typecheck/test, type=module; build artifacts (out/, release/, dist/, coverage/) исключены.
  - tsconfig.json + tsconfig.{electron,web,node}.json:
    - composite-проект с разделением Node-context (electron/) и DOM-context (src/), path-aliases @/* и @shared/*, noUncheckedIndexedAccess.
  - electron.vite.config.ts, electron-builder.yml, vitest.config.ts, index.html:
    - electron-vite с тремя entries; portable target + GitHub publish provider (AlgorithmicTrade/FloorCalc); CSP с разрешением connect к GitHub для updater.
  - .github/workflows/release.yml:
    - publish на push tag v*: typecheck + tests + build:publish с GH_TOKEN.
  - electron/main/{index,ipc,storage,files,menu,updater,updaterHelper}.ts:
    - createWindow с contextIsolation/sandbox/nodeIntegration=false; ipcMain.handle для всех каналов; atomic JSON-store через .tmp + rename; savePng/savePdf через dialog.showSaveDialog; printHtml в скрытом BrowserWindow; UpdaterService с 30-сек проверкой + PowerShell-helper для замены exe.
  - electron/preload/index.ts:
    - contextBridge.exposeInMainWorld('api', ...) с типизированным FloorCalcAPI и unsubscribe из onStatus.
  - src/shared/{ipc-contract,constants}.ts:
    - канонические типы (RollType, StoredCatalog, UpdateStatus, FloorCalcAPI, SaveResult), константы IPC_CHANNELS, GITHUB_OWNER/REPO.
  - src/domain/{types,units,validation}.ts, calculator/{strip,bank,seams,economy,optimal,selectRoll,index}.ts:
    - integer-mm типы; OffcutBank с гильотинным резом и tie-break по площади; computeSeamLength через группировку pieces по placedAtX; selectBestRoll лексикографически.
  - tests/domain/{fixtures,bank,seams,calculator.economy,calculator.optimal}.test.ts:
    - Vitest без mocks: фабрики реальных Room/RollType, 69 кейсов на границы алгоритмов и швов.
  - src/styles/{tokens,typography,globals,print}.css, resources/fonts/InterVariable.woff2:
    - DESIGN.md tokens в CSS-variables; Inter Variable bundled (344 KB); A4 landscape print-стили; dark scrollbar; focus-ring через accent.
  - src/components/design-system/{Button,Card,TextInput,NumberField,Checkbox,Eyebrow,IconButton,Tabs}.tsx + .module.css, src/css-modules.d.ts:
    - 4 варианта Button; NumberField с m↔mm-конверсией и blur-clamp; aria-selected на Tabs; ariaLabel обязателен на IconButton.
  - src/store/{catalogStore,roomsStore,resultsCache,updateStore}.ts, src/ipc/client.ts, src/lib/hash.ts:
    - Zustand v5 с persist каталога через IPC; in-memory rooms (стартует с одной защитой от удаления последней); FIFO-кеш расчётов с MAX_ENTRIES=64; api через ленивый Proxy.
  - src/components/{catalog,rooms,result,update,layout}/**, src/lib/{exportPng,exportPdf,copyImage,printScheme}.ts, src/App.tsx, src/main.tsx:
    - 2-колонный AppShell; RollCatalog + AddRollForm; RoomTabs + RoomEditor; RoomResultPanel с двумя ResultCard (economy + optimal одновременно); Konva SchemeView с forwardRef → toBlob/toDataURL/toCanvas; ResultActions (copy/PNG/PDF/print); UpdateBanner на 4 ветви UpdateStatus.
  - README.md, DESIGN.md:
    - инструкции install/dev/build/release; перевод DESIGN.md в трекинг.
  
  Эффект:
  - Один portable .exe (~73 МБ) запускается на любом Win10 x64 без установки и без runtime-зависимостей.
  - Каталог типоразмеров сохраняется в %APPDATA%\FloorCalc\ между запусками; устойчив к битому JSON (graceful degradation на default catalog).
  - Расчёт раскроя работает в двух режимах одновременно с фактической геометрией; результаты кешируются по hash(room+rolls+mode); 69/69 unit-тестов зелёные.
  - Схема рендерится через Konva, копируется в clipboard, сохраняется PNG, экспортируется PDF (landscape A4), печатается через системный диалог.
  - Auto-update проверяет GitHub Releases через 30 сек после старта; в портабл-режиме replace через PowerShell-helper с graceful fallback (toast «откройте папку с обновлением») при read-only расположении.
  - Безопасность IPC: contextIsolation+sandbox+nodeIntegration=false; zod-валидация всех границ; никаких секретов в логах.
  - Полный typecheck проходит без ошибок (electron + renderer); electron-vite renderer-bundle 1.6 MB JS + 13 KB CSS + 350 KB Inter font.


---

_This release was automatically generated from 3 commits._
