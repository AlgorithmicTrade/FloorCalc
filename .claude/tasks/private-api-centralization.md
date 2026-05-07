# Централизация Private API (WebSocket Primary + REST Reconcile)

## Проблема

Сейчас инициализация private методов (`initializeTrading`) проводится каждым менеджером отдельно:
- **BalanceManager**: вызывает `keytar` → `initializeTrading` → `getBalances`
- **OpenOrdersManager**: вызывает `getOpenOrders` без инициализации → ошибка "trading not initialized"

Это приводит к:
- ❌ Разнородности подключений и гонкам при параллельной инициализации
- ❌ Ошибкам по лимитам и таймаутам
- ❌ OpenOrdersManager работает по "биржам" вместо "подключений" (connId)

## Приоритеты для private методов

- **Доступ**: приватный (auth через credentials)
- **Транспорт**: **WS предпочтительно** (realtime), **REST обязателен** (reconcile/recovery)
- **Частота**: **по событию** (WS) + **сверка каждые 30 секунд** (REST)

## Текущее состояние

✅ **Public REST**: `RestApiManager` с единой очередью + лимиты + таймауты
✅ **Public WS**: `WebSocketManager` → `BaseExchangeController` → адаптеры
❌ **Private WS**: методы есть в адаптерах, но не централизованы
❌ **Private REST**: размазано по менеджерам, используется только для reconcile

## Целевая архитектура

### Симметрия: WebSocketManager ↔ RestApiManager

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PrivateSessionManager                          │
│  Единый слой auth для WS и REST:                                    │
│  • Credentials из keytar (один раз)                                 │
│  • initializeTrading с дедупликацией (Map<connId+exchange>)         │
│  • Кэш сессий + resetSession при auth-ошибках                       │
└─────────────────────────────────────────────────────────────────────┘
                           ▲                    ▲
                           │                    │
          ┌────────────────┴─────┐   ┌──────────┴──────────────┐
          │                      │   │                          │
┌─────────▼──────────────┐       │   │       ┌──────────────────▼─────┐
│   WebSocketManager     │       │   │       │   RestApiManager       │
│  (Primary Transport)   │       │   │       │  (Reconcile/Fallback)  │
├────────────────────────┤       │   │       ├────────────────────────┤
│ ┌────────────────────┐ │       │   │       │ ┌────────────────────┐ │
│ │ Public Controller  │ │       │   │       │ │ Public Queue       │ │
│ │ BaseExchangeCtrl   │ │       │   │       │ │ - getFundingRates  │ │
│ │ - prices           │ │       │   │       │ │ - getPrices        │ │
│ │ - funding rates    │ │       │   │       │ │ - lim + timeout    │ │
│ └────────────────────┘ │       │   │       │ └────────────────────┘ │
│                        │       │   │       │                        │
│ ┌────────────────────┐ │       │   │       │ ┌────────────────────┐ │
│ │ Private Controller │─┼───────┘   └───────┼─│ callPrivate()      │ │
│ │ PrivateExchCtrl    │ │                   │ │ - getBalances      │ │
│ │ - orders (WS)      │ │                   │ │ - getOpenOrders    │ │
│ │ - positions (WS)   │ │                   │ │ - getPositions     │ │
│ │ - balances (WS)    │ │                   │ │ - lim + timeout    │ │
│ │ - executions (WS)  │ │                   │ │ - retry on auth    │ │
│ └────────────────────┘ │                   │ └────────────────────┘ │
└────────────────────────┘                   └────────────────────────┘
         ▲                                              ▲
         │ Realtime события                             │ Reconcile (30s)
         │ (WebSocket)                                  │ (REST)
         │                                              │
         └──────────────┬───────────────────────────────┘
                        │
         ┌──────────────▼──────────────┐
         │  OpenOrdersManager          │
         │  • WS primary (realtime)    │
         │  • REST reconcile (30s)     │
         │                             │
         │  BalanceManager             │
         │  • WS primary (realtime)    │
         │  • REST reconcile (30s)     │
         │                             │
         │  PositionsManager (будущий) │
         └─────────────────────────────┘
```

### Ключевые моменты симметрии

| Слой | WebSocketManager | RestApiManager |
|------|------------------|----------------|
| **Назначение** | Primary transport (realtime) | Reconcile + fallback |
| **Public слой** | `BaseExchangeController` | `queueRequest('public', ...)` |
| **Private слой** | `PrivateExchangeController` | `callPrivate(connId, ...)` |
| **Auth** | через `PrivateSessionManager` | через `PrivateSessionManager` |
| **Частота** | По событию (realtime) | Каждые 30 секунд |
| **Данные** | orders, positions, balances | reconcile + recovery |

---

## Поток данных

### 1. Инициализация (при старте менеджера)

```
OpenOrdersManager.start()
  │
  ├──► WebSocketManager.subscribePrivateOrders(connId, 'spot')
  │     ├──► PrivateExchangeController.subscribeToOrders(connId, 'spot')
  │     │      ├──► PrivateSessionManager.ensureInitialized(connId, exchange)
  │     │      │      ├── keytar.getPassword (один раз)
  │     │      │      ├── adapter.initializeTrading (один раз, дедуп)
  │     │      │      └── кэш сессии
  │     │      │
  │     │      └──► adapter.subscribeToOrders('spot') // WS подписка
  │     │
  │     └──► PrivateExchangeController.on('orderUpdate') → OpenOrdersManager
  │
  └──► startReconcileTimer(30_000) // REST reconcile каждые 30 сек
```

### 2. Realtime обновления (через WebSocketManager)

```
Биржа (private WS)
  └──► Adapter.emit('orderUpdate', event)
        └──► PrivateExchangeController.emit('orderUpdate', event)
              └──► WebSocketManager.emit('privateOrderUpdate', event)
                    └──► OpenOrdersManager.handleOrderUpdate(event)
                          ├── обновить кэш Map<uid, order>
                          ├── сохранить в БД
                          └── emit 'orderUpdate' в UI
```

### 3. Reconcile (через RestApiManager, каждые 30 секунд)

```
OpenOrdersManager.reconcileTimer (30 секунд)
  │
  └──► RestApiManager.callPrivate(connId, exchange, adapter => adapter.getOpenOrders())
        │
        ├──► PrivateSessionManager.ensureInitialized(connId, exchange)
        │     └── проверка сессии (уже инициализирована WS)
        │
        ├──► queueRequest(exchange, 'private', task, timeout)
        │     └── лимиты + таймаут + AbortSignal
        │
        └──► Сравнить REST результат с WS кэшем:
              ├── Найти пропущенные ордера (есть в REST, нет в кэше WS)
              ├── Найти лишние ордера (есть в кэше WS, нет в REST)
              └── Синхронизировать кэш + БД + emit событий
```

---

## PHASE 1: Private Session Management + Private WebSocket ✅

### Шаг 1.1: Создать PrivateSessionManager (общий слой auth)

**Файл**: `electron/engine/arbitrage/managers/PrivateSessionManager.ts` (НОВЫЙ)

**Назначение**:
Единый слой управления auth для **WebSocketManager** и **RestApiManager**

**Интерфейсы:**
```typescript
export interface PrivateConnectionInfo {
  id: string;
  exchange: string;
  active: boolean;
}

export interface KeytarService {
  getPassword(service: string, account: string): Promise<string | null>;
}

export interface PrivateSessionConfig {
  keytarServiceNames: {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
}

export interface PrivateCredentials {
  apiKey: string;
  secret: string;
  passphrase?: string;
}
```

**Класс PrivateSessionManager:**
```typescript
export class PrivateSessionManager {
  private initPromises = new Map<string, Promise<void>>();
  private sessionReady = new Set<string>();
  private credentialsCache = new Map<string, PrivateCredentials>();

  constructor(
    private getConnections: () => Promise<PrivateConnectionInfo[]>,
    private getAdapter: (connId: string) => IExchangeAdapter | undefined,
    private keytar: KeytarService,
    private config: PrivateSessionConfig
  ) {}

  /**
   * Ключ кэша: connId + exchange
   */
  private getSessionKey(connId: string, exchange: string): string {
    return `${exchange.toUpperCase()}::${connId}`;
  }

  /**
   * Инициализация private сессии (дедуп, один раз на connId)
   * Используется ОБОИМИ: WebSocketManager и RestApiManager
   */
  async ensureInitialized(connId: string, exchange: string): Promise<void> {
    const key = this.getSessionKey(connId, exchange);

    // Если уже инициализирована - возвращаем сразу
    if (this.sessionReady.has(key)) {
      return;
    }

    // Если инициализация в процессе - ждем её
    const existing = this.initPromises.get(key);
    if (existing) {
      return existing;
    }

    // Создаем новый промис инициализации
    const initPromise = (async () => {
      try {
        // Получаем credentials из keytar
        const creds = await this.getCredentials(connId);

        // Получаем адаптер
        const adapter = this.getAdapter(connId);
        if (!adapter) {
          throw new Error(`Adapter not found for connId=${connId} (${exchange})`);
        }

        // Инициализируем trading (если адаптер поддерживает)
        if (typeof (adapter as any).initializeTrading === 'function') {
          const marginEnabled = false;
          const exchangeUpper = exchange.toUpperCase();

          if ((exchangeUpper === 'OKX' || exchangeUpper === 'BITGET') && creds.passphrase) {
            (adapter as any).initializeTrading(creds.apiKey, creds.secret, creds.passphrase, marginEnabled);
          } else {
            (adapter as any).initializeTrading(creds.apiKey, creds.secret, marginEnabled);
          }
        }

        // Маркируем сессию как готовую
        this.sessionReady.add(key);

      } catch (error) {
        // При ошибке - очищаем промис, чтобы можно было повторить
        this.initPromises.delete(key);
        throw error;
      }
    })();

    this.initPromises.set(key, initPromise);
    await initPromise;
  }

  /**
   * Сброс сессии (при auth-ошибках)
   */
  async resetSession(connId: string, exchange: string): Promise<void> {
    const key = this.getSessionKey(connId, exchange);
    this.sessionReady.delete(key);
    this.initPromises.delete(key);
    this.credentialsCache.delete(connId);
  }

  /**
   * Получение credentials из keytar с кэшированием
   */
  async getCredentials(connId: string): Promise<PrivateCredentials> {
    // Проверяем кэш
    const cached = this.credentialsCache.get(connId);
    if (cached) {
      return cached;
    }

    // Загружаем из keytar
    const apiKey = await this.keytar.getPassword(this.config.keytarServiceNames.apiKey, connId);
    const secret = await this.keytar.getPassword(this.config.keytarServiceNames.secret, connId);
    const passphrase = await this.keytar.getPassword(this.config.keytarServiceNames.passphrase, connId);

    if (!apiKey || !secret) {
      throw new Error(`Credentials not found for connId=${connId}`);
    }

    const creds: PrivateCredentials = {
      apiKey,
      secret,
      passphrase: passphrase || undefined
    };

    // Кэшируем
    this.credentialsCache.set(connId, creds);

    return creds;
  }
}
```

**Статус**: 🟡 Phase 1.1

---

### Шаг 1.2: Создать PrivateExchangeController (для WebSocketManager)

**Файл**: `electron/engine/arbitrage/adapters/PrivateExchangeController.ts` (НОВЫЙ)

**Назначение**:
Управление private WS подписками внутри **WebSocketManager**

**Класс PrivateExchangeController:**
```typescript
import { EventEmitter } from 'events';
import { PrivateSessionManager, PrivateConnectionInfo } from '../managers/PrivateSessionManager';
import { IExchangeAdapter } from './BaseExchangeAdapter';
import { safeLog } from '../utils/safeLogger';

export interface PrivateSubscription {
  connId: string;
  type: 'orders' | 'positions' | 'balances' | 'executions';
  market?: 'spot' | 'perp';
  subscribedAt: number;
}

export class PrivateExchangeController extends EventEmitter {
  private subscriptions: Map<string, PrivateSubscription> = new Map();
  private isInitialized: boolean = false;

  constructor(
    private sessionManager: PrivateSessionManager,
    private getConnections: () => Promise<PrivateConnectionInfo[]>,
    private getAdapter: (connId: string) => IExchangeAdapter | undefined
  ) {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    safeLog.info('[PrivateExchangeController] Initializing...');
    this.isInitialized = true;
  }

  /**
   * Подписка на private ордера через WS
   */
  async subscribeToOrders(connId: string, market: 'spot' | 'perp'): Promise<void> {
    const connections = await this.getConnections();
    const conn = connections.find(c => c.id === connId);

    if (!conn) {
      throw new Error(`Connection not found: ${connId}`);
    }

    const adapter = this.getAdapter(connId);
    if (!adapter) {
      throw new Error(`Adapter not found for ${connId}`);
    }

    // Инициализируем сессию через PrivateSessionManager
    await this.sessionManager.ensureInitialized(connId, conn.exchange);

    // Подписываемся на WS
    if (typeof adapter.subscribeToOrders === 'function') {
      await adapter.subscribeToOrders(market);

      // Настраиваем обработку событий от адаптера
      this.setupAdapterOrderHandlers(connId, adapter);

      // Сохраняем подписку
      const subKey = `${connId}:orders:${market}`;
      this.subscriptions.set(subKey, {
        connId,
        type: 'orders',
        market,
        subscribedAt: Date.now()
      });

      safeLog.info(`[PrivateExchangeController] Subscribed to ${market} orders for ${conn.exchange} (${connId})`);
    } else {
      safeLog.warn(`[PrivateExchangeController] Adapter for ${connId} does not support subscribeToOrders`);
    }
  }

  /**
   * Подписка на позиции через WS
   */
  async subscribeToPositions(connId: string): Promise<void> {
    const connections = await this.getConnections();
    const conn = connections.find(c => c.id === connId);

    if (!conn) {
      throw new Error(`Connection not found: ${connId}`);
    }

    const adapter = this.getAdapter(connId);
    if (!adapter) {
      throw new Error(`Adapter not found for ${connId}`);
    }

    // Инициализируем сессию
    await this.sessionManager.ensureInitialized(connId, conn.exchange);

    // Подписываемся на WS (если адаптер поддерживает)
    if (typeof (adapter as any).subscribeToPositions === 'function') {
      await (adapter as any).subscribeToPositions();

      // Настраиваем обработку событий
      this.setupAdapterPositionHandlers(connId, adapter);

      // Сохраняем подписку
      this.subscriptions.set(`${connId}:positions`, {
        connId,
        type: 'positions',
        subscribedAt: Date.now()
      });

      safeLog.info(`[PrivateExchangeController] Subscribed to positions for ${conn.exchange} (${connId})`);
    }
  }

  /**
   * Подписка на балансы через WS
   */
  async subscribeToBalances(connId: string): Promise<void> {
    const connections = await this.getConnections();
    const conn = connections.find(c => c.id === connId);

    if (!conn) {
      throw new Error(`Connection not found: ${connId}`);
    }

    const adapter = this.getAdapter(connId);
    if (!adapter) {
      throw new Error(`Adapter not found for ${connId}`);
    }

    // Инициализируем сессию
    await this.sessionManager.ensureInitialized(connId, conn.exchange);

    // Подписываемся на WS
    if (typeof adapter.subscribeToBalanceUpdates === 'function') {
      await adapter.subscribeToBalanceUpdates();

      // Настраиваем обработку событий
      this.setupAdapterBalanceHandlers(connId, adapter);

      // Сохраняем подписку
      this.subscriptions.set(`${connId}:balances`, {
        connId,
        type: 'balances',
        subscribedAt: Date.now()
      });

      safeLog.info(`[PrivateExchangeController] Subscribed to balances for ${conn.exchange} (${connId})`);
    }
  }

  /**
   * Настройка обработчиков событий ордеров от адаптера
   */
  private setupAdapterOrderHandlers(connId: string, adapter: IExchangeAdapter): void {
    adapter.on('orderUpdate', (event: any) => {
      // Пробрасываем событие выше с добавлением connId
      this.emit('orderUpdate', {
        ...event,
        connId
      });
    });
  }

  /**
   * Настройка обработчиков позиций
   */
  private setupAdapterPositionHandlers(connId: string, adapter: IExchangeAdapter): void {
    adapter.on('positionUpdate', (event: any) => {
      this.emit('positionUpdate', {
        ...event,
        connId
      });
    });
  }

  /**
   * Настройка обработчиков балансов
   */
  private setupAdapterBalanceHandlers(connId: string, adapter: IExchangeAdapter): void {
    adapter.on('balanceUpdate', (event: any) => {
      this.emit('balanceUpdate', {
        ...event,
        connId
      });
    });
  }

  /**
   * Отписка от ордеров
   */
  async unsubscribeFromOrders(connId: string, market: 'spot' | 'perp'): Promise<void> {
    const adapter = this.getAdapter(connId);
    if (!adapter) return;

    if (typeof adapter.unsubscribeFromOrders === 'function') {
      await adapter.unsubscribeFromOrders(market);

      const subKey = `${connId}:orders:${market}`;
      this.subscriptions.delete(subKey);

      safeLog.info(`[PrivateExchangeController] Unsubscribed from ${market} orders for ${connId}`);
    }
  }

  /**
   * Получение статистики подписок
   */
  getSubscriptions(): Map<string, PrivateSubscription> {
    return new Map(this.subscriptions);
  }
}
```

**Статус**: 🟡 Phase 1.2

---

### Шаг 1.3: Расширить WebSocketManager для private WS

**Файл**: `electron/engine/arbitrage/managers/WebSocketManager.ts`

**Добавить поля:**
```typescript
export class WebSocketManager extends EventEmitter {
  private exchangeController?: BaseExchangeController;        // public WS ✅ существует
  private privateController?: PrivateExchangeController;      // private WS ✅ НОВОЕ
  private privateSessionManager?: PrivateSessionManager;      // auth ✅ НОВОЕ
```

**Добавить метод инициализации:**
```typescript
/**
 * Инициализация private WS контроллера
 * Вызывается после initialize() для настройки private подписок
 */
async initializePrivate(
  getConnections: () => Promise<PrivateConnectionInfo[]>,
  getAdapter: (connId: string) => IExchangeAdapter | undefined,
  keytar: KeytarService
): Promise<void> {
  if (this.privateController) {
    safeLog.warn('[WebSocketManager] Private controller already initialized');
    return;
  }

  safeLog.info('[WebSocketManager] Initializing private WebSocket controller...');

  // Создаем PrivateSessionManager (общий для WS и REST)
  this.privateSessionManager = new PrivateSessionManager(
    getConnections,
    getAdapter,
    keytar,
    {
      keytarServiceNames: {
        apiKey: 'funding-bot-api',
        secret: 'funding-bot-secret',
        passphrase: 'funding-bot-passphrase'
      }
    }
  );

  // Создаем PrivateExchangeController
  this.privateController = new PrivateExchangeController(
    this.privateSessionManager,
    getConnections,
    getAdapter
  );

  await this.privateController.initialize();

  // Пробрасываем события от PrivateExchangeController наверх
  this.privateController.on('orderUpdate', (event) => {
    this.emit('privateOrderUpdate', event);
  });

  this.privateController.on('positionUpdate', (event) => {
    this.emit('privatePositionUpdate', event);
  });

  this.privateController.on('balanceUpdate', (event) => {
    this.emit('privateBalanceUpdate', event);
  });

  safeLog.info('[WebSocketManager] Private WebSocket controller initialized successfully');
}
```

**Добавить публичные методы для private подписок:**
```typescript
/**
 * Подписка на private ордера через WS
 */
async subscribePrivateOrders(connId: string, market: 'spot' | 'perp'): Promise<void> {
  if (!this.privateController) {
    throw new Error('[WebSocketManager] Private controller not initialized');
  }
  await this.privateController.subscribeToOrders(connId, market);
}

/**
 * Подписка на private позиции через WS
 */
async subscribePrivatePositions(connId: string): Promise<void> {
  if (!this.privateController) {
    throw new Error('[WebSocketManager] Private controller not initialized');
  }
  await this.privateController.subscribeToPositions(connId);
}

/**
 * Подписка на private балансы через WS
 */
async subscribePrivateBalances(connId: string): Promise<void> {
  if (!this.privateController) {
    throw new Error('[WebSocketManager] Private controller not initialized');
  }
  await this.privateController.subscribeToBalances(connId);
}

/**
 * Отписка от private ордеров
 */
async unsubscribePrivateOrders(connId: string, market: 'spot' | 'perp'): Promise<void> {
  if (!this.privateController) return;
  await this.privateController.unsubscribeFromOrders(connId, market);
}

/**
 * Получение PrivateExchangeController (для менеджеров)
 */
getPrivateController(): PrivateExchangeController | undefined {
  return this.privateController;
}

/**
 * Получение PrivateSessionManager (для RestApiManager)
 */
getPrivateSessionManager(): PrivateSessionManager | undefined {
  return this.privateSessionManager;
}
```

**Статус**: 🟡 Phase 1.3

---

### Шаг 1.4: Переписать OpenOrdersManager для private WS

**Файл**: `electron/engine/arbitrage/managers/OpenOrdersManager.ts`

**Изменения конструктора:**
```typescript
constructor(
  private getConnections: () => Promise<PrivateConnectionInfo[]>,     // ✅ НОВОЕ
  private getAdapter: (connId: string) => IExchangeAdapter | undefined, // ✅ НОВОЕ
  private webSocketManager: WebSocketManager,                          // ✅ НОВОЕ (для WS)
  private restApiManager: RestApiManager,                              // ✅ НОВОЕ (для reconcile)
  private databaseOpenOrders: DatabaseOpenOrders,
  config?: Partial<OpenOrdersManagerConfig>
)
```

**Удалить старое поле:**
```typescript
// ❌ УДАЛИТЬ:
// private exchangeController?: any;
```

**Изменения start():**
```typescript
async start(): Promise<void> {
  if (!this.isInitialized) {
    throw new Error('[OpenOrdersManager] Cannot start: not initialized');
  }

  if (this.isRunning) {
    safeLog.warn('[OpenOrdersManager] Already running');
    return;
  }

  try {
    safeLog.info('[OpenOrdersManager] Starting...');

    // Подписываемся на private WS события от WebSocketManager
    if (this.config.enableWsSubscriptions) {
      await this.subscribeToPrivateWS();
    }

    // Выполняем немедленную REST reconcile при старте для очистки старых ордеров
    if (this.config.enableRestReconcile) {
      safeLog.info('[OpenOrdersManager] Running initial reconcile...');
      await this.reconcileOpenOrders();
    }

    // Запускаем периодическую REST reconcile (каждые 30 секунд)
    if (this.config.enableRestReconcile) {
      this.startReconcileTimer();
    }

    this.isRunning = true;
    safeLog.info('[OpenOrdersManager] Started successfully');

  } catch (error) {
    safeLog.error('[OpenOrdersManager] Failed to start:', error);
    throw error;
  }
}

/**
 * Подписка на private WS события для всех активных подключений
 */
private async subscribeToPrivateWS(): Promise<void> {
  const connections = await this.getConnections();
  const active = connections.filter(c => c.active);

  safeLog.info(`[OpenOrdersManager] Subscribing to private WS for ${active.length} connections`);

  // Подписываемся на события от WebSocketManager
  this.webSocketManager.on('privateOrderUpdate', (event) => {
    this.handleOrderUpdate(event);
  });

  // Подписываемся на ордера для каждого connId
  for (const conn of active) {
    try {
      // Подписываемся на spot и perp ордера
      await this.webSocketManager.subscribePrivateOrders(conn.id, 'spot');
      await this.webSocketManager.subscribePrivateOrders(conn.id, 'perp');

      safeLog.info(`[OpenOrdersManager] Subscribed to orders for ${conn.exchange} (${conn.id})`);
    } catch (error) {
      safeLog.error(`[OpenOrdersManager] Failed to subscribe to orders for ${conn.id}:`, error);
    }
  }
}
```

**Изменения reconcileOpenOrders():**
```typescript
async reconcileOpenOrders(): Promise<void> {
  const startTime = Date.now();
  safeLog.info('[OpenOrdersManager] Starting REST reconcile...');

  const connections = await this.getConnections();
  const active = connections.filter(c => c.active);

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;

  for (const conn of active) {
    try {
      // Получаем ордера через REST API (через RestApiManager)
      const spotOrders = await this.restApiManager.callPrivate(
        conn.id,
        conn.exchange,
        async (adapter, signal) => {
          if (!adapter.getOpenOrders) return [];
          return adapter.getOpenOrders('spot', 'all');
        },
        { op: 'getOpenOrders:spot', timeoutMs: 60_000 }
      );

      const perpOrders = await this.restApiManager.callPrivate(
        conn.id,
        conn.exchange,
        async (adapter, signal) => {
          if (!adapter.getOpenOrders) return [];
          return adapter.getOpenOrders('perp', 'all');
        },
        { op: 'getOpenOrders:perp', timeoutMs: 60_000 }
      );

      const allRestOrders = [...(spotOrders || []), ...(perpOrders || [])];

      // Создаем Set из REST ордеров для быстрого поиска
      const restOrderUids = new Set(allRestOrders.map(o => o.uid));

      // Получаем текущие кэшированные ордера для этого connId
      const cachedOrders = Array.from(this.openOrdersCache.values())
        .filter(o => o.exchange.toUpperCase() === conn.exchange.toUpperCase());
      const cachedOrderUids = new Set(cachedOrders.map(o => o.uid));

      // Находим ордера для удаления (есть в кэше WS, но нет в REST)
      for (const cachedOrder of cachedOrders) {
        if (!restOrderUids.has(cachedOrder.uid)) {
          this.openOrdersCache.delete(cachedOrder.uid);
          await this.databaseOpenOrders.deleteOpenOrder(cachedOrder.exchange, cachedOrder.orderId);
          totalRemoved++;

          // Эмитим событие для UI
          this.emit('orderUpdate', {
            type: 'ORDER_CANCELLED',
            exchange: conn.exchange,
            order: cachedOrder
          });
        }
      }

      // Добавляем новые ордера или обновляем существующие
      for (const restOrder of allRestOrders) {
        const cachedOrder = this.openOrdersCache.get(restOrder.uid);

        if (!cachedOrder) {
          // Новый ордер (пропущен WS)
          this.openOrdersCache.set(restOrder.uid, restOrder);
          await this.databaseOpenOrders.saveOpenOrder(restOrder);
          totalAdded++;

          this.emit('orderUpdate', {
            type: 'ORDER_NEW',
            exchange: conn.exchange,
            order: restOrder
          });
        } else if (this.hasOrderChanged(cachedOrder, restOrder)) {
          // Обновленный ордер
          this.openOrdersCache.set(restOrder.uid, restOrder);
          await this.databaseOpenOrders.saveOpenOrder(restOrder);
          totalUpdated++;

          this.emit('orderUpdate', {
            type: 'ORDER_UPDATE',
            exchange: conn.exchange,
            order: restOrder
          });
        }
      }

    } catch (error) {
      safeLog.error(`[OpenOrdersManager] Failed to reconcile ${conn.exchange} (${conn.id}):`, error);
    }
  }

  const duration = Date.now() - startTime;
  const totalOrders = this.openOrdersCache.size;

  safeLog.info(
    `[OpenOrdersManager] Reconcile completed in ${duration}ms: ` +
    `+${totalAdded} ~${totalUpdated} -${totalRemoved} (total: ${totalOrders})`
  );

  // Эмитим событие о завершении reconcile
  this.emit('reconcileComplete', {
    type: 'RECONCILE_APPLIED',
    exchange: 'all',
    reconcileStats: {
      added: totalAdded,
      updated: totalUpdated,
      removed: totalRemoved,
      total: totalOrders
    }
  });
}
```

**Удалить старые методы:**
```typescript
// ❌ УДАЛИТЬ:
// private async subscribeToAllExchanges(): Promise<void>
// private async subscribeToExchangeOrders(exchange: string, adapter: IExchangeAdapter): Promise<void>
// private async unsubscribeFromAllExchanges(): Promise<void>
```

**Статус**: 🟡 Phase 1.4

---

## PHASE 2: Private REST централизация (reconcile/recovery) ⏳

### Шаг 2.1: Расширить RestApiManager для callPrivate

**Файл**: `electron/engine/arbitrage/managers/RestApiManager.ts`

**Добавить импорты:**
```typescript
import { PrivateSessionManager } from './PrivateSessionManager';
import { IExchangeAdapter } from '../adapters/BaseExchangeAdapter';
```

**Добавить типы:**
```typescript
export interface CallPrivateOptions {
  timeoutMs?: number;
  op?: string;
  retryOnAuthError?: boolean;
}
```

**Добавить поле:**
```typescript
private privateSessionManager?: PrivateSessionManager;
```

**Добавить методы:**
```typescript
/**
 * Установка PrivateSessionManager (общий с WebSocketManager)
 */
setPrivateSessionManager(manager: PrivateSessionManager): void {
  this.privateSessionManager = manager;
}

/**
 * Вызов private REST метода с auth через PrivateSessionManager
 * Используется для reconcile и fallback
 */
async callPrivate<T>(
  connId: string,
  exchange: string,
  task: (adapter: IExchangeAdapter, signal: AbortSignal) => Promise<T>,
  opts: CallPrivateOptions = {}
): Promise<T | null> {
  if (!this.privateSessionManager) {
    throw new Error('[RestApiManager] PrivateSessionManager not set. Call setPrivateSessionManager() first.');
  }

  const adapter = (this.privateSessionManager as any).getAdapter(connId);
  if (!adapter) {
    throw new Error(`[RestApiManager] Adapter not found for connId=${connId} (${exchange})`);
  }

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const op = opts.op ?? 'privateCall';

  const runOnce = async (): Promise<T | null> => {
    // Инициализация через PrivateSessionManager (дедуп)
    await this.privateSessionManager.ensureInitialized(connId, exchange);

    // Запрос через очередь (лимиты + таймаут)
    return this.queueRequest<T>(
      exchange,
      'private',
      async (signal) => task(adapter, signal),
      timeoutMs
    );
  };

  try {
    return await runOnce();
  } catch (err: any) {
    // Retry при auth-ошибке
    const msg = String(err?.message ?? err);
    const looksAuth = /unauth|auth|signature|permission|api key|invalid key|trading not/i.test(msg);

    if (opts.retryOnAuthError !== false && looksAuth) {
      safeLog.warn(`[RestApiManager] Auth error for ${connId} (${exchange}), resetting session and retrying...`);
      await this.privateSessionManager.resetSession(connId, exchange);
      return await runOnce(); // 1 retry
    }

    throw err;
  }
}
```

**Статус**: 🟡 Phase 2.1

---

### Шаг 2.2: Переписать BalanceManager

**Файл**: `electron/engine/BalanceManager.ts`

**Изменения конструктора:**
```typescript
constructor(
  private getConnections: () => Promise<ConnectionInfo[]>,
  private getAdapter: (connId: string) => IExchangeAdapter | undefined,
  private restApiManager: RestApiManager, // ✅ НОВОЕ
  private databaseBalances: DatabaseBalances | null,
  updateIntervalMs: number = 30_000
)

// ❌ УДАЛИТЬ:
// private keytar: KeytarService,
```

**Изменения refreshOne():**
```typescript
private async refreshOne(connId: string, exchange: string): Promise<void> {
  const updatedAt = Date.now();

  try {
    // ❌ УДАЛИТЬ весь блок keytar + initializeTrading:
    // const apiKey = await this.keytar.getPassword('funding-bot-api', connId);
    // const secret = await this.keytar.getPassword('funding-bot-secret', connId);
    // const passphrase = await this.keytar.getPassword('funding-bot-passphrase', connId);
    // if (typeof (adapter as any).initializeTrading === 'function') { ... }

    // ✅ НОВОЕ: через RestApiManager
    const balances = await this.restApiManager.callPrivate(
      connId,
      exchange,
      async (adapter, signal) => {
        if (!adapter.getBalances) {
          throw new Error(`Exchange ${exchange} does not support getBalances method`);
        }
        return adapter.getBalances();
      },
      { op: 'getBalances', timeoutMs: 60_000 }
    );

    if (balances === null) {
      throw new Error('Request timeout');
    }

    // Конвертируем и сохраняем
    const exchangeBalances = this.convertToExchangeBalances(connId, exchange, balances, updatedAt);
    this.cache.set(connId, exchangeBalances);
    await this.saveToDatabase(exchangeBalances);
    this.emit('balances:update', exchangeBalances);

    safeLog.info(`[BalanceManager] Successfully updated balances for ${exchange} (${connId})`);

  } catch (error: any) {
    safeLog.error(`[BalanceManager] Error updating balances for ${exchange} (${connId}): ${error?.message}`);

    // Сохраняем ошибку в кэш
    const errorBalances: ExchangeBalances = {
      exchange,
      connId,
      accounts: {},
      updatedAt,
      error: error?.message || String(error),
      source: 'rest-only'
    };

    this.cache.set(connId, errorBalances);
    this.emit('balances:update', errorBalances);
  }
}
```

**Изменения createBalanceManager:**
```typescript
export function createBalanceManager(
  getConnections: () => Promise<ConnectionInfo[]>,
  getAdapter: (connId: string) => IExchangeAdapter | undefined,
  restApiManager: RestApiManager, // ✅ НОВОЕ
  databaseBalances: DatabaseBalances | null,
  updateIntervalMs?: number
): BalanceManager {
  if (balanceManagerInstance) {
    return balanceManagerInstance;
  }

  balanceManagerInstance = new BalanceManager(
    getConnections,
    getAdapter,
    restApiManager, // ✅ НОВОЕ
    databaseBalances,
    updateIntervalMs
  );

  return balanceManagerInstance;
}

// ❌ УДАЛИТЬ параметр keytar
```

**Статус**: 🟡 Phase 2.2

---

### Шаг 2.3: Обновить инициализацию в main.ts

**Файл**: `electron/main.ts` (или где инициализируется архитектура)

**Порядок инициализации:**
```typescript
// 1. Инициализируем WebSocketManager (public + private)
await webSocketManager.initialize(symbolManager, fundingRateManager);
await webSocketManager.connectAll(); // public WS

// 2. Инициализируем private WS в WebSocketManager
await webSocketManager.initializePrivate(
  () => settings.getAllConnections(),
  (connId) => webSocketManager.getExchangeController()?.getAdapterByConnId(connId),
  keytar as KeytarService
);

// 3. Пробрасываем PrivateSessionManager в RestApiManager
const privateSessionManager = webSocketManager.getPrivateSessionManager();
if (!privateSessionManager) {
  throw new Error('PrivateSessionManager not initialized');
}

restApiManager.setPrivateSessionManager(privateSessionManager);

// 4. Создаем OpenOrdersManager с WebSocketManager и RestApiManager
const openOrdersManager = new OpenOrdersManager(
  () => settings.getAllConnections(),
  (connId) => webSocketManager.getExchangeController()?.getAdapterByConnId(connId),
  webSocketManager,       // WS primary
  restApiManager,         // REST reconcile
  databaseOpenOrders,
  {
    reconcileInterval: 30_000,  // 30 секунд
    enableWsSubscriptions: true,
    enableRestReconcile: true
  }
);

await openOrdersManager.initialize();
await openOrdersManager.start();

// 5. Создаем BalanceManager с RestApiManager
const balanceManager = createBalanceManager(
  () => settings.getAllConnections(),
  (connId) => webSocketManager.getExchangeController()?.getAdapterByConnId(connId),
  restApiManager,  // REST для балансов
  databaseBalances,
  30_000
);

await balanceManager.start();
```

**Статус**: 🟡 Phase 2.3

---

## Критерии успеха

### Phase 1: Private WS + Session Management ✅
- [ ] PrivateSessionManager создан и управляет auth для WS и REST
- [ ] PrivateExchangeController управляет private WS подписками
- [ ] WebSocketManager расширен для private WS
- [ ] OpenOrdersManager получает realtime обновления через private WS
- [ ] initializeTrading вызывается ОДИН раз на connId (дедуп через PrivateSessionManager)
- [ ] Нет ошибок "trading not initialized"

### Phase 2: Private REST Reconcile ✅
- [ ] RestApiManager.callPrivate() реализован
- [ ] RestApiManager использует PrivateSessionManager для auth (общий с WS)
- [ ] BalanceManager переписан на RestApiManager.callPrivate()
- [ ] OpenOrdersManager.reconcile() работает через RestApiManager.callPrivate()
- [ ] REST reconcile каждые 30 секунд находит расхождения с WS
- [ ] При auth-ошибке есть 1 retry через resetSession

---

## Прогресс

**Phase 1: Private WS + Auth**
- [x] Шаг 1.1: PrivateSessionManager (auth layer)
- [x] Шаг 1.2: PrivateExchangeController (private WS)
- [x] Шаг 1.3: WebSocketManager расширение
- [x] Шаг 1.4: OpenOrdersManager для WS

**Phase 2: Private REST Reconcile**
- [x] Шаг 2.1: RestApiManager.callPrivate()
- [x] Шаг 2.2: BalanceManager переписать
- [x] Шаг 2.3: main.ts инициализация

---

## Архитектурные решения

### Почему PrivateSessionManager общий для WS и REST?
- **Единая точка auth**: один слой управления credentials/keytar
- **Дедупликация**: initializeTrading вызывается один раз, используется и WS и REST
- **Кэш сессий**: сессия инициализируется при WS подписке, REST reconcile переиспользует
- **Простота**: resetSession при auth-ошибке работает для обоих транспортов

### Почему WebSocketManager симметричен RestApiManager?
- **Public слой**: оба управляют public данными (WebSocketManager→BaseExchangeController, RestApiManager→queueRequest)
- **Private слой**: оба управляют private данными (WebSocketManager→PrivateExchangeController, RestApiManager→callPrivate)
- **Единая абстракция**: менеджеры (OpenOrdersManager, BalanceManager) видят единый интерфейс для WS и REST

### Почему WS Primary, REST Reconcile?
- **Latency**: WS дает realtime обновления (< 100ms)
- **Bandwidth**: меньше нагрузка на API (не нужно поллить)
- **Reliability**: REST reconcile каждые 30 сек находит пропущенные WS события
- **Recovery**: при обрыве WS, REST восстанавливает состояние

### Почему работа по connId, а не по биржам?
Private данные привязаны к **аккаунту/ключам**. При нескольких connId на одну биржу:
- Итерация по биржам потеряет данные второго аккаунта
- initializeTrading перетрет credentials
- Неопределенное поведение при concurrent запросах
