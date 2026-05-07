# Миграция OpenOrdersManager: Реализация getOpenOrders во всех адаптерах

## Статус реализации

### ✅ Завершено
- **PHASE 1**: Private Session Management + Private WebSocket
- **PHASE 2**: Private REST централизация через RestApiManager
- **OpenOrdersManager**: Использует новую архитектуру
- **PHASE 0**: Подготовка инфраструктуры (conn_id добавлен во все слои)

### 📋 Запланировано
- **PHASE 3**: Адаптация адаптеров (BITGET, OKX, BYBIT, GATE, MEXC)
- **PHASE 4**: События и UI
- **PHASE 5**: Оптимизация

---

## Проблемы текущей реализации

1. **Таблица open_orders не содержит conn_id**
   - Текущий UID: `exchange:orderId`
   - Требуемый UID: `connId:exchange:market:symbol:orderId`
   - **Решение**: Добавить колонку `conn_id` (простая миграция)

2. **BitgetAdapter использует старую архитектуру**
   - UID: `bitget:${orderId}` → нужно `connId:BITGET:market:symbol:orderId`
   - Возвращает `any[]` → нужно `OpenOrderRecord[]`
   - Нет метода `getConnId()`

3. **AdapterData не содержит connId**
   - **Решение**: Добавить `connId` в `AdapterData`

---

## PHASE 0: Подготовка инфраструктуры (🔴 Критично)

### Задача 0.1: Добавить conn_id в таблицу open_orders (миграция БД)

**Файл**: `electron/database/DatabaseCore.ts` → метод миграции

**Текущая схема open_orders** (из `DatabaseCore.ts:671`):
```sql
CREATE TABLE IF NOT EXISTS open_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market TEXT CHECK(market IN ('spot', 'perp', 'futures', 'margin')) NOT NULL,
  order_id TEXT NOT NULL,
  client_order_id TEXT,
  side TEXT CHECK(side IN ('buy', 'sell')) NOT NULL,
  type TEXT CHECK(type IN ('limit', 'market', 'post_only', 'ioc', 'fok')) NOT NULL,
  price REAL,
  quantity REAL NOT NULL,
  filled_quantity REAL DEFAULT 0,
  remaining_quantity REAL NOT NULL,
  status TEXT NOT NULL,
  fee REAL NOT NULL,
  fee_currency TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source TEXT CHECK(source IN ('ws', 'rest')),
  time_in_force TEXT,
  reduce_only INTEGER DEFAULT 0,
  post_only INTEGER DEFAULT 0,
  margin_mode TEXT,
  pos_side TEXT,
  leverage INTEGER
);
```

**Добавить миграцию** (в методе `migrate()` в `DatabaseCore.ts`):
```typescript
// В DatabaseCore.ts → метод migrate()

// Проверяем, есть ли колонка conn_id
const tableInfo = await this.db.all(`PRAGMA table_info(open_orders);`);
const hasConnId = tableInfo.some((col: any) => col.name === 'conn_id');

if (!hasConnId) {
  console.log('[DatabaseCore] Running open_orders migration: adding conn_id...');

  await this.db.exec(`
    BEGIN TRANSACTION;

    -- Добавляем колонку conn_id
    ALTER TABLE open_orders ADD COLUMN conn_id TEXT;

    -- Обновляем существующие записи: извлекаем exchange из uid
    -- Устанавливаем conn_id = 'unknown' для старых записей
    UPDATE open_orders SET conn_id = 'unknown' WHERE conn_id IS NULL;

    COMMIT;
  `);

  console.log('[DatabaseCore] open_orders migration completed');
}
```

**Чеклист**:
- [x] Создать SQL миграцию `002_add_conn_id_to_open_orders.sql`
- [x] Проверить наличие колонки `conn_id` (в SQL скрипте)
- [x] Выполнить `ALTER TABLE` для добавления колонки (в SQL скрипте)
- [x] Обновить старые записи (`conn_id = 'unknown'`) (в SQL скрипте)
- [x] **Выполнить миграцию вручную** (требуется действие пользователя)

---

### Задача 0.2: Обновить DatabaseOpenOrders для работы с conn_id

**Файл**: `electron/database/DatabaseOpenOrders.ts`

**Подзадача 0.2.1**: Обновить saveOpenOrder
```typescript
async saveOpenOrder(order: OpenOrderRecord): Promise<void> {
  const startTime = Date.now();

  try {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO open_orders (
        uid, conn_id, exchange, symbol, market, order_id, client_order_id,
        side, type, price, quantity, filled_quantity, remaining_quantity,
        status, fee, fee_currency, created_at, updated_at, source,
        time_in_force, reduce_only, post_only, margin_mode, pos_side, leverage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      order.uid,
      order.connId, // ✅ НОВОЕ
      order.exchange,
      order.symbol,
      order.market,
      order.orderId,
      order.clientOrderId || null,
      order.side,
      order.type,
      order.price,
      order.quantity,
      order.filledQuantity,
      order.remainingQuantity,
      order.status,
      order.fee,
      order.feeCurrency,
      order.createdAt,
      order.updatedAt,
      order.source,
      order.timeInForce || null,
      order.reduceOnly ? 1 : 0,
      order.postOnly ? 1 : 0,
      order.marginMode || null,
      order.posSide || null,
      order.leverage || null
    );

    const executionTime = Date.now() - startTime;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    safeLog.error(
      `[DatabaseOpenOrders] Failed to save order ${order.exchange}:${order.orderId}:`,
      error,
      `(${executionTime}ms)`
    );
    throw error;
  }
}
```

**Подзадача 0.2.2**: Обновить mapRowToRecord
```typescript
private mapRowToRecord(row: any): OpenOrderRecord {
  return {
    id: row.id,
    uid: row.uid,
    connId: row.conn_id, // ✅ НОВОЕ
    exchange: row.exchange,
    symbol: row.symbol,
    market: row.market,
    orderId: row.order_id,
    clientOrderId: row.client_order_id || undefined,
    side: row.side,
    type: row.type,
    price: row.price,
    quantity: row.quantity,
    filledQuantity: row.filled_quantity,
    remainingQuantity: row.remaining_quantity,
    status: row.status,
    fee: row.fee,
    feeCurrency: row.fee_currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source,
    timeInForce: row.time_in_force || undefined,
    reduceOnly: row.reduce_only === 1,
    postOnly: row.post_only === 1,
    marginMode: row.margin_mode || undefined,
    posSide: row.pos_side || undefined,
    leverage: row.leverage || undefined,
  };
}
```

**Чеклист**:
- [x] Обновить `saveOpenOrder()` (добавить `conn_id` в INSERT)
- [x] Обновить `mapRowToRecord()` (добавить `connId`)
- [x] Тестирование

---

### Задача 0.3: Обновить OpenOrderRecord в DatabaseTypes

**Файл**: `electron/database/DatabaseTypes.ts`

**Изменения**:
```typescript
export interface OpenOrderRecord {
  id?: number;
  uid: string; // "connId:exchange:market:symbol:orderId"
  connId: string; // ✅ НОВОЕ
  exchange: string;
  symbol: string;
  market: 'spot' | 'perp' | 'futures' | 'margin';
  orderId: string;
  clientOrderId?: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'post_only' | 'ioc' | 'fok';
  price: number | null;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: string; // 'open', 'closed', 'cancelled', и др.
  fee: number;
  feeCurrency: string;
  createdAt: number;
  updatedAt: number;
  source?: 'ws' | 'rest';
  timeInForce?: string;
  reduceOnly?: boolean;
  postOnly?: boolean;
  marginMode?: string;
  posSide?: string;
  leverage?: number;
}
```

**Чеклист**:
- [x] Добавить `connId: string`

---

### Задача 0.4: Обновить AdapterData и добавить getConnId()

**Файл**: `electron/engine/arbitrage/adapters/BaseExchangeAdapter.ts`

**AdapterData**:
```typescript
export interface AdapterData {
  connId: string; // ✅ НОВОЕ
  symbols: SymbolInfo[];
  prices: Map<string, PriceData>;
  fundingRates: FundingRateData[];
}
```

**Метод getConnId()**:
```typescript
export abstract class BaseExchangeAdapter extends EventEmitter {
  protected adapterData?: AdapterData;

  getConnId(): string {
    return this.adapterData?.connId || 'unknown';
  }
}
```

**Чеклист**:
- [x] Добавить `connId` в `AdapterData`
- [x] Добавить метод `getConnId()`

---

### Задача 0.5: Обновить установку adapterData

**Где**: Места создания адаптеров (например, `BaseExchangeController`)

**Код**:
```typescript
adapter.setAdapterData({
  connId: connection.id, // ✅ Передаем connId
  symbols: symbolsForExchange,
  prices: new Map(),
  fundingRates: []
});
```

**Чеклист**:
- [x] Найти места создания адаптеров
- [x] Передавать `connId` при вызове `setAdapterData()`

---

## PHASE 3: Адаптация адаптеров

**Общая схема** для всех адаптеров:
1. Изменить сигнатуру: `async getOpenOrders(market, symbol?): Promise<OpenOrderRecord[]>`
2. Использовать `getConnId()` для создания UID: `connId:EXCHANGE:market:symbol:orderId`
3. Маппинг статусов (если нужно)
4. Возвращать `OpenOrderRecord` с полем `connId`

---

### Задача 3.1: Адаптация BitgetAdapter (🔴 Высокий приоритет)

**Файл**: `BitgetAdapter.ts`

**Подзадача 3.1.1**: Изменить сигнатуру getOpenOrders
```typescript
// Было: Promise<any[]>
// Стало:
async getOpenOrders(market: 'spot' | 'perp', symbol?: string): Promise<OpenOrderRecord[]>
```

**Подзадача 3.1.2**: Изменить UID в parseOpenOrdersResponse
```typescript
// Было:
const uid = `bitget:${orderId}`;

// Стало:
const connId = this.getConnId();
const symbol = orderData.symbol || orderData.instId || '';
const orderId = orderData.orderId || orderData.ordId || '';
const uid = `${connId}:BITGET:${market}:${symbol}:${orderId}`;
```

**Подзадача 3.1.3**: Добавить connId в возвращаемый объект
```typescript
const order: OpenOrderRecord = {
  uid,
  connId, // ✅ НОВОЕ
  exchange: 'BITGET',
  // ... остальные поля
};
```

**Подзадача 3.1.4**: Тестирование BitgetAdapter
- Запустить OpenOrdersManager
- Создать ордер вручную на Bitget
- Проверить БД: правильный `conn_id` и `uid` (формат `connId:BITGET:spot:SYMBOL:ORDER_ID`)
- Проверить reconcile (удаление ордера)

**Чеклист**:
- [x] Изменить сигнатуру `getOpenOrders`
- [x] Изменить UID на `connId:BITGET:market:symbol:orderId`
- [x] Добавить `connId` в объект ордера
- [x] Тестирование

---

### Задача 3.2: Реализация OKXAdapter.getOpenOrders (🟡 Средний)

**API**: `GET /api/v5/trade/orders-pending` (60 req / 2 sec)
**Поддерживает**: Все ордера без symbol ✅

**Краткий код**:
```typescript
async getOpenOrders(market: 'spot' | 'perp', symbol?: string): Promise<OpenOrderRecord[]> {
  const instType = market === 'spot' ? 'SPOT' : 'SWAP';
  const endpoint = '/api/v5/trade/orders-pending';

  // OKX authentication (signature)
  // GET запрос

  const orders = response.data?.data || [];
  const connId = this.getConnId();

  return orders.map((order: any): OpenOrderRecord => ({
    uid: `${connId}:OKX:${market}:${order.instId}:${order.ordId}`,
    connId,
    exchange: 'OKX',
    market,
    symbol: order.instId,
    orderId: order.ordId,
    // ... остальные поля
  }));
}
```

**Чеклист**:
- [x] Реализовать `getOpenOrders(market, symbol?)`
- [x] OKX authentication + signature
- [x] Маппинг в `OpenOrderRecord`
- [x] Тестирование

---

### Задача 3.3: Реализация BybitAdapter.getOpenOrders (🟡 Средний)

**API**: `GET /v5/order/realtime`
**Поддерживает**: Все ордера без symbol ✅

**Краткий код**:
```typescript
async getOpenOrders(market: 'spot' | 'perp', symbol?: string): Promise<OpenOrderRecord[]> {
  const category = market === 'spot' ? 'spot' : 'linear';
  const endpoint = '/v5/order/realtime';

  // Bybit authentication + signature
  // GET запрос

  const orders = response.data?.result?.list || [];
  const connId = this.getConnId();

  return orders.map((order: any): OpenOrderRecord => ({
    uid: `${connId}:BYBIT:${market}:${order.symbol}:${order.orderId}`,
    connId,
    exchange: 'BYBIT',
    // ...
  }));
}
```

**Чеклист**:
- [x] Реализовать `getOpenOrders(market, symbol?)`
- [x] Bybit authentication
- [x] Маппинг в `OpenOrderRecord`
- [x] Тестирование

---

### Задача 3.4: Реализация GateAdapter.getOpenOrders (🟢 Низкий)

**API**:
- Spot: `GET /api/v4/spot/open_orders` (900 r/s)
- Futures: `GET /api/v4/futures/{settle}/orders?status=open`

**Подзадачи**:
- Реализовать `getGateSpotOpenOrders()`
- Реализовать `getGateFuturesOpenOrders()`
- Добавить `makeGateAuthenticatedRequest()`
- Маппинг в `OpenOrderRecord`
- Тестирование

**Чеклист**:
- [x] Реализовать `getOpenOrders(market, symbol?)`
- [x] Spot + Futures endpoints
- [x] Маппинг в `OpenOrderRecord`
- [x] Тестирование

---

### Задача 3.5: Реализация MEXCAdapter.getOpenOrders (🟢 Низкий)

**API**:
- Spot: `GET /api/v3/openOrders` (Weight 3)
- Futures: `GET /api/v1/private/order/list/open_orders` (**требует symbol** ❌)

**Особенность**: MEXC Futures поддерживает запрос без symbol (возвращает все ордера).

**Подзадачи**:
- Реализовать `getMexcSpotOpenOrders()`
- Реализовать `getMexcFuturesOpenOrders()` (без обязательного symbol)
- Реализовать `subscribeToOrders()` + Private WebSocket (spot + futures)
- Маппинг в `OpenOrderRecord`
- Тестирование

**Чеклист**:
- [x] Реализовать `getOpenOrders(market, symbol?)`
- [x] Исправить URL futures (без symbol → все ордера)
- [x] Маппинг в `OpenOrderRecord`
- [x] Private WS Spot (listenKey в URL + `spot@private.orders.v3.api.pb` protobuf)
- [x] Private WS Futures (login + `push.personal.order`)
- [x] `subscribeToOrders(market)` — публичный метод
- [x] contractSize кэш для корректного отображения qty perp-ордеров
- [x] Тестирование

---

## PHASE 4: События и UI

### Задача 4.1: Добавить getDiagnostics() и улучшить логирование

**Файл**: `OpenOrdersManager.ts`

**getDiagnostics()**:
```typescript
private lastReconcileStats?: {
  timestamp: number;
  duration: number;
  stats: { added: number; updated: number; removed: number; total: number };
};

getDiagnostics() {
  return {
    isRunning: this.isRunning,
    reconcileInterval: this.config.reconcileInterval,
    cacheSize: this.openOrdersCache.size,
    wsStatuses: this.wsStatuses,
    lastReconcile: this.lastReconcileStats
  };
}
```

**Логирование по connId**:
```typescript
for (const conn of active) {
  const connOrders = Array.from(this.openOrdersCache.values())
    .filter(o => o.connId === conn.id);

  safeLog.debug(`[OpenOrdersManager] ${conn.exchange}(${conn.id}): ${connOrders.length} orders`);
}
```

**Чеклист**:
- [x] Добавить `lastReconcileStats`
- [x] Реализовать `getDiagnostics()`
- [x] Добавить логирование по connId

---

## PHASE 5: Оптимизация

### Задача 5.1: Параллельная reconcile

**Файл**: `OpenOrdersManager.ts`

**Изменения**:
1. Извлечь метод `reconcileOne(conn)` для одного подключения
2. Использовать `Promise.allSettled()` для параллельного выполнения

**Код** (краткая схема):
```typescript
async reconcileOpenOrders(): Promise<void> {
  const startTime = Date.now();
  const connections = await this.getConnections();
  const active = connections.filter(c => c.active);

  // Параллельная reconcile
  const results = await Promise.allSettled(
    active.map(conn => this.reconcileOne(conn))
  );

  // Агрегация результатов
  let totalAdded = 0, totalUpdated = 0, totalRemoved = 0, errors = 0;

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      const stats = result.value;
      totalAdded += stats.added;
      totalUpdated += stats.updated;
      totalRemoved += stats.removed;
    } else {
      errors++;
      safeLog.error(`Failed to reconcile ${active[idx].exchange}:`, result.reason);
    }
  });

  const duration = Date.now() - startTime;
  safeLog.info(`Reconcile completed in ${duration}ms: +${totalAdded} ~${totalUpdated} -${totalRemoved} (errors: ${errors})`);

  this.lastReconcileStats = {
    timestamp: Date.now(),
    duration,
    stats: { added: totalAdded, updated: totalUpdated, removed: totalRemoved, total: this.openOrdersCache.size }
  };

  this.emit('reconcileComplete', {
    type: 'RECONCILE_APPLIED',
    exchange: 'all',
    reconcileStats: this.lastReconcileStats.stats
  });
}

private async reconcileOne(conn: PrivateConnectionInfo): Promise<{ added: number; updated: number; removed: number; }> {
  // Существующая логика reconcile для одного connId
}
```

**Чеклист**:
- [x] Извлечь метод `reconcileOne(conn)`
- [x] Использовать `Promise.allSettled()`
- [x] Агрегировать результаты
- [x] Тестирование

---

### Задача 5.2: Добавить capability флаги

**Все адаптеры**:
```typescript
getCapabilities() {
  return {
    openOrders: {
      rest: true,  // REST реализован
      ws: false,   // Private WS пока нет
      requiresSymbol: false // true для MEXC futures
    }
  };
}
```

**Чеклист**:
- [x] Добавить `getCapabilities()` во все адаптеры
- [x] Для MEXC: `requiresSymbol: false` (futures теперь работает без symbol)

---

## Общий чеклист

**PHASE 0** (🔴 критично):
- [x] 0.1: Добавить `conn_id` в таблицу `open_orders` (миграция)
- [x] 0.2: Обновить `DatabaseOpenOrders` (saveOpenOrder, mapRowToRecord)
- [x] 0.3: Обновить `OpenOrderRecord` (добавить `connId`)
- [x] 0.4: Обновить `AdapterData` + `getConnId()`
- [x] 0.5: Установка `connId` при создании адаптеров

**PHASE 3**:
- [x] 3.1: BitgetAdapter (4 подзадачи)
- [x] 3.2: OKXAdapter
- [x] 3.3: BybitAdapter
- [x] 3.4: GateAdapter
- [x] 3.5: MEXCAdapter ✅ (REST spot+perp, Private WS spot protobuf + futures, contractSize)

**PHASE 4**:
- [x] 4.1: getDiagnostics() + логирование

**PHASE 5**:
- [x] 5.1: Параллельная reconcile
- [x] 5.2: Capability флаги

---

## Приоритеты

1. **PHASE 0** (🔴 критично): Блокирует все остальное
2. **Задача 3.1** (🔴 высокий): BitgetAdapter
3. **Задачи 3.2-3.3** (🟡 средний): OKXAdapter, BybitAdapter
4. **Задачи 3.4-3.5** (🟢 низкий): GateAdapter, MEXCAdapter
5. **PHASE 4-5** (🟢 низкий): После адаптеров

---

## Ссылки API

- **OKX**: https://www.okx.com/docs-v5/en/#trading-account-rest-api-get-order-list
- **Bybit**: https://bybit-exchange.github.io/docs/v5/order/open-order
- **Gate.io**: https://www.gate.io/docs/developers/apiv4/en/#list-all-open-orders
- **MEXC Spot**: https://mexcdevelop.github.io/apidocs/spot_v3_en/#current-open-orders
- **MEXC Futures**: https://mexcdevelop.github.io/apidocs/contract_v1_en/#query-all-current-pending-orders
