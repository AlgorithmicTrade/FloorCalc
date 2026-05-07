# Security & Secrets

## Rule

- All confidential data (API keys, credentials, passwords, tokens, logs with secrets) must be stored exclusively via SecureStorageService (electron.safeStorage).
- It is strictly forbidden to store secrets in source code, files, databases, logs, or any other persistent storage.

## Fallback for non-Electron environments

В средах без safeStorage (CI, headless tests, build scripts) секреты передаются через переменные окружения и не сохраняются на диск. Запись через SecureStorageService — только в desktop runtime.

## Anti-examples (что НЕ делать)

- ❌ `const API_KEY = "sk-prod-abc123"` — hardcoded в `.ts`/`.js`.
- ❌ `safeLog.error("HTTP failed", { headers: req.headers })` — `Authorization` попадёт в лог.
- ❌ `safeLog.error("Webhook body", body)` — тело запроса с подписью/токеном.
- ❌ `git add .env` — секретные переменные коммитятся в репозиторий.
- ❌ `db.exec("INSERT INTO config (api_key) VALUES (?)", [key])` — секрет в SQLite-таблице.
- ❌ `console.log("OAuth response:", responseJson)` — токен в browser console / DevTools.
