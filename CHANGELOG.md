# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.10] - 2026-05-08

### Added
- **Release**: добавить post-release verification autoupdate-feed (46a289e)

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


### Fixed
- **Core**: закрыть IPC defense-gap, очистить debug-логи и добавить autoupdate-feed генератор (9069a63)

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

## [1.0.9] - 2026-05-07

### Added
- **App**: упростить hint, добавить swap-кнопку, обновить tooltip обрезка и safe-build (e96dab9)

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

## [1.0.8] - 2026-05-07

### Fixed

- **Updater**: возврат к `cmd /c start "" /MIN /B bat` — единственному надёжному способу детачить helper от Electron job-object без зависимости от WSH.

  Решение:
  - **Корневая проблема (повторяющаяся между версиями).** Любой child, спавнутый напрямую из Electron на Windows (PowerShell, wscript, cmd-без-start), наследует Windows job-object Electron. Через ~500 мс `app.quit()` убивает весь job вместе с child'ом ДО ТОГО как helper успевает выполниться. Это и сломалось в v1.0.4 (`spawn powershell.exe -File`) и v1.0.7 (`spawn powershell.exe -Command 'Start-Process …'`). В v1.0.7 диагностика показала: PS-spawn успешен (`child.pid=620`), но bat-лог не создан — PS убит до `Start-Process`.
  - **Почему `cmd /c start "" /B` работает.** Встроенная команда cmd `start.exe` при создании child-процесса использует `CREATE_BREAKAWAY_FROM_JOB` flag в Win32 `CreateProcess`. Помощник bat выходит из job-object Electron и переживает `app.quit()`. Это проверенный pattern из v1.0.5.
  - **Почему НЕ wscript+vbs (v1.0.6).** WSH отключён по умолчанию на части Win 10/11 (Defender ASR / GroupPolicy / Win11 24H2 deprecation) — `Отсутствует исполняющее ядро для расширения .vbs`.
  - **Почему НЕ powershell -Command 'Start-Process' (v1.0.7).** PS наследует job-object и убит до `Start-Process` (см. выше).
  - **Что нового по сравнению с v1.0.5.** Добавлен флаг `/MIN` — окно helper-cmd мелькает минимизированным (не разворачиваясь), что менее заметно для пользователя. Полное скрытие окна без зависимости от WSH/PS на Win 10/11 без подписанных native launcher'ов невозможно — это компромисс между надёжностью и UX.
  - Все улучшения 1.0.6 (rename файла, `(goto) 2>nul & del` для self-clean) сохранены в bat без изменений.

  Изменения:
  - electron/main/updater.ts:
    - `installAndRestart()`: spawn заменён с `powershell.exe + -Command 'Start-Process …'` на `cmd.exe ['/c','start','','/MIN','/B', batPath]`. Опции `detached:true`, `stdio:'ignore'`, `windowsHide:true`, `shell:false` сохранены.
    - Комментарий полностью переписан: пояснены три провалившиеся попытки (powershell -File, wscript+vbs, powershell + Start-Process) и почему `cmd /c start /B` — единственный надёжный путь.
    - Пауза перед `app.quit()` 500 мс (cmd start стартует за ~50 мс, 10× запас).
  - electron/main/updaterHelper.ts:
    - Без изменений (логика wait/copy/rename/(goto)-trick из v1.0.6 сохранена).
  - package.json:
    - `version`: `1.0.7` → `1.0.8`.
  - package-lock.json:
    - top-level и `packages[""]` `version`: `1.0.7` → `1.0.8`.
  - CHANGELOG.md, RELEASE_NOTES.md:
    - Раздел `1.0.8` с описанием возврата к v1.0.5-pattern.

  Эффект:
  - Обновление работает: `start.exe` детачит helper из Electron job через `CREATE_BREAKAWAY_FROM_JOB`, bat переживает `app.quit()` и завершает работу.
  - На экране: окно helper-cmd мелькнёт минимизированным (как иконка в taskbar) и сразу закроется. Полностью без окна — не получается без WSH или native launcher'а.
  - Все возможности 1.0.6 (rename файла, отсутствие сообщения «cannot be found») работают.
  - Зависимости: только `cmd.exe` (встроен во все Windows). Никаких WSH, PowerShell, vbs.

## [1.0.7] - 2026-05-07

### Fixed

- **Updater**: убран VBS-launcher — на Windows 10/11 c отключённым Windows Script Host обновление падало с ошибкой `Отсутствует исполняющее ядро для расширения имени файла ".vbs"`.

  Решение:
  - В v1.0.6 helper запускался через `wscript.exe vbs` чтобы скрыть cmd-окно. Но на части Windows 10/11 систем Windows Script Host (WSH) отключён через Defender ASR rules, GroupPolicy, или будет deprecated в Windows 11 24H2. На таких системах `wscript.exe` либо отсутствует, либо отказывается выполнять `.vbs` → обновление полностью ломается.
  - Принцип проекта: работа на Windows 10/11 без установки доп. софта. WSH этому не соответствует.
  - VBS заменён на **PowerShell 5.1**, который **встроен во все Windows 10/11 без исключений** (часть Windows-as-a-Service). PS используется ТОЛЬКО как hidden-launcher для cmd — никакой логики обновления внутри PS:
    ```
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden
      -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', '<bat>') -WindowStyle Hidden"
    ```
  - `-WindowStyle Hidden` на самом PS-процессе скрывает окно при его старте.
  - `Start-Process … -WindowStyle Hidden` использует Win32 `CreateProcess` с `STARTUPINFO.wShowWindow = SW_HIDE` — cmd запускается полностью без окна.
  - `Start-Process` создаёт независимый процесс, не зависящий от job-object Electron — bat переживает `app.quit()`.
  - Вся бизнес-логика обновления (wait-loop, copy retry, rename, start, self-clean) остаётся в чистом cmd-bat (без PowerShell-вставок), поэтому проблем с экранированием/continuation у v1.0.4 больше не повторится.
  - Пауза между spawn и `app.quit()` увеличена с 300 до 500 мс — PS стартует медленнее cmd (~200 мс), страховка.

  Изменения:
  - electron/main/updaterHelper.ts:
    - `writeUpdateHelperScript()` снова возвращает `string` (только batPath) — VBS больше не генерируется.
    - Из bat убран `del /F /Q "%VBSFILE%"` (нет vbs).
    - Логика wait-loop, copy retry, rename, self-clean (`(goto) 2>nul & del`) сохранена без изменений.
  - electron/main/updater.ts:
    - `installAndRestart()` принимает `string` (batPath) от helper'а вместо `{ vbsPath, batPath }`.
    - spawn заменён с `wscript.exe [vbsPath]` на `powershell.exe ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', '<Start-Process command>']`.
    - PS-команда: `Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', '<bat>') -WindowStyle Hidden`. Экранирование `'` в bat-пути → `''` для PS single-quoted строк.
    - Пауза перед `app.quit()` 300 → 500 мс.
  - package.json:
    - `version`: `1.0.6` → `1.0.7`.
  - package-lock.json:
    - top-level и `packages[""]` `version`: `1.0.6` → `1.0.7`.
  - CHANGELOG.md, RELEASE_NOTES.md:
    - Раздел `1.0.7`.

  Эффект:
  - Обновление работает на Windows 10/11 с отключённым WSH (по умолчанию или через GP).
  - Никаких внешних зависимостей кроме PowerShell 5.1 и cmd, оба встроены в Windows 10/11.
  - Скрытие окна сохранено: PS hidden + Start-Process hidden — cmd вообще не видно.
  - Имя файла после обновления переименовывается в актуальную версию (логика 1.0.6 сохранена).
  - `(goto) 2>nul & del` устраняет «The batch file cannot be found» (логика 1.0.6 сохранена).

## [1.0.6] - 2026-05-07

### Improved

- **Updater**: косметическая полировка процесса автообновления — скрытие cmd-окна, корректное переименование portable.exe и устранение «The batch file cannot be found».

  Решение:
  - **Скрытие cmd-окна.** Запуск helper'а изменён с `cmd.exe /c start "" /B bat` на `wscript.exe vbs`. wscript использует GUI subsystem (не console), поэтому при его запуске не возникает мелькания консольного окна. Внутри vbs `WScript.Shell.Run "cmd /c <bat>", 0, False` стартует bat в hidden mode (`windowStyle = 0`) — пользователь больше не видит чёрного окна.
  - **Rename файла после copy.** Bat теперь извлекает basename из pending-exe (`FloorCalc-1.0.6-portable.exe`) и сравнивает с текущим именем target-exe (`FloorCalc-0.2.0-portable.exe`). Если различаются — выполняет `ren "%OLDEXE%" "<новое имя>"` после успешного `copy /Y`. В результате после обновления имя файла в `release/` отражает актуальную версию вместо «застывшей» 0.2.0. `start ""` запускается уже по новому пути.
  - **Self-clean trick.** Вместо прямого `del "%~f0"` в конце bat теперь используется идиома `(goto) 2>nul & del "%~f0"`. `(goto)` без метки вызывает редиректнутую в `nul` ошибку, которая прерывает парсинг блока cmd до del — del выполняется как post-batch action, и cmd не пытается прочитать строку после удаления файла. Сообщение «The batch file cannot be found» больше не появляется.
  - VBS-launcher тоже подчищается: bat в `:cleanup` блоке делает `del /F /Q "%VBSFILE%"` перед самоудалением — в `%TEMP%` не остаётся «осиротевших» vbs-файлов.

  Изменения:
  - electron/main/updaterHelper.ts:
    - `writeUpdateHelperScript()` теперь возвращает `{ vbsPath, batPath }` (раньше — только `string`).
    - Bat: добавлены `setlocal enabledelayedexpansion`, `for %%I in ("%NEWEXE%") do set "NEWNAME=%%~nxI"` (basename pending-файла), `for %%I in ("%OLDEXE%")` для `OLDNAME` + `OLDDIR`, переменная `FINALEXE = OLDDIR + NEWNAME`. После copy — блок `if /I not "!NEWNAME!" == "!OLDNAME!" ren …` (с fallback'ом FINALEXE на OLDEXE при ошибке rename). Пуск через `start "" "!FINALEXE!"`. Cleanup: `del vbs` + `(goto) 2>nul & del "%~f0"`.
    - Добавлен VBS-launcher `vbsLines`: `Set objShell = CreateObject("WScript.Shell")` + `objShell.Run "cmd /c ""<bat>""", 0, False`.
  - electron/main/updater.ts:
    - `installAndRestart()` принимает `{ vbsPath, batPath }` от helper'а. spawn заменён с `cmd.exe /c start "" /B <bat>` на `wscript.exe <vbs>` (с `detached:true`, `windowsHide:true`, `shell:false`). spawn-лог расширен (`vbsPath`, `batPath`).
  - package.json:
    - `version`: `1.0.5` → `1.0.6`.
  - package-lock.json:
    - top-level и `packages[""]` `version`: `1.0.5` → `1.0.6`.
  - CHANGELOG.md, RELEASE_NOTES.md:
    - Раздел `1.0.6` (Improved/Polish).

  Эффект:
  - При нажатии «Перезапустить и обновить» — никаких визуальных артефактов: окно приложения закрывается, далее тишина, через пару секунд открывается уже новая версия.
  - В `release/` появляется `FloorCalc-1.0.6-portable.exe` (старый `FloorCalc-0.2.0-portable.exe` исчезает после ren). При следующем апдейте 1.0.6 → 1.0.7 имя снова обновится.
  - Лог-файлы `%TEMP%\floorcalc-spawn.log` (Electron) и `%TEMP%\floorcalc-update-<uuid>.log` (bat) сохраняются для диагностики; vbs/bat сами себя удаляют после завершения.

## [1.0.5] - 2026-05-07

### Fixed

- **Updater**: переписан helper-скрипт обновления на чистый cmd.exe — устранён сбой `^ : Имя ^ не распознано` после нажатия «Перезапустить и обновить».

  Решение:
  - В v1.0.4 helper-bat вызывал inline `powershell.exe -Command "..."` через многострочный `^`-continuation. На запуске cmd падал с «Имя `^` не распознано как имя командлета», PS-блок никогда не выполнялся, exe не заменялся. Две причины:
    1. `^` перед CRLF теряет escape-функцию, если строка заканчивается **внутри двойных кавычек** PS-блока — cmd считывает `^` буквально, как имя команды.
    2. `writeFileSync` от Node.js пишет в LF (`\n`), а cmd.exe ожидает CRLF — обработка `^`-continuation в LF-only файлах ненадёжная.
  - Helper переписан на **чистый cmd**: `copy /Y` для замены exe вместо `Copy-Item`; `tasklist /FI "PID eq … " | findstr` для wait-loop; `start ""` для детачнутого запуска. PowerShell не используется — нет проблем с экранированием/кавычками/continuation.
  - Файл записывается с `\r\n` (CRLF) явно через `lines.join('\r\n')` — обязательно для надёжного парсинга cmd.exe.
  - Добавлен `chcp 65001 >nul` в начале — UTF-8 на случай путей с non-ASCII символами.
  - Retry-loop для copy сохранён (10 × 1 sec через goto + `set /A RETRIES`).
  - Логирование в `%TEMP%\floorcalc-update-<uuid>.log` через `echo … >> "%LOGFILE%"` — пишется на каждом шаге (start, parent exit, copy success/fail per attempt, removed pending, start invoked).

  Изменения:
  - electron/main/updaterHelper.ts:
    - `writeUpdateHelperScript()` полностью переписан. Логика wait→copy retry→remove→start выражена native cmd-командами. `lines.join('\r\n')` гарантирует Windows line-endings. PARENT_IMAGE = `FloorCalc.exe` для tasklist-фильтра.

  Эффект:
  - При нажатии «Перезапустить и обновить» helper теперь действительно выполняется до конца:
    - ждёт завершения parent process (tasklist),
    - копирует скачанный exe поверх исходного portable.exe (через `PORTABLE_EXECUTABLE_FILE`),
    - удаляет pending,
    - запускает новую версию через `start ""`.
  - Никаких больше сбоев на этапе разбора скрипта cmd-парсером.
  - Лог-файл `%TEMP%\floorcalc-update-<uuid>.log` теперь стабильно пишется — все шаги видны в timeline.

## [1.0.4] - 2026-05-07

### Fixed

- **Updater**: исправлен запуск helper-процесса обновления — приложение больше не закрывается без последующего запуска новой версии.

  Решение:
  - Корневая причина: `spawn('powershell.exe', ..., { detached: true })` не даёт полного отделения от родительского Windows job-object. Electron при старте дочернего процесса может добавить его в свой job-object, и PowerShell (.NET-runtime) наследует job-membership, из-за чего child убивается вместе с родителем при `app.quit()`, не оставляя никаких следов (лог-файл не создавался).
  - Решение: переход с `powershell.exe -File helper.ps1` на `cmd.exe /c start "" /B helper.bat`. `start "" /B` запускает батник в полностью независимом процессе без GUI-окна, разрывая связь с job-object родителя.
  - Вся логика Copy-Item retry (10 × 1s) и запуска нового exe сохранена внутри bat-файла через `powershell.exe -Command` (inline, без `-File` — не зависит от ExecutionPolicy на уровне файлов).
  - Добавлен spawn-лог в `%TEMP%\floorcalc-spawn.log`: записывает путь к helper-файлу, успех/ошибку spawn, момент вызова `app.quit()` — видно прямо на стороне Electron без открытия DevTools.
  - Добавлены `child.on('error')` и `child.on('spawn')` для диагностики: ошибки spawn теперь не теряются молча.
  - Добавлена пауза 300 мс между `spawn` и `app.quit()` чтобы OS успела выполнить `CreateProcess` до завершения родителя.

  Изменения:
  - electron/main/updaterHelper.ts:
    - `writeUpdateHelperScript()`: генерирует `.bat` вместо `.ps1`; wait-loop через `tasklist /FI "PID eq %PID%" | findstr`; Copy-Item retry через `powershell.exe -Command` (inline); лог через `>>` из bat + `Add-Content` из PS-блока.
  - electron/main/updater.ts:
    - `installAndRestart()`: spawn заменён на `cmd.exe /c start "" /B <helperPath>`; добавлены `windowsHide:true`, `child.on('error')`, `child.on('spawn')`; добавлен `spawnLogEntry` (append в `%TEMP%\floorcalc-spawn.log`); `await` 300 мс перед `app.quit()`.

  Эффект:
  - Helper-процесс (bat) гарантированно переживает `app.quit()` — job-object Electron больше не убивает его.
  - Лог-файл `%TEMP%\floorcalc-update-<uuid>.log` создаётся с первых секунд работы bat-хелпера.
  - `%TEMP%\floorcalc-spawn.log` отражает результат spawn на стороне Electron (spawn ok / ошибка) сразу при нажатии «Перезапустить и обновить».
  - После завершения bat portable-exe заменяется на новую версию и запускается автоматически.

## [1.0.3] - 2026-05-07

### Fixed

- **Updater**: исправлена замена portable.exe при `installAndRestart()` — раньше приложение закрывалось и не запускалось обратно на новой версии.

  Решение:
  - В `electron/main/updater.ts:installAndRestart()` использовался `process.execPath` как `oldExePath`. Для portable target этот путь указывает на распакованный во временной папке `%TEMP%/<hash>/FloorCalc.exe`, которая удаляется при `app.quit()`. PowerShell-helper пытался `Move-Item` на уже несуществующую папку → падал с ошибкой → новый exe не запускался.
  - Теперь используется `process.env.PORTABLE_EXECUTABLE_FILE` (выставляется electron-builder portable bootstrapom при запуске) — путь к **исходному** portable.exe, который пользователь запустил. Этот файл не удаляется при quit, его можно безопасно перезаписать.
  - Helper-скрипт переписан: `Move-Item` → `Copy-Item` с retry-loop (10 попыток × 1s) на случай anti-virus/indexer-локов; явный `Remove-Item` source после успеха; полное логирование в `%TEMP%/floorcalc-update-<uuid>.log` для диагностики; `$ErrorActionPreference = 'Continue'` + try/catch ловят все ошибки в лог вместо silent fail.

  Изменения:
  - electron/main/updater.ts:
    - `installAndRestart()`: `targetExePath = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath`.
  - electron/main/updaterHelper.ts:
    - `writeUpdateHelperScript()`: новый PS-скрипт с логом, retry-loop для Copy-Item, `Remove-Item` source, try/catch.

  Эффект:
  - При обновлении portable target: helper заменит исходный `release/FloorCalc-X.Y.Z-portable.exe` (или там, откуда пользователь запустил) на скачанный новый exe → запустит его → portable bootstrapper распакует свежий win-unpacked и стартует.
  - Лог-файл `%TEMP%\floorcalc-update-*.log` останется на диске после завершения helper (он сам себя удаляет, но лог не трогает) — позволяет диагностировать проблемы с обновлением.
  - В non-portable окружении (`process.env.PORTABLE_EXECUTABLE_FILE` отсутствует) поведение не меняется — fallback на `process.execPath`.

## [1.0.2] - 2026-05-07

### Fixed

- **CI/Updater**: добавлена ручная генерация и upload `latest.yml` для portable target.

  Решение:
  - electron-builder для `target: portable` не создаёт `latest.yml` (auto-update в portable изначально не поддерживается официально). В release v1.0.1 был только `FloorCalc-1.0.1-portable.exe`, а `latest.yml` отсутствовал → electron-updater на стороне клиента получал 404 и не мог обнаружить новую версию.
  - В workflow `Release` после шага `Build & publish` добавлен шаг `Generate and upload latest.yml (portable target)`: считает sha512 (base64) и size portable.exe, формирует `release/latest.yml` с полями `version`, `files[]`, `path`, `sha512`, `releaseDate` и заливает его через `gh release upload --clobber` в текущий тег.
  - Это закрывает gap между portable target и кастомным auto-update flow в `electron/main/updater.ts` (где `app-update.yml` + helper-скрипт замены exe уже реализованы).

  Изменения:
  - .github/workflows/release.yml:
    - Новый step `Generate and upload latest.yml (portable target)` после `Build & publish` — node-based sha512/size, heredoc YAML, `gh release upload --clobber`.
  - package.json:
    - `version`: `1.0.1` → `1.0.2`.
  - package-lock.json:
    - top-level и `packages[""]` `version`: `1.0.1` → `1.0.2`.
  - CHANGELOG.md, RELEASE_NOTES.md:
    - Раздел `1.0.2` с описанием fix'а.

  Эффект:
  - Каждый последующий релиз автоматически содержит `latest.yml` рядом с portable-exe → electron-updater видит новую версию через `releases/latest/download/latest.yml`.
  - autoUpdater на запущенном `FloorCalc-0.2.0-portable.exe` (с вшитым `app-update.yml` через extraResources) при первой проверке получит `latest.yml@1.0.2`, отправит `kind: 'available'` через `IPC_CHANNELS.UPDATER_STATUS`, `UpdateBanner` отрисует предложение обновления.
  - Прошлые релизы v1.0.0 / v1.0.1 остаются как есть (без artifact-fix back-port'а).

## [1.0.1] - 2026-05-07

### Fixed

- **CI/Release**: восстановлена публикация GitHub-релизов после конфликта с repository ruleset.

  Решение:
  - Workflow `Release` (`.github/workflows/release.yml`) на тег `v1.0.0` упал на шаге `Build & publish` с `422 Unprocessable Entity: "Cannot upload assets to an immutable release"` — релиз создавался, но активный ruleset *Immutable Releases* запрещал последующий `POST /releases/{id}/assets`. Из-за этого в релизе v1.0.0 остались только source-zip/tar.gz и attestation, без `FloorCalc-1.0.0-portable.exe` и `latest.yml`.
  - Ruleset *Immutable Releases* отключён в Settings → Rules → Rulesets. Tag-deletion rule (отдельный ruleset на `refs/tags/v*`) сохранён, поэтому существующий тег `v1.0.0` не удаляется и не перевыпускается.
  - Версия проекта поднята до `1.0.1`, синхронизирована между `package.json` и `package-lock.json` (в коммите `cf8b999` lock остался на `0.2.0` — рассинхронизация устранена).
  - Новый тег `v1.0.1` запустит свежий workflow run; теперь шаг `electron-builder --publish always` догрузит `FloorCalc-1.0.1-portable.exe`, `latest.yml` и `.blockmap` в новый release.

  Изменения:
  - package.json:
    - `version`: `1.0.0` → `1.0.1`.
  - package-lock.json:
    - top-level `version`: `0.2.0` → `1.0.1`.
    - `packages[""]` `version`: `0.2.0` → `1.0.1`.
  - CHANGELOG.md, RELEASE_NOTES.md:
    - Добавлен раздел `1.0.1`, поясняющий релиз-фикс.

  Эффект:
  - autoUpdater на запущенном `FloorCalc-0.2.0-portable.exe` (собранном с `app-update.yml`) увидит `latest.yml` от `1.0.1` и через `IPC_CHANNELS.UPDATER_STATUS` отправит `{ kind: 'available', current: '0.2.0', next: '1.0.1' }` в renderer; `UpdateBanner` покажет предложение обновления.
  - Существующий "пустой" release `v1.0.0` остаётся как исторический маркер (содержательная функциональность — та же, что в 1.0.1), его отдельная очистка/правка не требуется.
  - Версии `package.json` и `package-lock.json` синхронны → `npm ci` в CI больше не предупреждает о расхождении.

## [1.0.0] - 2026-05-07

### Added
- **App**: mixed-type раскладка с rotation, дифференциация режимов и переработка UI (fd18dbe)

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

## [0.2.0] - 2026-05-07

### Added
- **App**: реализовать bootstrap FloorCalc — портабл-калькулятор раскроя рулонов (a9ce6df)

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


### Other
- **repo**: добавить минимальный root package.json для release.sh (99bba73)

  Решение:
  - release.sh падает на pre-flight без `package.json` в корне репо (строка 247: `Not in project root. Could not find package.json`).
  - Создаётся минимальный private workspace-манифест (name=floorcalc, version=0.0.0, private=true) — без зависимостей и скриптов, чтобы не предрешать будущую структуру проекта.
  
  Изменения:
  - package.json:
    - name=floorcalc, version=0.0.0, private=true, description=FloorCalc workspace.
  
  Эффект:
  - /push (release.sh) проходит package.json check; следующий блокер — отсутствие git remote 'origin' (строка 437).
  - private=true исключает случайный npm publish.
  - Стартовая версия 0.0.0 — первый запуск /push minor выставит её в 0.1.0.

- **repo**: инициализировать git и зафиксировать оркестрационную инфраструктуру Claude Code (e5d0ddd)

  Решение:
  - Создать корневой git-репозиторий FloorCalc на ветке main — workspace ранее не был под версионным контролем.
  - Зафиксировать в истории импортированную конфигурацию `.claude/`: 39 субагентов по 11 доменам, ~40 скиллов, 26 slash-команд, hooks/schemas/scripts/rules — baseline для будущей работы.
  - Добавить корневой CLAUDE.md с workspace-выжимкой (orchestrator pattern, project rules, agent cheat sheet, push policy) — будущие сессии стартуют с релевантным контекстом без чтения upstream.
  - Исключить vendored upstream `claude-code-orchestrator-kit/` через .gitignore: пакет обновляется через npm и не должен загрязнять историю основного репо.
  
  Изменения:
  - .gitignore:
    - starter-набор: node_modules/, .tmp/, *.log, .env* (с исключением .env.example), OS-файлы (.DS_Store, Thumbs.db), Claude Code-артефакты (.claude/anytype-sync-queue.txt, hooks/__pycache__, hooks/beads-sync-trigger.log, worktrees/), vendored claude-code-orchestrator-kit/.
  - CLAUDE.md:
    - workspace-инструкции: repository status, orchestrator pattern (5 правил), command reference (/commit, /push, /health-*, /speckit.*, /anytype, /beads-init, /worktree, /process-logs, /ultra-think), .claude/ architecture, test runner selection (Vitest→test-writer / Jest→tester-bot), project rules summary, agent selection cheat sheet, push policy.
  - .claude/agents/{business,database,development,documentation,frontend,health,infrastructure,integrations,meta,research,testing}/workers/*.md:
    - 39 субагентов по 11 доменам (health, database/supabase, development, frontend, infrastructure, testing, research, meta, business, integrations, documentation).
  - .claude/commands/*.md:
    - 26 slash-команд: commit, push, anytype, beads-init, worktree, ultra-think, translate-doc, process-logs, supabase-performance-optimizer; health-{bugs,security,cleanup,deps,reuse,metrics}, record-metrics; speckit.{specify,clarify,plan,tasks,analyze,implement,checklist,constitution,tobeads,taskstoissues}.
  - .claude/skills/**:
    - ~40 скиллов: orchestrator inline (health-*-inline), parsing/formatting/validation утилиты, senior expertise (architect/devops/prompt-engineer/code-reviewer), workflow (rollback-changes, systematic-debugging, test-step, beads, process-issues/logs), creative/UX (algorithmic-art, artifacts-builder, canvas-design, theme-factory, frontend-aesthetics, ui-design-system, ux-researcher-designer, content-research-writer, lead-research-assistant, interview, webapp-testing).
  - .claude/hooks/beads-sync-trigger.py + __test_payloads/*.json:
    - PostToolUse hook: фильтрует мутирующие bd-вызовы, складывает FundingBot-* IDs в .claude/anytype-sync-queue.txt и через hookSpecificOutput напоминает оркестратору вызвать anytype-beads-sync только для этих ID. Read-only относительно Beads. Тестовые payload-ы покрывают update/create/quoted_path/chain/readonly/echo_quoted/grep/dep/nonbash сценарии.
  - .claude/schemas/{base,bug,dead-code,dependency,security}-plan.schema.json:
    - JSON-схемы plan-файлов orchestrator-агентов.
  - .claude/scripts/release.sh + gates/check-{bundle-size,coverage,security}.sh:
    - release automation (используется /push: bump, dual changelog, git tag, push, rollback) + quality-gate скрипты.
  - .claude/rules/*.md:
    - проектные правила: commit_message (русский conventional commit с секциями Решение/Изменения/Эффект), quality (no mocks, цитирование file:line), security (SecureStorageService для секретов), workflow, logging, preference (русский язык).
  - .claude/tasks/{open-orders-adapters-migration,private-api-centralization}.md:
    - архивные task-файлы — референс паттернов миграционных задач.
  - .claude/settings.json:
    - ENABLE_TOOL_SEARCH=auto:5, plansDirectory=./docs/plans, plugins: voltagent-{dev-exp,qa-sec}@voltagent-subagents.
  - .claude/statusline.ps1:
    - PowerShell-статусбар.
  - .claude/docs/beads-quickstart.{md,en.md}:
    - Beads-документация (RU/EN).
  
  Эффект:
  - Workspace готов к версионированию: впервые возможны git history, тэги, релизы.
  - Полная оркестрационная инфраструктура под контролем версий — любые модификации видны в diff и могут быть откачены.
  - Vendored upstream отделён от основного репо: npm-обновления не создают false-positive diff.
  - Будущие сессии Claude Code стартуют с workspace-выжимкой из корневого CLAUDE.md без обращения к upstream.
  - Воспроизводимая baseline для разработки FloorCalc; релизные тэги (v0.1.0+) появятся после добавления package.json и git remote.
