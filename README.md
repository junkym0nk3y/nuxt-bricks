# nuxt-bricks

Визуальный билдер лендингов для Nuxt 3 с drag-and-drop компонентами. Самостоятельный Nuxt Module: дашборд страниц на `/bricks`, редактор на `/bricks/<pagename>`, превью на `/preview/<pagename>` (префиксы настраиваются — см. «Маршруты и поверхности»).

## Авторизация

Защищённые пути (в обоих режимах одна матрица; префиксы страниц — из `bricks.routes`): `<builderPrefix>/**` (менеджер страниц + редактор), `<previewPrefix>/**` (превью рендера), `/mock-api/s3-*` (снапшот превью страницы, media-proxy) и весь editorial API `/api/bricks/**`, включая GET (списки страниц с черновиками и полной schema, медиатека, версии). Публична только public read-model `GET/HEAD /api/bricks/public/**` — published-проекции для рендера.

**CSRF**: unsafe-запросы (`POST`/`PUT`/`PATCH`/`DELETE`) на `/api/bricks/**` (включая `auth/login`/`auth/logout`) и `/mock-api/s3-*` требуют доказательства same-origin — заголовка `Origin`, совпадающего с ПОЛНЫМ origin запроса (схема + хост + порт; эффективная схема — TLS сокета либо последний хоп `x-forwarded-proto` при `bricks.trustProxy` — ре-ревью A-03), заголовка `Sec-Fetch-Site: same-origin/none`, либо кастомного заголовка `x-bricks-csrf: 1` (кросс-доменный документ не может поставить кастомный заголовок без CORS-preflight). Проверка идёт до auth — отсутствие любого признака отдаёт `403` ещё до логина. Тело JSON-ручек принимается только с `Content-Type: application/json` (`415` иначе). Клиент билдера (`useApiClient`) шлёт заголовок автоматически; для curl-автоматизации и прочих не-браузерных клиентов:

```bash
curl -X POST '.../api/bricks/auth/login' \
  -H 'x-bricks-csrf: 1' -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}'
```

Конфигурация — через env (`.env`):

```bash
BRICKS_AUTH_MODE=database                              # 'basic' (дефолт) | 'database'
BRICKS_AUTH_SESSION_MAX_AGE=604800                     # срок cookie-сессии в секундах, 7 дней (только database)
NUXT_BRICKS_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bricks  # обязателен для database
```

Несекретные опции (`mode`, `sessionMaxAgeSeconds`) можно задать и в nuxt.config (`bricks.auth`). Строку подключения к БД в `bricks.database.url` не класть — секретам не место в nuxt.config, он уходит в git; только env.

> Нюанс для уже собранного приложения: `NUXT_BRICKS_AUTH_MODE` меняет только server-ключ runtimeConfig — клиенту (401-редирект, страница логина) нужен ещё `NUXT_PUBLIC_BRICKS_AUTH_MODE`. Обычный `BRICKS_AUTH_MODE` при старте модуля заполняет оба.

### Режим `basic` (дефолт)

HTTP Basic Auth с одной парой креденшелов.

| Env                   | Дефолт      |
| --------------------- | ----------- |
| `BASIC_AUTH_USERNAME` | `admin`     |
| `BASIC_AUTH_PASSWORD` | `change-me` |

Дефолтный пароль — только для dev: в production с `change-me` защищённые пути отвечают `503` (забытый пароль закрывает доступ, а не оставляет дыру).

Невалидные креденшелы (заголовок `Authorization: Basic` присутствует, но не совпадает) делят с database-логином тот же per-IP лимитер второго уровня (см. ниже) — 30 неудач за 15 минут с одного IP → `429`; отсутствующий заголовок (обычный браузерный prompt) не считается попыткой.

### Режим `database`

Пользователи в Postgres (scrypt-хеш пароля), страница логина `/bricks/login`, отзываемые cookie-сессии в БД (HttpOnly, SameSite=Lax, Secure в production; в БД хранится только SHA-256 токена). Брутфорс логина ограничен двухуровневым лимитером (аудит A-04):

- **По паре IP+логин** — 5 неудач за 15 минут → блокировка на 15 минут (`429`).
- **По IP** (сменяемые username) — 30 неудач за 15 минут → блокировка на 15 минут (`429`); проверяется **до** дорогой scrypt-верификации пароля, поэтому перебор с одного IP по множеству username не запускает новую scrypt-дериватизацию на каждую попытку.

Сама scrypt-верификация исполняется под общим bounded-семафором (не больше 4 одновременных дериваций, очередь 32 — сверх, `503`), общим для всех login-запросов процесса: поток запросов с разными username не может занять CPU неограниченным числом параллельных derive-операций.

Канонический bootstrap схемы БД — версионированные миграции (`migrations/*.sql`, поставляются в npm-пакете):

```bash
npm run bricks:migrate -- status    # applied/pending список (или npx bricks-migrate)
npm run bricks:migrate -- migrate   # применить pending миграции
```

Подключение — `--url`, иначе env `NUXT_BRICKS_DATABASE_URL` / `DATABASE_URL`. Миграции применяет deploy/bootstrap job ролью с DDL-правами; runtime-роли приложения DDL не нужен. Реестр применённых — таблица `bricks_schema_migrations`; серия идёт под advisory lock. Runtime-DDL адаптеры не выполняют: миграции — единственный источник схемы (непримененные проявятся ошибкой запроса с подсказкой `npx bricks-migrate migrate` в логе сервера; локальный docker-compose монтирует `migrations/` в initdb).

**`0004_timestamptz`** (аудит A-07) переводит все колонки абсолютных дат (`bricks_pages`, `bricks_page_versions`, `bricks_users`, `bricks_sessions`, `bricks_media`, `bricks_schema_migrations`) с `TIMESTAMP` на `TIMESTAMPTZ`: без зоны node-postgres читает значение в локальном TZ процесса — один и тот же момент в БД означал разные instants при разных TZ приложения (сроки сессий, сортировка, расхождение реплик). Миграция предполагает, что существующие значения — UTC (дефолт docker-compose и рекомендованный TZ production). Если БД/приложение исторически работали в другом timezone — до применения 0004 вручную выполнить `ALTER ... USING <col> AT TIME ZONE '<ваш tz>'` для соответствующих колонок. Конверсия каждой колонки идёт под guard'ом по фактическому типу и потому идемпотентна (ре-ревью A-07): docker-compose initdb применяет SQL-файлы напрямую без CLI — таблицы реестра `bricks_schema_migrations` на пустом volume ещё нет; а повторный прогон не конвертирует уже-`TIMESTAMPTZ` колонки заново (двойная конверсия сдвинула бы значения при не-UTC session TZ).

**`0005_namespaced_trigger_function`** (аудит A-10) переводит триггеры `updated_at` на namespaced-функцию `bricks_update_updated_at_column()`. Свежая установка функцию с общим именем не создаёт вовсе — актуальная `0001` сразу создаёт namespaced-функцию (ре-ревью A-10: прежняя редакция `0001` выполняла `CREATE OR REPLACE FUNCTION update_updated_at_column()` и могла молча перезаписать тело одноимённой функции host-приложения). Для БД, созданных прежней редакцией, `0005` пересоздаёт триггеры `bricks_pages`/`bricks_users` на новой функции; старая `update_updated_at_column()` сознательно **не удаляется** — bricks-копию невозможно отличить от собственной функции host-приложения (в т.ч. ещё не привязанной к триггерам, которую условный DROP снёс бы молча). Осиротевшую bricks-копию оператор при желании убирает вручную: `DROP FUNCTION update_updated_at_column();`.

**Checksum-контроль миграций** (аудит A-10): реестр `bricks_schema_migrations` хранит SHA-256 применённого SQL (колонка `checksum`). При каждом запуске `bricks-migrate` пересчитывает checksum файлов на диске и сравнивает с сохранённым:

- **Drift** — применённая миграция, чей файл изменился после применения (или исчез с диска). `status` помечает такие строки `[drift]`; `migrate` отказывается применять pending-миграции и завершается с кодом 1, пока drift не устранён. Выпущенные миграции не редактируются задним числом — изменения оформляются новой forward-миграцией (например, `0006_*.sql`); если расхождение — ложное срабатывание (файл перенесён/переименован без смены содержимого), явного пути восстановления checksum сейчас нет — годится прямой `UPDATE bricks_schema_migrations SET checksum = ...` вручную.
- **Backfill** — строки реестра, применённые до появления этого контроля (`checksum IS NULL`), не считаются drift'ом: `migrate` тихо проставляет им checksum текущего файла (лог `[checksum backfilled]`) при первом запуске после апгрейда.

**Дефолтных пользователей нет** — пока не заведёте пользователя, войти невозможно.

Создание пользователя:

```bash
npm run bricks:hash -- mypassword --username admin
# печатает хеш и готовый SQL:
# INSERT INTO bricks_users (username, password_hash) VALUES ('admin', 'scrypt:...');
```

Смена пароля — тот же CLI, затем:

```sql
UPDATE bricks_users SET password_hash = '<новый hash>' WHERE username = 'admin';
-- опционально отозвать активные сессии:
DELETE FROM bricks_sessions WHERE user_id = (SELECT id FROM bricks_users WHERE username = 'admin');
```

Деактивация без удаления: `UPDATE bricks_users SET is_active = false WHERE username = '...';`

Хранилище пользователей/сессий подменяемо — `setBricksAuthAdapter` из `nuxt-bricks/persistence` (Nitro-плагин потребителя).

### Ограничения (осознанные, v1)

- Rate limiter логина (оба уровня — IP+логин и IP) и scrypt-семафор живут в памяти процесса — при нескольких репликах лимиты слабеют пропорционально их числу; для production рекомендуется дополнительный rate limiting на ingress.
- Нет 2FA, ролей и UI управления пользователями: один уровень доступа, провижининг вручную.
- `Secure`-флаг cookie включается по `NODE_ENV=production` — в бою обязателен HTTPS.
- `login` — зарезервированный pagename (занят страницей логина).

## Версионирование страниц

Дефолтный Postgres-адаптер хранит последние N версий каждой страницы (таблица `bricks_page_versions`): снапшот прежнего состояния создаётся при каждом сохранении, меняющем `schema` (PATCH только thumbnail/published версий не плодит). В дашборде `/bricks` — секция «Версии» панели деталей с превью и откатом; откат применяет только `schema` + `layout` + `backgroundColor` (pagename/title/SEO/published не трогаются) и сам попадает в историю — «откат отката» работает.

Глубина истории — `bricks.versionsLimit` в nuxt.config (дефолт 5, `0` выключает версионирование) или env `NUXT_BRICKS_VERSIONS_LIMIT` (работает и для уже собранного приложения).

## Медиа-хранилище

Файлы медиа-библиотеки живут в S3-совместимом хранилище (дефолтный адаптер — Yandex Object Storage), метаданные — в таблице `bricks_media` (URL уникален — миграция `0002`). Обе половины каждой операции выполняет сервер атомарно, одним запросом клиента:

- `POST /api/bricks/media/upload` (multipart `file` + `category`) — валидация/оптимизация файла, загрузка в хранилище и регистрация метаданных; при ошибке БД загруженный файл компенсируется удалением. SVG санитизируется на сервере до записи.
- `DELETE /api/bricks/media/:id` — сначала файл, затем запись (file-first): при недоступном хранилище — 502, запись остаётся, повтор запроса безопасно доводит удаление до конца (S3-delete идемпотентен).
- `DELETE /api/bricks/:id` (страница) — заодно best-effort чистит файл превью страницы из хранилища.

Модуль оперирует только собственным namespace бакета — managed-префиксами `bricks.s3.prefix` (медиа, дефолт `bricks-media/`) и `bricks.s3.thumbnailsPrefix` (превью страниц, дефолт `bricks-thumbnails/`). Ключи объектов генерирует сервер (`IPublishAdapter.buildFileKey`); удаление, регистрация URL и media-proxy отказывают любым объектам вне этих префиксов — в shared-бакете модуль не может затронуть посторонние файлы даже по валидному URL бакета.

Контракт кастомных адаптеров: `IPublishAdapter` требует `buildFileKey(kind, filename)`, managed-семантику `deleteFile`/`isOwnedUrl` и полный листинг `listFiles` (пагинация хранилища — забота адаптера); `IStorageAdapter` — `getMedia(id)`, идемпотентный по `url` `createMedia` (повторная регистрация возвращает существующую запись; на этом же контракте держится дедупликация импорта из бакета) и `listPages`, возвращающий сводки страниц **без** поля `schema` (полную строку отдаёт только `getPage`/`getPageByPagename`). Компилятор укажет на несовпадения при обновлении.

### Лимиты запросов и ресурсов (ingress)

Серверные ручки модуля сами ограничивают принимаемые данные и ресурсы обработки:

- Тело запроса читается с жёстким лимитом: заявленный `Content-Length` сверх лимита отклоняется (413) до чтения, фактический поток обрывается сразу при превышении — chunked-запрос без заголовка не обходит границу. Лимиты: загрузка медиа — `media.maxUploadSizeMb` (изображения, дефолт 10 МБ) / `media.maxVideoUploadSizeMb` (видео, дефолт 100 МБ) + 1 МБ на multipart-конверт; снапшот превью страницы — 10 МБ; JSON editorial API — 4 МБ (вдвое больше максимально валидной schema).
- Содержимое загрузки подтверждается magic bytes: файл, чьё содержимое не является заявленным изображением/видео/SVG, отклоняется с 400 — MIME и расширению из формы модуль не доверяет.
- Обработка изображений (sharp) ограничена 100 мегапикселями на вход (декомпрессионные бомбы) и общим семафором одновременности (4 конвертации, очередь 32, сверх — 503).
- Ingest-ручки (`POST /api/bricks/media/upload`, `POST /mock-api/s3-page-thumbnail`) дополнительно ограничены 30 запросами в минуту с одного IP (429 + `Retry-After`). Лимитер per-process — multi-replica деплой ослабляет его пропорционально числу реплик.
- Клиентский IP для rate limiter'ов (upload/thumbnail/login) по умолчанию — только socket-адрес соединения: заголовкам `x-forwarded-*` модуль не доверяет, подделать IP клиент не может. За reverse proxy socket-адрес у всех запросов одинаковый, и per-IP лимиты схлопываются в один общий bucket — для этого случая есть опт-ин `bricks.trustProxy: true` (или env `NUXT_BRICKS_TRUST_PROXY=true`, работает без ребилда): берётся **последний** элемент `x-forwarded-for` — тот, что дописал ближайший прокси-хоп; первый элемент (клиентский spoof при аппендящем прокси) лимит не обходит. Тот же флаг управляет доверием к `x-forwarded-host` при SSR-сопоставлении `subdomain` published-страницы: с `trustProxy` берётся **последний** токен `x-forwarded-host` (оригинальный хост, дописанный ближайшим прокси-хопом), без него — обычный заголовок `Host`. Включать только когда приложение действительно стоит за собственным прокси; рассчитано ровно на один доверенный хоп — при цепочке прокси внешний хоп должен перезаписывать заголовки.

Эти границы — вторая линия обороны: в production перед приложением стоит держать reverse proxy с собственным лимитом тела запроса (например, `client_max_body_size` в nginx чуть выше лимита видео) и, при необходимости, внешним rate limiting.

## Маршрутизация published-страниц

Опубликованные страницы обслуживаются двумя статическими маршрутами, которые модуль регистрирует при сборке: `/:pagename` и `/:urlPrefix+/:pagename` (сегменты ограничены regex `[a-z0-9-]+`). Страница резолвится на лету прямым запросом public read-model по `pagename` — publish/unpublish вступают в силу сразу, без пересборки и перезагрузки.

Правила сосуществования с маршрутами вашего приложения:

- Статические страницы приложения (`pages/about.vue` и т.п.) всегда побеждают маршруты bricks — vue-router ранжирует их выше.
- URL с символами вне `[a-z0-9-]` (точки, подчёркивания, файлы статики) маршрутами bricks не перехватываются.
- Ограничение: корневой динамический маршрут приложения без custom regex (`pages/[slug].vue`, `pages/[...slug].vue`) проиграет ранжирование маршрутам bricks — одно- и двухсегментные URL, не занятые published-страницей, получат 404 от bricks вместо вашей страницы. Обходной путь — задать своему маршруту custom regex через `definePageMeta({ path })` либо развести пространства URL через `urlPrefix`.

## Data sources published-страниц

Brick-компоненты могут объявлять `dataSources` — запросы, которые рендерер выполняет на каждый SSR/refresh опубликованной страницы и мержит в props компонента. Это **публичный** контекст, поэтому запросы идут через выделенный клиент с жёсткой политикой (не через API-клиент билдера):

- **Методы — только `GET`/`HEAD`.** Мутирующий метод — это побочный эффект рендера; такой data source пропускается с предупреждением в логе.
- **URL: относительные — всегда разрешены** (`/api/...` уходит на ваш backend через proxy-режим либо в локальные Nitro-ручки). **Абсолютные — только http(s) на хост из allow-list** `bricks.dataSources.allowedHosts`; по умолчанию список пуст и абсолютные URL запрещены.
- **Без cookies и identity**: cookie посетителя, cookie/креды билдера и `x-forwarded-*` в запросы data sources не пробрасываются; ошибка источника не редиректит посетителя на страницу логина.
- **Таймаут и лимит одновременности**: каждый запрос ограничен таймаутом (дефолт 10 с, без ретраев); страница выполняет не более N запросов одновременно (дефолт 6). Ошибка/таймаут источника не валит страницу — компонент рендерится с дефолтными props.
- **Дедупликация**: одинаковые (метод + URL) запросы одного рендера выполняются один раз и делят результат.
- **Бюджеты ресурсов** (аудит A-09): страница с большим числом brick-компонентов не должна открывать неограниченное число запросов, копить неограниченные ответы или блокировать SSR без предела. Три независимых лимита:
    - `maxResponseBytes` (дефолт 1 МБ) — байтовый бюджет транспортного потока одного ответа: `Content-Length` проверяется до чтения тела, поток без заголовка обрывается на превышении ещё ДО JSON.parse (ре-ревью A-09 — крупный ответ не буферизуется в памяти целиком); ответ больше лимита не мержится в props компонента (лог `byte budget`, компонент остаётся на дефолтных props).
    - `maxRequestsPerPage` (дефолт 24) — источники сверх лимита не выполняются вовсе (лог `Request budget exceeded`, приоритет — порядок объявления в схеме).
    - `totalDeadlineMs` (дефолт 15000) — суммарный wall-clock бюджет одного прогона страницы; по истечении оставшиеся запросы отменяются `AbortController`'ом (лог `Total deadline exceeded`), уже выполненные результаты сохраняются.
- **Логи**: параметры, props компонента и превью ответов логируются только в dev; в production — только key/метод/id компонента, цель запроса (относительный URL → `local`, абсолютный → только origin, без пути и query) и причина отказа политики/бюджета.

```typescript
bricks: {
    dataSources: {
        allowedHosts: ['api.example.com'], // дефолт []: только относительные URL
        timeoutMs: 10000,                  // таймаут одного запроса, мс
        concurrency: 6,                    // одновременных запросов на страницу
        maxResponseBytes: 1024 * 1024,     // лимит размера одного ответа, байт
        maxRequestsPerPage: 24,            // максимум запросов на один прогон страницы
        totalDeadlineMs: 15000,            // суммарный wall-clock budget прогона, мс
    },
}
```

## Маршруты и поверхности

Пути страниц модуля настраиваются, поверхности отключаются — всё через nuxt.config (build-time, env-override не поддерживается):

```typescript
bricks: {
    routes: {
        builderPrefix: '/admin/builder', // дефолт '/bricks': дашборд, редактор <prefix>/<pagename>, логин <prefix>/login
        previewPrefix: '/look',          // дефолт '/preview': превью <prefix>/<pagename>
    },
    features: {
        builder: false,        // дефолт true; false — render-only деплой (см. ниже)
        publishedPages: false, // дефолт true; false — отключить catch-all маршруты live-рендера
    },
}
```

- Формат префикса: ведущий `/`, lowercase-сегменты `[a-z0-9-]`, без trailing slash; префиксы не должны пересекаться и занимать зарезервированные корни (`/api`, `/mock-api`, `/_nuxt`). Невалидная конфигурация валит сборку с понятной ошибкой.
- `app.baseURL` поддерживается: страницы, серверные редиректы авторизации, превью и API-клиент билдера работают под нестандартным base без дополнительной настройки.
- `features.builder: false` — render-only: не регистрируются страницы билдера/логина/превью, плагины редактора, mock-api ручки и editorial API (остаётся только public read-model `GET /api/bricks/public/**`); Pinia и `@nuxtjs/i18n` не подключаются. Published-страницы продолжают работать.
- `features.publishedPages: false` — модуль не перехватывает URL приложения: published-страницы доступны только через превью, live-маршрутизацию вы берёте на себя.

**Порядок модулей**: `nuxt-bricks` должен стоять **до** `@nuxtjs/i18n` в `modules` (bricks применяет безопасные i18n-дефолты и регистрирует переводы билдера). Неверный порядок ломает маршруты билдера, поэтому сборка падает сразу с ошибкой `[nuxt-bricks] @nuxtjs/i18n is installed before nuxt-bricks…`.

## Изоляция стилей

Модуль не задаёт глобальных стилей вашему приложению: весь reset действует только на поверхностях bricks (страницы билдера — `body.bricks-page`, published/preview — `body.bricks-render`), CSS-переменные и transition-имена носят префикс `bricks-`, Swiper CSS загружается лениво вместе с блоком «Слайдер».

Контент bricks (канвас билдера и published/preview-страницы) получает **встроенный normalize + reset внутри `@layer bricks-reset`** — это самый низкий уровень каскада: любой стиль вашего проекта (включая голые element-селекторы вида `button { ... }`) его перебивает. Поэтому вёрстка в канвасе и на опубликованной странице выглядит одинаково и наследует стили проекта; отдельный normalize подключать не нужно, но свой — не помешает (он просто победит встроенный).

Плюс fallback'и **нулевой специфичности** (`:where()`), которые тоже перебиваются одноимёнными правилами проекта:

- `:where(html) { font-size: 10px; line-height: 1.15; -webkit-text-size-adjust: 100% }` — rem-база bricks-контента (совпадает с базой канваса билдера) и html-часть normalize. Если проект задаёт собственную базу (`html { font-size: ... }`, см. `remBase` в конфиге breakpoints) — она побеждает.
- `:where(body) { margin: 0 }` — полноэкранный лендинг без браузерной рамки.
- `:where(.bricks-container, .bricks-container *) { box-sizing: border-box }` и `:where(.bricks-container a) { color: inherit }` — прежнее поведение bricks-блоков внутри контейнера (страховка для рендера вне bricks-маршрутов).

UI самого билдера защищён от стилей проекта: его reset действует только вне канваса и выигрывает у element-селекторов проекта по порядку загрузки, а классы CSS-модулей билдера ваши селекторы не матчат.

## CI и релизный гейт

GitHub Actions (`.github/workflows/ci.yml`) гоняет на каждый PR и push в `main` пять независимых job:

1. **checks** — `format:check` + `lint:check` (oxlint, stylelint, dependency-cruiser, knip) + `type-check` + `test`;
2. **build** — сборка модуля и прод-сборка playground + bundle budget (`npm run budget:bundle`): gzip-размер initial JS двух поверхностей (entry и published-страница) сверяется с бюджетами в `scripts/bundle-budget.mjs` — незаметный рост бандла валит job, осознанный рост фиксируется diff'ом бюджета (локальный запуск требует свежего `npm run dev:build`; атрибуция состава чанков — `npx nuxi analyze playground`);
3. **pack-smoke** — `npm run smoke:pack`: fresh-consumer smoke опубликованного tarball (`npm pack` → чистое consumer-приложение во временной папке ставит tarball → в пакете есть `dist`, `migrations/*.sql` и CLI-бины → `nuxi build` без Postgres/PROXY_URL → прод-сервер поднимается, отдаёт страницу consumer'а 200, editorial API и `/bricks` анониму — 401, basic-креды принимаются). Скрипт можно гонять и локально; при провале временная папка сохраняется для разбора (путь — в логе);
4. **integration** — `npm run smoke:integration`: production-like гейт из собранного tarball против живых Postgres и MinIO (аудит A-06), см. ниже;
5. **audit** — `npm audit --omit=dev` блокирующе (prod-зависимости держим на 0 уязвимостей), полный audit — информационно.

Рекомендации по репозиторию (настраиваются в GitHub, не в коде): включить branch protection на `main` с обязательными checks всех пяти jobs и публиковать пакет только из CI. Обновления зависимостей — Dependabot (`.github/dependabot.yml`): npm еженедельно (minor/patch — одним групповым PR), GitHub Actions еженедельно.

### Integration smoke (Postgres + MinIO)

`npm run smoke:integration` (`scripts/integration-smoke.mjs` + lifecycle-проверки в `scripts/integration-lifecycle.mjs`) собирает tarball, разворачивает чистый consumer с database-auth, применяет миграции CLI `bricks-migrate` **из tarball** (и проверяет `status`: ни pending, ни checksum-drift), провижинит пользователя CLI `bricks-hash-password`, собирает и поднимает прод-сервер, затем гоняет black-box HTTP lifecycle: CSRF-гейт (unsafe-запрос без признаков происхождения — 403) → login → editorial CRUD → контракт схемы (невалидные/циклические компоненты — 400) → optimistic locking (устаревший `expectedRevision` — 409 `REVISION_CONFLICT`) → publish → public read-model (черновик — 404, editor-поля не отдаются) → версии + restore с precondition → media upload/delete через S3 → logout. Гейт падает при несовместимой миграции, сломанном SQL-маппинге, недоступном хранилище и нарушении auth/session flow.

Env-контракт:

- `BRICKS_IT_DATABASE_URL` — обязателен; **пустая** база (миграции применяет сам скрипт).
- `BRICKS_IT_S3_ENDPOINT` / `BRICKS_IT_S3_ACCESS_KEY` / `BRICKS_IT_S3_SECRET_KEY` / `BRICKS_IT_S3_BUCKET` — опционально; без них media-этап пропускается (остальной lifecycle гоняется полностью).

Локальный запуск (Postgres из `docker-compose.yml` инициализирует базу `bricks` файлами миграций — для smoke нужна отдельная пустая база):

```bash
docker compose up -d
docker exec nuxt-bricks-db psql -U postgres -c 'CREATE DATABASE bricks_it;'
docker run -d --name bricks-it-minio -p 127.0.0.1:9000:9000 \
    -e MINIO_ROOT_USER=bricks -e MINIO_ROOT_PASSWORD=bricks-secret \
    minio/minio server /data

BRICKS_IT_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/bricks_it' \
BRICKS_IT_S3_ENDPOINT='http://127.0.0.1:9000' \
BRICKS_IT_S3_ACCESS_KEY=bricks BRICKS_IT_S3_SECRET_KEY=bricks-secret \
BRICKS_IT_S3_BUCKET=bricks-it npm run smoke:integration
```

Прогон идемпотентен (страница прошлого запуска зачищается, провижининг пользователя — upsert), CI-job гоняется с не-UTC `TZ` (регрессия таймзонных инвариантов A-07). Browser-E2E и axe-проверки (a11y) — следующий шаг этого трека, вместе с пунктом A-13 аудита.

## Production deployment и operability

### Health-пробы

Модуль отдаёт две открытые (LB не умеет авторизоваться) ручки без деталей окружения:

- `GET /api/bricks/health` — liveness: процесс жив и отвечает на HTTP;
- `GET /api/bricks/health/ready` — readiness: приложение готово принимать трафик. Ручка выбирает persistence-путь, который фактически обслуживает editorial API (`resolveReadinessTarget`, аудит A-05): кастомный storage-адаптер или сконфигурированная локальная БД → дёргает `IStorageAdapter.checkHealth` (дефолтный Postgres-адаптер — `SELECT 1`); адаптер без `checkHealth` НЕ считается готовым автоматически — выполняется fallback-проба `listPages()`, минимальный реальный editorial-запрос (ре-ревью A-05; реализуйте `checkHealth`, если листинг для вашего хранилища дорог); только `PROXY_URL`/`NUXT_BRICKS_SSR_PROXY_URL` без локальной БД → проба backend'а: со сконфигурированным health-эндпоинтом (`bricks.proxy.healthUrl` / env `NUXT_BRICKS_PROXY_HEALTH_URL`, runtime-override) — GET по нему, готовность **только при 2xx**; без него — reachability-fallback HEAD на `PROXY_URL` (ответ < 500, включая 404/405, — backend жив; **5xx**, сетевая ошибка или таймаут — не готов) — осознанное ограничение: неверный путь `PROXY_URL` или отсутствующий editorial API на живом хосте fallback не детектирует, для строгой проверки задайте `healthUrl`; ни БД, ни proxy, ни кастомного адаптера — **503**, а не зелёный ответ (в этой конфигурации editorial CRUD всё равно ответит 500). Недоступное хранилище/proxy → 503, таймаут проверки 5 с.

Обе ручки всегда обслуживаются локально — в том числе в proxy-режиме (`PROXY_URL` без локальной БД) они не уходят на backend через основной прокси-мидлварь, а readiness делает собственный прямой запрос к backend'у: GET по `bricks.proxy.healthUrl`, если он задан (готовность — только 2xx), иначе reachability-HEAD к `PROXY_URL`. Без `healthUrl` readiness подтверждает только сетевую достижимость backend'а — его editorial API и собственные зависимости не проверяются; с `healthUrl` глубина проверки определяется самим health-эндпоинтом backend'а, поэтому в production рекомендуется задать его (и/или мониторить readiness backend'а напрямую).

### Ошибки наружу

Непредвиденные ошибки editorial API уходят клиенту generic-конвертом: `500` с фиксированным `statusMessage` и `data.errorId`; полная ошибка с тем же `errorId` — только в server-логе. По `errorId` инцидент из ответа клиента находится в логах.

### Runbook

- **TLS и reverse proxy** — терминируйте TLS на reverse proxy перед Nitro; там же — внешний body-limit и (для корректных per-IP rate limit'ов) `NUXT_BRICKS_TRUST_PROXY=true` при ровно одном доверенном хопе (см. «Лимиты запросов и ресурсов»).
- **Миграции до рол-аута** — `npx bricks-migrate migrate` выполняет deploy/bootstrap job ролью с DDL-правами до запуска новой версии приложения; runtime-роли достаточно DML. Миграции forward-only: откат приложения на предыдущую версию безопасен без отката схемы (новые колонки/таблицы старым кодом игнорируются).
- **Backup/restore** — состояние живёт в PostgreSQL (страницы, версии, медиа-метаданные, пользователи/сессии) и S3-бакете (файлы под префиксами `bricks-media/`/`bricks-thumbnails/`). Бэкап: штатный `pg_dump`/managed-снапшоты + версионирование бакета; восстанавливать парой на близкие моменты времени (медиа-записи ссылаются на файлы по URL).
- **Secrets** — все секреты (`NUXT_BRICKS_DATABASE_URL`, S3-ключи, `NUXT_BASIC_AUTH_*`) доставляются env-переменными среды выполнения, в репозитории и образе их быть не должно. `docker-compose.yml` в корне — только локальная dev-среда (порт на localhost, дефолтный пароль переопределяется `POSTGRES_PASSWORD`).
- **Логи** — сервер пишет префиксованные `console`-логи (`[Bricks API]`, `[PostgreSQL]`, …); SQL и параметры запросов в production не логируются (контент страниц). Сбор/JSON-форматирование, метрики и tracing — зона платформы деплоя: Nitro-логи забираются со stdout любым коллектором.

## Остальные env

| Env                                                                                                | Назначение                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `PROXY_URL`                                                                                        | Внешний backend для `/api/*` (proxy-режим persistence) |
| `NUXT_BRICKS_DATABASE_URL`                                                                         | PostgreSQL для локального storage-адаптера             |
| `NUXT_BRICKS_VERSIONS_LIMIT`                                                                       | Глубина истории версий страниц (дефолт 5, `0` — выкл)  |
| `YANDEX_STORAGE_ACCESS_KEY_ID` / `YANDEX_STORAGE_SECRET_ACCESS_KEY` / `YANDEX_STORAGE_BUCKET_NAME` | S3-хранилище публикации медиа                          |

Подробности архитектуры — в `CLAUDE.md`.
