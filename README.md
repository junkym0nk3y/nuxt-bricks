# nuxt-bricks

Визуальный билдер лендингов для Nuxt 3. Модуль добавляет дашборд страниц,
drag-and-drop редактор, preview и рендер опубликованных страниц.

Основные возможности:

- brick-компоненты с настраиваемыми и адаптивными свойствами;
- редактирование текста через TipTap;
- версии страниц и откат изменений;
- медиатека в S3-совместимом хранилище;
- встроенный PostgreSQL или внешний HTTP backend;
- Basic Auth или пользователи и сессии в PostgreSQL.

Требования: Node.js `>=22.17`, Nuxt `>=3.21`.

## Установка

```bash
npm install nuxt-bricks
```

Минимальная конфигурация со встроенным PostgreSQL:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['nuxt-bricks'],
    bricks: {
        backend: { mode: 'builtin' },
        auth: { mode: 'basic' },
    },
});
```

```bash
# .env
NUXT_BRICKS_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bricks
NUXT_BASIC_AUTH_USERNAME=admin
NUXT_BASIC_AUTH_PASSWORD=replace-me
```

Примените миграции и запустите Nuxt:

```bash
npx bricks-migrate migrate
npm run dev
```

После запуска доступны:

| Поверхность | Путь                        |
| ----------- | --------------------------- |
| Дашборд     | `/bricks`                   |
| Редактор    | `/bricks/<pagename>`        |
| Preview     | `/preview/<pagename>`       |
| Live        | URL опубликованной страницы |

Если приложение использует `@nuxtjs/i18n`, подключайте `nuxt-bricks` раньше
него в массиве `modules`.

## Backend данных

Режим задаётся в `nuxt.config` и фиксируется при сборке. Browser-facing API,
обработка изображений и S3 всегда остаются внутри Nuxt-приложения.

### Встроенный PostgreSQL

```typescript
bricks: {
    backend: { mode: 'builtin' },
}
```

Строка подключения задаётся через `NUXT_BRICKS_DATABASE_URL`. Миграции —
единственный источник схемы БД:

```bash
npx bricks-migrate status
npx bricks-migrate migrate
```

Для локальной разработки в репозитории есть `docker-compose.yml` с PostgreSQL.

### Внешний HTTP backend

```typescript
bricks: {
    backend: { mode: 'external' },
    auth: { mode: 'basic' },
}
```

```bash
NUXT_BRICKS_BACKEND_URL=https://api.example.com/bricks
NUXT_BRICKS_BACKEND_TOKEN=server-to-server-secret
NUXT_BRICKS_BACKEND_HEALTH_URL=https://api.example.com/health
```

`backend.url` — полный base URL API; сегмент `bricks` автоматически не
добавляется. Адаптер отправляет Bearer token, если он задан. Полный контракт
ручек — [`docs/external-backend-contract.md`](docs/external-backend-contract.md);
кратко внешний backend должен реализовать следующие JSON-ручки:

| Метод                                | Назначение                  |
| ------------------------------------ | --------------------------- |
| `GET/POST {base}`                    | список и создание страниц   |
| `GET/PATCH/DELETE {base}/:id`        | чтение, изменение, удаление |
| `GET {base}/:id/versions`            | список версий               |
| `GET {base}/:id/versions/:versionId` | снапшот версии              |
| `GET {base}/public/pages/:pagename`  | опубликованная страница     |
| `GET/POST {base}/media`              | список и регистрация медиа  |
| `PATCH/DELETE {base}/media/:id`      | изменение и удаление медиа  |

`404` означает отсутствие записи. Конфликты должны возвращать `409` с
`data.code`: `PAGENAME_CONFLICT` или `REVISION_CONFLICT`. При изменении schema
внешний backend сам отвечает за создание и очистку версий.

Списки страниц возвращаются без `schema`, полная страница — только из point-
lookup. Даты передаются в ISO 8601, `PATCH` страницы принимает
`expectedRevision` в JSON body. `POST {base}/media` регистрирует только JSON-
метаданные без binary и должен быть идемпотентным по `url`.

Database-auth несовместим с external-режимом, потому что пользователи и сессии
этого режима хранятся в локальном PostgreSQL.

### Dev-прокси host-API (`PROXY_URL`)

`PROXY_URL` не выбирает backend данных. Он используется только в dev для
проксирования `/api/*` host-проекта, кроме `/api/bricks/**` и `/mock-api/**` —
эти пути всегда обслуживаются локально. Значение принимается с завершающим
слэшем и без; в production-сборке proxy middleware не регистрируется. Один и
тот же адрес используется и SSR-запросами, и клиентским dev-прокси.

## Авторизация

Защищены builder, preview, `/mock-api/**` и editorial API `/api/bricks/**`.
Публичны health-пробы и `GET/HEAD /api/bricks/public/**`, используемый live-
рендерером.

### Basic Auth

Это режим по умолчанию:

```bash
NUXT_BASIC_AUTH_USERNAME=admin
NUXT_BASIC_AUTH_PASSWORD=replace-me
```

Дефолтный пароль `change-me` разрешён только в development. В production с
таким паролем защищённые пути отвечают `503`.

`BASIC_AUTH_USERNAME` и `BASIC_AUTH_PASSWORD` также поддерживаются при сборке и
в dev, но для уже собранного приложения используйте `NUXT_*`-варианты выше.

### Пользователи в PostgreSQL

Режим требует `backend.mode: 'builtin'` и применённых миграций:

```typescript
bricks: {
    backend: { mode: 'builtin' },
    auth: {
        mode: 'database',
        sessionMaxAgeSeconds: 604800,
    },
}
```

Дефолтных пользователей нет. CLI генерирует scrypt-хеш и готовый SQL:

```bash
npx bricks-hash-password mypassword --username admin
```

Обычно режим задаётся в `nuxt.config`. Для его переопределения в уже собранном
приложении нужны одновременно `NUXT_BRICKS_AUTH_MODE` и
`NUXT_PUBLIC_BRICKS_AUTH_MODE`; срок сессии меняется через
`NUXT_BRICKS_AUTH_SESSION_MAX_AGE`. Режим не включает роли, 2FA и UI управления
пользователями.

### CSRF

Изменяющие запросы к bricks API требуют same-origin заголовков браузера либо
`x-bricks-csrf: 1`. Последний вариант предназначен для CLI и интеграций:

```bash
curl -X POST 'https://example.com/api/bricks/auth/login' \
  -H 'x-bricks-csrf: 1' \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}'
```

## Медиа и S3

Файлы хранятся в S3-совместимом storage, а метаданные — в выбранном backend
данных. Секреты задавайте через env:

```bash
NUXT_BRICKS_S3_ENDPOINT=https://storage.example.com
NUXT_BRICKS_S3_REGION=region-1
NUXT_BRICKS_S3_BUCKET=my-bucket
NUXT_BRICKS_S3_ACCESS_KEY_ID=...
NUXT_BRICKS_S3_SECRET_ACCESS_KEY=...
```

По умолчанию используются endpoint Yandex Object Storage и managed-префиксы
`bricks-media/` и `bricks-thumbnails/`.

Сервер проверяет тип содержимого, санитизирует SVG и ограничивает входные
данные. Дефолтные лимиты: 10 МБ для изображений, 100 МБ для видео, 100 МП для
растров и 4 МБ для JSON editorial API. В production дополнительно настройте
body- и rate-limits на reverse proxy.

## Версии страниц

При сохранении изменённой schema backend создаёт снапшот предыдущего состояния.
Глубина истории задаётся через `bricks.versionsLimit` или
`NUXT_BRICKS_VERSIONS_LIMIT`; дефолт — `5`, значение `0` отключает версии.

Откат восстанавливает schema и настройки layout, не меняя URL, SEO и статус
публикации. Сам откат также попадает в историю.

## Маршруты и поверхности

```typescript
bricks: {
    routes: {
        builderPrefix: '/admin/builder',
        previewPrefix: '/look',
    },
    features: {
        builder: true,
        publishedPages: true,
    },
}
```

Префиксы задаются при сборке: начинаются с `/`, состоят из lowercase-сегментов
`[a-z0-9-]`, не имеют trailing slash и не пересекаются. Поддерживается
нестандартный `app.baseURL`.

`features.builder: false` создаёт render-only сборку без UI, preview и
editorial API. `features.publishedPages: false` отключает catch-all live-
маршруты.

Статические страницы Nuxt имеют приоритет над live-маршрутами bricks. Корневые
динамические маршруты приложения (`[slug].vue`, `[...slug].vue`) могут с ними
конфликтовать; в таком случае используйте `urlPrefix`, собственный regex или
отключите `publishedPages`.

## Data sources опубликованных страниц

Brick-компоненты могут объявлять `dataSources`, выполняемые при рендере. Это
публичный контекст: поддерживаются только `GET` и `HEAD`, cookies и identity не
пробрасываются, абсолютные URL запрещены без allow-list.

```typescript
bricks: {
    dataSources: {
        allowedHosts: ['api.example.com'],
        timeoutMs: 10000,
        concurrency: 6,
        maxResponseBytes: 1024 * 1024,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    },
}
```

Относительные URL (`/api/...`) разрешены всегда. Одинаковые запросы одного
рендера дедуплицируются; ошибка или превышение бюджета оставляет компонент с
дефолтными props и не прерывает рендер всей страницы.

## Изоляция стилей

Reset модуля ограничен поверхностями bricks. Контент canvas и published-
страницы наследует стили host-приложения, а UI билдера изолирован CSS Modules.
CSS-переменные, transition-имена и utility-классы модуля имеют префикс
`bricks-`. Swiper CSS загружается только вместе со слайдером.

## Production

- Перед rollout выполняйте `npx bricks-migrate migrate` отдельной ролью с
  DDL-правами; приложению достаточно DML.
- Храните PostgreSQL URL, S3 credentials и auth/backend tokens только в env.
- Используйте TLS и внешний reverse proxy с body- и rate-limits.
- Включайте `NUXT_BRICKS_TRUST_PROXY=true` только за одним доверенным proxy-
  хопом; модуль использует последний элемент `x-forwarded-*`.
- Резервируйте PostgreSQL и S3 как согласованную пару.

Health endpoints:

- `GET /api/bricks/health` — liveness;
- `GET /api/bricks/health/ready` — readiness выбранного backend данных.

Для external backend рекомендуется задать `NUXT_BRICKS_BACKEND_HEALTH_URL`.
Непредвиденные ошибки API возвращают безопасный `500` с `data.errorId`; полная
ошибка с тем же идентификатором остаётся в server log.

### Обновление существующей БД

Не изменяйте уже применённые SQL-файлы: checksum drift блокирует дальнейшие
миграции. Миграция `0004_timestamptz` считает старые значения `TIMESTAMP`
записанными в UTC. Если исторически использовалась другая timezone,
скорректируйте значения перед применением этой миграции.

## Разработка

```bash
npm install
npm run dev
```

Основные команды:

| Команда                     | Назначение                            |
| --------------------------- | ------------------------------------- |
| `npm run bricks:gen`        | сгенерировать `bricks.json`           |
| `npm run type-check`        | проверить TypeScript                  |
| `npm run lint:check`        | линтеры и архитектурные границы       |
| `npm test`                  | unit-тесты Vitest                     |
| `npm run dev:build`         | production build playground           |
| `npm run smoke:pack`        | проверить tarball в чистом consumer   |
| `npm run smoke:integration` | lifecycle против PostgreSQL и MinIO   |
| `npm run smoke:external`    | lifecycle внешнего HTTP backend       |
| `npm run budget:bundle`     | проверить gzip-бюджеты initial bundle |

Runtime-код разделён на домены в `src/runtime/modules/`, тесты лежат в `test/`,
миграции — в `migrations/`. Границы зависимостей описаны в
`.dependency-cruiser.cjs`; краткие инструкции для AI — в `CLAUDE.md`.
