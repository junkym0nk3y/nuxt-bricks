/**
 * Чистый резолвер режима data backend (`bricks.backend.mode`): options + env →
 * разрешённый mode + диагностика. Без зависимостей от Nuxt — тестируется юнитами
 * (test/moduleBackendConfig.spec.ts).
 *
 * Модель (docs/backend-connection-modes-plan-2026-07-12.md):
 * - выбор backend относится только к данным (страницы/версии/media metadata);
 *   файлы (S3), sharp и browser-facing `/api/bricks/**` всегда локальные;
 * - `builtin` (дефолт) — встроенный PostgreSQL-адаптер; `external` —
 *   HTTP-реализация IStorageAdapter поверх пользовательского backend;
 * - PROXY_URL не участвует в выборе persistence: это dev-only проксирование
 *   не-bricks `/api/*` (см. server/middleware/devProxy.ts).
 */

// #region Types
export type TBricksBackendMode = 'builtin' | 'external';

export interface IBricksBackendResolutionInput {
    /** Явный bricks.backend.mode из nuxt.config (build-time, дефолт 'builtin'). */
    configuredMode?: TBricksBackendMode;
    /** Разрешённый base URL external backend (options/env). */
    backendUrl: string;
    /** Разрешённый URL PostgreSQL (options/env). */
    databaseUrl: string;
    /** Режим авторизации ('basic' | 'database'). */
    authMode: string;
}

export interface IBricksBackendResolution {
    mode: TBricksBackendMode;
    /** Предупреждения (конфигурация подозрительная, но сборка продолжается). */
    warnings: string[];
    /** Фатальные ошибки конфигурации — валят сборку (fail-fast). */
    errors: string[];
}
// #endregion

// #region Helpers
/**
 * Диагностика `mode: 'external'`: database-auth несовместим (build-ошибка),
 * database.url игнорируется (warning), отсутствующий url — warning (env может
 * прийти на деплое через NUXT_BRICKS_BACKEND_URL).
 */
function resolveExternalMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'external',
        warnings: [],
        errors: [],
    };

    if (input.authMode === 'database') {
        resolution.errors.push(
            'bricks.auth.mode = "database" несовместим с bricks.backend.mode = "external": ' +
                'пользователи и сессии database-auth живут в локальном PostgreSQL. ' +
                'Используйте auth.mode = "basic" или backend.mode = "builtin".'
        );
    }

    if (input.databaseUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "external": database.url игнорируется ' +
                '(данные страниц/медиа идут на external backend). ' +
                'Уберите database.url или переключитесь на backend.mode = "builtin".'
        );
    }

    if (!input.backendUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "external", но backend.url не задан — задайте его ' +
                'в nuxt.config или через NUXT_BRICKS_BACKEND_URL до старта сервера, ' +
                'иначе /api/bricks/** будет отвечать ошибкой.'
        );
    }

    return resolution;
}

/**
 * Диагностика `mode: 'builtin'` (в том числе дефолтного): backend.url
 * игнорируется (warning); без database.url editorial API отвечает ошибкой —
 * warning, не ошибка (URL может прийти на деплое через
 * NUXT_BRICKS_DATABASE_URL, либо потребитель регистрирует кастомный адаптер).
 */
function resolveBuiltinMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'builtin',
        warnings: [],
        errors: [],
    };

    if (input.backendUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "builtin": backend.url игнорируется. ' +
                'Уберите backend.url или переключитесь на backend.mode = "external".'
        );
    }

    if (!input.databaseUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "builtin", но database.url не задан — без ' +
                'NUXT_BRICKS_DATABASE_URL (или кастомного storage-адаптера) ' +
                '/api/bricks/** будет отвечать ошибкой.'
        );
    }

    return resolution;
}
// #endregion

/**
 * Разрешает режим data backend по опции конфигурации (дефолт — builtin).
 * Ошибки в `errors` должны валить сборку (fail-fast в module.ts); сам резолвер
 * не бросает — вызывающий решает, как отобразить диагностику.
 *
 * @param input - Сведённые значения options+env (см. module-runtime-config.ts).
 * @returns Разрешённый mode + warnings/errors.
 */
export function resolveBricksBackendConfig(
    input: IBricksBackendResolutionInput
): IBricksBackendResolution {
    if (input.configuredMode === 'external') {
        return resolveExternalMode(input);
    }

    return resolveBuiltinMode(input);
}
