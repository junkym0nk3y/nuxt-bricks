# План: database-авторизация для nuxt-bricks

## Контекст

Редактор (`/bricks/**`), превью неопубликованных страниц (`/preview/**`), загрузка изображений (`/mock-api/s3-*`) и мутации БД (`POST/PUT/PATCH/DELETE /api/bricks/**`) сейчас защищены только HTTP Basic Auth с одной парой креденшелов из env (`src/runtime/server/middleware/basic-auth.ts`). Нужен включаемый через опции модуля режим надёжной авторизации: пользователи в Postgres (scrypt-хеш пароля), страница логина, cookie-сессии в БД.

**Скоуп v1 (подтверждён)**: только логин/логаут. Без UI управления пользователями, ролей и смены пароля — пользователи заносятся в БД вручную (поэтому нужна CLI-утилита генерации хеша). Basic остаётся дефолтом, обратная совместимость 100%.

## Ключевые решения

1. **Опция**: `bricks.auth = { mode: 'basic' | 'database', sessionMaxAgeSeconds }` (дефолты `'basic'`, `604800`). Приоритет как у остальных опций: runtimeConfig (NUXT\_\*) ?? env `BRICKS_AUTH_MODE`/`BRICKS_AUTH_SESSION_MAX_AGE` ?? опция. Публичный флаг `runtimeConfig.public.bricksAuthMode` — для 401-интерцептора и login-страницы. Всё регистрируется безусловно (страница, endpoints, middleware), ветвление — в runtime (как у persistence).
2. **Сессии — в БД** (`bricks_sessions`): opaque-токен 32 байта base64url в HttpOnly cookie `bricks-session` (SameSite=Lax, Secure в production, path=/); в БД — только SHA-256 hex токена. Session-secret не нужен, сессии отзываемы. Sliding-продление при < половины срока.
3. **Пароли — scrypt из node:crypto** (ноль зависимостей): самоописывающий формат `scrypt:N:r:p:saltB64:hashB64` (N=16384, r=8, p=1, keylen=64), verify парсит параметры из строки, сравнение `timingSafeEqual`. Экспорт `DUMMY_PASSWORD_HASH` — выравнивание тайминга при неизвестном username (анти-enumeration).
4. **Хранение — расширение persistence**: `IAuthAdapter` + `useBricksAuthAdapter`/`setBricksAuthAdapter` в registry (потребитель может подменить; уходит в существующий экспорт `nuxt-bricks/persistence`). Postgres-реализация поверх готовых `query`/`queryOne`.
5. **Миграций нет** → мемоизированный idempotent `ensureSchema()` в адаптере при первом обращении (с reset-on-failure, чтобы сбой БД не «отравил» синглтон). `database/init.sql` дополняется для свежих установок (в npm-пакет init.sql не попадает — `files: ["dist"]`, реальный механизм — ensureSchema).
6. **HTTP-логика** (не подменяемая) — `src/runtime/server/utils/auth/`: passwords, sessionCookie, session (resolveSessionUser), loginRateLimiter, routeProtection. `server/` — инфраструктура Nitro; depcruise это разрешает (persistence-is-server-only ограничивает только `modules/**`).
7. **UI — новый поддомен `builder/auth/`** (pages/composables/utils/types) — прецедент малых самодостаточных поддоменов (documentation/media), зависимости только ui+common.

## Схема БД (init.sql + ensureSchema в адаптере)

```sql
CREATE TABLE IF NOT EXISTS bricks_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- scrypt:N:r:p:saltB64:hashB64
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
DROP TRIGGER IF EXISTS update_bricks_users_updated_at ON bricks_users;
CREATE TRIGGER update_bricks_users_updated_at BEFORE UPDATE ON bricks_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();  -- ensureSchema делает CREATE OR REPLACE функции

CREATE TABLE IF NOT EXISTS bricks_sessions (
    id SERIAL PRIMARY KEY,
    token_hash CHAR(64) UNIQUE NOT NULL,  -- sha256 hex
    user_id INTEGER NOT NULL REFERENCES bricks_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bricks_sessions_user_id ON bricks_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bricks_sessions_expires_at ON bricks_sessions(expires_at);
```

`TIMESTAMP` без tz — как у существующих таблиц.

## Шаги реализации

### 1. `src/module.ts` — опции и регистрация

- `IBricksModuleOptions.auth` (JSDoc на русском), defaults, `applyBricksRuntimeConfig`: `bricksAuthMode`, `bricksAuthSessionMaxAge`, `public.bricksAuthMode`; `logAuthMode()` рядом с `logPersistenceMode()` (+ warn если database-режим без `bricksDatabaseUrl`).
- Регистрация middleware: `server/middleware/basic-auth` → `server/middleware/auth`.
- extendPages: первый child у `bricks-builder`: `{ name: 'bricks-builder-login', path: 'login', file: modules/builder/auth/pages/login.vue }` (static-сегмент бьёт `:pagename` по ранжированию vue-router независимо от порядка).
- В `apiHandlers`: `POST /api/bricks/auth/login`, `POST /api/bricks/auth/logout`, `GET /api/bricks/auth/me`.

### 2. Persistence: контракт + registry

- `modules/persistence/types/adapters.d.ts`: `IAuthUserRecord { id, username, passwordHash, isActive }`, `IAuthSessionUser` (без секретов), `IAuthSessionWithUser { tokenHash, expiresAt, lastUsedAt, user }`, `ICreateAuthSessionPayload`, `IAuthAdapter { getUserByUsername, getSessionWithUser, createSession, deleteSession, deleteExpiredSessions, touchSession }`.
- `modules/persistence/server/registry.ts`: третья пара сеттер/геттер по образцу storage/publish.

### 3. `modules/persistence/server/postgres/postgresAuthAdapter.ts`

- Мемоизированный `ensureSchema()` с reset-on-failure; каждый метод сначала await'ит его.
- SELECT-ы с алиасами `snake_case AS "camelCase"` (конвенция queryBuilders); `getSessionWithUser` — один JOIN c SQL-фильтром `expires_at > NOW()` (просроченная неотличима от отсутствующей); `deleteExpiredSessions` возвращает count.
- `database/init.sql` — дополнить тем же DDL.

### 4. `src/runtime/server/utils/auth/` (+ README.md таблица)

- `passwords.ts` — scrypt hash/verify, `DUMMY_PASSWORD_HASH`; malformed-строка → false.
- `sessionCookie.ts` — `SESSION_COOKIE_NAME='bricks-session'`, generate/hash token, get/set/clear cookie (h3: `getCookie/setCookie/deleteCookie` — есть в h3@1.15.11).
- `session.ts` — `resolveSessionUser(event)`: cookie → sha256 → адаптер → null при отсутствии/`isActive=false`. Общий для middleware и `me.get`.
- `loginRateLimiter.ts` — in-memory Map, ключ `${ip}|${username.toLowerCase()}`, 5 неудач/15 мин → lockout 15 мин; opportunistic sweep (без таймеров — дружелюбно к HMR/serverless), bound 10k записей. `isLockedOut` возвращает остаток секунд (для `Retry-After`).
- `routeProtection.ts` — `requiresAuth(pathname, method, mode)`: текущая матрица + database-only исключения `/bricks/login` и `/api/bricks/auth/**`; `isProtectedHtmlPath()` → redirect-vs-401.
- `types.d.ts` — `TBricksAuthMode`, augmentation `H3EventContext.bricksUser`.

### 5. Middleware: `basic-auth.ts` → `auth.ts` (git mv)

- `handleBasicAuth` — текущая логика дословно (safeCompare, 503-guard `change-me`, WWW-Authenticate).
- `handleDatabaseAuth`:

```
нет bricksDatabaseUrl → 503 'Database auth is not configured'
resolveSessionUser (catch → 503 'Auth storage is unavailable' — БД упала ≠ 500)
валидна → event.context.bricksUser; sliding (touchSession + re-set cookie) → пропустить
нет → clearSessionCookie; HTML-путь → 302 /bricks/login?redirect=<path+search>; иначе 401 без WWW-Authenticate
```

### 6. Endpoints `src/runtime/server/api/bricks/auth/`

Паттерн репо (`defineEventHandler` → try → `toHttpError`); каждый сначала: mode !== 'database' → 404.

- `login.post.ts`: `readNormalizedBody` → валидация (непустые, username ≤255, password ≤1024) → rate limit (429 + Retry-After) → `getUserByUsername` → verify против `user?.passwordHash ?? DUMMY_PASSWORD_HASH` → неуспех (нет юзера / неверный пароль / `isActive=false`) → `registerFailure` + единый 401 'Invalid credentials' → успех: `resetFailures`, `deleteExpiredSessions` (try/catch-log, не валит логин), создать сессию, `setSessionCookie`, вернуть `{ user: { id, username } }`.
- `logout.post.ts`: идемпотентный — удалить сессию если cookie есть, всегда clear cookie, `{ ok: true }`.
- `me.get.ts`: `resolveSessionUser` → `{ user }` | 401 (используется только login-страницей; интерцептор пропускает `/bricks/login` — петли нет).

### 7. Клиент

- `common/composables/useApiClient.ts` → `onResponseError`: client-only, `public.bricksAuthMode === 'database'`, status 401, не на `/bricks/login` → `window.location.assign('/bricks/login?redirect=' + encodeURIComponent(path+search))` (полная перезагрузка чисто сбрасывает сторы; вне гарантированного Nuxt-контекста). Обновить README-таблицу.
- `builder/auth/composables/useAuthSession.ts`: `isDatabaseMode`, `login()`, `logout()` (POST → assign на login), `fetchMe()` (catch 401 → null).
- `builder/auth/utils/redirects.ts`: `sanitizeRedirectPath()` — только внутренние пути (один ведущий `/`, отсечь `//`, `/\`, абсолютные URL), иначе `/bricks`. **Защита от open redirect.**

### 8. Страница логина

- `ui/inputs/BricksInput`: расширить `type` юнионом `'password'` + опциональный проп `autocomplete` (дефолты сохраняют старое поведение — кит-компонент общий).
- `builder/auth/utils/validationSchema.ts` — yup-фабрика по образцу `publish/utils/validationSchema.ts` (сообщения-функции с `t()`).
- `builder/auth/types/auth.d.ts` — `IAuthLoginFormValues`, `IAuthSessionUserPayload`.
- `builder/auth/composables/useAuthLoginForm.ts` — по образцу `usePublishCreatePageForm`: vee-validate `useForm`/`defineField`, маппинг ошибок по statusCode (401/429/503/прочее → ключи `bricks.auth.errors.*`), успех → `navigateTo(sanitizeRedirectPath(route.query.redirect))`.
- `builder/auth/pages/login.vue` — строгий порядок секций SFC, корневой класс `$style.BuilderAuthLogin`, центрированная карточка: BricksInput (username, `autocomplete="username"`), BricksInput password (`autocomplete="current-password"`), общая ошибка, submit в `<form @submit.prevent>`. Гварды: `!isDatabaseMode → navigateTo('/bricks')`; уже авторизован (`fetchMe`) → redirect. vee-validate доступен (гейт плагина покрывает `/bricks/**`).

### 9. Кнопка «Выйти» в дашборде

- `publish/types/dashboard.d.ts`: `isLogoutVisible` в props Nav и Dashboard, emit `logout` в оба интерфейса.
- `BuilderPublishDashboardNav.vue`: footer-кнопка `v-if="props.isLogoutVisible"`, иконка `ta:outline-logout`, label `bricks.auth.logout`, emit.
- `TheBuilderPublishDashboard.vue`: проброс + re-emit; `publish/pages/index.vue`: `useAuthSession()` → `:is-logout-visible="isDatabaseMode"`, `@logout` → `logout()` с тостом при ошибке.
- `plugins/icons/builderIcons.ts`: зарегистрировать `ta:outline-logout` (экспорт `TaOutlineLogout` в `@kalimahapps/vue-icons/ta` есть).
- `.dependency-cruiser.cjs`: в `builder-publish-deps` добавить `builder/auth`; новое правило `builder-auth-deps` (auth → только ui|common).

### 10. i18n — неймспейс `bricks.auth` (ru.json + en.json)

`login.title` (Вход в билдер / Sign in to builder), `login.username|usernamePlaceholder|password|passwordPlaceholder|submit`, `validation.usernameRequired|passwordRequired`, `errors.invalidCredentials|tooManyAttempts|loginFailed|notConfigured`, `logout` (Выйти / Sign out), `logoutFailed`. Без HTML и literal-`{}` (ограничения message compiler).

### 11. CLI `src/cli/bricks-hash-password.mjs`

Plain-node ESM (mkdist копирует `src/cli` → `dist/cli` как есть — проверено в `build.config.ts`). Пароль из argv или readline-prompt; печатает хеш + готовый `INSERT INTO bricks_users (username, password_hash) VALUES (...)`. package.json: `bin["bricks-hash-password"]`, script `"bricks:hash"`. Параметры scrypt продублированы с `passwords.ts` (verify парсит их из строки — контракт только формат).

### 12. Резерв slug + доки + тесты

- `publish/utils/validationSchema.ts`: `login` — зарезервированный pagename (иначе страница с именем login перекроет URL редактора... наоборот: её редактор `/bricks/login` станет недостижим).
- CLAUDE.md: подраздел про auth-режимы (env `BRICKS_AUTH_MODE`, `BRICKS_AUTH_SESSION_MAX_AGE`; runtime-каveат: `NUXT_BRICKS_AUTH_MODE` меняет только server-ключ, нужен и `NUXT_PUBLIC_BRICKS_AUTH_MODE`), список i18n-неймспейсов (+auth), направления зависимостей (builder/auth; persistence теперь используется и из server/middleware), провижининг пользователей. README — env vars.
- Тесты (vitest, чистые утилиты): `test/serverAuthPasswords.spec.ts` (roundtrip/wrong/malformed), `test/serverAuthRateLimiter.spec.ts` (lockout/окно с fake timers/reset/sweep), `test/serverAuthRouteProtection.spec.ts` (матрица путей × режимов).

## Верификация

1. Статика после каждого файла: `npx vue-tsc --noEmit | grep <file>`, `npx oxlint <file>`; в конце `npm run type-check`, `npm run lint:check` (deps-cruiser проверит новые границы), `npm run test`.
2. **Basic-режим регрессия** (`npm run dev` без env): всё как раньше, `/bricks/login` тоже под Basic (by design).
3. **Database-режим** (`docker compose up -d`; `BRICKS_AUTH_MODE=database DATABASE_URL=... npm run dev`):
    - `npm run bricks:hash -- secret123 --username admin` → INSERT через psql; таблицы должны появиться от ensureSchema при первом защищённом запросе (volume не пересоздавать — это и есть проверка ensureSchema).
    - curl: `/bricks` → 302 на login; `POST /api/bricks` → 401 JSON без WWW-Authenticate; `GET /api/bricks` → 200; `/preview/x` → 302.
    - Браузер: `/bricks/login` рендерит форму (не редактор с pagename='login'); пустой submit → yup-сообщения в обеих локалях; неверный пароль → generic ошибка; 6-я попытка → 429; вход → `/bricks`, cookie HttpOnly/Lax; в БД — только hash, expiry ~7 дней.
    - Удалить строку сессии в БД → мутация → 401 → авторедирект (интерцептор); перезагрузка → 302.
    - Кнопка «Выйти» в nav (в basic-режиме отсутствует) → сессия удалена, редирект на login.
    - 503: database-режим без DATABASE_URL; остановленный postgres → 'Auth storage is unavailable'.
    - Open redirect: `?redirect=https://evil.example`, `//evil.example` → `/bricks`.
4. `npm run build` → в dist есть `cli/bricks-hash-password.mjs`, `runtime/server/middleware/auth.*`; `registry.d.ts` экспортирует `setBricksAuthAdapter`.

## Риски

- **SPA-навигация с мёртвой сессией**: публичные GET-данные видны до первой мутации (401 → redirect) — принято для v1, зеркалит basic-режим (браузер кеширует креды).
- **Rate limiter per-process**: multi-replica ослабляет — документируем.
- **NUXT\_-override split** (server vs public ключ) — документируем в CLAUDE.md.
- **Порядок middleware**: auth до `proxy.client` — сохраняется текущей позицией регистрации.
- **BricksInput — общий кит**: дефолты новых пропов сохраняют старое поведение; полный `vue-tsc` по репо.
- **Локали**: битое значение валит загрузку всей локали — значения plain text.
