---
name: beads
description: Beads (bd) issue tracking — git-backed, AI-native task management. TRIGGER when user mentions Beads/bd, asks to create/update/close issues, runs `bd` commands, or starts a session with `bd prime`/`bd ready`. SKIP: for plain GitHub Issues without bd, for non-issue task management (TodoWrite for ephemeral session todos), or in projects without `.beads/` initialized.
---

# Beads Issue Tracking Skill

> **Attribution**: [Beads](https://github.com/steveyegge/beads) by [Steve Yegge](https://github.com/steveyegge)

## Description

Beads is a git-backed, AI-native issue tracking system. This skill helps AI agents work with Beads effectively.

## When to Use

- Starting a new work session (bd prime → bd ready)
- Creating, updating, or closing issues
- Managing task dependencies
- Running workflow formulas
- Coordinating multi-session work

## Quick Reference

### Session Workflow

```bash
# START
bd prime                    # Inject context
bd ready                    # Find available work

# WORK
bd update ID --status in_progress  # Take task
# ... implement ...
bd close ID --reason "Done"        # Complete task

# WRAP UP (project-dependent)
bd sync                            # Sync Beads issues with git
# Commit + push only on explicit user signal (/commit, /push) or per project policy.
# Do not run `git push` automatically — see project memory `feedback_no_auto_commits.md`
# (or equivalent) for whether auto-push is allowed.
```

### Issue Creation

```bash
# Basic
bd create "Title" -t type -p priority

# With files (auto-labels)
bd create "Fix button" --files src/components/Button.tsx

# Emergent work
bd create "Found bug" -t bug --deps discovered-from:current-id
```

### Types & Priorities

| Type | When |
|------|------|
| feature | New functionality |
| bug | Bug fix |
| chore | Tech debt, config |
| docs | Documentation |
| test | Tests |
| epic | Group of tasks |

| Priority | Meaning |
|----------|---------|
| 0 | Critical (blocks release) |
| 1 | Critical |
| 2 | High |
| 3 | Medium (default) |
| 4 | Low / backlog |

### Formulas (Workflows)

```bash
bd formula list                                    # List all
bd mol wisp exploration --var "question=How?"    # Ephemeral
bd mol pour bigfeature --var "feature_name=auth" # Persistent
bd mol squash WISP_ID                             # Save result
bd mol burn WISP_ID                               # Discard
```

## Resources

See `resources/` for detailed guides:
- COMMANDS_QUICKREF.md - Command cheat sheet
- DECISION_MATRIX.md - When to use what
- WORKFLOWS.md - Common workflows
- SPECKIT_BRIDGE.md - Integration with Spec-kit

## Integration with Spec-kit

For large features (>1 day):
1. `/speckit.specify` → requirements
2. `/speckit.plan` → design
3. `/speckit.tasks` → task breakdown
4. `/speckit.tobeads` → import to Beads
5. `bd ready` → work with Beads

## Links

- [Beads GitHub](https://github.com/steveyegge/beads)
- [CLI Reference](https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md)
