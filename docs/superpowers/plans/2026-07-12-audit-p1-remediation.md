# Audit P1 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть восемь P1-находок аудита `docs/application-audit-2026-07-12.md` (A-03, A-04, A-05, A-08, A-07, A-10, A-09, A-06) в порядке приоритетности бэклога аудита.

**Architecture:** Каждая находка — отдельная задача с собственным тест-циклом и коммитом. Серверная логика выносится в чистые функции (тестируются юнитами без h3/БД), h3-обвязка — тонкая. Две новые forward-миграции (0004 timestamptz, 0005 namespaced trigger fn) + checksum-реестр в CLI. Финальный регрессионный гейт — новый CI job `integration` (Postgres + MinIO, black-box HTTP lifecycle из собранного tarball).

**Tech Stack:** Nuxt 3 module, h3/Nitro, node-postgres, vitest, GitHub Actions.

## Global Constraints

- После **каждого** изменения `.vue`/`.ts`: `npx vue-tsc --noEmit 2>&1 | grep <changed-file>` и `npx oxlint <changed-file>` (CLAUDE.md).
- Тесты: `npx vitest run test/<spec>.spec.ts` точечно, `npm test` перед коммитом задачи.
- TypeScript: интерфейсы `I*`, типы `T*`; никакого `any`; JSDoc на каждую функцию (русский, как в кодабазе).
- Хардкод `/bricks`/`/preview` в новом коде запрещён — только `routePaths`/`useBricksRoutePaths`.
- Комментарии и JSDoc — на русском, в стиле существующих файлов.
- Прямые читатели тела h3 (`readBody` и т.п.) запрещены — только `requestBodyLimits.ts`.
- Коммит после каждой задачи; формат — как в истории (`fix(server): ... (audit A-XX)`).
- Каждая задача в конце обновляет `README.md`-разделы, которые она затрагивает, и НЕ трогает `docs/application-audit-2026-07-12.md` (его обновляет Task 9 разом).

## Осознанные отступления от текста аудита (зафиксировать в Task 9)

1. **A-03:** `__Host-`-cookie НЕ вводим: переименование инвалидирует живые сессии и константу `BRICKS_SESSION_COOKIE_NAME` (фильтрация proxy-заголовков); текущая cookie уже `Secure` + `path=/` без `Domain`. Серверный synchronizer token не нужен — достаточно кастомного заголовка + origin-проверки (OWASP допускает custom-header pattern для same-origin SPA).
2. **A-04:** внешний shared limiter для multi-replica не реализуем — остаётся документированной рекомендацией ingress-уровня (README).
3. **A-06:** browser-E2E и coverage thresholds — отдельный трек следующего спринта (вместе с A-13 axe), в этом плане только Postgres+MinIO integration gate.
4. **A-09:** метрики — структурированные логи (timeout/bytes/drop), без отдельной metrics-подсистемы.

---

### Task 1: A-03 — CSRF-защита unsafe bricks-API

**Files:**
- Create: `src/runtime/server/utils/auth/csrfProtection.ts`
- Modify: `src/runtime/server/middleware/auth.ts`
- Modify: `src/runtime/modules/common/constants/auth.ts`
- Modify: `src/runtime/modules/common/composables/useApiClient.ts`
- Modify: `src/runtime/modules/persistence/server/utils/handlerHelpers.ts` (`readNormalizedBody`)
- Modify: `README.md` (раздел Auth: заголовок для автоматизации)
- Test: `test/serverAuthCsrfProtection.spec.ts`, дополнение `test/persistenceHandlerHelpers.spec.ts`

**Interfaces:**
- Consumes: `parseTrustProxyFlag` из `server/utils/requestClientIp.ts`; `BRICKS_SESSION_COOKIE_NAME`-паттерн констант.
- Produces: `checkCsrf(context: ICsrfRequestContext): TCsrfCheckResult`, `assertCsrfSafe(event: H3Event): void`, `isCsrfProtectedPath(pathname: string): boolean`, константа `BRICKS_CSRF_HEADER_NAME = 'x-bricks-csrf'`. Task 8 шлёт этот заголовок в integration-smoke.

**Дизайн:** unsafe-методы (POST/PUT/PATCH/DELETE) на логических путях `/api/bricks/**` (включая `/api/bricks/auth/**` — login/logout вне auth-матрицы, но под CSRF) и `/mock-api/s3-*` требуют одного из доказательств same-origin: (1) кастомный заголовок `x-bricks-csrf` (кросс-доменно не поставить без CORS-preflight, CORS модуль не включает); (2) `Sec-Fetch-Site: same-origin|none`; (3) hostname `Origin` == hostname эффективного Host (`x-forwarded-host` первый токен при `bricks.trustProxy`, иначе `Host`). Ничего из этого нет → 403. Проверка идёт ДО auth-веток (fail fast, login тоже покрыт). Не-браузерная автоматизация обязана слать `x-bricks-csrf: 1` — задокументировать в README.

- [ ] **Step 1: Написать падающий тест** `test/serverAuthCsrfProtection.spec.ts`

```ts
// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    checkCsrf,
    isCsrfProtectedPath,
    type ICsrfRequestContext,
} from '../src/runtime/server/utils/auth/csrfProtection';
// #endregion

/** Базовый unsafe-контекст без каких-либо признаков происхождения. */
const BARE_POST: ICsrfRequestContext = {
    method: 'POST',
    origin: undefined,
    secFetchSite: undefined,
    hasCsrfHeader: false,
    effectiveHost: 'app.example.com',
};

describe('csrfProtection: чистая проверка контекста запроса', () => {
    it('safe-методы всегда разрешены', () => {
        for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
            expect(checkCsrf({ ...BARE_POST, method }).allowed).toBe(true);
        }
    });

    it('кастомный заголовок разрешает unsafe-запрос без Origin', () => {
        expect(checkCsrf({ ...BARE_POST, hasCsrfHeader: true }).allowed).toBe(true);
    });

    it('unsafe без Origin, Sec-Fetch-Site и заголовка — отклоняется', () => {
        expect(checkCsrf(BARE_POST).allowed).toBe(false);
    });

    it('Sec-Fetch-Site same-origin/none — разрешён, same-site/cross-site — нет', () => {
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'same-origin' }).allowed).toBe(true);
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'none' }).allowed).toBe(true);
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'same-site' }).allowed).toBe(false);
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'cross-site' }).allowed).toBe(false);
    });

    it('Origin same-origin (с портом и без) — разрешён', () => {
        expect(
            checkCsrf({ ...BARE_POST, origin: 'https://app.example.com' }).allowed
        ).toBe(true);
        expect(
            checkCsrf({
                ...BARE_POST,
                origin: 'http://app.example.com:3000',
                effectiveHost: 'app.example.com:3000',
            }).allowed
        ).toBe(true);
    });

    it('cross-origin, sibling same-site и opaque origin — отклоняются', () => {
        expect(checkCsrf({ ...BARE_POST, origin: 'https://evil.example' }).allowed).toBe(false);
        expect(
            checkCsrf({ ...BARE_POST, origin: 'https://evil.example.com' }).allowed
        ).toBe(false);
        expect(checkCsrf({ ...BARE_POST, origin: 'null' }).allowed).toBe(false);
        expect(checkCsrf({ ...BARE_POST, origin: '::not-a-url::' }).allowed).toBe(false);
    });

    it('Origin без эффективного Host — отклоняется', () => {
        expect(
            checkCsrf({ ...BARE_POST, origin: 'https://app.example.com', effectiveHost: undefined })
                .allowed
        ).toBe(false);
    });

    it('Sec-Fetch-Site приоритетнее Origin (same-site с совпавшим хостом — отказ)', () => {
        expect(
            checkCsrf({
                ...BARE_POST,
                secFetchSite: 'same-site',
                origin: 'https://app.example.com',
            }).allowed
        ).toBe(false);
    });

    it('isCsrfProtectedPath: покрывает /api/bricks и /mock-api/s3-*, не трогает прочее', () => {
        expect(isCsrfProtectedPath('/api/bricks/auth/login')).toBe(true);
        expect(isCsrfProtectedPath('/api/bricks/123')).toBe(true);
        expect(isCsrfProtectedPath('/mock-api/s3-page-thumbnail')).toBe(true);
        expect(isCsrfProtectedPath('/api/other')).toBe(false);
        expect(isCsrfProtectedPath('/landing')).toBe(false);
    });
});
```

- [ ] **Step 2:** `npx vitest run test/serverAuthCsrfProtection.spec.ts` — FAIL (модуль не существует).

- [ ] **Step 3:** Добавить константу в `src/runtime/modules/common/constants/auth.ts`:

```ts
/**
 * Имя кастомного CSRF-заголовка unsafe-запросов bricks-API.
 *
 * Кросс-доменный документ не может поставить кастомный заголовок без
 * CORS-preflight (CORS модуль не включает) — его присутствие доказывает
 * same-origin. Клиент билдера (useApiClient) шлёт его всегда; не-браузерная
 * автоматизация обязана добавлять `x-bricks-csrf: 1` к unsafe-запросам.
 */
export const BRICKS_CSRF_HEADER_NAME = 'x-bricks-csrf';
```

- [ ] **Step 4:** Создать `src/runtime/server/utils/auth/csrfProtection.ts`:

```ts
/**
 * CSRF-защита unsafe-запросов bricks-API (аудит A-03).
 *
 * Session-cookie SameSite=Lax не покрывает same-site sibling-домены, а Basic
 * Auth браузер автоповторяет — поэтому unsafe-методы на поверхностях модуля
 * требуют доказательства same-origin: кастомный заголовок `x-bricks-csrf`,
 * либо Sec-Fetch-Site: same-origin/none, либо совпадение hostname Origin
 * с эффективным Host запроса (x-forwarded-host при bricks.trustProxy).
 * Запрос без признаков происхождения отклоняется 403.
 */
import { createError, getRequestHeader, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { BRICKS_CSRF_HEADER_NAME } from '../../../modules/common/constants/auth';
import { parseTrustProxyFlag } from '../requestClientIp';

/** Методы, не требующие CSRF-проверки (safe по RFC 9110). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Значения Sec-Fetch-Site, подтверждающие не-кросс-сайтовый запрос. */
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

/** Контекст запроса для чистой CSRF-проверки. */
export interface ICsrfRequestContext {
    method: string;
    origin: string | undefined;
    secFetchSite: string | undefined;
    hasCsrfHeader: boolean;
    effectiveHost: string | undefined;
}

export type TCsrfCheckResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Извлекает hostname из значения Host-заголовка (может содержать порт).
 *
 * @param host - Значение Host / x-forwarded-host.
 * @returns hostname в нижнем регистре или null для мусорного значения.
 */
function parseHostHeaderHostname(host: string): string | null {
    try {
        return new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Путь входит в CSRF-скоуп модуля: весь /api/bricks (включая auth-ручки,
 * которые не под auth-матрицей) и S3-операции mock-api.
 *
 * @param pathname - Логический путь запроса (без baseURL).
 */
export function isCsrfProtectedPath(pathname: string): boolean {
    return pathname.startsWith('/api/bricks') || pathname.startsWith('/mock-api/s3-');
}

/**
 * Чистая CSRF-проверка контекста запроса (порядок: safe-метод → кастомный
 * заголовок → Sec-Fetch-Site → Origin → отказ).
 *
 * @param context - Извлечённые из запроса признаки происхождения.
 * @returns Результат; при отказе — машиночитаемая причина для лога.
 */
export function checkCsrf(context: ICsrfRequestContext): TCsrfCheckResult {
    if (SAFE_METHODS.has(context.method.toUpperCase())) {
        return { allowed: true };
    }

    if (context.hasCsrfHeader) {
        return { allowed: true };
    }

    if (context.secFetchSite) {
        return TRUSTED_FETCH_SITES.has(context.secFetchSite.toLowerCase())
            ? { allowed: true }
            : { allowed: false, reason: `sec-fetch-site "${context.secFetchSite}"` };
    }

    if (context.origin) {
        if (context.origin === 'null') {
            return { allowed: false, reason: 'opaque origin' };
        }

        let originHostname: string;

        try {
            originHostname = new URL(context.origin).hostname.toLowerCase();
        } catch {
            return { allowed: false, reason: 'malformed origin' };
        }

        const hostHostname = context.effectiveHost
            ? parseHostHeaderHostname(context.effectiveHost)
            : null;

        if (!hostHostname) {
            return { allowed: false, reason: 'missing effective host' };
        }

        return originHostname === hostHostname
            ? { allowed: true }
            : {
                  allowed: false,
                  reason: `origin "${originHostname}" does not match host "${hostHostname}"`,
              };
    }

    return { allowed: false, reason: 'no origin evidence (send x-bricks-csrf header)' };
}

/**
 * h3-обвязка: собирает контекст из заголовков и кидает 403 при отказе.
 * Причина отказа уходит только в server-лог (не в ответ).
 *
 * @param event - Событие запроса.
 */
export function assertCsrfSafe(event: H3Event): void {
    const method = event.node.req.method || 'GET';

    if (SAFE_METHODS.has(method)) {
        return;
    }

    const trustProxy = parseTrustProxyFlag(useRuntimeConfig(event).bricksTrustProxy);
    const forwardedHost = trustProxy
        ? getRequestHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
        : undefined;

    const result = checkCsrf({
        method,
        origin: getRequestHeader(event, 'origin'),
        secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
        hasCsrfHeader: Boolean(getRequestHeader(event, BRICKS_CSRF_HEADER_NAME)),
        effectiveHost: forwardedHost || getRequestHeader(event, 'host'),
    });

    if (result.allowed) {
        return;
    }

    console.warn('[nuxt-bricks] CSRF check rejected request:', {
        path: event.node.req.url,
        method,
        reason: result.reason,
    });

    throw createError({ statusCode: 403, statusMessage: 'Cross-site request rejected' });
}
```

- [ ] **Step 5:** `npx vitest run test/serverAuthCsrfProtection.spec.ts` — PASS.

- [ ] **Step 6:** Вшить в `src/runtime/server/middleware/auth.ts` — сразу после построения `target`, ДО `requiresAuth`-ветки:

```ts
import { assertCsrfSafe, isCsrfProtectedPath } from '../utils/auth/csrfProtection';
```

```ts
    // CSRF-гейт unsafe-методов (аудит A-03): ДО auth — login/logout не под
    // requiresAuth, но под CSRF; неавторизованный кросс-сайтовый POST — 403
    if (isCsrfProtectedPath(target.logicalPathname)) {
        assertCsrfSafe(event);
    }

    if (!requiresAuth(target.logicalPathname, method, mode, prefixes)) {
        return; // Пропускаем незащищённые пути
    }
```

- [ ] **Step 7:** Клиент: в `useApiClient.ts` после блока CSRF-токена Django добавить (импортировав `BRICKS_CSRF_HEADER_NAME` из `../constants/auth`):

```ts
    // CSRF-маркер unsafe-запросов bricks-API: кросс-доменный документ не может
    // поставить кастомный заголовок без CORS-preflight (см. csrfProtection.ts)
    defaultHeaders[BRICKS_CSRF_HEADER_NAME] = '1';
```

- [ ] **Step 8:** `readNormalizedBody` (handlerHelpers.ts): требовать JSON content-type (импорт `getHeader` из h3 там уже есть/добавить):

```ts
export async function readNormalizedBody<T>(event: H3Event): Promise<T> {
    // Unsafe-запрос с не-JSON контентом (form/text) — типичный CSRF-вектор
    // мимо preflight; требуем явный application/json (аудит A-03)
    const contentType = getHeader(event, 'content-type') ?? '';

    if (!contentType.toLowerCase().includes('application/json')) {
        throw createError({
            statusCode: 415,
            statusMessage: 'Expected application/json body',
        });
    }

    const body = await readJsonBodyWithLimit<object>(event, MAX_JSON_BODY_BYTES);
    // ... остальное без изменений
```

Дополнить `test/persistenceHandlerHelpers.spec.ts` кейсом: событие с `content-type: text/plain` → reject 415 (следовать паттерну фейковых событий из этого же spec / `persistenceRequestBodyLimits.spec.ts`).

- [ ] **Step 9:** README: в раздел про auth добавить абзац «CSRF: unsafe-запросы `/api/bricks/**` требуют same-origin (Origin/Sec-Fetch-Site) или заголовка `x-bricks-csrf: 1`; тело JSON-ручек — только `application/json`. curl-автоматизация: `-H 'x-bricks-csrf: 1' -H 'content-type: application/json'`».

- [ ] **Step 10:** Проверки: `npx vue-tsc --noEmit 2>&1 | grep -E 'csrfProtection|auth.ts|useApiClient|handlerHelpers'`; `npx oxlint` по изменённым файлам; `npm test`. Ручная проверка происходит в Task 8 (integration-smoke шлёт заголовок).

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "fix(server): CSRF origin gate for unsafe bricks API (audit A-03)"
```

---

### Task 2: A-04 — двухуровневый auth throttling + scrypt semaphore

**Files:**
- Modify: `src/runtime/server/utils/auth/loginRateLimiter.ts`
- Create: `src/runtime/server/utils/auth/scryptGate.ts`
- Modify: `src/runtime/server/api/bricks/auth/login.post.ts`
- Modify: `src/runtime/server/middleware/auth.ts` (`handleBasicAuth`)
- Modify: `README.md` (rate-limit/multi-replica заметка)
- Test: `test/serverAuthRateLimiter.spec.ts` (дополнить), `test/serverAuthScryptGate.spec.ts`

**Interfaces:**
- Consumes: `createConcurrencyGate`, `GateOverflowError` из `modules/persistence/server/utils/concurrencyGate.ts` (persistence из middleware — разрешённое направление); `resolveRequestClientIp` из `server/utils/requestClientIp.ts`.
- Produces: `registerIpFailure(ip: string): void`, `isIpLockedOut(ip: string): number` (секунды для Retry-After), `buildIpRateLimitKey(ip: string): string`; `runScryptTask<T>(task: () => Promise<T>): Promise<T>` и реэкспорт `GateOverflowError`.

**Дизайн:** второй bucket того же in-memory лимитера с ключом `ip:${ip}` и порогом `MAX_IP_FAILURES = 30` за то же 15-мин окно (login database-режима и невалидные Basic-креденшелы делят его). Проверка per-IP идёт ДО дорогого scrypt (критерий аудита: 100 сменяемых username с одного IP → 429 до нового derive). scrypt — под bounded-семафором (4 одновременных, очередь 32, переполнение → 503).

- [ ] **Step 1:** Дополнить `test/serverAuthRateLimiter.spec.ts` (внутри существующего describe, импорты расширить на `buildIpRateLimitKey`, `isIpLockedOut`, `registerIpFailure`):

```ts
    it('per-IP bucket: 30 неудач с разными username включают lockout по IP', () => {
        for (let attempt = 0; attempt < 29; attempt += 1) {
            registerIpFailure('9.9.9.9');
            expect(isIpLockedOut('9.9.9.9')).toBe(0);
        }

        registerIpFailure('9.9.9.9');
        expect(isIpLockedOut('9.9.9.9')).toBeGreaterThan(0);
    });

    it('per-IP и per-IP|username buckets независимы', () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            registerFailure(buildRateLimitKey('9.9.9.9', 'admin'));
        }

        expect(isLockedOut(buildRateLimitKey('9.9.9.9', 'admin'))).toBeGreaterThan(0);
        expect(isIpLockedOut('9.9.9.9')).toBe(0);
    });

    it('ключ IP-bucket не пересекается с ключами username', () => {
        expect(buildIpRateLimitKey('1.2.3.4')).not.toBe(buildRateLimitKey('1.2.3.4', ''));
    });
```

- [ ] **Step 2:** `npx vitest run test/serverAuthRateLimiter.spec.ts` — FAIL (нет экспортов).

- [ ] **Step 3:** В `loginRateLimiter.ts`: параметризовать порог и добавить IP-bucket. Изменения:

```ts
/** Максимум неудач по одному IP (сменяемые username) в окне до блокировки. */
const MAX_IP_FAILURES = 30;
```

```ts
/**
 * Строит ключ IP-bucket'а (второй уровень: неудачи с любыми username).
 */
export function buildIpRateLimitKey(ip: string): string {
    return `ip:${ip}`;
}
```

`registerFailure` получает параметр порога:

```ts
export function registerFailure(key: string, maxFailures: number = MAX_FAILURES): void {
    // ... тело как было, но
    if (entry.failures >= maxFailures) {
        entry.lockedUntil = now + LOCKOUT_MS;
    }
```

(и в ветке первой записи ничего не меняется). Новые обёртки:

```ts
/**
 * Регистрирует неудачную попытку на IP-bucket (порог MAX_IP_FAILURES) —
 * второй уровень против перебора username (аудит A-04).
 */
export function registerIpFailure(ip: string): void {
    registerFailure(buildIpRateLimitKey(ip), MAX_IP_FAILURES);
}

/**
 * Остаток IP-lockout'а в секундах (0 — не заблокирован).
 */
export function isIpLockedOut(ip: string): number {
    return isLockedOut(buildIpRateLimitKey(ip));
}
```

Обновить шапку-JSDoc модуля (двухуровневая схема).

- [ ] **Step 4:** `npx vitest run test/serverAuthRateLimiter.spec.ts` — PASS.

- [ ] **Step 5:** Создать `src/runtime/server/utils/auth/scryptGate.ts` + тест `test/serverAuthScryptGate.spec.ts`:

```ts
/**
 * Bounded-семафор scrypt-дериваций (аудит A-04): поток login-запросов с
 * разными username не может занять CPU неограниченным числом одновременных
 * derive-операций. Переполнение очереди — GateOverflowError (ручка мапит в 503).
 */
import {
    createConcurrencyGate,
    GateOverflowError,
} from '../../../modules/persistence/server/utils/concurrencyGate';

/** Максимум одновременных scrypt-дериваций. */
const MAX_CONCURRENT_SCRYPT_TASKS = 4;
/** Максимум ожидающих слот дериваций; сверх — GateOverflowError. */
const MAX_SCRYPT_QUEUE = 32;

const scryptGate = createConcurrencyGate({
    maxConcurrent: MAX_CONCURRENT_SCRYPT_TASKS,
    maxQueue: MAX_SCRYPT_QUEUE,
});

export { GateOverflowError };

/**
 * Исполняет scrypt-задачу в пределах общего лимита одновременности.
 *
 * @param task - Ленивая scrypt-операция (verifyPassword).
 */
export function runScryptTask<T>(task: () => Promise<T>): Promise<T> {
    return scryptGate.run(task);
}
```

Тест (паттерн `persistenceConcurrencyGate.spec.ts`): 5 параллельных задач → одновременно активных не больше 4 (счётчик active в замыкании тестовых задач с deferred-промисами).

- [ ] **Step 6:** `login.post.ts`: IP-lockout до scrypt + гейт + двойная регистрация неудач:

```ts
import {
    buildRateLimitKey,
    isIpLockedOut,
    isLockedOut,
    registerFailure,
    registerIpFailure,
    resetFailures,
} from '../../../utils/auth/loginRateLimiter';
import { GateOverflowError, runScryptTask } from '../../../utils/auth/scryptGate';
```

В `verifyCredentials` scrypt под гейтом:

```ts
    const isPasswordValid = await runScryptTask(() =>
        verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
    );
```

В обработчике — после `validateLoginBody`:

```ts
        const clientIp = resolveRequestClientIp(event);
        const ipLockoutSeconds = isIpLockedOut(clientIp);

        if (ipLockoutSeconds > 0) {
            setResponseHeader(event, 'Retry-After', ipLockoutSeconds);
            throw createError({
                statusCode: 429,
                statusMessage: 'Too many login attempts',
            });
        }

        const rateLimitKey = buildRateLimitKey(clientIp, username);
        // ... существующая per-key проверка без изменений
```

Вызов `verifyCredentials` — с маппингом переполнения гейта:

```ts
        let user;

        try {
            user = await verifyCredentials(auth, username, password);
        } catch (error: unknown) {
            if (error instanceof GateOverflowError) {
                throw createError({
                    statusCode: 503,
                    statusMessage: 'Server is busy, try again later',
                });
            }

            throw error;
        }

        if (!user) {
            registerFailure(rateLimitKey);
            registerIpFailure(clientIp);
            throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
        }
```

- [ ] **Step 7:** `handleBasicAuth` в middleware: лимит невалидных креденшелов per IP (заголовок отсутствует — браузерный prompt, НЕ считаем):

```ts
import { isIpLockedOut, registerIpFailure } from '../utils/auth/loginRateLimiter';
import { resolveRequestClientIp } from '../utils/requestClientIp';
```

```ts
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return sendUnauthorized(event);
    }

    // Rate limit невалидных креденшелов (аудит A-04): Basic Auth перебирается
    // тем же IP-bucket'ом, что и database-login
    const clientIp = resolveRequestClientIp(event);
    const lockoutSeconds = isIpLockedOut(clientIp);

    if (lockoutSeconds > 0) {
        setResponseHeader(event, 'Retry-After', lockoutSeconds);
        throw createError({ statusCode: 429, statusMessage: 'Too many authentication attempts' });
    }

    // ... разбор креденшелов как был ...

    if (!userValid || !passValid) {
        registerIpFailure(clientIp);
        return sendUnauthorized(event);
    }
```

- [ ] **Step 8:** README: дополнить auth-раздел — двухуровневый лимитер (5/username, 30/IP за 15 мин), scrypt-семафор, per-process ограничение (multi-replica → рекомендация ingress-лимитера).

- [ ] **Step 9:** `npm test`; `npx vue-tsc --noEmit 2>&1 | grep -E 'loginRateLimiter|scryptGate|login.post|auth.ts'`; oxlint по изменённым.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "fix(server): two-level auth throttling and scrypt semaphore (audit A-04)"
```

---

### Task 3: A-05 — честный readiness

**Files:**
- Create: `src/runtime/server/utils/readinessTarget.ts`
- Modify: `src/runtime/modules/persistence/server/registry.ts`
- Modify: `src/runtime/server/api/bricks/health/ready.get.ts`
- Modify: `src/runtime/modules/persistence/types/adapters.d.ts` (JSDoc-контракт `checkHealth`)
- Modify: `scripts/pack-smoke.mjs` (assert ready=503 без persistence)
- Modify: `README.md` (health-раздел)
- Test: `test/serverReadinessTarget.spec.ts`

**Interfaces:**
- Consumes: `useRuntimeConfig` ключи `bricksDatabaseUrl`, `bricksProxyUrl`, `bricksSsrProxyUrl` (см. `useApiClient.ts`).
- Produces: `resolveReadinessTarget(input: IReadinessTargetInput): TReadinessTarget` (`'adapter' | 'proxy' | 'none'`); `hasCustomBricksStorageAdapter(): boolean` в registry. Task 8 asserts ready=200 c БД.

- [ ] **Step 1:** Тест `test/serverReadinessTarget.spec.ts`:

```ts
// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { resolveReadinessTarget } from '../src/runtime/server/utils/readinessTarget';
// #endregion

describe('readinessTarget: выбор persistence-пути для readiness probe', () => {
    it('кастомный адаптер — adapter-путь независимо от конфигурации', () => {
        expect(
            resolveReadinessTarget({ hasDatabaseUrl: false, hasProxyUrl: true, hasCustomAdapter: true })
        ).toBe('adapter');
    });

    it('сконфигурированная БД — adapter-путь', () => {
        expect(
            resolveReadinessTarget({ hasDatabaseUrl: true, hasProxyUrl: false, hasCustomAdapter: false })
        ).toBe('adapter');
    });

    it('только proxy — proxy-путь', () => {
        expect(
            resolveReadinessTarget({ hasDatabaseUrl: false, hasProxyUrl: true, hasCustomAdapter: false })
        ).toBe('proxy');
    });

    it('ни БД, ни proxy, ни адаптера — none (readiness обязан отвечать 503)', () => {
        expect(
            resolveReadinessTarget({ hasDatabaseUrl: false, hasProxyUrl: false, hasCustomAdapter: false })
        ).toBe('none');
    });
});
```

- [ ] **Step 2:** Прогнать — FAIL. Создать `src/runtime/server/utils/readinessTarget.ts`:

```ts
/**
 * Выбор persistence-пути для readiness probe (аудит A-05): конфигурация без
 * БД, без proxy и без кастомного адаптера означает, что editorial CRUD
 * фактически отвечает 500 — readiness обязан быть 503, а не зелёным.
 */

/** Проверяемый readiness'ом persistence-путь. */
export type TReadinessTarget = 'adapter' | 'proxy' | 'none';

/** Признаки сконфигурированных persistence-путей. */
export interface IReadinessTargetInput {
    hasDatabaseUrl: boolean;
    hasProxyUrl: boolean;
    hasCustomAdapter: boolean;
}

/**
 * Определяет, какой persistence-путь должен подтвердить готовность.
 *
 * @param input - Признаки конфигурации.
 */
export function resolveReadinessTarget(input: IReadinessTargetInput): TReadinessTarget {
    if (input.hasCustomAdapter || input.hasDatabaseUrl) {
        return 'adapter';
    }

    if (input.hasProxyUrl) {
        return 'proxy';
    }

    return 'none';
}
```

- [ ] **Step 3:** Registry: флаг кастомного storage-адаптера:

```ts
let customStorageAdapterRegistered = false;
```

в `setBricksStorageAdapter` добавить `customStorageAdapterRegistered = true;`, и новый экспорт:

```ts
/**
 * Зарегистрирован ли кастомный storage-адаптер (для readiness probe:
 * кастомный адаптер сам отвечает за checkHealth-семантику).
 */
export function hasCustomBricksStorageAdapter(): boolean {
    return customStorageAdapterRegistered;
}
```

- [ ] **Step 4:** Переписать `ready.get.ts`:

```ts
import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    hasCustomBricksStorageAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import { resolveReadinessTarget } from '../../../utils/readinessTarget';

/** Зависший коннект/дальний proxy не должны вешать probe дольше таймаута. */
const READINESS_TIMEOUT_MS = 5000;

// withTimeout — без изменений (как в текущем файле)

/**
 * Достижимость downstream-proxy: любой HTTP-ответ (включая 404/405)
 * подтверждает, что backend жив; сетевые ошибки/таймаут — не готов.
 *
 * @param proxyUrl - PROXY_URL из runtimeConfig.
 */
async function probeProxyEndpoint(proxyUrl: string): Promise<void> {
    await fetch(proxyUrl, { method: 'HEAD', redirect: 'manual' });
}

/**
 * GET /api/bricks/health/ready — readiness probe. Выбирает persistence-путь
 * (адаптер / proxy / ничего) и подтверждает готовность именно его:
 * ни БД, ни proxy, ни кастомного адаптера → 503 (аудит A-05).
 * Наружу деталей не отдаёт — полная ошибка уходит в server-лог.
 */
export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store');

    const config = useRuntimeConfig();
    const proxyUrl =
        (config.bricksSsrProxyUrl as string | undefined) ||
        (config.bricksProxyUrl as string | undefined);
    const target = resolveReadinessTarget({
        hasDatabaseUrl: Boolean(config.bricksDatabaseUrl),
        hasProxyUrl: Boolean(proxyUrl),
        hasCustomAdapter: hasCustomBricksStorageAdapter(),
    });

    try {
        if (target === 'none') {
            throw new Error('No persistence configured (neither database, proxy nor adapter)');
        }

        if (target === 'adapter') {
            const adapter = useBricksStorageAdapter();

            if (adapter.checkHealth) {
                await withTimeout(adapter.checkHealth(), READINESS_TIMEOUT_MS);
            }
        } else {
            await withTimeout(probeProxyEndpoint(proxyUrl as string), READINESS_TIMEOUT_MS);
        }

        return { status: 'ok' };
    } catch (error: unknown) {
        console.error('[Bricks Health] Readiness check failed:', error);

        throw createError({ statusCode: 503, statusMessage: 'Service is not ready' });
    }
});
```

- [ ] **Step 5:** JSDoc `checkHealth` в `persistence/types/adapters.d.ts`: дописать «Production-адаптеры ДОЛЖНЫ реализовать метод: адаптер без checkHealth считается всегда готовым, и readiness не заметит деградацию хранилища».

- [ ] **Step 6:** `scripts/pack-smoke.mjs` → `runHttpChecks()` дополнить:

```js
    const health = await fetch(`${SERVER_ORIGIN}/api/bricks/health`);
    assertOk(health.status === 200, `liveness должен быть 200, получено ${health.status}`);

    // Consumer без БД и без PROXY_URL: readiness обязан быть 503 (аудит A-05)
    const ready = await fetch(`${SERVER_ORIGIN}/api/bricks/health/ready`);
    assertOk(ready.status === 503, `readiness без persistence должен быть 503, получено ${ready.status}`);
```

- [ ] **Step 7:** README health-раздел: readiness 503 при отсутствии persistence-пути; proxy-режим — HEAD-проверка достижимости PROXY_URL.

- [ ] **Step 8:** `npm test`; type-check/oxlint по изменённым; `npm run smoke:pack` (долгий — можно отложить до Task 8, но прогнать хотя бы раз до коммита).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "fix(server): readiness reflects actual persistence path (audit A-05)"
```

---

### Task 4: A-08 — точное сопоставление subdomain

**Files:**
- Modify: `src/runtime/modules/common/utils/main.ts` (общий `parseBricksBooleanFlag`)
- Modify: `src/runtime/server/utils/requestClientIp.ts` (делегировать парсинг флага)
- Modify: `src/runtime/modules/common/utils/bricks/publishedPage.ts` (`matchesPageSubdomain`)
- Modify: `src/runtime/middleware/bricks-page-layout.global.ts`
- Test: `test/commonPublishedPage.spec.ts` (дополнить)

**Interfaces:**
- Produces: `matchesPageSubdomain(hostHeader: string | undefined, subdomain: string | null | undefined): boolean`; `parseBricksBooleanFlag(value: unknown): boolean` в `common/utils/main.ts`.
- Consumes: `parseTrustProxyFlag` остаётся экспортом `requestClientIp.ts` (его тестирует `serverRequestClientIp.spec.ts`), но внутри делегирует общему флаг-парсеру.

- [ ] **Step 1:** Дополнить `test/commonPublishedPage.spec.ts`:

```ts
import { matchesPageSubdomain } from '../src/runtime/modules/common/utils/bricks/publishedPage';

describe('matchesPageSubdomain: точное сопоставление subdomain (аудит A-08)', () => {
    it('первый label должен совпасть точно — подстрока не матчится', () => {
        expect(matchesPageSubdomain('promo.example.com', 'promo')).toBe(true);
        expect(matchesPageSubdomain('notpromo.example.com', 'promo')).toBe(false);
        expect(matchesPageSubdomain('promo-x.example.com', 'promo')).toBe(false);
        expect(matchesPageSubdomain('example.com', 'promo')).toBe(false);
    });

    it('порт, регистр и trailing dot нормализуются', () => {
        expect(matchesPageSubdomain('PROMO.example.com:3000', 'promo')).toBe(true);
        expect(matchesPageSubdomain('promo.example.com.', 'Promo')).toBe(true);
    });

    it('subdomain с точками — полное совпадение hostname', () => {
        expect(matchesPageSubdomain('promo.example.com', 'promo.example.com')).toBe(true);
        expect(matchesPageSubdomain('sub.promo.example.com', 'promo.example.com')).toBe(false);
    });

    it('пустой/отсутствующий subdomain — всегда матч, пустой host — нет', () => {
        expect(matchesPageSubdomain('anything.example', null)).toBe(true);
        expect(matchesPageSubdomain('anything.example', '  ')).toBe(true);
        expect(matchesPageSubdomain(undefined, 'promo')).toBe(false);
        expect(matchesPageSubdomain('', 'promo')).toBe(false);
    });
});
```

- [ ] **Step 2:** Прогнать — FAIL. Реализовать в `publishedPage.ts`:

```ts
/**
 * Проверяет соответствие subdomain страницы фактическому хосту запроса
 * (аудит A-08: прежний `includes` матчил notpromo.example под "promo").
 * Хост нормализуется URL-парсером (порт, регистр, trailing dot); значение
 * без точек сравнивается с первым label hostname, с точками — с полным
 * hostname (явный mapping). Ожидаются ASCII-slug значения — punycode-хосты
 * с non-ASCII конфигом сознательно не матчатся.
 *
 * @param hostHeader - Host-заголовок SSR (может содержать порт) или hostname браузера.
 * @param subdomain - Поле subdomain страницы.
 * @returns true — страница показывается на этом хосте.
 */
export function matchesPageSubdomain(
    hostHeader: string | undefined,
    subdomain: string | null | undefined
): boolean {
    const requested = (subdomain ?? '').trim().toLowerCase();

    if (!requested) {
        return true;
    }

    if (!hostHeader) {
        return false;
    }

    let hostname: string;

    try {
        hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    } catch {
        return false;
    }

    hostname = hostname.replace(/\.$/, '');

    if (requested.includes('.')) {
        return hostname === requested;
    }

    const [firstLabel] = hostname.split('.');
    return firstLabel === requested;
}
```

- [ ] **Step 3:** `parseBricksBooleanFlag` в `common/utils/main.ts` (перенести set truthy-значений из `requestClientIp.ts`):

```ts
/** Строковые значения флага, считающиеся включением (env-переменные — строки). */
const TRUTHY_FLAG_VALUES = new Set(['true', '1', 'yes', 'on']);

/**
 * Приводит значение runtimeConfig/env к булеву флагу (boolean из опций
 * модуля или строка из env-override).
 *
 * @param value - Сырое значение флага.
 */
export function parseBricksBooleanFlag(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return TRUTHY_FLAG_VALUES.has(value.trim().toLowerCase());
    }

    return false;
}
```

В `requestClientIp.ts` заменить тело `parseTrustProxyFlag` на делегирование (`return parseBricksBooleanFlag(value);`), локальный `TRUTHY_FLAG_VALUES` удалить; экспорт и JSDoc сохранить (spec `serverRequestClientIp` держит контракт).

- [ ] **Step 4:** Middleware `bricks-page-layout.global.ts` — заменить блок subdomain:

```ts
import { useRuntimeConfig } from '#imports'; // добавить к существующим #imports
import { matchesPageSubdomain, ... } from '../modules/common/utils/bricks/publishedPage';
import { parseBricksBooleanFlag } from '../modules/common/utils/main';
```

```ts
        if (page.subdomain) {
            let currentHost = '';

            if (import.meta.server) {
                // За доверенным прокси Host — адрес прокси; оригинальный хост —
                // первый токен x-forwarded-host (опт-ин bricks.trustProxy)
                const headers = useRequestHeaders(['host', 'x-forwarded-host']);
                const trustProxy = parseBricksBooleanFlag(useRuntimeConfig().bricksTrustProxy);
                const forwardedHost = trustProxy
                    ? headers['x-forwarded-host']?.split(',').at(-1)?.trim()
                    : undefined;
                currentHost = forwardedHost || headers.host || '';
            } else {
                currentHost = window.location.hostname;
            }

            if (!matchesPageSubdomain(currentHost, page.subdomain)) {
                return createError({
                    statusCode: 404,
                    statusMessage: 'Page not found',
                });
            }
        }
```

- [ ] **Step 5:** `npx vitest run test/commonPublishedPage.spec.ts test/serverRequestClientIp.spec.ts` — PASS; type-check/oxlint по изменённым; `npm test`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(render): exact subdomain matching for published pages (audit A-08)"
```

---

### Task 5: A-07 — миграция на TIMESTAMPTZ

**Files:**
- Create: `migrations/0004_timestamptz.sql`
- Modify: `src/runtime/modules/persistence/server/postgres/postgresAuthAdapter.ts` (нормализация `expiresAt` в ISO)
- Modify: `README.md` (заметка о TZ-предположении миграции)

**Interfaces:**
- Produces: колонки всех абсолютных дат — `TIMESTAMPTZ`. Task 8 применяет миграцию в CI под `TZ=Europe/Moscow` (регрессия timezone-зависимости).

- [ ] **Step 1:** Создать `migrations/0004_timestamptz.sql`:

```sql
-- 0004_timestamptz: абсолютные даты → TIMESTAMPTZ (аудит A-07).
-- TIMESTAMP without time zone читается node-postgres в локальном TZ процесса:
-- одно и то же значение БД означало разные instants при разных TZ приложения
-- (сроки сессий, сортировка, расхождение реплик).
--
-- Существующие значения интерпретируются как UTC (дефолт docker-compose и
-- рекомендованный TZ). Если БД/приложение работали в другом timezone —
-- выполнить вручную ALTER ... USING <col> AT TIME ZONE '<ваш tz>' ДО
-- применения этой миграции (см. README «Production deployment»).

ALTER TABLE bricks_pages
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_page_versions
    ALTER COLUMN page_updated_at TYPE TIMESTAMPTZ USING page_updated_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_users
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_sessions
    ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN last_used_at TYPE TIMESTAMPTZ USING last_used_at AT TIME ZONE 'UTC';

ALTER TABLE bricks_media
    ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING uploaded_at AT TIME ZONE 'UTC';

-- Реестр миграций создаёт CLI (bricks-migrate) — к моменту применения 0004
-- таблица гарантированно существует
ALTER TABLE bricks_schema_migrations
    ALTER COLUMN applied_at TYPE TIMESTAMPTZ USING applied_at AT TIME ZONE 'UTC';
```

- [ ] **Step 2:** `postgresAuthAdapter.ts`: строка `expiresAt: row.expiresAt` (в `resolveSession`-подобном методе, см. `expiresAt` на строке ~67) — после timestamptz pg возвращает `Date`; нормализовать контракт до ISO-строки:

```ts
                expiresAt:
                    row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
```

(тип поля в интерфейсе остаётся `string` — API-контракт ISO 8601 UTC).

- [ ] **Step 3:** README «Production deployment» / «Миграции БД»: абзац про 0004 (UTC-предположение, ручная конвертация для legacy-TZ до применения).

- [ ] **Step 4:** Локальная проверка при поднятом docker-compose Postgres (если доступен): `npm run bricks:migrate -- status` → 0004 pending; `npm run bricks:migrate -- migrate`; `\d bricks_sessions` → `timestamp with time zone`. Если БД недоступна — проверку выполнит integration job (Task 8, обязательный гейт).

- [ ] **Step 5:** `npm test` (регрессий нет), type-check/oxlint по адаптеру.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(persistence): migrate absolute timestamps to TIMESTAMPTZ (audit A-07)"
```

---

### Task 6: A-10 — namespaced trigger-функция + checksum миграций

**Files:**
- Create: `migrations/0005_namespaced_trigger_function.sql`
- Create: `src/cli/bricks-migrate-checksum.mjs`
- Modify: `src/cli/bricks-migrate.mjs`
- Modify: `README.md` (drift-семантика)
- Test: `test/cliMigrationChecksum.spec.ts`

**Interfaces:**
- Produces: `computeMigrationChecksum(sql: string): string` (sha256 hex), `findMigrationDrift(fileChecksums: Map<string,string>, appliedRows: Array<{name: string, checksum: string | null}>): string[]`; таблица `bricks_schema_migrations` получает колонку `checksum TEXT`.
- Consumes: реестр создаётся в `readAppliedMigrations` CLI.

- [ ] **Step 1:** Создать `migrations/0005_namespaced_trigger_function.sql`:

```sql
-- 0005: namespaced-функция триггера updated_at (аудит A-10).
-- Прежний CREATE OR REPLACE FUNCTION update_updated_at_column() в shared
-- schema мог перезаписать одноимённую функцию host-приложения.

CREATE OR REPLACE FUNCTION bricks_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bricks_pages_updated_at ON bricks_pages;
CREATE TRIGGER update_bricks_pages_updated_at
    BEFORE UPDATE ON bricks_pages
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

DROP TRIGGER IF EXISTS update_bricks_users_updated_at ON bricks_users;
CREATE TRIGGER update_bricks_users_updated_at
    BEFORE UPDATE ON bricks_users
    FOR EACH ROW
    EXECUTE FUNCTION bricks_update_updated_at_column();

-- Старую общую функцию удаляем, только если от неё ничего не зависит:
-- host-приложение могло привязать к ней собственные триггеры
DO $$
BEGIN
    DROP FUNCTION IF EXISTS update_updated_at_column();
EXCEPTION
    WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'update_updated_at_column() оставлена: на неё ссылаются объекты вне nuxt-bricks';
END $$;
```

- [ ] **Step 2:** Тест `test/cliMigrationChecksum.spec.ts`:

```ts
// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    computeMigrationChecksum,
    findMigrationDrift,
} from '../src/cli/bricks-migrate-checksum.mjs';
// #endregion

describe('bricks-migrate checksum: обнаружение drift применённых миграций', () => {
    it('checksum детерминирован и чувствителен к содержимому', () => {
        expect(computeMigrationChecksum('SELECT 1;')).toBe(computeMigrationChecksum('SELECT 1;'));
        expect(computeMigrationChecksum('SELECT 1;')).not.toBe(computeMigrationChecksum('SELECT 2;'));
        expect(computeMigrationChecksum('SELECT 1;')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('drift — только применённые с checksum, не совпавшим с файлом', () => {
        const files = new Map([
            ['0001.sql', 'aaa'],
            ['0002.sql', 'bbb'],
        ]);
        const applied = [
            { name: '0001.sql', checksum: 'aaa' }, // совпал
            { name: '0002.sql', checksum: 'CHANGED' }, // drift
            { name: '0000_legacy.sql', checksum: null }, // до checksum-эры — backfill, не drift
        ];

        expect(findMigrationDrift(files, applied)).toEqual(['0002.sql']);
    });

    it('применённая миграция без файла на диске — тоже drift', () => {
        const files = new Map([['0001.sql', 'aaa']]);
        const applied = [{ name: '0009_removed.sql', checksum: 'xyz' }];

        expect(findMigrationDrift(files, applied)).toEqual(['0009_removed.sql']);
    });
});
```

- [ ] **Step 3:** Прогнать — FAIL. Создать `src/cli/bricks-migrate-checksum.mjs`:

```js
/**
 * Checksum-контроль миграций (аудит A-10): реестр bricks_schema_migrations
 * хранит SHA-256 применённого SQL — редактирование уже выпущенного файла
 * обнаруживается как drift и валит migrate с диагностикой.
 * Чистые функции без pg — тестируются юнитами.
 */
import { createHash } from 'node:crypto';

/**
 * SHA-256 hex содержимого файла миграции.
 *
 * @param {string} sql Содержимое .sql файла.
 * @returns {string} 64-символьный hex.
 */
export function computeMigrationChecksum(sql) {
    return createHash('sha256').update(sql).digest('hex');
}

/**
 * Возвращает имена применённых миграций, чей сохранённый checksum не
 * совпадает с текущим файлом (или файла больше нет). Записи без checksum
 * (до введения контроля) drift'ом не считаются — их backfill'ит migrate.
 *
 * @param {Map<string, string>} fileChecksums Имя файла → checksum текущего содержимого.
 * @param {Array<{name: string, checksum: string | null}>} appliedRows Строки реестра.
 * @returns {string[]} Имена drift-миграций.
 */
export function findMigrationDrift(fileChecksums, appliedRows) {
    return appliedRows
        .filter((row) => {
            if (!row.checksum) {
                return false;
            }

            const current = fileChecksums.get(row.name);
            return !current || current !== row.checksum;
        })
        .map((row) => row.name);
}
```

- [ ] **Step 4:** Прогнать тест — PASS. Обновить `src/cli/bricks-migrate.mjs`:

1. Импорт: `import { computeMigrationChecksum, findMigrationDrift } from './bricks-migrate-checksum.mjs';`
2. `readAppliedMigrations` → возвращает строки с checksum и добавляет колонку:

```js
async function readAppliedMigrations(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS bricks_schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await client.query(
        'ALTER TABLE bricks_schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT'
    );

    const result = await client.query(
        'SELECT name, checksum FROM bricks_schema_migrations ORDER BY name'
    );
    return result.rows;
}
```

3. Новый хелпер чтения файлов с checksum:

```js
/**
 * Читает содержимое миграций и считает checksums.
 *
 * @param {string[]} files Имена файлов.
 * @returns {Promise<Map<string, {sql: string, checksum: string}>>}
 */
async function readMigrationContents(files) {
    const contents = new Map();

    for (const file of files) {
        const sql = await readFile(new URL(file, `file://${MIGRATIONS_DIR}`), 'utf-8');
        contents.set(file, { sql, checksum: computeMigrationChecksum(sql) });
    }

    return contents;
}
```

4. В `main()` после чтения: `const contents = await readMigrationContents(files);` и `const appliedRows = await readAppliedMigrations(client);`; построить `fileChecksums = new Map([...contents].map(([name, v]) => [name, v.checksum]))` и `applied = new Set(appliedRows.map((row) => row.name))`.
5. Drift-гейт перед migrate (и `[drift]`-маркер в status):

```js
    const drifted = findMigrationDrift(fileChecksums, appliedRows);

    if (command === 'migrate' && drifted.length > 0) {
        console.error(
            `[bricks-migrate] Drift применённых миграций (SQL изменён после применения): ${drifted.join(', ')}.\n` +
                'Выпущенные миграции не редактируются — изменения оформляются новой forward-миграцией.'
        );
        process.exit(1);
    }
```

6. Backfill в migrate-ветке (до применения pending): для `appliedRows` с `checksum == null` и существующим файлом — `UPDATE bricks_schema_migrations SET checksum = $2 WHERE name = $1` + лог `[checksum backfilled]`.
7. INSERT при применении: `INSERT INTO bricks_schema_migrations (name, checksum) VALUES ($1, $2)`; SQL брать из `contents.get(file).sql` (двойное чтение файла убрать).
8. `printStatus(files, applied, drifted)`: drift-имена печатать как `[drift]  <file>`.

- [ ] **Step 5:** Проверить упаковку CLI: `npm run build` (или `npm run dev:prepare`) → убедиться, что `dist/cli/bricks-migrate-checksum.mjs` попал в dist рядом с `bricks-migrate.mjs`; если билдер модулей не копирует новый файл — добавить его в конфигурацию сборки по образцу существующих cli-файлов (посмотреть, как в `nuxt.config`/`build`-настройках попадают `bricks-generate.mjs` и др.). Проверка обязательна — bin работает из dist.

- [ ] **Step 6:** Локально (если поднят Postgres): `npm run bricks:migrate -- migrate` → 0005 применяется, `status` чистый; поменять байт в локальной копии применённого файла → `status` показывает `[drift]`, `migrate` падает; вернуть файл. Иначе — проверит Task 8.

- [ ] **Step 7:** README «Миграции БД»: checksum-контроль, drift-семантика, backfill.

- [ ] **Step 8:** `npm test`; oxlint по cli-файлам.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "fix(cli): namespaced trigger function and migration checksums (audit A-10)"
```

---

### Task 7: A-09 — resource budgets для data sources

**Files:**
- Modify: `src/runtime/modules/render/utils/dataSourcePolicy.ts`
- Modify: `src/runtime/modules/common/types/dataSource.ts` (`IBricksDataSourcesConfig`)
- Modify: `src/runtime/modules/render/composables/useDataSourceClient.ts`
- Modify: `src/runtime/modules/render/composables/useBricksDataSources.ts`
- Modify: `src/runtime/modules/render/composables/useRendererDataSources.ts`
- Modify: `README.md` (конфиг `bricks.dataSources`)
- Test: `test/renderDataSourcePolicy.spec.ts` (дополнить), `test/renderDataSources.spec.ts` (дополнить)

**Interfaces:**
- Produces: константы `DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES = 1024 * 1024`, `DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE = 24`, `DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS = 15000`; `measureResponseSizeBytes(value: unknown): number`; `executeDataSource(source, component, pageSettings, requestCache?, signal?: AbortSignal)`; `useDataSourceClient()` дополнительно возвращает `{ maxResponseBytes, maxRequestsPerPage, totalDeadlineMs }`; `useBricksDataSources()` — `{ executeDataSource, concurrency, maxRequestsPerPage, totalDeadlineMs }`.
- Consumes: `runWithConcurrencyLimit` (`render/utils/requestPool.ts`), `withDevLogDetails`-паттерн логов.

- [ ] **Step 1:** Дополнить `test/renderDataSourcePolicy.spec.ts`:

```ts
import {
    DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE,
    DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES,
    DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS,
    measureResponseSizeBytes,
} from '../src/runtime/modules/render/utils/dataSourcePolicy';

describe('dataSourcePolicy: resource budget (аудит A-09)', () => {
    it('дефолты бюджета заданы', () => {
        expect(DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES).toBe(1024 * 1024);
        expect(DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE).toBe(24);
        expect(DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS).toBe(15000);
    });

    it('measureResponseSizeBytes: null/undefined — 0, объект — длина JSON', () => {
        expect(measureResponseSizeBytes(null)).toBe(0);
        expect(measureResponseSizeBytes(undefined)).toBe(0);
        expect(measureResponseSizeBytes({ a: 1 })).toBe(JSON.stringify({ a: 1 }).length);
        expect(measureResponseSizeBytes('xx')).toBe(4); // '"xx"'
    });

    it('несериализуемое значение (цикл) — Infinity (жёсткий отказ, не пропуск)', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        expect(measureResponseSizeBytes(cyclic)).toBe(Number.POSITIVE_INFINITY);
    });
});
```

- [ ] **Step 2:** Прогнать — FAIL. В `dataSourcePolicy.ts` (Constants-регион):

```ts
/** Дефолтный лимит размера одного ответа data source, байт (~UTF-16 code units JSON). */
export const DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES = 1024 * 1024;

/** Дефолтный максимум запросов data sources на один прогон страницы. */
export const DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE = 24;

/** Дефолтный суммарный wall-clock budget всех data sources одного прогона, мс. */
export const DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS = 15000;
```

и функция:

```ts
/**
 * Приблизительный размер ответа в байтах — длина JSON-сериализации
 * (UTF-16 code units; точность достаточна для бюджета). Несериализуемое
 * значение (циклы, BigInt) — Infinity: такой ответ бюджет не проходит.
 *
 * @param value - Ответ data source.
 */
export function measureResponseSizeBytes(value: unknown): number {
    if (value === undefined || value === null) {
        return 0;
    }

    try {
        return JSON.stringify(value)?.length ?? 0;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}
```

- [ ] **Step 3:** `IBricksDataSourcesConfig` (types/dataSource.ts) — добавить поля:

```ts
    /** Лимит размера одного ответа, байт (JSON-length approximation). */
    maxResponseBytes: number;
    /** Максимум запросов data sources на один прогон страницы. */
    maxRequestsPerPage: number;
    /** Суммарный wall-clock budget одного прогона, мс (по истечении — abort). */
    totalDeadlineMs: number;
```

- [ ] **Step 4:** `useDataSourceClient.ts` — рядом с timeoutMs/concurrency:

```ts
    const maxResponseBytes =
        dataSourcesConfig?.maxResponseBytes ?? DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES;
    const maxRequestsPerPage =
        dataSourcesConfig?.maxRequestsPerPage ?? DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE;
    const totalDeadlineMs =
        dataSourcesConfig?.totalDeadlineMs ?? DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS;
```

и вернуть их из композабла (импорты констант — из dataSourcePolicy).

- [ ] **Step 5:** `useBricksDataSources.ts`:
1. Деструктурировать новые значения из `useDataSourceClient()`.
2. `fetchDataSource(url, method, requestCache?, signal?)` — прокинуть `signal` в `dataSourceFetcher<unknown>(url, { method, signal })` (ключ кеша БЕЗ signal).
3. `executeDataSource(source, component, pageSettings, requestCache?, signal?)` — прокинуть signal в fetchDataSource; после получения ответа — бюджет:

```ts
            const response = await fetchDataSource(url, method, requestCache, signal);
            const responseSizeBytes = measureResponseSizeBytes(response);

            if (responseSizeBytes > maxResponseBytes) {
                console.warn(
                    '[Bricks DataSource] Skip - response exceeds byte budget:',
                    withDevLogDetails(
                        {
                            key: source.key,
                            target: resolveDataSourceLogTarget(url),
                            responseSizeBytes,
                            maxResponseBytes,
                            componentId: component.id,
                            brickPath: component.brickPath,
                        },
                        { url }
                    )
                );
                return null;
            }
```

4. Вернуть из композабла `maxRequestsPerPage` и `totalDeadlineMs`.

- [ ] **Step 6:** `useRendererDataSources.ts` — в теле `useAsyncData`-хендлера:

```ts
    const { executeDataSource: executeDataSourceRequest, concurrency, maxRequestsPerPage, totalDeadlineMs } =
        useBricksDataSources();
```

```ts
            const requests = await collectDataSourceRequests();

            if (!requests?.length) {
                return {};
            }

            // Бюджет запросов на прогон: излишек отбрасывается с логом,
            // а не выполняется молча (аудит A-09)
            const limitedRequests = requests.slice(0, maxRequestsPerPage);

            if (limitedRequests.length < requests.length) {
                console.warn('[Bricks DataSources] Request budget exceeded — extra sources skipped:', {
                    pagename,
                    total: requests.length,
                    executed: limitedRequests.length,
                });
            }

            const requestCache: TDataSourceRequestCache = new Map();
            // Общий wall-clock budget прогона: по истечении оставшиеся запросы
            // прерываются AbortController'ом, компоненты остаются на fallback props
            const abortController = new AbortController();
            const deadlineTimer = setTimeout(() => {
                console.warn('[Bricks DataSources] Total deadline exceeded — aborting remaining requests:', {
                    pagename,
                    totalDeadlineMs,
                });
                abortController.abort();
            }, totalDeadlineMs);

            const result: Record<string, Record<string, unknown>> = {};

            try {
                await runWithConcurrencyLimit(
                    limitedRequests.map(({ component, source }) => async () => {
                        if (abortController.signal.aborted) {
                            return;
                        }

                        const mapped = await executeDataSourceRequest(
                            source,
                            component,
                            page.value,
                            requestCache,
                            abortController.signal
                        );

                        if (!mapped) {
                            return;
                        }

                        const target = (result[component.id] ||= {});

                        source.props.forEach((propName) => {
                            if (propName in mapped) {
                                target[propName] = (mapped as Record<string, unknown>)[propName];
                            }
                        });
                    }),
                    concurrency
                );
            } finally {
                clearTimeout(deadlineTimer);
            }

            return result;
```

(abort-ошибка fetch ловится существующим catch в `executeDataSource` → `null` → fallback props.)

- [ ] **Step 7:** Дополнить `test/renderDataSources.spec.ts` (следуя существующим мокам этого spec): (а) при числе источников больше `maxRequestsPerPage` executeDataSource вызывается ровно `maxRequestsPerPage` раз; (б) `measureResponseSizeBytes`-бюджет: ответ больше лимита → результат null и prop не мержится (покрывается на уровне executeDataSource — мок fetcher'а с гигантским ответом и маленьким `maxResponseBytes` в конфиге).

- [ ] **Step 8:** README: описать `bricks.dataSources.maxResponseBytes/maxRequestsPerPage/totalDeadlineMs` с дефолтами. `npm test`, type-check/oxlint по изменённым.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "fix(render): byte/request/deadline budgets for data sources (audit A-09)"
```

---

### Task 8: A-06 — integration gate (Postgres + MinIO, black-box lifecycle из tarball)

**Files:**
- Create: `scripts/integration-smoke.mjs`
- Modify: `scripts/pack-smoke.mjs` (экспортировать/вынести переиспользуемые хелперы — см. Step 1)
- Create: `scripts/smoke-shared.mjs`
- Modify: `package.json` (`"smoke:integration": "node ./scripts/integration-smoke.mjs"`)
- Modify: `.github/workflows/ci.yml` (job `integration`)
- Modify: `README.md` (локальный запуск integration smoke)

**Interfaces:**
- Consumes: CSRF-заголовок `x-bricks-csrf: 1` (Task 1), readiness-контракт (Task 3), миграции 0004/0005 (Tasks 5–6), CLI `bricks-migrate`/`bricks-hash-password` из tarball.
- Produces: обязательный CI job `integration`; env-контракт `BRICKS_IT_DATABASE_URL`, опционально `BRICKS_IT_S3_*`.

- [ ] **Step 1:** Вынести из `pack-smoke.mjs` в новый `scripts/smoke-shared.mjs` функции `run`, `runCapture`, `assertOk`, `assertFileExists`, `bootServer` (перенести код как есть, экспортировать; `bootServer` параметризовать `env`-объектом и портом). `pack-smoke.mjs` импортирует их оттуда; поведение pack-smoke не меняется (`npm run smoke:pack` зелёный).

- [ ] **Step 2:** Создать `scripts/integration-smoke.mjs`. Скелет (полный, дополнять только по месту `...` в комментариях не оставлять — ниже перечислены все проверки):

```js
#!/usr/bin/env node
/**
 * Integration smoke (аудит A-06): production-like гейт из собранного tarball.
 * Требует живой Postgres (BRICKS_IT_DATABASE_URL); S3-часть включается при
 * заданных BRICKS_IT_S3_ENDPOINT/ACCESS_KEY/SECRET/BUCKET (MinIO в CI).
 *
 * Поток: npm pack → чистый consumer (database-auth) → bricks-migrate из
 * tarball → провижининг пользователя → nuxi build → boot → black-box HTTP
 * lifecycle: login (CSRF) → CRUD страницы → optimistic locking (409) →
 * контракт схемы (400) → publish → public read-model → версии + restore →
 * media upload/delete (S3) → logout.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { assertOk, bootServer, run, runCapture } from './smoke-shared.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_PORT = 4311;
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const DATABASE_URL = process.env.BRICKS_IT_DATABASE_URL;
const S3 = {
    endpoint: process.env.BRICKS_IT_S3_ENDPOINT,
    accessKeyId: process.env.BRICKS_IT_S3_ACCESS_KEY,
    secretAccessKey: process.env.BRICKS_IT_S3_SECRET_KEY,
    bucket: process.env.BRICKS_IT_S3_BUCKET,
};
const HAS_S3 = Boolean(S3.endpoint && S3.accessKeyId && S3.secretAccessKey && S3.bucket);
const IT_USERNAME = 'it-admin';
const IT_PASSWORD = 'integration-smoke-password';
/** 1x1 png для media upload. */
const PNG_1X1_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Общие заголовки авторизованных unsafe-запросов (CSRF-гейт A-03). */
function jsonHeaders(cookie) {
    return {
        'content-type': 'application/json',
        'x-bricks-csrf': '1',
        ...(cookie ? { cookie } : {}),
    };
}

/**
 * fetch с проверкой статуса и JSON-разбором.
 */
async function api(path, { method = 'GET', cookie, body, expectStatus } = {}) {
    const response = await fetch(`${SERVER_ORIGIN}${path}`, {
        method,
        headers: jsonHeaders(cookie),
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
    });

    if (expectStatus !== undefined) {
        assertOk(
            response.status === expectStatus,
            `${method} ${path}: ожидали ${expectStatus}, получили ${response.status}`
        );
    }

    const text = await response.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // не-JSON ответ допустим для ошибок
    }

    return { response, data };
}

/**
 * Пишет consumer-проект с database-auth и (опционально) S3-конфигом.
 */
async function scaffoldConsumer(consumerDir, tarballPath) {
    await mkdir(join(consumerDir, 'pages'), { recursive: true });
    await writeFile(
        join(consumerDir, 'package.json'),
        JSON.stringify(
            {
                name: 'bricks-integration-consumer',
                private: true,
                scripts: { build: 'nuxi build' },
                dependencies: { 'nuxt-bricks': `file:${tarballPath}`, nuxt: '^3.0.0' },
            },
            null,
            4
        )
    );
    await writeFile(
        join(consumerDir, 'nuxt.config.ts'),
        [
            'export default defineNuxtConfig({',
            "    modules: ['nuxt-bricks'],",
            '    bricks: {',
            "        auth: { mode: 'database' },",
            '        database: { url: process.env.NUXT_BRICKS_DATABASE_URL },',
            ...(HAS_S3
                ? [
                      '        s3: {',
                      '            endpoint: process.env.BRICKS_IT_S3_ENDPOINT,',
                      '            bucket: process.env.BRICKS_IT_S3_BUCKET,',
                      '        },',
                  ]
                : []),
            '    },',
            '});',
        ].join('\n')
    );
    await writeFile(
        join(consumerDir, 'pages', 'index.vue'),
        '<template><div>integration consumer</div></template>\n'
    );
    await writeFile(join(consumerDir, 'app.vue'), '<template><NuxtPage /></template>\n');
}

/**
 * Создаёт S3-бакет (идемпотентно) через SDK consumer'а.
 */
async function ensureBucket(consumerDir) {
    const sdkPath = join(consumerDir, 'node_modules', '@aws-sdk', 'client-s3', 'dist-cjs', 'index.js');
    const { S3Client, CreateBucketCommand } = await import(sdkPath);
    const client = new S3Client({
        endpoint: S3.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
    });

    try {
        await client.send(new CreateBucketCommand({ Bucket: S3.bucket }));
    } catch (error) {
        if (error?.name !== 'BucketAlreadyOwnedByYou' && error?.name !== 'BucketAlreadyExists') {
            throw error;
        }
    }
}

/**
 * Провижининг editor-пользователя: hash через CLI tarball'а + INSERT через pg.
 */
async function provisionUser(consumerDir) {
    const installedRoot = join(consumerDir, 'node_modules', 'nuxt-bricks');
    const hashOutput = await runCapture(
        'node',
        [join(installedRoot, 'dist', 'cli', 'bricks-hash-password.mjs'), IT_PASSWORD],
        consumerDir
    );
    const hash = hashOutput.split('\n').map((line) => line.trim()).find((line) => line.startsWith('scrypt:'));
    assertOk(Boolean(hash), 'bricks-hash-password не вернул scrypt-хеш');

    const pgPath = join(consumerDir, 'node_modules', 'pg', 'lib', 'index.js');
    const { default: pg } = await import(pgPath);
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    try {
        await client.query(
            `INSERT INTO bricks_users (username, password_hash) VALUES ($1, $2)
             ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
            [IT_USERNAME, hash]
        );
    } finally {
        await client.end();
    }
}

/**
 * Black-box HTTP lifecycle против запущенного consumer'а.
 */
async function runLifecycle() {
    // Health / readiness с живой БД
    await api('/api/bricks/health', { expectStatus: 200 });
    await api('/api/bricks/health/ready', { expectStatus: 200 });

    // CSRF-гейт: unsafe без заголовка/Origin — 403
    const bareLogin = await fetch(`${SERVER_ORIGIN}/api/bricks/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: IT_USERNAME, password: IT_PASSWORD }),
    });
    assertOk(bareLogin.status === 403, `login без CSRF-признаков: ожидали 403, получили ${bareLogin.status}`);

    // Login → cookie сессии
    const login = await api('/api/bricks/auth/login', {
        method: 'POST',
        body: { username: IT_USERNAME, password: IT_PASSWORD },
        expectStatus: 200,
    });
    const setCookie = login.response.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assertOk(cookie.startsWith('bricks-session='), 'login не вернул cookie сессии');

    // Неавторизованный editorial GET — 401
    await api('/api/bricks', { expectStatus: 401 });
    // Авторизованный список — 200
    await api('/api/bricks', { cookie, expectStatus: 200 });

    // Create
    const created = await api('/api/bricks', {
        method: 'POST',
        cookie,
        body: { pagename: 'it-page', title: 'IT', schema: { components: [] } },
    });
    assertOk([200, 201].includes(created.response.status), `create: ${created.response.status}`);
    const pageId = created.data?.id;
    assertOk(Boolean(pageId), 'create не вернул id');

    // Невалидная схема — 400 (контракт A-02)
    await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: { components: [null] } },
        expectStatus: 400,
    });

    // Update со schema → версия + revision
    const componentId = 'it-component-1';
    const validSchema = {
        components: [
            {
                id: componentId,
                componentName: 'BlockText',
                brickPath: 'text/BlockText',
                props: {},
                parent: null,
                children: [],
            },
        ],
    };
    const updated = await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: validSchema, expectedRevision: created.data?.revision },
        expectStatus: 200,
    });
    const freshRevision = updated.data?.revision;

    // Optimistic locking: устаревший expectedRevision — 409 REVISION_CONFLICT
    const conflict = await api(`/api/bricks/${pageId}`, {
        method: 'PUT',
        cookie,
        body: { schema: validSchema, expectedRevision: created.data?.revision },
        expectStatus: 409,
    });
    assertOk(
        conflict.data?.data?.code === 'REVISION_CONFLICT',
        `409 без кода REVISION_CONFLICT: ${JSON.stringify(conflict.data)}`
    );

    // Publish → public read-model без editor-полей
    await api(`/api/bricks/${pageId}`, {
        method: 'PATCH',
        cookie,
        body: { published: true },
        expectStatus: 200,
    });
    const publicPage = await api('/api/bricks/public/pages/it-page', { expectStatus: 200 });
    assertOk(publicPage.data?.pagename === 'it-page', 'public projection не вернула страницу');
    assertOk(publicPage.data?.revision === undefined, 'public projection не должна отдавать revision');

    // Версии: снапшот появился после update со schema; restore проходит
    const versions = await api(`/api/bricks/${pageId}/versions`, { cookie, expectStatus: 200 });
    assertOk(Array.isArray(versions.data) && versions.data.length >= 1, 'нет снапшотов версий');
    await api(`/api/bricks/${pageId}/versions/${versions.data[0].id}/restore`, {
        method: 'POST',
        cookie,
        expectStatus: 200,
    });

    // Media (S3): multipart upload → запись; delete → удаление
    if (HAS_S3) {
        const form = new FormData();
        form.append(
            'file',
            new File([Buffer.from(PNG_1X1_BASE64, 'base64')], 'it.png', { type: 'image/png' })
        );
        form.append('category', 'other');
        const upload = await fetch(`${SERVER_ORIGIN}/api/bricks/media/upload`, {
            method: 'POST',
            headers: { 'x-bricks-csrf': '1', cookie },
            body: form,
        });
        assertOk([200, 201].includes(upload.status), `media upload: ${upload.status}`);
        const media = await upload.json();
        assertOk(Boolean(media?.id), 'upload не вернул id');
        await api(`/api/bricks/media/${media.id}`, { method: 'DELETE', cookie, expectStatus: 200 });
    } else {
        console.warn('[integration-smoke] S3 env не задан — media-этап пропущен');
    }

    // Cleanup + logout
    await api(`/api/bricks/${pageId}`, { method: 'DELETE', cookie, expectStatus: 200 });
    await api('/api/bricks/auth/logout', { method: 'POST', cookie, expectStatus: 200 });
    await api('/api/bricks', { cookie, expectStatus: 401 });
    assertOk(Boolean(freshRevision), 'update не вернул revision');
}

async function main() {
    assertOk(Boolean(DATABASE_URL), 'BRICKS_IT_DATABASE_URL обязателен');

    const workDir = await mkdtemp(join(tmpdir(), 'bricks-int-smoke-'));
    const consumerDir = join(workDir, 'consumer');
    let server;

    try {
        const packOutput = await runCapture('npm', ['pack', '--pack-destination', workDir], REPO_ROOT);
        const tarballName = packOutput.trim().split('\n').at(-1);
        const tarballPath = join(workDir, tarballName);

        await scaffoldConsumer(consumerDir, tarballPath);
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        const installedRoot = join(consumerDir, 'node_modules', 'nuxt-bricks');
        // Миграции из tarball (включая 0004 timestamptz и 0005 namespaced fn)
        await run('node', [join(installedRoot, 'dist', 'cli', 'bricks-migrate.mjs'), 'migrate', '--url', DATABASE_URL], {
            cwd: consumerDir,
        });
        const status = await runCapture(
            'node',
            [join(installedRoot, 'dist', 'cli', 'bricks-migrate.mjs'), 'status', '--url', DATABASE_URL],
            consumerDir
        );
        assertOk(status.includes('0 pending'), `после migrate остались pending: ${status}`);

        if (HAS_S3) {
            await ensureBucket(consumerDir);
        }

        await provisionUser(consumerDir);

        await run('npx', ['nuxi', 'build'], { cwd: consumerDir });
        server = await bootServer(consumerDir, {
            port: SERVER_PORT,
            env: {
                NUXT_BRICKS_DATABASE_URL: DATABASE_URL,
                BRICKS_AUTH_MODE: 'database',
                NUXT_PUBLIC_BRICKS_AUTH_MODE: 'database',
                ...(HAS_S3
                    ? {
                          YANDEX_STORAGE_ACCESS_KEY_ID: S3.accessKeyId,
                          YANDEX_STORAGE_SECRET_ACCESS_KEY: S3.secretAccessKey,
                          YANDEX_STORAGE_BUCKET_NAME: S3.bucket,
                      }
                    : {}),
            },
        });

        await runLifecycle();
        console.log('\n[integration-smoke] OK');
    } finally {
        server?.kill?.();
        await rm(workDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error('[integration-smoke] FAILED:', error.message || error);
    process.exit(1);
});
```

**Обязательная сверка при реализации:** точные пути/статусы ручек (`/api/bricks/` trailing slash, формат ответа create, форма validSchema под `schemaContract.ts`, вывод `bricks-hash-password`, сигнатура `bootServer` после выноса, s3-опции модуля `bricks.s3` и env-ключи) — свериться с кодом и `scripts/pack-smoke.mjs`, скорректировать скрипт. Скрипт итерируется локально до зелёного прогона.

- [ ] **Step 3:** `package.json`: добавить script `"smoke:integration": "node ./scripts/integration-smoke.mjs"`.

- [ ] **Step 4:** CI job в `.github/workflows/ci.yml` (TZ намеренно не-UTC — регрессия A-07):

```yaml
    integration:
        name: Integration smoke (Postgres + MinIO)
        runs-on: ubuntu-latest
        env:
            TZ: Europe/Moscow
        services:
            postgres:
                image: postgres:16
                env:
                    POSTGRES_USER: bricks
                    POSTGRES_PASSWORD: bricks
                    POSTGRES_DB: bricks
                ports:
                    - 5432:5432
                options: >-
                    --health-cmd "pg_isready -U bricks"
                    --health-interval 5s
                    --health-timeout 5s
                    --health-retries 10
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 22
                  cache: npm
            - name: Start MinIO
              run: |
                  docker run -d --name minio -p 9000:9000 \
                      -e MINIO_ROOT_USER=bricks -e MINIO_ROOT_PASSWORD=bricks-secret \
                      minio/minio server /data
            - run: npm ci
            - run: npm run smoke:integration
              env:
                  BRICKS_IT_DATABASE_URL: postgres://bricks:bricks@127.0.0.1:5432/bricks
                  BRICKS_IT_S3_ENDPOINT: http://127.0.0.1:9000
                  BRICKS_IT_S3_ACCESS_KEY: bricks
                  BRICKS_IT_S3_SECRET_KEY: bricks-secret
                  BRICKS_IT_S3_BUCKET: bricks-it
```

- [ ] **Step 5:** Локальный прогон: `docker compose up -d` (Postgres из репо) + `BRICKS_IT_DATABASE_URL=postgres://... npm run smoke:integration` (S3-этап можно пропустить без env). Итерировать до зелёного. Затем `npm run smoke:pack` (рефакторинг shared-хелперов не сломал).

- [ ] **Step 6:** README: раздел «Integration smoke» — env-контракт, локальный запуск, что покрывает; пометить browser-E2E как следующий шаг (вместе с axe/A-13).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "ci: postgres+minio integration smoke gate from packed tarball (audit A-06)"
```

---

### Task 9: Документация и статус аудита

**Files:**
- Modify: `docs/application-audit-2026-07-12.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1:** В `docs/application-audit-2026-07-12.md` → раздел «Бэклог (2026-07-12)»: перенести A-03, A-04, A-05, A-07, A-08, A-09, A-10 и integration-часть A-06 в «Выполнено» с хешами коммитов Task 1–8; browser-E2E/coverage thresholds из A-06 оставить открытым пунктом (объединён с A-13 в P2-спринте). Зафиксировать осознанные отступления из шапки этого плана (без `__Host-`, ingress-limiter как рекомендация, метрики-как-логи). Обновить «Итоговый release gate».

- [ ] **Step 2:** CLAUDE.md — точечные дополнения:
    - Auth-блок: CSRF-гейт unsafe-методов (`x-bricks-csrf`, `csrfProtection.ts`), двухуровневый login-лимитер + scrypt-семафор.
    - Health-блок: readiness отражает выбранный persistence-путь (503 без БД/proxy/адаптера).
    - Миграции: checksum-контроль drift, namespaced `bricks_update_updated_at_column`, TIMESTAMPTZ.
    - Data sources: byte/request/deadline-бюджеты.
    - CI: job `integration` (Postgres+MinIO, TZ=Europe/Moscow).

- [ ] **Step 3:** `npm run format` (prettier по докам), финальный `npm test` + `npm run lint:check` + `npm run type-check`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: audit P1 remediation status (A-03..A-10, integration gate)"
```

---

## Self-Review (выполнено при составлении)

- **Coverage:** A-03 → Task 1; A-04 → Task 2; A-05 → Task 3; A-08 → Task 4; A-07 → Task 5; A-10 → Task 6; A-09 → Task 7; A-06 → Task 8 (integration; browser-E2E/coverage — задокументированный перенос); статусы → Task 9.
- **Критерии приёмки аудита:** A-03 HTTP-кейсы — юнитами (чистая checkCsrf: cross-origin, sibling, missing Origin, proxy host, header) + integration bare-login 403; A-04 «100 username → 429 до scrypt» — IP-bucket проверяется до verifyCredentials; A-05 матрица — юнит resolveReadinessTarget + pack-smoke (none→503) + integration (db→200); A-06 — гейт падает при сломанной миграции/SQL/недоступном storage/сломанном auth flow.
- **Type consistency:** `registerFailure(key, maxFailures?)` обратно совместим; `executeDataSource(..., requestCache?, signal?)` — новые параметры опциональны; `useBricksDataSources` возвращает `maxRequestsPerPage`/`totalDeadlineMs`, потребитель — только `useRendererDataSources`.
- **Риски:** Task 8 — самый хрупкий (точные контракты ручек сверяются по коду при реализации, шаг сверки заложен); Task 6 Step 5 (упаковка нового cli-файла в dist) — обязательная проверка.
