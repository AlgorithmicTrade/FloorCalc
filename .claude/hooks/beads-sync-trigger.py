#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Claude Code PostToolUse hook — инкрементальный триггер sync Beads → Anytype.

Схема работы:
  1. Хук срабатывает на КАЖДЫЙ Bash tool call.
  2. Если команда не выглядит как мутирующий вызов `bd`/`bd.exe` — молчаливый exit.
     Read-only подкоманды (list, show, ready, version, info, doctor, help, ...)
     игнорируются, поэтому anytype-beads-sync сам себя НЕ ретриггерит.
  3. Из command + stdout извлекаются все `FundingBot-xxx` ID.
  4. IDs дописываются в durable очередь `.claude/anytype-sync-queue.txt`
     (по одному на строку, с дедубликацией при чтении).
  5. Хук возвращает `additionalContext` через `hookSpecificOutput`, чтобы главный
     Claude увидел напоминание и вызвал сабагента `anytype-beads-sync` ТОЛЬКО для
     этих ID (а не полный пересинк).

Ограничения:
  * Скрипт READ-ONLY по отношению к Beads. Никаких `bd` вызовов не делает.
  * Не делает сетевых запросов. Пишет только в .claude/anytype-sync-queue.txt
    и stdout (JSON для Claude Code).
  * Любые свои ошибки — в .claude/hooks/beads-sync-trigger.log, с exit 0,
    чтобы никогда не блокировать выполнение родительской Bash команды.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys
import traceback
from datetime import datetime
from pathlib import Path

# Windows Python по умолчанию пишет stdout в cp1251 → UnicodeEncodeError на
# кириллице / `→`. Claude Code ожидает UTF-8 в hook JSON output, поэтому
# принудительно переключаем stdout/stderr на UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

# --- Константы ---------------------------------------------------------------

# Подкоманды bd, которые меняют состояние задач. ВСЁ остальное (list, show,
# ready, version, info, doctor, help, mol, wisp, healthcheck, ...) игнорируем.
MUTATING_SUBCOMMANDS = {
    "create", "update", "close", "reopen",
    "dep", "edit", "block", "unblock",
    "delete", "rm", "import", "assign",
    "label", "priority", "move",
}

# Универсально безопасные no-op флаги справки: применимы к любой подкоманде,
# всегда печатают help и ничего не меняют.
HELP_FLAGS = {"--help", "-h"}

# `--dry-run` официально поддерживается как preview только у этих подкоманд
# (подтверждено через `bd <cmd> --help`). У `bd update/close/edit/reopen/...`
# такого флага нет — передача туда либо упадёт с unknown flag, либо команда
# реально применит изменение, поэтому игнорировать их нельзя.
DRY_RUN_SAFE_SUBCOMMANDS = {"create", "delete", "import"}

# FundingBot-xxx — формат Beads ID в этом проекте
ID_REGEX = re.compile(r"\bFundingBot-[A-Za-z0-9]+\b")

# Shell-разделители, между которыми могут жить отдельные команды в пайплайне
SHELL_SEPARATORS = {";", "&&", "||", "|", "&"}

# Токены bd — имя исполняемого файла (без пути)
BD_EXE_NAMES = {"bd", "bd.exe"}


def _executable_basename(token: str) -> str:
    """
    Из токена-исполняемого (`bd`, `C:/Users/.../bd.exe`, `/c/.../bd`) достать
    basename в нижнем регистре.
    """
    # shlex.split(posix=True) уже снимает с токена `"..."`/`'...'`.
    # Поддерживаем и unix `/`, и windows `\`.
    normalized = token.replace("\\", "/")
    tail = normalized.rsplit("/", 1)[-1]
    return tail.lower()


def extract_bd_invocations(command: str) -> list[tuple[str, list[str]]]:
    """
    Разобрать shell-команду в токены через shlex и вернуть список реальных
    bd-вызовов в виде [(subcmd_lower, [args...]), ...].

    `&&`/`|` внутри кавычек НЕ считаются разделителями — shlex это корректно
    обрабатывает, так что `echo "bd update X"` НЕ будет распознан как вызов bd.
    """
    try:
        tokens = shlex.split(command, posix=True)
    except ValueError:
        # Незавершённые кавычки — false negative лучше ложного триггера
        return []

    invocations: list[tuple[str, list[str]]] = []
    at_command_start = True
    current_is_bd = False
    current_subcmd: str | None = None
    current_args: list[str] = []

    def flush() -> None:
        nonlocal current_is_bd, current_subcmd, current_args
        if current_is_bd and current_subcmd is not None:
            invocations.append((current_subcmd, current_args))
        current_is_bd = False
        current_subcmd = None
        current_args = []

    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in SHELL_SEPARATORS:
            flush()
            at_command_start = True
            i += 1
            continue
        if at_command_start:
            if _executable_basename(tok) in BD_EXE_NAMES:
                current_is_bd = True
                # Следующий токен — подкоманда (если не разделитель/конец)
                if i + 1 < len(tokens) and tokens[i + 1] not in SHELL_SEPARATORS:
                    current_subcmd = tokens[i + 1].lower()
                    i += 2
                    at_command_start = False
                    continue
            at_command_start = False
            i += 1
            continue
        # Это аргумент текущей команды в пайплайне
        if current_is_bd:
            current_args.append(tok)
        i += 1
    flush()
    return invocations


# --- Вспомогательные функции -------------------------------------------------

def project_dir() -> Path:
    """Корень проекта (Claude Code проставляет CLAUDE_PROJECT_DIR)."""
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())


def log_path() -> Path:
    return project_dir() / ".claude" / "hooks" / "beads-sync-trigger.log"


def queue_path() -> Path:
    return project_dir() / ".claude" / "anytype-sync-queue.txt"


def log_error(msg: str) -> None:
    """Лог в файл, молча. Никогда не кидает наружу."""
    try:
        lp = log_path()
        lp.parent.mkdir(parents=True, exist_ok=True)
        with lp.open("a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}\n")
    except Exception:
        pass  # не должны ронять бой-команду


def append_ids_to_queue(ids: list[str]) -> None:
    """Дописать IDs в очередь. Дедупликация при чтении агентом."""
    qp = queue_path()
    qp.parent.mkdir(parents=True, exist_ok=True)
    with qp.open("a", encoding="utf-8") as f:
        for tid in ids:
            f.write(tid + "\n")


def emit(additional_context: str) -> None:
    """Вернуть Claude Code additionalContext через hookSpecificOutput."""
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": additional_context,
        }
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


# --- Основная логика ---------------------------------------------------------

def run() -> None:
    # 1) Парсим payload от Claude Code
    raw = sys.stdin.read()
    if not raw:
        return
    try:
        payload = json.loads(raw)
    except Exception as e:
        log_error(f"bad payload json: {e}")
        return

    if payload.get("tool_name") != "Bash":
        return

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command") or ""
    if not command:
        return

    tool_response = payload.get("tool_response") or {}
    stdout = tool_response.get("stdout") or ""

    # 2) Через shlex токенизируем команду и находим реальные bd-вызовы
    #    (цепочки `a && b` поддерживаем, `echo "bd ..."` — нет, как и должно).
    invocations = extract_bd_invocations(command)

    def _is_noop(subcmd: str, args: list[str]) -> bool:
        # `--help`/`-h` — универсальный no-op для любой подкоманды.
        if any(a in HELP_FLAGS for a in args):
            return True
        # `--dry-run` — no-op только там, где он действительно поддерживается.
        if subcmd in DRY_RUN_SAFE_SUBCOMMANDS and "--dry-run" in args:
            return True
        return False

    mutating = [
        (subcmd, args) for (subcmd, args) in invocations
        if subcmd in MUTATING_SUBCOMMANDS and not _is_noop(subcmd, args)
    ]
    if not mutating:
        return
    subcmd = mutating[0][0]  # для отображения в сообщении

    # 3) Собираем ID ТОЛЬКО из аргументов мутирующих bd-вызовов + из stdout
    #    (stdout важен для `bd create`, который печатает новый ID).
    ids: set[str] = set()
    for _, args in mutating:
        for arg in args:
            for mm in ID_REGEX.finditer(arg):
                ids.add(mm.group(0))
    for mm in ID_REGEX.finditer(stdout):
        ids.add(mm.group(0))

    # 4) Если ID не нашлись — fallback-маркер
    if not ids:
        if subcmd in {"import", "move"}:
            ids.add("__ALL__")
        else:
            # bd create обычно печатает ID в stdout. Если всё равно нет —
            # метка для агента, чтобы он подтянул все open tasks и сверил.
            ids.add("__UNKNOWN__")

    sorted_ids = sorted(ids)

    # 6) Durable очередь
    try:
        append_ids_to_queue(sorted_ids)
    except Exception as e:
        log_error(f"queue append failed: {e}")

    # 7) Напоминание в additionalContext
    ids_display = ", ".join(sorted_ids)
    msg = (
        f"[Beads→Anytype auto-sync] После `bd {subcmd}` изменены задачи: "
        f"{ids_display}.\n"
        "Вызови сабагента `anytype-beads-sync` через Agent tool и передай ему этот "
        "список ID — синхронизировать ИНКРЕМЕНТАЛЬНО, ТОЛЬКО перечисленные задачи, "
        "НЕ запускать полный пересинк всего Beads.\n"
        "Очередь: `.claude/anytype-sync-queue.txt` (durable, по одному ID на строку, "
        "могут быть дубли — дедуп при чтении).\n"
        "После успешной синхронизации опустоши файл очереди "
        "(перезапиши пустым содержимым).\n"
        "Спец-маркеры: `__ALL__` → полный пересинк нужен (редко, только на "
        "`bd import`); `__UNKNOWN__` → подтяни `bd list --all --json` и сверь "
        "по updated_at."
    )
    emit(msg)


if __name__ == "__main__":
    try:
        run()
    except SystemExit:
        raise
    except Exception:
        log_error("unhandled exception:\n" + traceback.format_exc())
    sys.exit(0)
