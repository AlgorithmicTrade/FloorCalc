---
description: Automated release management with version bumping, dual changelogs, and autoupdate verification
argument-hint: [patch|minor|major] [-m "message"] [--no-verify-autoupdate]
allowed-tools: Bash
---

Execute the release automation script with auto-confirmation for Claude Code.

**Features:**
- Auto-syncs package.json versions with latest git tag (prevents version conflicts)
- Analyzes commits since last release
- Auto-detects version bump type from conventional commits
- **Generates dual changelogs:**
  - `CHANGELOG.md` - Technical format (Keep a Changelog) for developers
  - `RELEASE_NOTES.md` - User-facing format with friendly language for marketing
- Updates all package.json files
- Creates git tag and pushes to GitHub
- Full rollback support on errors
- **Custom commit message** for uncommitted changes via `--message` / `-m` flag
- **Post-release autoupdate verification** — после push tag скрипт ждёт завершения
  GitHub Actions workflow (до 10 мин), затем проверяет, что в Release появились
  `*-portable.exe` и `latest.yml`, и что `latest.yml` указывает на новую версию.
  Без `latest.yml` electron-updater на установленных клиентах НЕ увидит обновление —
  поэтому проверка обязательна. Отключить: флаг `--no-verify-autoupdate` или
  env-переменная `RELEASE_SKIP_AUTOUPDATE_VERIFY=true`. Шаг graceful: при FAIL не
  откатывает релиз (тег уже на remote), а печатает чёткое предупреждение и URL
  для ручной проверки.

**Generated RELEASE_NOTES.md format:**
- Friendly scope names (auth → Authentication, db → Database)
- Emojis for visual clarity (✨ Features, 🐛 Fixes, 🔒 Security)
- Skips technical commits (chore, ci, docs) not relevant to users
- Ready to copy for announcements, app stores, emails

**Tip:** Use `-m` with `feat:` or `fix:` prefix to include your changes in RELEASE_NOTES:
```bash
/push patch -m "feat(worker): add worker readiness pre-flight system"
```

**Usage:**

# Navigate to project root first
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
cd "$PROJECT_ROOT" && bash .claude/scripts/release.sh $ARGUMENTS --yes
