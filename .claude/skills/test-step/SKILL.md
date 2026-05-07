---
name: test-step
description: Run tester-bot agent at the end of a development step. Collects git diff context (changed files in electron/engine/) and launches tester-bot to write/run Jest tests in tests/execution/. Use when finishing a development step that touches execution engine managers. SKIP: for changes outside electron/engine/; for UI-only work (ui/); when tests in tests/execution/ are already up-to-date and no engine code changed.
allowed-tools: Bash
---

# test-step

Inline orchestrator that detects changed execution engine files and delegates Jest test writing and execution to the `tester-bot` agent.

## When to Use

- After completing a development step that modifies `electron/engine/**/*.ts`
- When invoked manually as `/test-step` at the end of any coding session
- When the user provides specific file paths as arguments to test

## Instructions

### Step 1: Collect Changed Files

If the user provided file paths as arguments to `/test-step`, use those directly — skip git diff entirely and proceed to Step 2.

Otherwise run both commands via Bash:

```bash
git diff --name-only HEAD
git status --short
```

Filter output to only lines matching the pattern `electron/engine/**/*.ts`.

If no matching files are found from the above, run a fallback against the previous commit:

```bash
git diff --name-only HEAD~1 HEAD
```

Apply the same filter. If still no files are found, stop and tell the user:

```
Изменённых файлов в electron/engine/ не найдено.
Укажи файлы вручную: /test-step electron/engine/arbitrage/managers/SomeManager.ts
```

### Step 2: Display Summary

Show the user which files will be tested before launching the agent:

```
Найдены изменённые файлы для тестирования:
- electron/engine/arbitrage/managers/SomeManager.ts
- electron/engine/arbitrage/managers/AnotherManager.ts

Запускаю tester-bot...
```

### Step 3: Launch tester-bot

Use the Task tool to invoke the `tester-bot` subagent.

**Task tool parameters:**
- `subagent_type`: `"tester-bot"`
- `description`: `"Write and run Jest tests for changed execution engine files"`
- `prompt`: structured message (see template below)

**Prompt template:**

```
Запусти фазы 0–4 из своего системного промпта для следующих изменённых файлов.

## Изменённые файлы

{LIST_OF_FILES}

## Инструкции

1. Фаза 0 — прочитай каждый файл, извлеки публичный интерфейс (классы, методы, типы, FSM-переходы, EventLog-вызовы)
2. Фаза 1 — проверь наличие существующих тестов в tests/execution/<ModuleName>.test.ts
3. Фаза 2 — создай или обнови тесты, покрывая: инстанциирование, публичный интерфейс, FSM-переходы, EventLog-события, пути ошибок
4. Фаза 3 — запусти тесты: npx jest tests/execution/ --no-coverage
5. Фаза 4 — верни структурированный отчёт

## Правила

- Тесты только в tests/execution/
- Именование: <ModuleName>.test.ts
- Фреймворк: Jest (jest.fn(), describe/it/expect)
- Не менять исходный код менеджеров — только тесты
- Если тест не проходит из-за ошибок компиляции TS — попробуй исправить пути импорта
- Если тест не проходит по бизнес-логике — сообщи об этом в отчёте (NEEDS FIX)
```

Replace `{LIST_OF_FILES}` with the actual list of changed files (one per line, with `- ` prefix).

### Step 4: Show Results

When the tester-bot agent returns, display its full report to the user without modification.

If the report status is `NEEDS FIX`, also show:

```
Статус: NEEDS FIX
Требуется ручное вмешательство. Проверь failures выше и исправь исходный код или тесты.
```

If the report status is `DONE`, show:

```
Статус: DONE — все тесты прошли успешно.
```

## Error Handling

- **No files found**: Tell user to specify files manually (see Step 1 fallback message)
- **tester-bot returns no report**: Display raw output and warn that report was incomplete
- **tester-bot reports jest not installed**: Escalate as blocker — do not retry automatically
- **User provides paths that don't match `electron/engine/`**: Warn user, but still pass the files to tester-bot (it can handle files outside the default scope if explicitly requested)

## Examples

### Example 1: Auto-detect from git diff

**Invocation**: `/test-step` (no arguments)

**git diff output**:
```
electron/engine/arbitrage/managers/FillManager.ts
electron/engine/arbitrage/managers/OrderManager.ts
ui/components/Dashboard.tsx
```

**Filtered files passed to tester-bot**:
```
- electron/engine/arbitrage/managers/FillManager.ts
- electron/engine/arbitrage/managers/OrderManager.ts
```

**Summary shown to user**:
```
Найдены изменённые файлы для тестирования:
- electron/engine/arbitrage/managers/FillManager.ts
- electron/engine/arbitrage/managers/OrderManager.ts

Запускаю tester-bot...
```

### Example 2: User provides files manually

**Invocation**: `/test-step electron/engine/arbitrage/managers/RiskManager.ts`

**Behaviour**: Skip git diff entirely. Pass `electron/engine/arbitrage/managers/RiskManager.ts` directly to tester-bot.

### Example 3: No changed engine files

**Invocation**: `/test-step` (no arguments, only UI files changed)

**git diff output**:
```
ui/components/Chart.tsx
ui/styles/theme.css
```

**Response to user**:
```
Изменённых файлов в electron/engine/ не найдено.
Укажи файлы вручную: /test-step electron/engine/arbitrage/managers/SomeManager.ts
```

### Example 4: Fallback to HEAD~1

**Invocation**: `/test-step` (no arguments, working tree is clean after commit)

**git diff HEAD** returns empty. Fallback runs:
```bash
git diff --name-only HEAD~1 HEAD
```
Returns `electron/engine/arbitrage/managers/HedgeManager.ts`. Proceeds with that file.

## Validation

- [ ] Changed files are filtered to `electron/engine/**/*.ts` only (unless user provides paths manually)
- [ ] Summary is shown to user before launching agent
- [ ] Task tool is called with `subagent_type: "tester-bot"`
- [ ] Prompt includes the full file list with `- ` prefix
- [ ] Prompt instructs tester-bot to follow phases 0-4
- [ ] tester-bot report is displayed in full without modification
- [ ] DONE / NEEDS FIX status is clearly communicated to user

## Integration with Agents

This skill acts as the entry point that bridges the developer workflow with `tester-bot`.

**Calling pattern:**
```
/test-step  →  Skill collects files  →  Task(tester-bot)  →  Report displayed
```

`tester-bot` is located at `.claude/agents/testing/workers/tester-bot.md` and runs phases 0–4 autonomously. The skill only needs to supply the file list and the instruction to follow its own system prompt.

## Notes

- This skill is project-specific to FundingBot (arbitrage trading bot)
- UI files (`ui/**`) are intentionally excluded from the filter — architecture rules prohibit analyzing UI WebSocket code unless explicitly requested
- The skill uses inline Bash for git commands, not a subagent, to keep latency low
- Mandatory test location: `tests/execution/<ModuleName>.test.ts`
- Do not modify source managers during this skill — testing only
