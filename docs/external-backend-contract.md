# Контракт external data backend

Контракт HTTP-ручек, которые обязан реализовать пользовательский backend при
`bricks.backend.mode = 'external'`. Потребители модуля не обязаны использовать
встроенную PostgreSQL-часть — достаточно реализовать описанную здесь структуру
ручек.

Модель разделения (см. `docs/backend-connection-modes-plan-2026-07-12.md`):
external backend хранит только **данные** — страницы, версии страниц и
media-метаданные. Файлы (S3), обработка изображений (sharp), thumbnail/media
proxy и все browser-facing `/api/bricks/**` остаются локальными ручками
nuxt-bricks. Браузер с external backend'ом напрямую не общается — CORS не
требуется.

Референс-реализация — fake backend nitro-смока:
`scripts/external-smoke-backend.mjs` (запуск: `npm run smoke:external`).

## Конфигурация

```typescript
export default defineNuxtConfig({
    modules: ['nuxt-bricks'],
    bricks: {
        backend: {
            mode: 'external',
            // ПОЛНЫЙ префикс до «корня» bricks-API вашего сервера —
            // сегмент «bricks» не зашит, монтируйте API где угодно
            url: process.env.BRICKS_BACKEND_URL, // например https://api.example.com/my-cms
            healthUrl: process.env.BRICKS_BACKEND_HEALTH_URL, // опционально
        },
        s3: {
            /* S3 нужен в обоих режимах — файлы всегда локальный pipeline */
        },
    },
});
```

| Env                              | Назначение                                                       |
| -------------------------------- | ---------------------------------------------------------------- |
| `NUXT_BRICKS_BACKEND_URL`        | Server-only base URL (runtime-override `backend.url`)            |
| `NUXT_BRICKS_BACKEND_TOKEN`      | Опциональный Bearer-токен server-to-server запросов (только env) |
| `NUXT_BRICKS_BACKEND_HEALTH_URL` | Readiness-эндпоинт (runtime-override `backend.healthUrl`)        |

Сам `mode` — build-time и через env НЕ переопределяется.

## Общие требования транспорта

- Все пути — **относительные от `backend.url`** (`{base}` ниже); соединение
  путей нормализует слэши (`joinURL`), trailing slash в `backend.url` не важен.
- Формат — JSON. Тела запросов (POST/PATCH) приходят в **camelCase** как есть.
  Ответы сервер может отдавать в snake_case или camelCase: адаптер нормализует
  **только top-level ключи** snake_case → camelCase; вложенные значения
  (включая `schema`) не трогаются.
- Даты — строки **ISO 8601** (`createdAt`, `updatedAt`, `uploadedAt`,
  `pageUpdatedAt`).
- **Аутентификация**: при заданном `NUXT_BRICKS_BACKEND_TOKEN` каждый запрос
  несёт `Authorization: Bearer <токен>`. Browser identity (cookie
  `bricks-session`, Basic-креды) НЕ пробрасывается — заголовки строятся с нуля.
- **Таймаут** — 10 с на запрос (`AbortSignal.timeout`); ответьте быстрее.
- **Редиректы запрещены** (`redirect: 'error'`): 3xx = ошибка запроса.
- Пустое тело / 204 трактуются как `null` (нормально для DELETE).

## Структура ручек

Зеркало локальной структуры `/api/bricks/**` относительно `{base}`:

| Метод HTTP | Путь                             | Операция                              | Особенности                                                                              |
| ---------- | -------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET        | `{base}`                         | Список страниц (сводки без `schema`)  | Массив `TBricksPageSummaryRow`                                                           |
| POST       | `{base}`                         | Создать страницу                      | 409 `PAGENAME_CONFLICT`                                                                  |
| GET        | `{base}/:id`                     | Страница по id (полная, со `schema`)  | 404 → «не найдено»                                                                       |
| PATCH      | `{base}/:id`                     | Частичное обновление страницы         | **только PATCH**; 409 `REVISION_CONFLICT`/`PAGENAME_CONFLICT`; инвариант версионирования |
| DELETE     | `{base}/:id`                     | Удалить страницу                      | 404 → «не найдено»                                                                       |
| GET        | `{base}/:id/versions`            | Сводки версий страницы (новые сверху) | Массив `IPageVersionSummary`                                                             |
| GET        | `{base}/:id/versions/:versionId` | Полный снапшот версии                 | Путь SSR превью версии; 404 → «не найдено» (в т.ч. чужая версия)                         |
| GET        | `{base}/public/pages/:pagename`  | **Public lookup** по pagename         | Горячий путь SSR; 404 для draft/несуществующей                                           |
| GET        | `{base}/media`                   | Список media-метаданных               | Массив либо envelope `{ items: [...] }`                                                  |
| POST       | `{base}/media`                   | Регистрация media-метаданных          | **Server-to-server-only**; идемпотентна по `url`                                         |
| PATCH      | `{base}/media/:id`               | Обновление метаданных                 | Поля: `filename`, `alt`, `category` (частично)                                           |
| DELETE     | `{base}/media/:id`               | Удалить media-запись                  | Только метаданные — файл удаляет nuxt-bricks                                             |

### Ошибки

- **404** — контрактное «не найдено»: адаптер превращает в `null`
  (get-операции) или `false` (delete). Ручки nuxt-bricks вернут браузеру 404.
- **409** — конфликт с машиночитаемым кодом в JSON-теле по формату
  `{ "data": { "code": "..." } }` (как локальный `toPageHttpError`; top-level
  `"code"` тоже принимается). Распознаются только точные коды:
    - `PAGENAME_CONFLICT` — pagename занят (POST страницы; PATCH при rename);
    - `REVISION_CONFLICT` — не совпала `expectedRevision` (PATCH страницы).

    409 без кода или с незнакомым кодом — generic-ошибка (браузер получит 500 с
    errorId), доменной интерпретации не будет.

- Прочие статусы (401, 5xx, …) — generic-ошибка; upstream-статус браузеру НЕ
  пробрасывается.

### Страницы

Полная строка страницы (`IBricksPageRow`) — обязательные поля:

| Поле              | Тип                      | Примечание                          |
| ----------------- | ------------------------ | ----------------------------------- |
| `id`              | number                   |                                     |
| `pagename`        | string                   | Уникален                            |
| `title`           | string \| null           |                                     |
| `description`     | string \| null           |                                     |
| `keywords`        | string \| null           |                                     |
| `backgroundColor` | string \| null           |                                     |
| `layout`          | string \| null           |                                     |
| `socialImage`     | string \| null           |                                     |
| `urlPrefix`       | string \| null           |                                     |
| `subdomain`       | string \| null           |                                     |
| `thumbnailUrl`    | string \| null           | Машинное поле (пишется PATCH'ем)    |
| `schema`          | object (`IBricksSchema`) | Хранить как есть (JSONB-семантика)  |
| `published`       | boolean                  |                                     |
| `revision`        | number                   | Монотонный счётчик изменений строки |
| `createdAt`       | string (ISO 8601)        |                                     |
| `updatedAt`       | string (ISO 8601)        |                                     |

- `GET {base}` отдаёт сводки — те же поля **без `schema`**
  (`TBricksPageSummaryRow`). Полная строка — только point-lookup.
- `POST {base}` принимает `ICreatePagePayload` (`pagename`, `schema`,
  опциональные meta-поля, `published?`); сервер генерирует `id`, `revision`,
  даты.
- `PATCH {base}/:id` принимает `IUpdatePagePayload` — **partial**-семантика:
  обновлять только присланные поля. Поле `expectedRevision` — precondition
  optimistic locking, НЕ записываемое: при несовпадении с текущей `revision`
  ответить 409 `REVISION_CONFLICT`, ничего не меняя; без поля — запись без
  precondition (last-write-wins). Каждое успешное изменение инкрементирует
  `revision`.

**Инвариант версионирования** (обязанность external-сервера, автоматически не
проверяется): если в PATCH-payload присутствует `schema` и лимит версий больше
нуля, сервер обязан атомарно снапшотить ПРЕЖНЮЮ строку в историю версий и
обрезать (prune) историю страницы до лимита. Лимит — ваша конфигурация
(builtin использует `bricks.versionsLimit`).

Снапшот обязан копировать и `thumbnailUrl` прежней строки — галерея версий в
дашборде показывает превью каждого сохранённого состояния. Копируется именно
значение на момент снапшота: снимок канваса приезжает отдельным PATCH'ем ПОСЛЕ
сохранения, поэтому `thumbnailUrl` страницы в этот момент — кадр того
состояния, которое снапшот и уносит в историю. Заполнять версию снимком,
пришедшим после неё, нельзя: он показывает уже новое содержимое.

Версии:

- `IPageVersionSummary`: `id`, `pageId`, `thumbnailUrl` (string | null),
  `pageUpdatedAt` (updated_at исходной строки на момент снапшота, string | null),
  `createdAt`.
- `IPageVersion` (полный снапшот): summary + meta-поля страницы + `schema`,
  `published`.

`pageUpdatedAt` обязан быть и в сводке, а не только в полном снапшоте: даты
означают разное. `createdAt` — момент снапшота, то есть момент, когда состояние
**вытеснили**; `pageUpdatedAt` — момент, когда его **сохранили**. Пользователю в
галерее версий показывают вторую, иначе кадр подписывается временем следующего
сохранения (расхождение доходит до минут).

`thumbnailUrl` версии — обычный URL файла в хранилище публикации; сами файлы
загружает и убирает nuxt-bricks (ключ уникален на загрузку, сироты чистятся по
префиксу страницы). От backend требуется только хранить и отдавать значение.

### Public lookup (горячий путь)

`GET {base}/public/pages/:pagename` вызывается при SSR **каждого визита**
published-страницы — поэтому lookup по pagename обязан быть точечным
(list+find на каждый визит недопустим). Требования:

- отдавать страницу только если `published: true`; draft и несуществующая —
  404;
- формат — публичная проекция: поля `IBricksPageRow` **без** `thumbnailUrl` и
  `revision` (можно отдавать и полную строку — лишние поля не мешают);
- сегмент `public` — имя пути в структуре, а не требование открытого доступа:
  запросы приходят server-to-server с тем же Bearer.

Зазор проекции адаптер закрывает синтезом `thumbnailUrl: null, revision: 0,
published: true` — единственный вызывающий сразу применяет
`toPublicPageProjection`, отбрасывающую эти поля.

### Media

External backend хранит только **метаданные** (`IMediaItem`); binary живёт в
S3 и загружается локальным pipeline'ом nuxt-bricks (валидация → sharp/санитизация
SVG → S3 → регистрация метаданных).

`IMediaItem` — обязательные поля:

| Поле           | Тип               | Примечание                                  |
| -------------- | ----------------- | ------------------------------------------- |
| `id`           | number            |                                             |
| `url`          | string            | **Уникален** — ключ идемпотентности         |
| `filename`     | string            |                                             |
| `alt`          | string            | Пустая строка, если не задан                |
| `size`         | number            | Байты                                       |
| `uploadedAt`   | string (ISO 8601) |                                             |
| `mimeType`     | string            |                                             |
| `category`     | string            |                                             |
| `thumbnailUrl` | string?           | Опционально                                 |
| `svgContent`   | string \| null    | Санитизированный inline SVG (для SVG-медиа) |

- `GET {base}/media` — плоский массив либо envelope `{ items: [...] }`.
- `POST {base}/media` — JSON `{ url, filename, size, mimeType, category, alt?,
svgContent?, uploadedAt? }`; сервер генерирует `id` (и `uploadedAt`, если не
  прислан). **Никакого multipart/binary**. Ручка — server-to-server-only
  (локальный browser-facing аналог удалён аудитом A-01): принимайте её только
  с вашим Bearer-токеном.
- **Идемпотентность по `url`**: повторная регистрация того же `url` (гонка
  импорта, ретрай) обязана вернуть существующую запись — не падать и не
  создавать дубликат. Ответ 409 адаптер дополнительно разруливает повторным
  чтением списка по `url`, но полагаться стоит на серверную идемпотентность.
- `DELETE {base}/media/:id` удаляет только метаданные: file-first порядок
  (сначала S3-объект, потом запись) обеспечивает локальный handler; ошибка
  записи метаданных при upload компенсируется удалением S3-объекта тоже
  локально.

### Readiness

`GET /api/bricks/health/ready` nuxt-bricks проверяет external backend:
`GET` по `backend.healthUrl`, а если он не задан — дешёвая проба `GET {base}`
(контрактный список страниц). Готовность — только 2xx; таймаут 5 с на probe.
