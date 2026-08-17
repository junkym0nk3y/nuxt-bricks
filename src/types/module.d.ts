/**
 * Опции Nuxt-модуля (`bricks` в `nuxt.config`) — контракт `src/module.ts`.
 *
 * Типизацию ключа `bricks` Nuxt выводит из дженерика `defineNuxtModule`
 * (`NuxtModule<infer O>`), а не из имени этого интерфейса, поэтому файл —
 * единственный источник формы опций и для setup'а, и для резолверов
 * runtimeConfig.
 */
import type { TBricksBackendMode } from './moduleBackendConfig';
import type { TBricksProjectDeviceSet } from '../runtime/modules/common/types/devices';

export interface IBricksModuleOptions {
    /**
     * Набор устройств проекта: 2–4 записи, отсортированные по возрастанию
     * `width`, обязательно с `mobile` в начале и `desktop` в конце.
     *
     * `width` устройства — это одновременно ширина листа в билдере и `min-width`
     * его диапазона media-query на published: отдельного списка порогов нет,
     * поэтому дыр и наложений между ступенями не бывает по построению.
     *
     * Опция build-time и единственная: той же резолвнутой картой кормится
     * SCSS-карта миксинов (`#bricks-scss`), поэтому канвас, контейнеры, пороги
     * published и media query авторов бриков считаются по одним числам.
     * Невалидное значение валит сборку — молча подменять набор нельзя, это
     * изменило бы раскладку всех страниц.
     *
     * Отдельная страница может завести свой набор в билдере; он хранится в
     * `bricks_pages.viewport_config` и перекрывает проектный только для неё.
     */
    devices?: TBricksProjectDeviceSet;
    /**
     * Basic Auth для защиты builder/preview и модифицирующих API.
     * ВНИМАНИЕ: задайте свои значения в production (см. README).
     */
    basicAuth?: {
        username?: string;
        password?: string;
    };
    /**
     * Режим авторизации защищённых путей (builder/preview/мутации API).
     * - 'basic' (дефолт) — HTTP Basic Auth с парой креденшелов из basicAuth/env.
     * - 'database' — пользователи в Postgres (scrypt-хеш), страница логина
     *   `<builderPrefix>/bricks-login`, cookie-сессии в БД (таблицы
     *   bricks_users/bricks_sessions).
     * ENV-переопределение: BRICKS_AUTH_MODE, BRICKS_AUTH_SESSION_MAX_AGE.
     * Провижининг пользователей — вручную (см. CLI bricks-hash-password).
     */
    auth?: {
        mode?: 'basic' | 'database';
        /** Срок жизни cookie-сессии в секундах (дефолт: 604800 — 7 дней). */
        sessionMaxAgeSeconds?: number;
        /**
         * Раздел «Пользователи» и ручки `/api/bricks/users/**` (дефолт true).
         *
         * `false` — раздел не показывается, а ручки отвечают **404**, а не 403:
         * 403 подтверждал бы, что управление учётками в сборке есть и просто
         * закрыто. Флаг для установок, где учётки ведут снаружи (LDAP, ручной
         * провижининг через CLI) и правка их из билдера рассинхронизировала бы
         * источник истины. Свой профиль от флага не зависит.
         *
         * В режиме `auth.mode: 'basic'` ручки недоступны независимо от флага:
         * учёток в нём нет вовсе.
         * ENV-переопределение: BRICKS_AUTH_ALLOW_USER_MANAGEMENT.
         */
        allowUserManagement?: boolean;
    };
    /**
     * Режим data backend: где живут данные страниц, версий и media metadata.
     * Файлы (S3), sharp и browser-facing /api/bricks/** всегда локальные.
     * - 'builtin' — встроенный PostgreSQL-адаптер (см. database.url);
     * - 'external' — пользовательский HTTP-backend по контракту
     *   docs/external-backend-contract.md (HTTP-реализация IStorageAdapter).
     * mode — build-time (менять после сборки unsupported), дефолт 'builtin';
     * url/token/healthUrl runtime-переопределяемы: NUXT_BRICKS_BACKEND_URL /
     * _TOKEN / _HEALTH_URL.
     */
    backend?: {
        mode?: TBricksBackendMode;
        /**
         * Полный base-префикс bricks-API external-сервера (например
         * https://api.example.com/my-cms) — адаптер добавляет только
         * относительные пути, сегмент «bricks» не зашит.
         */
        url?: string;
        /** Readiness-URL external backend (готовность — только 2xx). */
        healthUrl?: string;
    };
    /**
     * PostgreSQL для дефолтного storage-адаптера (persistence, builtin-режим).
     * Если url задан — /api/bricks/** обслуживаются локальными Nitro-ручками.
     * Строку подключения задавать через ENV NUXT_BRICKS_DATABASE_URL —
     * секретам не место в nuxt.config.
     */
    database?: {
        url?: string;
        /**
         * Серверный потолок исполнения одного SQL-statement, мс (дефолт 8000).
         * База отменяет превысивший его запрос сама — без этого зависший запрос
         * держал бы соединение из пула до конца жизни процесса, и серия таких
         * запросов исчерпала бы пул. Считается на каждый statement, а не на
         * транзакцию. Выключить нельзя: `0` и прочие невалидные значения
         * трактуются как «не задано» и заменяются дефолтом; законно долгий
         * запрос обслуживается бо́льшим значением.
         * Лимит не касается миграций (`bricks-migrate` подключается сам).
         * ENV-переопределение: NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS.
         */
        statementTimeoutMs?: number;
    };
    /**
     * Количество хранимых версий страницы: снапшот прежнего состояния создаётся
     * при каждом сохранении, меняющем `schema` (реализуется storage-адаптером).
     * Дефолт 5, `0` — версионирование выключено.
     * ENV-переопределение: NUXT_BRICKS_VERSIONS_LIMIT.
     */
    versionsLimit?: number;
    /**
     * S3-совместимое хранилище для дефолтного publish-адаптера.
     * ENV-переопределение: NUXT_BRICKS_S3_*.
     */
    s3?: {
        endpoint?: string;
        region?: string;
        bucket?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        /** Managed-префикс ключей медиа-файлов (дефолт 'bricks-media/'). */
        prefix?: string;
        /** Managed-префикс ключей превью страниц (дефолт 'bricks-thumbnails/'). */
        thumbnailsPrefix?: string;
    };
    /**
     * Dev-only проксирование не-bricks /api/* на backend host-проекта
     * (middleware регистрируется только при nuxt.options.dev; /api/bricks/**
     * никогда не проксируется — см. bricks.backend).
     * Адрес — server-only runtimeConfig (в client payload не попадает).
     * ENV: PROXY_URL (build-time fallback), NUXT_BRICKS_PROXY_URL
     * (runtime-override).
     */
    proxy?: {
        url?: string;
    };
    /**
     * Политика data sources published-страницы (выполняются рендерером
     * на каждый SSR/refresh через выделенный публичный клиент: без cookie,
     * с таймаутом; методы — только GET/HEAD).
     */
    dataSources?: {
        /**
         * Хосты, для которых разрешены абсолютные http(s)-URL data sources
         * (точное совпадение hostname, без протокола и порта).
         * Дефолт: пусто — разрешены только относительные URL (`/api/...`).
         */
        allowedHosts?: string[];
        /** Таймаут одного запроса, мс (дефолт 10000). */
        timeoutMs?: number;
        /** Максимум одновременных запросов на страницу (дефолт 6). */
        concurrency?: number;
        /** Лимит размера одного ответа, байт (дефолт 1 МБ, JSON-length approximation). */
        maxResponseBytes?: number;
        /** Максимум запросов data sources на один прогон страницы (дефолт 24). */
        maxRequestsPerPage?: number;
        /** Суммарный wall-clock budget одного прогона, мс (дефолт 15000). */
        totalDeadlineMs?: number;
    };
    /**
     * Доверять заголовку x-forwarded-for при определении клиентского IP
     * (ключи rate limiter'ов: upload/thumbnail/login). Дефолт false —
     * используется только socket-адрес. Включать только за собственным
     * reverse proxy (ровно один доверенный хоп; берётся последний элемент
     * заголовка — дописанный прокси, первый клиент может подделать).
     * ENV-переопределение: NUXT_BRICKS_TRUST_PROXY.
     */
    trustProxy?: boolean;
    /**
     * Локализация интерфейса билдера (ru/en).
     * defaultLocale применяется, только если @nuxtjs/i18n ставит сам bricks
     * (у потребителя модуль не подключён).
     */
    i18n?: {
        defaultLocale?: 'ru' | 'en';
    };
    /**
     * Префиксы страниц модуля (build-time, env-override не поддерживается).
     * Формат: ведущий `/`, lowercase-сегменты [a-z0-9-], без trailing slash;
     * префиксы не должны пересекаться. Невалидная конфигурация валит сборку.
     * - builderPrefix — дашборд `<prefix>`, редактор `<prefix>/:pagename`,
     *   логин `<prefix>/bricks-login` (дефолт: '/bricks')
     * - previewPrefix — превью рендера `<prefix>/:pagename`
     *   (дефолт: '/bricks-preview')
     *
     * Дефолты сидят в неймспейсе `bricks-` намеренно: занятый префикс отбирает
     * у published-страниц соответствующий адрес, поэтому ходовые `/preview` и
     * `/login` остаются потребителю.
     */
    routes?: {
        builderPrefix?: string;
        previewPrefix?: string;
    };
    /**
     * Поверхности модуля (build-time).
     * - builder (дефолт true) — UI билдера целиком: страницы
     *   builder/login/preview, плагины редактора, builder-ручки (библиотека
     *   компонентов, media proxy, page thumbnail), editorial
     *   API, i18n и Pinia. false — render-only деплой: остаются published
     *   catch-all маршруты, public read-model и auth-защита путей.
     * - publishedPages (дефолт true) — статические catch-all маршруты
     *   live-рендера. false — модуль не перехватывает URL приложения,
     *   published-страницы доступны только через превью.
     */
    features?: {
        builder?: boolean;
        publishedPages?: boolean;
    };
}
