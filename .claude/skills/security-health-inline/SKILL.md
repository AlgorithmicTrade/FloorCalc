---
name: security-health-inline
description: Inline orchestration workflow for security vulnerability detection and remediation with Beads integration. Provides step-by-step phases for security-scanner detection, priority-based fixing with vulnerability-fixer, and verification cycles. SKIP: для проектов без security-relevant кода (только конфиги/документация); для CI-only utilities без user input; если security-scanner не работает на текущем стеке
---

## Outcome

**Goal**: все critical/high security findings устранены или явно подтверждены как false positive; security-score проекта повышен

**Success criteria**:
- security-fixes-implemented.md содержит список исправлений с обоснованием каждого
- 0 hardcoded credentials в коде после фиксов
- Verified safe findings задокументированы с обоснованием false positive

**Stop rules**:
- Достигнут max iterations workflow
- Quality gate (type-check / build) не прошёл и rollback применён
- Пользователь явно остановил выполнение

**Project Stack Discovery (Phase 0)**: перед началом workflow прочитать `package.json` (deps + scripts + name), lock-файл (package-manager), `CLAUDE.md` (Active Technologies), `.mcp.json` (доступные MCP). Использовать выявленный package_manager (npm/pnpm/yarn/bun) для type-check/build, не хардкодить `pnpm`. Stack-specific MCP-вызовы (`mcp__supabase__*`, `mcp__context7__*` и т.п.) применять только при наличии в `.mcp.json`; иначе skip с пометкой в отчёте.

# Security Health Check (Inline Orchestration)

You ARE the orchestrator. Execute this workflow directly without spawning a separate orchestrator agent.

## Workflow Overview

```
Beads Init → Detection → Create Issues → Fix by Priority → Close Issues → Verify → Beads Complete
```

**Max iterations**: 3
**Priorities**: critical → high → medium → low
**Beads integration**: Automatic issue tracking

---

## Phase 1: Pre-flight & Beads Init

1. **Setup directories**:
   ```bash
   mkdir -p .tmp/current/{plans,changes,backups} reports
   ```

2. **Validate environment**:
   ```bash
   node -e "const s=require('./package.json').scripts||{}; console.log(Object.keys(s).join(' '))"
   ```
   - If `type-check` missing → use `build:main` as TypeScript check fallback
   - If `build` missing → report and exit

3. **Create Beads wisp**:
   ```bash
   bd mol wisp exploration --var "question=Security vulnerability scan"
   ```

   **IMPORTANT**: Save the wisp ID (e.g., `<bd-prefix>-xxx`) for later use.

4. **Initialize TodoWrite**:
   ```json
   [
     {"content": "Security scan", "status": "in_progress", "activeForm": "Scanning for vulnerabilities"},
     {"content": "Create Beads issues", "status": "pending", "activeForm": "Creating issues"},
     {"content": "Fix critical vulnerabilities", "status": "pending", "activeForm": "Fixing critical vulnerabilities"},
     {"content": "Fix high priority vulnerabilities", "status": "pending", "activeForm": "Fixing high vulnerabilities"},
     {"content": "Fix medium priority vulnerabilities", "status": "pending", "activeForm": "Fixing medium vulnerabilities"},
     {"content": "Fix low priority vulnerabilities", "status": "pending", "activeForm": "Fixing low vulnerabilities"},
     {"content": "Verification scan", "status": "pending", "activeForm": "Verifying fixes"},
     {"content": "Complete Beads wisp", "status": "pending", "activeForm": "Completing wisp"}
   ]
   ```

---

## Phase 2: Detection (Batched, Sequential)

**IMPORTANT**: Do NOT invoke a single scanner on the entire codebase — it will overflow context.
Split into 4 sequential scanners by directory, each with strict context protection.

**Run 4 sequential security-scanner agents** via Agent tool — invoke each batch one-by-one and **wait for it to complete** before invoking the next (do NOT use `run_in_background: true`, do NOT call multiple agents in a single message). Sequential execution preserves rate limits.

### Batch 1: Database — SQL Injection
```
subagent_type: "security-scanner"
description: "Scan database for SQL injection"
prompt: |
  Scan {project}/electron/database/ for SQL injection vulnerabilities ONLY.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - Maximum 20 files per scan.
  - Write findings incrementally to the report file.

  SCAN METHOD — Pattern-based ONLY:
  1. Grep for SQL patterns: string concatenation in queries, template literals with SQL
  2. Grep for: db.prepare, db.exec, db.run — check if parameters are bound
  3. For each match, read ONLY ±10 lines context
  4. Check if user input flows into SQL without sanitization

  Write results to: reports/security-scan-part1-database.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of vulnerabilities per priority (critical/high/medium/low).
```

### Batch 2: Engine — Secrets, WebSocket, Crypto
```
subagent_type: "security-scanner"
description: "Scan engine for secrets/WS security"
prompt: |
  Scan {project}/electron/engine/ for security vulnerabilities.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - If a file is >500 lines, search for keywords only.
  - Maximum 25 files per scan.

  SCAN METHOD — Pattern-based ONLY:
  1. Grep for hardcoded secrets: password, secret, api_key, apiKey, token, private_key
  2. Grep for: eval(, exec(, execSync(, child_process, spawn
  3. Grep for unsafe crypto: Math.random() for security, createHash('md5')
  4. Grep for WebSocket: ws:// without TLS, missing origin validation
  5. For each match, read ONLY ±10 lines context

  Write results to: reports/security-scan-part2-engine.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of vulnerabilities per priority.
```

### Batch 3: IPC + UI — XSS, Input Validation
```
subagent_type: "security-scanner"
description: "Scan IPC+UI for XSS/input issues"
prompt: |
  Scan {project}/electron/ipc/ and {project}/ui/ for XSS and input validation.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - Maximum 25 files per scan.

  SCAN METHOD — Pattern-based ONLY:
  1. Grep for XSS: innerHTML, dangerouslySetInnerHTML, document.write
  2. Grep for: eval(, Function(, setTimeout(string)
  3. Grep for missing validation in IPC: ipcMain.handle — check arg validation
  4. Grep for: shell.openExternal, nodeIntegration, contextIsolation, webSecurity
  5. For each match, read ONLY ±10 lines context

  Write results to: reports/security-scan-part3-ipc-ui.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of vulnerabilities per priority.
```

### Batch 4: Root Configs — Secrets, Misconfigurations
```
subagent_type: "security-scanner"
description: "Scan root configs for secrets"
prompt: |
  Scan {project} root files and configs for hardcoded secrets and misconfigurations.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file.
  - Maximum 15 files per scan.

  SCAN METHOD — Pattern-based ONLY:
  1. Grep recursively (excluding node_modules, dist, .git) for secrets patterns
  2. Check .env files, .gitignore for proper exclusions
  3. Check BrowserWindow security settings (sandbox, contextIsolation, nodeIntegration)
  4. For each match, read ONLY ±5 lines context

  Write results to: reports/security-scan-part4-configs.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of vulnerabilities per priority.
```

**After all 4 sequential scanners complete** (each finished one-by-one):
1. Read all 4 part reports
2. Deduplicate overlapping findings across reports
3. Create consolidated `reports/security-scan-report.md` with unified vulnerability list
4. Parse vulnerability counts by priority
5. If zero vulnerabilities → skip to Phase 7 (Final Summary)
6. Update TodoWrite: mark detection complete

---

## Phase 3: Create Beads Issues

**ДЕДУПЛИКАЦИЯ (ОБЯЗАТЕЛЬНО перед каждым `bd create`)**:
1. Перед созданием задачи искать существующие открытые задачи:
   ```bash
   bd search "{vuln_title_keywords}" --status open
   ```
2. Если найдена открытая задача с той же уязвимостью → **НЕ создавать дубль**, использовать существующий ID в маппинге
3. Создавать новую задачу **только если дубль не найден**

**For each vulnerability found** (после проверки дедупликации), create a Beads issue:

```bash
# Critical (P0) - Security critical gets highest priority
bd create "SECURITY: {vuln_title}" -t bug -p 0 -d "{description}" \
  --deps discovered-from:{wisp_id}

# High (P1)
bd create "SECURITY: {vuln_title}" -t bug -p 1 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Medium (P2)
bd create "SECURITY: {vuln_title}" -t bug -p 2 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Low (P3)
bd create "SECURITY: {vuln_title}" -t bug -p 3 -d "{description}" \
  --deps discovered-from:{wisp_id}
```

**Add security label**:
```bash
bd update {issue_id} --add-label security
```

**Track issue IDs** in a mapping for later closure (включая переиспользованные существующие ID).

Update TodoWrite: mark "Create Beads issues" complete.

---

## Phase 4: Quality Gate (Pre-fix)

Run inline validation:

```bash
pnpm type-check
pnpm build
```

- If both pass → proceed to fixing
- If fail → report to user, exit

---

## Phase 5: Fixing Loop

**For each priority** (critical → high → medium → low):

1. **Check if vulnerabilities exist** for this priority
   - If zero → skip to next priority

2. **Update TodoWrite**: mark current priority in_progress

3. **Claim issues in Beads**:
   ```bash
   bd update {issue_id} --status in_progress
   ```

4. **Invoke vulnerability-fixer** via Task tool:
   ```
   subagent_type: "vulnerability-fixer"
   description: "Fix {priority} vulnerabilities"
   prompt: |
     Read reports/security-scan-report.md and fix all {priority} priority vulnerabilities.

     For each vulnerability:
     1. Backup file before editing
     2. Implement fix
     3. Log change to .tmp/current/changes/security-changes.json

     Generate/update: reports/security-fixes-implemented.md

     IMPORTANT: Write the entire report in Russian language.

     Return: count of fixed vulnerabilities, count of failed fixes, list of fixed vuln IDs.
   ```

5. **Quality Gate** (inline):
   ```bash
   pnpm type-check
   pnpm build
   ```

   - If FAIL → report error, suggest rollback, exit
   - If PASS → continue

6. **Close fixed issues in Beads**:
   ```bash
   bd close {issue_id_1} {issue_id_2} ... --reason "Security fix applied"
   ```

7. **Update TodoWrite**: mark priority complete

8. **Repeat** for next priority

---

## Phase 6: Verification

After all priorities fixed:

1. **Update TodoWrite**: mark verification in_progress

2. **Invoke security-scanner** (verification mode):
   ```
   subagent_type: "security-scanner"
   description: "Verification scan"
   prompt: |
     Re-scan codebase after fixes.
     Compare with previous reports/security-scan-report.md.

     Report:
     - Vulnerabilities fixed (count)
     - Vulnerabilities remaining (count)
     - New vulnerabilities introduced (count)
   ```

3. **Decision**:
   - If vulnerabilities_remaining == 0 → Phase 7
   - If iteration < 3 AND vulnerabilities_remaining > 0 → Go to Phase 2
   - If iteration >= 3 → Phase 7 with remaining vulnerabilities

---

## Phase 7: Final Summary & Beads Complete

1. **Complete Beads wisp**:
   ```bash
   # If all fixed
   bd mol squash {wisp_id}

   # If nothing found
   bd mol burn {wisp_id}
   ```

2. **Обработка нерешённых уязвимостей** (если есть):
   - Проверить маппинг из Phase 3 — если задача ещё открыта → **НЕ создавать "REMAINING" дубль**
   - Если задача была закрыта, но уязвимость вернулась → переоткрыть:
     ```bash
     bd update {issue_id} --status open -d "Уязвимость не устранена. ТРЕБУЕТ РУЧНОГО ВМЕШАТЕЛЬСТВА. См. security-scan-report.md"
     ```
   - Создавать новую задачу **ТОЛЬКО** если в маппинге нет ID для этой уязвимости:
     ```bash
     bd create "SECURITY REMAINING: {vuln_title}" -t bug -p {priority} \
       -d "Not fixed in scan. REQUIRES MANUAL ATTENTION. See security-scan-report.md"
     bd update {new_issue_id} --add-label security
     ```

3. **Generate summary for user**:

```markdown
## Проверка безопасности — Завершено

**Wisp ID**: {wisp_id}
**Итераций**: {count}/3
**Статус**: {УСПЕХ/ЧАСТИЧНЫЙ}

### Результаты
- Обнаружено: {total} уязвимостей
- Исправлено: {fixed} ({percentage}%)
- Осталось: {remaining}

### По приоритетам
- Критические: {fixed}/{total}
- Высокие: {fixed}/{total}
- Средние: {fixed}/{total}
- Низкие: {fixed}/{total}

### Задачи Beads
- Создано: {count}
- Закрыто: {count}
- Осталось: {count} (метка SECURITY — требует внимания)

### Валидация
- Type Check: {status}
- Build: {status}

### Артефакты
- Обнаружение: `reports/security-scan-report.md`
- Исправления: `reports/security-fixes-implemented.md`
```

4. **Update TodoWrite**: mark wisp complete

5. **Record metrics** (ОБЯЗАТЕЛЬНО — НЕ ПРОПУСКАТЬ):

   **Источники данных** (читать в указанном порядке):
   - `report_date` → из frontmatter `reports/security-scan-report.md`, поле `generated` (дата текущего прогона)
   - `detection.*` → из frontmatter `reports/security-scan-report.md` (`issues_found`, `critical_count`, `high_count`, `medium_count`, `low_count`, `files_processed`)
   - `remediation.*` → из результатов Phase 5 (фактические данные текущего прогона: сколько исправлено, сколько осталось, сколько файлов изменено)
   - `verification.*` → из результатов Phase 6

   **ВАЖНО**: НЕ брать данные из `reports/security-fixes-implemented.md` — этот файл может содержать данные предыдущих прогонов. Использовать только фактические результаты текущей сессии.

   Прочитать `.tmp/metrics/YYYY-MM.json` (текущий месяц). Если не существует — создать структуру из шаблона `/record-metrics`.
   Обновить (или добавить) секцию `categories.security` данными текущего прогона:
   ```json
   "security": {
     "report_date": "YYYY-MM-DD",
     "detection": { "total_found": N, "critical": N, "high": N, "medium": N, "low": N, "files_scanned": N },
     "remediation": { "fixed": N, "remaining": N, "skipped_by_design": N, "failed": N, "fix_rate_percent": N, "files_modified": N },
     "verification": { "status": "PASSED|FAILED", "issues_verified": N, "fixes_confirmed": N },
     "score": { "current": N, "max": 100 }
   }
   ```
   Пересчитать `summary`, `health_scores` (fix_rate >=90%→HEALTHY, >=70%→NEEDS_ATTENTION, <70%→CRITICAL), `severity_distribution`.
   Записать файл через Write tool. **Если этот шаг не выполнен — workflow считается НЕЗАВЕРШЁННЫМ.**

6. **SESSION CLOSE PROTOCOL**:
   ```bash
   git status
   git add .
   bd sync
   git commit -m "security: {fixed} vulnerabilities fixed ({wisp_id})"
   bd sync
   git push
   ```

---

## Error Handling

**If quality gate fails**:
```
Rollback available: .tmp/current/changes/security-changes.json

To rollback:
1. Read changes log
2. Restore files from .tmp/current/backups/
3. Re-run workflow
```

**If worker fails**:
- Report error to user
- Keep Beads wisp open for manual completion
- Suggest manual intervention
- Exit workflow

**If Beads command fails**:
- Log error but continue workflow
- Beads tracking is enhancement, not blocker

---

## Quick Reference

| Phase | Beads Action |
|-------|--------------|
| 1. Pre-flight | `bd mol wisp exploration` |
| 3. After detection | `bd create` + `--add-label security` |
| 5. Before fix | `bd update --status in_progress` |
| 5. After fix | `bd close --reason "Fixed"` |
| 7. Complete | `bd mol squash/burn` |
| 7. Remaining | `bd create` with security label |
