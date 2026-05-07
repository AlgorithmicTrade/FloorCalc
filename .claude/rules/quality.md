# Data Integrity

## Rules

- Do not use mocks, stubs, or fake data. Only real data implementations are allowed.
- Any claim about absence of a bug/leak/duplication must be backed by reading the relevant code sections; mark hypotheses without read evidence as `unverified`.
- If you cannot read the needed code due to size/limits, return `Insufficient data: <чего не хватило>` and continue by reading smaller relevant sections.
- Do not use `git diff` as a substitute for understanding the current code.
- Для создания тестов и проверки используй уже готовый скилл `/test-step`.

## Anti-examples (что НЕ делать)

- ❌ «Багов нет, я просмотрел код» — без указания конкретных файлов/строк.
- ❌ «По git diff ничего опасного» — diff показывает дельту, не текущее состояние файла.
- ❌ «Тесты пройдут с моком БД» — мок скрывает реальные миграции/SQL-семантику.
- ❌ Молчаливое сокращение скоупа из-за слишком большого файла — нужно явное `Insufficient data: cannot fully read X`.

## Verified vs unverified claims (как формулировать)

- ✅ «Утечки в `WebSocketManager.reconnect()` нет — прочитал `electron/engine/.../WebSocketManager.ts:42-78`, есть явный `await this.cleanup()` перед `new WebSocket()`».
- ⚠️ «Гипотеза (unverified): возможно race в OKXAdapter — нужно прочитать `OKXAdapter.ts:onClose` чтобы подтвердить».
