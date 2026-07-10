# nuxt-bricks

Визуальный билдер лендингов для Nuxt 3 с drag-and-drop компонентами. Самостоятельный Nuxt Module: дашборд страниц на `/bricks`, редактор на `/bricks/<pagename>`, превью на `/preview/<pagename>` (префиксы настраиваются — см. «Маршруты и поверхности»).

## Авторизация

Защищённые пути (в обоих режимах одна матрица; префиксы страниц — из `bricks.routes`): `<builderPrefix>/**` (менеджер страниц + редактор), `<previewPrefix>/**` (превью рендера), `/mock-api/s3-*` (снапшот превью страницы, media-proxy) и весь editorial API `/api/bricks/**`, включая GET (списки страниц с черновиками и полной schema, медиатека, версии). Публична только public read-model `GET/HEAD /api/bricks/public/**` — published-проекции для рендера.

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

### Режим `database`

Пользователи в Postgres (scrypt-хеш пароля), страница логина `/bricks/login`, отзываемые cookie-сессии в БД (HttpOnly, SameSite=Lax, Secure в production; в БД хранится только SHA-256 токена). Брутфорс логина ограничен: 5 неудач за 15 минут на пару IP+логин → блокировка на 15 минут (`429`).

Канонический bootstrap схемы БД — версионированные миграции (`migrations/*.sql`, поставляются в npm-пакете):

```bash
npm run bricks:migrate -- status    # applied/pending список (или npx bricks-migrate)
npm run bricks:migrate -- migrate   # применить pending миграции
```

Подключение — `--url`, иначе env `NUXT_BRICKS_DATABASE_URL` / `DATABASE_URL`. Миграции применяет deploy/bootstrap job ролью с DDL-правами; runtime-роли приложения DDL не нужен. Реестр применённых — таблица `bricks_schema_migrations`; серия идёт под advisory lock. Runtime-DDL адаптеры не выполняют: миграции — единственный источник схемы (непримененные проявятся ошибкой запроса с подсказкой `npx bricks-migrate migrate` в логе сервера; локальный docker-compose монтирует `migrations/` в initdb).

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

- Rate limiter логина живёт в памяти процесса — при нескольких репликах лимит слабеет пропорционально их числу.
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

Контракт кастомных адаптеров: `IPublishAdapter` требует `buildFileKey(kind, filename)` и managed-семантику `deleteFile`/`isOwnedUrl`; `IStorageAdapter` — `getMedia(id)` и идемпотентный по `url` `createMedia` (повторная регистрация возвращает существующую запись). Компилятор укажет на недостающие методы при обновлении.

### Лимиты запросов и ресурсов (ingress)

Серверные ручки модуля сами ограничивают принимаемые данные и ресурсы обработки:

- Тело запроса читается с жёстким лимитом: заявленный `Content-Length` сверх лимита отклоняется (413) до чтения, фактический поток обрывается сразу при превышении — chunked-запрос без заголовка не обходит границу. Лимиты: загрузка медиа — `media.maxUploadSizeMb` (изображения, дефолт 10 МБ) / `media.maxVideoUploadSizeMb` (видео, дефолт 100 МБ) + 1 МБ на multipart-конверт; снапшот превью страницы — 10 МБ; JSON editorial API — 4 МБ (вдвое больше максимально валидной schema).
- Содержимое загрузки подтверждается magic bytes: файл, чьё содержимое не является заявленным изображением/видео/SVG, отклоняется с 400 — MIME и расширению из формы модуль не доверяет.
- Обработка изображений (sharp) ограничена 100 мегапикселями на вход (декомпрессионные бомбы) и общим семафором одновременности (4 конвертации, очередь 32, сверх — 503).
- Ingest-ручки (`POST /api/bricks/media/upload`, `POST /mock-api/s3-page-thumbnail`) дополнительно ограничены 30 запросами в минуту с одного IP (429 + `Retry-After`). Лимитер per-process — multi-replica деплой ослабляет его пропорционально числу реплик.
- Клиентский IP для rate limiter'ов (upload/thumbnail/login) по умолчанию — только socket-адрес соединения: заголовкам `x-forwarded-*` модуль не доверяет, подделать IP клиент не может. За reverse proxy socket-адрес у всех запросов одинаковый, и per-IP лимиты схлопываются в один общий bucket — для этого случая есть опт-ин `bricks.trustProxy: true` (или env `NUXT_BRICKS_TRUST_PROXY=true`, работает без ребилда): берётся **последний** элемент `x-forwarded-for` — тот, что дописал ближайший прокси-хоп; первый элемент (клиентский spoof при аппендящем прокси) лимит не обходит. Включать только когда приложение действительно стоит за собственным прокси; рассчитано ровно на один доверенный хоп — при цепочке прокси внешний хоп должен перезаписывать заголовок.

Эти границы — вторая линия обороны: в production перед приложением стоит держать reverse proxy с собственным лимитом тела запроса (например, `client_max_body_size` в nginx чуть выше лимита видео) и, при необходимости, внешним rate limiting.

## Маршрутизация published-страниц

Опубликованные страницы обслуживаются двумя статическими маршрутами, которые модуль регистрирует при сборке: `/:pagename` и `/:urlPrefix+/:pagename` (сегменты ограничены regex `[a-z0-9-]+`). Страница резолвится на лету прямым запросом public read-model по `pagename` — publish/unpublish вступают в силу сразу, без пересборки и перезагрузки.

Правила сосуществования с маршрутами вашего приложения:

- Статические страницы приложения (`pages/about.vue` и т.п.) всегда побеждают маршруты bricks — vue-router ранжирует их выше.
- URL с символами вне `[a-z0-9-]` (точки, подчёркивания, файлы статики) маршрутами bricks не перехватываются.
- Ограничение: корневой динамический маршрут приложения без custom regex (`pages/[slug].vue`, `pages/[...slug].vue`) проиграет ранжирование маршрутам bricks — одно- и двухсегментные URL, не занятые published-страницей, получат 404 от bricks вместо вашей страницы. Обходной путь — задать своему маршруту custom regex через `definePageMeta({ path })` либо развести пространства URL через `urlPrefix`.

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

Модуль не задаёт глобальных стилей вашему приложению: весь reset (box-sizing, ссылки, инпуты/кнопки, сглаживание шрифтов) действует только на страницах билдера (`body.bricks-page`), CSS-переменные и transition-имена носят префикс `bricks-`, Swiper CSS загружается лениво вместе с блоком «Слайдер». Собственный reset/normalize вашего приложения — ваша зона ответственности.

Published/preview-страницы получают минимальный fallback **нулевой специфичности** (`:where()`), поэтому любое одноимённое правило вашего проекта его перебивает:

- `:where(html) { font-size: 10px }` — rem-база bricks-контента (совпадает с базой канваса билдера). Если проект задаёт собственную базу (`html { font-size: ... }`, см. `remBase` в конфиге breakpoints) — она побеждает.
- `:where(body) { margin: 0 }` — полноэкранный лендинг без браузерной рамки.
- `:where(.bricks-container, .bricks-container *) { box-sizing: border-box }` и `:where(.bricks-container a) { color: inherit }` — прежнее поведение bricks-блоков внутри контейнера.

## Остальные env

| Env                                                                                                | Назначение                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `PROXY_URL`                                                                                        | Внешний backend для `/api/*` (proxy-режим persistence) |
| `NUXT_BRICKS_DATABASE_URL`                                                                         | PostgreSQL для локального storage-адаптера             |
| `NUXT_BRICKS_VERSIONS_LIMIT`                                                                       | Глубина истории версий страниц (дефолт 5, `0` — выкл)  |
| `YANDEX_STORAGE_ACCESS_KEY_ID` / `YANDEX_STORAGE_SECRET_ACCESS_KEY` / `YANDEX_STORAGE_BUCKET_NAME` | S3-хранилище публикации медиа                          |

Подробности архитектуры — в `CLAUDE.md`.
