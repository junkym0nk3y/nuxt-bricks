/**
 * Чистый резолвер режима data backend (`bricks.backend.mode`): options + env →
 * разрешённый mode + диагностика. Без зависимостей от Nuxt — тестируется юнитами
 * (test/moduleBackendConfig.spec.ts).
 *
 * Модель (docs/backend-connection-modes-plan-2026-07-12.md):
 * - выбор backend относится только к данным (страницы/версии/media metadata);
 *   файлы (S3), sharp и browser-facing `/api/bricks/**` всегда локальные;
 * - `builtin` — встроенный PostgreSQL-адаптер; `external` — HTTP-реализация
 *   IStorageAdapter поверх пользовательского backend;
 * - PROXY_URL больше не выбирает persistence: dev-only проксирование
 *   не-bricks `/api/*` (см. server/middleware/devProxy.ts).
 */

// #region Types
export type TBricksBackendMode = 'builtin' | 'external';

export interface IBricksBackendResolutionInput {
    /** Явный bricks.backend.mode из nuxt.config (build-time). */
    configuredMode?: TBricksBackendMode;
    /** Разрешённый base URL external backend (options/env). */
    backendUrl: string;
    /** Разрешённый URL PostgreSQL (options/env). */
    databaseUrl: string;
    /** Разрешённый PROXY_URL (options/env). */
    proxyUrl: string;
    /** Режим авторизации ('basic' | 'database'). */
    authMode: string;
    /** Dev-сборка (nuxt.options.dev). */
    isDev: boolean;
}

export interface IBricksBackendResolution {
    mode: TBricksBackendMode;
    /** Информационные сообщения (deprecation-подсказки). */
    infos: string[];
    /** Предупреждения (конфигурация подозрительная, но сборка продолжается). */
    warnings: string[];
    /** Фатальные ошибки конфигурации — валят сборку (fail-fast). */
    errors: string[];
}
// #endregion

// #region Constants
const EXTERNAL_MODE_EXAMPLE = [
    'bricks: {',
    "    backend: { mode: 'external', url: process.env.BRICKS_BACKEND_URL },",
    '}',
].join('\n');
// #endregion

// #region Helpers
/**
 * Диагностика явного `mode: 'external'`: database-auth несовместим (build-ошибка),
 * database.url игнорируется (warning), отсутствующий url — warning (env может
 * прийти на деплое через NUXT_BRICKS_BACKEND_URL).
 */
function resolveExternalMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'external',
        infos: [],
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
 * Диагностика явного `mode: 'builtin'`: backend.url игнорируется (warning).
 */
function resolveBuiltinMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'builtin',
        infos: [],
        warnings: [],
        errors: [],
    };

    if (input.backendUrl) {
        resolution.warnings.push(
            'bricks.backend.mode = "builtin": backend.url игнорируется. ' +
                'Уберите backend.url или переключитесь на backend.mode = "external".'
        );
    }

    return resolution;
}

/**
 * Legacy-резолвер (mode не задан): database.url → builtin + deprecation-info;
 * только PROXY_URL в production → fail-fast ошибка сборки с миграционной
 * инструкцией (тихо сломанного прода не будет); только PROXY_URL в dev →
 * warning (devProxy обслуживает лишь не-bricks /api/*); ничего → builtin +
 * warning о неработающем /api/bricks/**.
 */
function resolveLegacyMode(input: IBricksBackendResolutionInput): IBricksBackendResolution {
    const resolution: IBricksBackendResolution = {
        mode: 'builtin',
        infos: [],
        warnings: [],
        errors: [],
    };

    if (input.databaseUrl) {
        resolution.infos.push(
            'bricks.backend.mode не задан — database.url включает builtin-режим. ' +
                'Задайте backend.mode = "builtin" явно: неявный выбор режима deprecated.'
        );
        return resolution;
    }

    if (input.proxyUrl) {
        if (!input.isDev) {
            resolution.errors.push(
                'PROXY_URL больше не выбирает persistence: проксирование /api/bricks/** ' +
                    'на внешний backend в production удалено. Если данные страниц живут ' +
                    'на вашем HTTP-backend — включите external-режим:\n' +
                    `${EXTERNAL_MODE_EXAMPLE}\n` +
                    'Контракт ручек — docs/external-backend-contract.md. ' +
                    'PROXY_URL остаётся только dev-проксированием не-bricks /api/*.'
            );
            return resolution;
        }

        resolution.warnings.push(
            'PROXY_URL без bricks.backend.mode: /api/bricks/** обслуживаются локально ' +
                '(builtin) и без database.url будут отвечать ошибкой; devProxy проксирует ' +
                'только не-bricks /api/*. Задайте backend.mode явно.'
        );
        return resolution;
    }

    resolution.warnings.push(
        'Ни bricks.backend.mode, ни database.url не заданы — /api/bricks/** будет ' +
            'отвечать ошибкой во время работы. Задайте backend.mode = "builtin" + ' +
            'NUXT_BRICKS_DATABASE_URL или backend.mode = "external" + backend.url.'
    );
    return resolution;
}
// #endregion

/**
 * Разрешает режим data backend по явной опции и legacy-сигналам конфигурации.
 * Ошибки в `errors` должны валить сборку (fail-fast в module.ts); сам резолвер
 * не бросает — вызывающий решает, как отобразить диагностику.
 *
 * @param input - Сведённые значения options+env (см. module-runtime-config.ts).
 * @returns Разрешённый mode + infos/warnings/errors.
 */
export function resolveBricksBackendConfig(
    input: IBricksBackendResolutionInput
): IBricksBackendResolution {
    if (input.configuredMode === 'external') {
        return resolveExternalMode(input);
    }

    if (input.configuredMode === 'builtin') {
        return resolveBuiltinMode(input);
    }

    return resolveLegacyMode(input);
}
