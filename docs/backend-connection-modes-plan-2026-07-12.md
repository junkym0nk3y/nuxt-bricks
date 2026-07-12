# План режимов подключения backend

Дата: 12 июля 2026 года
Статус: выверен по кодовой базе (ветка audit-p1-remediation, HEAD f5e3281); заменяет первоначальную ChatGPT-версию
Решения зафиксированы с заказчиком: hot lookup через public route, fail-fast для legacy production PROXY_URL, PR-разбивка «мельче»

## Цель

Три понятных сценария без массовой смены существующего API:

1. **external** — пользовательский HTTP-backend для страниц, версий и media metadata (потребители модуля не обязаны использовать встроенную backend-часть — достаточно реализовать ту же структуру ручек).
2. **builtin** — текущее встроенное решение с PostgreSQL.
3. **devProxy** — dev-only проксирование API host-проекта через PROXY_URL.

При любом data backend обработка файлов остаётся внутри nuxt-bricks: локальная Nitro-ручка принимает файл → sharp проверяет/оптимизирует → локальный S3 adapter загружает объект → в выбранный data backend уходят только URL и metadata.

## Зафиксированная модель

Выбор backend относится только к данным, а не к файлам.

| Часть системы         | external                           | builtin                            |
| --------------------- | ---------------------------------- | ---------------------------------- |
| Страницы и SEO-поля   | Пользовательский HTTP backend      | PostgreSQL adapter                 |
| Версии страниц        | Пользовательский HTTP backend      | PostgreSQL adapter                 |
| Media metadata        | Пользовательский HTTP backend      | Таблица bricks_media               |
| Binary media          | Локальный S3 handler nuxt-bricks   | Локальный S3 handler nuxt-bricks   |
| Обработка изображений | Локальный sharp                    | Локальный sharp                    |
| Thumbnail/media proxy | Локальные handlers nuxt-bricks     | Локальные handlers nuxt-bricks     |
| Browser-facing API    | Текущие локальные /api/bricks/\*\* | Текущие локальные /api/bricks/\*\* |

- external ≠ «проксировать весь /api/bricks на другой сервер»; external = «подставить HTTP-реализацию `IStorageAdapter` под существующие локальные handlers»;
- S3PublishAdapter и sharp — общая постоянная часть пакета;
- devProxy не выбирает data backend и никогда не перехватывает Bricks/S3 routes.

## Текущая реализация: проверенные факты

Все утверждения проверены по коду (исследование 2026-07-12):

- **Режим сейчас выводится, а не задаётся**: ручки `/api/bricks/**` регистрируются build-time безусловно (`module-setup.ts::registerBricksServerHandlers`, манифест `src/api-handlers.ts`); runtime proxy middleware (`server/middleware/proxy.client.ts` + `server/utils/proxyRouting.ts::shouldProxyRequest`) перехватывает `/api/bricks/**`, если нет `bricksDatabaseUrl` и есть `bricksProxyUrl`. Без обоих — локальная ручка падает 500 (`resolveConnectionString` бросает).
- **Баг trailing slash подтверждён** (black-box прогон + чтение h3-proxy): `pathRewrite {'^/api': 'api'}` + голая конкатенация `${target}${rewritedPath}` → `PROXY_URL` без завершающего слэша даёт `http://host:portapi/...` → 502. Со слэшем метод/путь/query/JSON body сохраняются, Host меняется на upstream, Bricks Basic Authorization и cookie `bricks-session` вырезаются (`stripBricksIdentityHeaders`), health-пути остаются локальными. E2e-теста proxy нет; `test/serverProxyRouting.spec.ts` покрывает только решение «проксировать или нет», не построение target URL.
- **Proxy middleware регистрируется и в production** (`src/module.ts:354-357`, без dev-гейта); активность гейтится только пустым `bricksProxyUrl`. Имя файла `proxy.client.ts` вводит в заблуждение — это server middleware.
- **`useApiClient.ts` — третья точка дублирования роутинга**: упрощённое зеркало (`startsWith('/api/bricks')` без segment-boundary и health-исключений, server-only `hasLocalDatabase`); SSR-endpoint берёт `bricksSsrProxyUrl || bricksProxyUrl`.
- **Registry** (`persistence/server/registry.ts`): `useBricksStorageAdapter()` лениво создаёт Postgres-дефолт, кастомный — через `setBricksStorageAdapter`; есть `hasCustomBricksStorageAdapter()` (readiness). `pg` импортируется динамически (`await import('pg')` в `postgres/client.ts`).
- **Readiness** (`readinessTarget.ts` + `health/ready.get.ts`): custom adapter || databaseUrl → `'adapter'` (`checkHealth` или fallback `listPages()`, timeout 5 с); иначе proxyUrl → probe; иначе 503.
- **Auth**: database-auth middleware напрямую проверяет `config.bricksDatabaseUrl` → 503 (`server/middleware/auth.ts`).
- **package.json**: `h3-proxy` — dependencies; `sharp` и `@aws-sdk/client-s3` — обязательные peers (в `peerDependenciesMeta` только `pg: optional`); `pg` — optional peer + devDep.
- **`SERVER_API_URL` в коде не существует** — стейл-запись CLAUDE.md, убрать при обновлении доков.
- **Горячий путь**: `getPageByPagename` вызывается только из `server/api/bricks/public/pages/[pagename].get.ts` — SSR каждого визита published-страницы (затем `toPublicPageProjection`, отбрасывает `thumbnailUrl` и `revision`). `getMedia`/`getMediaByUrl` — низкочастотные (media delete orchestration, `mock-api/s3-media-proxy`).
- **Локальный `POST /api/bricks/media` удалён** (2026-07-12, аудит A-01): записи `bricks_media` создаёт только сервер.

### Что уже подходит для новой схемы

- Все browser-facing handlers локальные и используют `IStorageAdapter`; прямых проверок database URL в CRUD-ручках нет.
- Media upload уже выполняет sharp → S3 → `storage.createMedia`; ошибка `createMedia` компенсируется удалением S3-объекта; delete — file-first.
- `IStorageAdapter` содержит все операции страниц, версий и media metadata; `IPublishAdapter` полностью отделён.
- Custom adapters уже регистрируются через `nuxt-bricks/persistence`.

Основная недостающая часть — HTTP-реализация `IStorageAdapter` и явный выбор режима.

## Решения

### Р1. `backend.mode` + конфигурируемый base-путь external

```typescript
export default defineNuxtConfig({
    modules: ['nuxt-bricks'],
    bricks: {
        backend: {
            mode: 'external', // 'builtin' | 'external', build-time
            // ПОЛНЫЙ префикс до «корня» bricks-API пользовательского сервера,
            // например https://api.example.com/my-cms — сегмент «bricks» не зашит
            url: process.env.BRICKS_BACKEND_URL,
            healthUrl: process.env.BRICKS_BACKEND_HEALTH_URL, // опционально
        },
        s3: {
            /* нужен в обоих режимах */
        },
    },
});
```

- `backend.url` — полный base-префикс; адаптер добавляет только относительные пути (см. контракт). Пользователь монтирует свой API где угодно.
- runtimeConfig: `bricksBackendUrl` / `bricksBackendToken` / `bricksBackendHealthUrl`; runtime-override через Nuxt-конвенцию `NUXT_BRICKS_BACKEND_URL/TOKEN/HEALTH_URL`. Сам `mode` в runtimeConfig НЕ хранится (ключ был бы переопределяем `NUXT_BRICKS_BACKEND_MODE` в обход build-валидации — ре-ревью PR2): носитель режима — build-time регистрация Nitro-плагина `externalBackendStorage`, который ставит дефолтную фабрику storage-адаптера (persistence/server/defaultStorage.ts).
- **Legacy-резолвер** (mode не задан):
    - есть `databaseUrl` → `builtin` + deprecation-info;
    - только PROXY_URL, **production → fail-fast ошибка сборки** с примером конфига `backend.mode=external`;
    - только PROXY_URL, dev → warning, devProxy работает для не-bricks `/api`;
    - ничего → `builtin` + текущий warning (совместимо с pack-smoke: 500/503).
- **Конфликты**: `external` + `databaseUrl` → warning (переходный период, потом ошибка); `builtin` + `backendUrl` → warning; `external` без url → build-warning (env может прийти на деплое) + понятная runtime-ошибка в адаптере/readiness; `auth.mode === 'database'` + `external` → **build-time ошибка** (не рантайм-503).
- `auth.mode = 'basic'` работает в обоих режимах.

### Р2. Контракт external backend

Относительные пути — от `backend.url` (`{base}`). Зеркало локальной структуры ручек:

| Метод адаптера      | HTTP external backend                | Примечания                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listPages`         | `GET {base}`                         | сводки без `schema` (`TBricksPageSummaryRow`)                                                                                                                                                                                                                     |
| `getPage`           | `GET {base}/:id`                     | 404 → `null`                                                                                                                                                                                                                                                      |
| `createPage`        | `POST {base}`                        | 409 `PAGENAME_CONFLICT`                                                                                                                                                                                                                                           |
| `updatePage`        | `PATCH {base}/:id`                   | только PATCH (partial-семантика `IUpdatePagePayload`); 409 `REVISION_CONFLICT`/`PAGENAME_CONFLICT`; **инвариант версионирования** (снапшот при изменении `schema` + prune до лимита) — обязанность external-сервера (контракт JSDoc `IStorageAdapter.updatePage`) |
| `deletePage`        | `DELETE {base}/:id`                  | 404 → `false`                                                                                                                                                                                                                                                     |
| `listPageVersions`  | `GET {base}/:id/versions`            |                                                                                                                                                                                                                                                                   |
| `getPageVersion`    | `GET {base}/:id/versions/:versionId` | 404 → `null`                                                                                                                                                                                                                                                      |
| `getPageByPagename` | `GET {base}/public/pages/:pagename`  | **горячий путь** (SSR каждого визита published-страницы); public projection; 404 (draft/нет) → `null`                                                                                                                                                             |
| `listMedia`         | `GET {base}/media`                   |                                                                                                                                                                                                                                                                   |
| `createMedia`       | `POST {base}/media`                  | **server-to-server-only дополнение** (локальный аналог удалён аудитом A-01); JSON: `url, filename, size, mimeType, category, alt?, svgContent?, uploadedAt?`; **идемпотентна по `url`** (повтор → существующая запись); без multipart/binary                      |
| `updateMedia`       | `PATCH {base}/media/:id`             |                                                                                                                                                                                                                                                                   |
| `deleteMedia`       | `DELETE {base}/media/:id`            | file-first порядок обеспечивает локальный handler                                                                                                                                                                                                                 |

Нюансы:

- **`getPageByPagename` через public route, НЕ list+find**: list+find означал бы O(N страниц) HTTP-вызова на каждый визит посетителя. Ручка `public/pages/:pagename` у external-сервера обязана быть по «той же структуре ручек» (в editorial API lookup'а по pagename нет вообще — только по id). Сегмент `public` — имя существующего пути в структуре, а не требование открытого доступа. Типовой зазор (projection = `Omit<IBricksPageRow, 'thumbnailUrl' | 'revision'>`) закрывается синтезом `thumbnailUrl: null, revision: 0, published: true` — единственный вызывающий сразу применяет `toPublicPageProjection`, которая эти поля отбрасывает (идемпотентна). JSDoc-предупреждение для будущих editorial-вызывающих + unit-тест идемпотентности.
- `getMedia`/`getMediaByUrl` — list+find fallback (низкочастотные); известное ограничение O(N) на больших медиатеках, point-lookup — follow-up.
- **Аутентификация**: `Authorization: Bearer <NUXT_BRICKS_BACKEND_TOKEN>` на каждом запросе адаптера (если задан). Browser identity (cookie `bricks-session`, Basic-креды) НЕ пробрасывается — заголовки строятся с нуля. `POST {base}/media` external-сервер должен принимать только с этим токеном.
- **Ошибки**: 409 с JSON-телом `data.code` (`PAGENAME_CONFLICT` | `REVISION_CONFLICT` — формат локального `toPageHttpError`); адаптер парсит лояльно (`data?.code ?? code`) → доменные `BricksPagenameConflictError` / `BricksRevisionConflictError`. Прочие ошибки → generic Error (ручки замаппят через `toHttpError` без утечки деталей).
- **Формат**: даты — ISO 8601; snake_case/camelCase нормализуется адаптером (`common/utils/case-transform.ts`); страница обязана содержать поля `IBricksPageRow`, media — `IMediaItem`. Таймаут + AbortSignal на каждый запрос (конвенция модуля).
- Отдельный новый публичный API не нужен — документировать контракт (`docs/external-backend-contract.md`) и добавить contract smoke.

### Р3. useApiClient и bricksSsrProxyUrl

В новой модели `/api/bricks/**` для браузера/SSR всегда локален:

- `/api/bricks` и `/mock-api` — всегда локальный base (segment-boundary проверка; общий util вместо третьей копии роутинга — proxyRouting server-only, переиспользовать напрямую нельзя → util в `modules/common/utils/`).
- Не-bricks `/api/*` на SSR продолжают уходить на `bricksSsrProxyUrl || bricksProxyUrl` (host-API проекта — легитимный переходный сценарий).
- `bricksSsrProxyUrl` (`NUXT_SERVER_CACHE_URL`) — deprecated с warning'ом; удаление — отдельный мажорный шаг.

### Media flow в обоих режимах (без изменений схемы)

- **Upload**: browser → `POST /api/bricks/media/upload` (multipart) → локальная валидация (лимиты, magic bytes) → sharp/санитизация SVG → `IPublishAdapter.uploadFile` (S3) → `activeStorageAdapter.createMedia` (builtin → `bricks_media`; external → JSON metadata на пользовательский backend) → ошибка metadata-записи компенсируется удалением S3-объекта.
- **Delete**: `DELETE /api/bricks/media/:id` → get record → file-first S3 delete → delete metadata; ошибка S3 → 502, запись остаётся (безопасный retry).
- **Thumbnail**: `/mock-api/s3-page-thumbnail` остаётся локальной; sharp — общий семафор; thumbnail URL — обычный PATCH через active storage adapter.
- **Media proxy**: `/mock-api/s3-media-proxy` локальна; `IPublishAdapter.isOwnedUrl` обязателен; external backend не вовлекается.

## Env

| Env                            | Назначение                                      |
| ------------------------------ | ----------------------------------------------- |
| NUXT_BRICKS_BACKEND_URL        | Server-only base URL external data backend      |
| NUXT_BRICKS_BACKEND_HEALTH_URL | Readiness URL external backend                  |
| NUXT_BRICKS_BACKEND_TOKEN      | Опциональный server-to-server Bearer credential |
| NUXT_BRICKS_DATABASE_URL       | PostgreSQL builtin adapter                      |
| NUXT*BRICKS_S3*\*              | Общий S3 asset pipeline                         |
| PROXY_URL                      | Только dev proxy для API host-проекта           |

External URL — server-only; browser продолжает обращаться к локальному `/api/bricks`, CORS для data backend не требуется.

## План реализации (3 PR)

PR-разбивка — для гранулярности ревью, **не** для независимых релизов: PR1 и PR2 —
stacked (fail-fast PR1 предлагает `backend.mode = 'external'`, который заработает
только с HttpStorageAdapter из PR2; SSR-роутинг useApiClient — PR3). Merge в main
допустим последовательно, но релиз npm-версии — только после PR2 (минимум) с PR3
следом (ре-ревью 2026-07-12).

### PR1 — resolver `backend.mode` + devProxy-фикс + зависимости

Этап 1. Резолвер:

- [x] Create: `src/module-backend-config.ts` — чистый резолвер options+env → `{ mode, warnings, errors }` (тестируем без Nuxt)
- [x] Modify: `src/module.ts` — опция `backend` в `IBricksModuleOptions`, вызов валидации, fail-fast production PROXY_URL-only, build-ошибка database-auth+external
- [x] Modify: `src/module-runtime-config.ts` — заполнение `bricksBackendUrl/Token/HealthUrl`; сам `mode` в runtimeConfig НЕ пишется (носитель — регистрация Nitro-плагина, см. «Решения» и журнал ре-ревью PR2); лог одного разрешённого mode без URL/секретов
- [x] Create: `test/moduleBackendConfig.spec.ts` — все комбинации mode×db×proxy×url×dev/prod

Этап 2. devProxy:

- [x] Rename: `src/runtime/server/middleware/proxy.client.ts` → `devProxy.ts`; регистрация в `src/module.ts` только при `nuxt.options.dev`
- [x] Modify: `src/runtime/server/utils/proxyRouting.ts` — `shouldProxyRequest` теряет `hasLocalDatabase` (`/api/bricks` и `/mock-api` — никогда не проксируются); Create чистую `buildProxyTargetUrl(baseUrl, pathnameWithQuery)` с нормализацией trailing slash (`joinURL` из `ufo`)
- [x] Заменить `createProxyEventHandler` (h3-proxy) на `proxyRequest` из h3; перенести `stripBricksIdentityHeaders` как есть; timeout + стабильный 502; сохранить method/query/body/статус/заголовки
- [x] Modify: `test/serverProxyRouting.spec.ts` — покрыть построение target URL (сейчас источник 502-бага не покрыт)

Этап 3. Зависимости:

- [x] `package.json`: `sharp`, `@aws-sdk/client-s3` → dependencies (фактический runtime-контракт); `pg` остаётся optional peer + devDep; удалить `h3-proxy`
- [x] `scripts/pack-smoke.mjs`: проверка отсутствия h3-proxy в дереве; существующие ожидания (500 с кредами без конфига, ready 503) сохранить для «mode не задан»

### PR2 — HttpStorageAdapter + readiness/auth

- [x] Create: `src/runtime/modules/persistence/server/http/httpStorageAdapter.ts` (+ `http/httpClient.ts` — fetch с timeout/AbortSignal, Bearer, парсер ошибок)
- [x] Реализовать все методы `IStorageAdapter` по контракту Р2; `getPageByPagename` — через public route; `getMedia`/`getMediaByUrl` — list+find; `checkHealth` — GET `bricksBackendHealthUrl` (2xx) либо дешёвый `GET {base}`
- [x] Modify: `persistence/server/registry.ts` — `useBricksStorageAdapter()` выбирает: custom (сеттер) > `external` → HTTP-адаптер > `builtin` → Postgres
- [x] Modify: `persistence/server/postgres/client.ts` — сообщение `resolveConnectionString` без совета PROXY_URL; понятная ошибка при недоступном `import('pg')` («npm install pg — только для builtin»)
- [x] Modify: `server/utils/readinessTarget.ts` + `api/bricks/health/ready.get.ts` — входы `hasExternalBackend`/`isLegacyBackendMode` (флаги build-time регистрации Nitro-плагинов, не runtimeConfig-ключ); `external` → target `'adapter'` (существующая ветка покрывает `checkHealth` HTTP-адаптера); ветка `'proxy'` остаётся legacy-only
- [x] `server/middleware/auth.ts` — runtime-defense: проверка `bricksDatabaseUrl` + отказ database-auth при активном external-флаге (build-time фабрика defaultStorage; закрывает env-обход build-ошибки PR1, ре-ревью итерация 3)
- [x] Create: `test/persistenceHttpStorageAdapter.spec.ts` (маппинг методов, case-нормализация, 409 → доменные ошибки по `data.code`, 404 → null/false, Bearer, таймаут, идемпотентный createMedia, идемпотентность public-проекции)
- [x] Modify: `test/serverReadinessTarget.spec.ts`
- [x] Add: external media integration smoke (fake backend — простой node http-сервер): upload → sharp → S3 → JSON metadata; compensation delete S3 при отказе external; file-first delete; thumbnail PATCH. Media/publish handlers НЕ меняются.

### PR3 — useApiClient + документация

- [x] Modify: `common/composables/useApiClient.ts` по Р3; общий util локальных путей в `modules/common/utils/`; unit-тест чистой функции решения local-vs-external
- [x] Create: `docs/external-backend-contract.md` — контракт Р2 целиком (относительные пути от `backend.url`, Bearer, 409 `data.code`, идемпотентность media, инвариант версионирования, ISO-даты, обязательные поля `IBricksPageRow`/`IMediaItem`)
- [x] Update: README, CLAUDE.md (env-таблица, режимы; убрать стейл `SERVER_API_URL`), примеры трёх конфигураций, transition-гайд PROXY_URL → backend.mode/devProxy, deprecation `bricksSsrProxyUrl`

## Тестовая матрица

Unit:

- `moduleBackendConfig.spec.ts` — комбинации backend config, включая legacy-ошибку prod PROXY_URL-only.
- `persistenceHttpStorageAdapter.spec.ts` — request mapping, snake_case/camelCase, conflict mapping, Bearer, timeout.
- `serverProxyRouting.spec.ts` — target URL с/без trailing slash и с base path; exclusions `/api/bricks` и `/mock-api` без параметра БД.
- `serverReadinessTarget.spec.ts` — external → adapter.

Integration (external fake backend):

1. Создать страницу через текущий local `/api/bricks` → external получил page payload.
2. Загрузить raster через local media upload → sharp обработал → объект в MinIO/S3 → external получил только JSON URL/metadata.
3. Смоделировать отказ metadata → compensation delete S3-объекта.
4. Удалить media → file-first порядок.
5. Public page lookup и версии.

Builtin: текущий Postgres + MinIO lifecycle без изменения paths.

Dev proxy: реальный upstream, основные HTTP-методы; PROXY_URL с/без завершающего слэша; `/api/items` проксируется; `/api/bricks` и `/mock-api` локальны; production-сборка middleware не регистрирует.

Pack smoke: external consumer собирается без pg; sharp/AWS SDK приходят как dependencies; builtin без pg падает с понятной install-командой; h3-proxy отсутствует.

## Обратная совместимость

1. `backend.mode` вводится явно; database URL без mode временно означает builtin + warning.
2. PROXY_URL без mode в production — fail-fast ошибка сборки с миграционной инструкцией (тихо сломанного прода не будет; **breaking change** — осознанно).
3. В dev PROXY_URL маппится только в devProxy (не-bricks `/api`).
4. Все текущие browser paths и payloads сохраняются; SQL-миграции не меняются → rollback безопасен.

## Ограничение scope

Не делаем: переименование `/api/bricks` routes; namespace `/storage`; версия в URL; перенос S3/sharp на external; новый external auth mode; package splitting; изменение схемы media flow (compensation upload / file-first delete уже есть); `getPageByPagename` list+find.

Follow-up (вне этих PR): `bricks-migrate verify` (readiness с проверкой таблиц); удаление `bricksSsrProxyUrl`; point-lookup ручки для media; отвязка custom auth adapter от databaseUrl; database-auth в external mode.

## Критерии готовности

- Есть явный builtin/external data mode; PROXY_URL не выбирает persistence.
- Все текущие `/api/bricks` и `/mock-api` paths сохранены; S3 upload, thumbnail и media proxy всегда локальны.
- External backend получает только page/media data и S3 URLs, не binary; ошибка external metadata write удаляет загруженный S3-объект.
- External consumer не требует pg; builtin consumer получает точную подсказку об установке pg.
- PROXY_URL работает с target с/без завершающего слэша; dev proxy никогда не забирает `/api/bricks`/`/mock-api` и отсутствует в production.
- Existing builtin integration lifecycle зелёный; новый external + S3 integration lifecycle зелёный.

## Поправки к первоначальной (ChatGPT) версии плана

1. **`getPageByPagename` ≠ list+find** — это SSR-горячий путь каждого визита published-страницы; вместо O(N) — `GET {base}/public/pages/:pagename` с маппингом projection→row. List+find остаётся только для низкочастотных `getMedia`/`getMediaByUrl`.
2. **`backend.url` = полный base-префикс** — сегмент `bricks` в контракте не зашит, пути только относительные.
3. **`POST {base}/media` — явно server-to-server-only**: локальный аналог удалён аудитом A-01, «та же структура ручек» здесь нарушается сознательно — оговорено в контракте вместе с Bearer.
4. **`updatePage` — только PATCH** (было «PUT или PATCH» — двусмысленность убрана).
5. **Добавлен этап useApiClient** — третья точка дублирования роутинга; зафиксирована судьба `bricksSsrProxyUrl` (deprecated, не удаляется сразу).
6. **auth database + external → build-time ошибка**, а не рантайм-503.
7. **Readiness без новой ветки** — external проходит существующим target `'adapter'` через `checkHealth`; `bricks-migrate verify` вынесен в follow-up.
8. **devProxy конкретизирован**: rename `proxy.client.ts` → `devProxy.ts`, гейт `nuxt.options.dev`, чистая функция target URL (текущие тесты 502-баг не ловят).
9. **`shouldProxyRequest` теряет `hasLocalDatabase`** — `/api/bricks` всегда локален, сигнатура и тесты упрощаются.
10. **Production PROXY_URL-only → fail-fast ошибка сборки** (момент отказа уточнён: сборка, не рантайм).
11. **Формат 409 конкретизирован**: JSON-тело с `data.code`, идентичное локальному `toPageHttpError`; лояльный парсер в адаптере.
12. **PR-разбивка мельче**: PR1 resolver+devProxy+deps, PR2 адаптер+readiness, PR3 клиент+доки (у ChatGPT первый PR включал и адаптер).

## Риски

- **Breaking change** для прод-потребителей PROXY_URL (проксирование `/api/bricks` в production исчезает) — митигация: fail-fast с миграционной инструкцией.
- Инвариант версионирования на external-сервере не проверяется автоматически — только контракт-док + integration smoke с fake backend, который его реализует.
- `getMedia`/`getMediaByUrl` list+find — O(N) на больших медиатеках (builder-only, известное ограничение).
- Синтезированные поля в `getPageByPagename` — защита: unit-тест идемпотентности проекции + JSDoc-предупреждение.
- sharp/AWS SDK в dependencies увеличивают install-footprint потребителей — осознанное решение (фактический runtime-контракт).

## Журнал прогресса

- 2026-07-12 — план выверен по кодовой базе и заменил первоначальную ChatGPT-версию; решения (hot lookup, fail-fast, PR-scope) зафиксированы с заказчиком. Реализация не начата.
- 2026-07-12 — **PR1 code-complete** (этапы 1–3; merge/релиз — stacked, см. ре-ревью ниже):
    - Этап 1: `src/module-backend-config.ts` — чистый резолвер `{mode, infos, warnings, errors}` (external/builtin/legacy-ветки; database-auth+external → error; production PROXY_URL-only → fail-fast error с миграционной инструкцией); опция `backend` в `IBricksModuleOptions`; `module-runtime-config.ts` заполняет `bricksBackendMode/Url/Token/HealthUrl` (токен — только env) и логирует один разрешённый mode без URL/секретов; `module.ts` кидает при `errors`; `test/moduleBackendConfig.spec.ts` — 14 тестов на ключевые комбинации mode×db×proxy×url×dev/prod (декартово покрытие не заявляется).
    - Этап 2: `proxy.client.ts` → `devProxy.ts`, регистрация только при `nuxt.options.dev`; `shouldProxyRequest(pathname)` без `hasLocalDatabase` (`/api/bricks` и `/mock-api` никогда не проксируются — health-исключения стали не нужны); `buildProxyTargetUrl` через `joinURL` (ufo) — 502-баг trailing slash закрыт и покрыт тестами; `resolveRequestPathWithQuery` доносит query до upstream; h3-proxy заменён на `proxyRequest` из h3 (Host не пробрасывается — эквивалент changeOrigin), таймаут 30 с через `AbortSignal.timeout` + стабильный 502; `stripBricksIdentityHeaders` перенесён как есть.
    - Этап 3: `sharp` и `@aws-sdk/client-s3` → dependencies, `h3-proxy` удалён, добавлен `ufo`; pack-smoke проверяет отсутствие h3-proxy и присутствие sharp/aws-sdk в dependencies и node_modules consumer.
    - Сопутствующее: стейл-комментарии на `proxy.client.ts` обновлены (module-setup.ts, useApiClient.ts, postgres/client.ts); playground получил явный `backend.mode: 'builtin'`.
    - Верификация: vue-tsc чисто, oxlint чисто, vitest 497/497 (61 файл), depcruise/knip чисто, `nuxi prepare playground` логирует `Backend mode: builtin`; `npm run smoke:pack` зелёный (включая новые dep-проверки).
    - Runtime-верификация devProxy (playground dev + echo-upstream, PROXY_URL **без** завершающего слэша): GET/POST `/api/items` проксируются с query/body/content-type, Host = upstream; cookie `bricks-session` вырезана, проектные cookie доезжают; `/api/bricks/health` 200 локально, `/api/bricks` 401 локально, `/mock-api/*` локально; мёртвый upstream → стабильный 502. Бывший 502-баг trailing slash не воспроизводится.
    - Осталось для PR1: коммит (не делался — по запросу).
- 2026-07-12 — **ре-ревью PR1, итерация 2** (4 finding'а внешнего ревью, все закрыты):
    - [P1 → решение] Миграционный путь production PROXY_URL: fail-fast остаётся в PR1 (решение заказчика — тихо сломанного прода не должно быть; без fail-fast прод PROXY_URL-потребителей ломался бы молча — devProxy стал dev-only). Следствие: **PR1–PR2 — stacked**: PR1 не мержится/не релизится в npm отдельно — предлагаемый ошибкой `backend.mode = 'external'` заработает только с HttpStorageAdapter из PR2 (registry пока всегда создаёт Postgres-адаптер, SSR-роутинг useApiClient — PR3). Формулировка журнала «реализован целиком» заменена на «code-complete».
    - [P1 → fix] devProxy сохранял не все заголовки/статусы: h3 `proxyRequest` глушит входной `accept` (ignoredHeaders), а fetch по умолчанию разворачивал upstream 3xx в финальный ответ без `Location`. Handler вынесен в фабрику `createDevProxyEventHandler` (`server/utils/devProxyHandler.ts`, middleware — тонкая обвязка runtimeConfig): `accept` восстанавливается явно, `redirect: 'manual'` пробрасывает 3xx+Location как есть. Добавлен `test/serverDevProxy.spec.ts` — 11 интеграционных тестов на реальных сокетах (accept passthrough, 302+Location, body/content-type, cookie stripping basic/database, локальность `/api/bricks`+`/mock-api`, мёртвый upstream → 502, зависший upstream → 502 по таймауту, PROXY_URL без слэша).
    - [P2 → fix] `npm run format:check` падал на этом файле — прогнан prettier, весь format:check зелёный.
    - [P3 → fix] Журнал: фактически 14 тестов резолвера (не 16), «все комбинации» заменено на честную формулировку.
    - Ре-верификация: vue-tsc/oxlint/depcruise/knip чисто, vitest 508/508 (62 файла), format:check зелёный.
- 2026-07-12 — **PR2 code-complete** (все чекбоксы; коммит — по запросу):
    - `persistence/server/http/httpClient.ts` — server-to-server транспорт: заголовки строятся с нуля (browser identity не пробрасывается), Bearer при заданном токене, `AbortSignal.timeout` (дефолт 10 с), `redirect: 'error'`, ошибки → `BricksBackendRequestError` (статус + лояльно распарсенный `data.code ?? code`); `probeHealth` — health URL либо `GET {base}`, готовность только 2xx.
    - `persistence/server/http/httpStorageAdapter.ts` — все методы `IStorageAdapter` по контракту Р2: `getPageByPagename` через `public/pages/:pagename` (синтез `thumbnailUrl: null / revision: 0 / published: true` + JSDoc-предупреждение editorial-вызывающим), `getMedia`/`getMediaByUrl` — list+find, 404 → null/false, 409 → доменные ошибки (`createPage` → pagename; `updatePage` — `PAGENAME_CONFLICT` при rename, иначе revision), идемпотентный `createMedia` (409 → повторное чтение по url), top-level snake_case → camelCase (`toCamelCaseShallow`, schema не трогается), listMedia принимает и массив, и envelope `{ items }`.
    - `registry.ts` — дефолт по `runtimeConfig.bricksBackendMode`: custom (сеттер) > external → HTTP > builtin → Postgres; `postgres/client.ts` — сообщение без совета PROXY_URL + понятная ошибка недоступного `import('pg')`.
    - Readiness: `resolveReadinessTarget` получил вход `backendMode` — `external` всегда `'adapter'` (checkHealth HTTP-адаптера), ветка `'proxy'` — legacy-only; `auth.ts` — комментарий о runtime-defense (основная защита — build-ошибка PR1).
    - Тесты: `persistenceHttpStorageAdapter.spec.ts` — 34 юнита (маппинг/нормализация/конфликты/404/Bearer/таймаут/идемпотентность createMedia и public-проекции); `persistenceExternalMediaSmoke.spec.ts` — 5 integration-смоков на реальном node http fake-backend + реальном sharp (PNG → WebP по magic bytes) + in-memory S3: external получает только JSON metadata с Bearer (binary — в S3), отказ metadata → компенсационное удаление S3-объекта, file-first delete (порядок ops журналируется, ошибка S3 → 502 и запись остаётся), thumbnail PATCH; `serverReadinessTarget.spec.ts` дополнен external-кейсами.
    - Верификация: vue-tsc чисто, oxlint чисто, vitest 549/549 (64 файла), format:check зелёный, depcruise (463 модуля) и knip чисто.
    - Вне PR2 (критерий плана целиком): tarball-level external lifecycle в `smoke:integration` (сейчас скрипт — builtin/Postgres) — добить вместе с PR3-доками либо отдельным шагом.
- 2026-07-13 — **ре-ревью PR2, итерация 2** (2 P1 + 3 P2 внешнего ревью, все закрыты):
    - [P1 → fix] Upstream-статусы становились browser-facing: `BricksBackendRequestError.statusCode` подпадал под контракт `toHttpError` («объект со `statusCode` — готовая H3-ошибка») — 401 неверного Bearer или 5xx backend'а ушли бы браузеру, минуя generic 500-envelope с errorId (401 к тому же читался бы UI как истёкшая Bricks-сессия). Поле переименовано в `upstreamStatus`; наружу маппятся только контрактные значения (404 → null/false, 409 → доменные ошибки). Тест: у ошибки нет свойства `statusCode`.
    - [P1 → fix] Readiness мог быть зелёным при неработающем builtin: explicit `builtin` без БД + любой PROXY_URL давал target `'proxy'` (проба постороннего host API → 200, а `/api/bricks` падает). `resolveReadinessTarget` получил `isLegacyBackendMode`: proxy-ветка доступна ТОЛЬКО при legacy-резолюции (mode не задан); носитель legacy-признака — build-time регистрация Nitro-плагина `legacyBackendMode` (`server/utils/legacyBackendFlag.ts`).
    - [P2 → fix] `backend.mode` был runtime-переключаем через `NUXT_BRICKS_BACKEND_MODE` (Nitro auto-env поверх runtimeConfig-ключа) в обход build-валидации database-auth+external. Ключ `bricksBackendMode` удалён из runtimeConfig целиком; носитель режима — build-time регистрация Nitro-плагина `externalBackendStorage`, ставящего дефолтную фабрику storage-адаптера во внутренний слот `persistence/server/defaultStorage.ts` (registry: custom-сеттер > фабрика плагина > Postgres; `nuxt-bricks/persistence` новых экспортов не получил). Runtime-переопределяемыми остались только URL/token/healthUrl.
    - [P2 → fix] Ложные доменные конфликты: 409 без машиночитаемого кода маппился в pagename-конфликт (createPage) / revision-конфликт (updatePage) — посторонний 409 backend'а (квота, состояние) заставил бы UI предлагать rename или refetch-and-retry. Теперь на доменные ошибки маппятся только точные `PAGENAME_CONFLICT`/`REVISION_CONFLICT`; прочие 409 — generic error. Идемпотентность createMedia сохранена (409 → повторное чтение по url).
    - [P2 → fix] Nitro-level external smoke: `scripts/external-smoke.mjs` (+ `external-smoke-backend.mjs` — fake backend по паттерну integration-lifecycle), `npm run smoke:external`, отдельный CI-job `external`. Tarball → чистый consumer (`backend.mode: 'external'`, in-memory publish adapter через публичный `setBricksPublishAdapter`) → nuxi build → boot с `NUXT_BRICKS_BACKEND_URL/TOKEN` → lifecycle через РЕАЛЬНЫЕ локальные ручки: readiness 200 (adapter-путь), POST/GET/PATCH страницы, public lookup (проекция без editor-полей), multipart upload (sharp → webp в consumer; на backend — только JSON metadata с Bearer, multipart не долетает), media delete; отдельный boot подтверждает, что `NUXT_BRICKS_BACKEND_MODE=builtin` игнорируется (режим build-time). Прогнан локально — зелёный.
    - Верификация: vue-tsc/oxlint/depcruise/knip чисто, vitest 552/552 (64 файла), format:check зелёный, `smoke:external` зелёный.
- 2026-07-13 — **ре-ревью PR2, итерация 3** (2 P2 + 1 P3 внешнего ревью, все закрыты):
    - [P2 → fix] Build-time запрет auth.mode=database + backend.mode=external оставался runtime-обходимым: `auth.ts` проверял только наличие `bricksDatabaseUrl`, а `NUXT_BRICKS_AUTH_MODE=database` + `NUXT_BRICKS_DATABASE_URL` переопределяемы env'ом. `handleDatabaseAuth` теперь сверяется с неизменяемым носителем external-режима (build-time фабрика `defaultStorage`, ставится только плагином `externalBackendStorage`) и отвечает 503 `Database auth is not available in external backend mode`. Smoke-покрытие: третий boot в `external-smoke.mjs` (`runDatabaseAuthDefenseCheck`) утверждает 503 и текст external-defense в теле (отличает от 503 по недоступной БД).
    - [P2 → fix] Проверка mode-immutability в `external-smoke.mjs` была подвержена гонке за порт: после `kill('SIGKILL')` следующий boot стартовал, не дождавшись exit предыдущего процесса — запрос мог попасть в старый сервер, а новый умереть с EADDRINUSE (ложноположительный результат). Добавлен `waitForExit` в `smoke-shared.mjs`; все kill→boot-переходы смока ждут фактического завершения child-процесса.
    - [P3 → fix] Чеклисты PR1/PR2 приведены к фактической архитектуре: `bricksBackendMode` в runtimeConfig не пишется (носитель — регистрация Nitro-плагина), вход readiness — флаги `hasExternalBackend`/`isLegacyBackendMode`, пункт auth.ts дополнен external-defense. Журнальные записи прошлых итераций не переписывались (история).
    - Верификация: vue-tsc/oxlint/depcruise чисто, vitest 552/552 (64 файла), format:check зелёный, `smoke:external` зелёный (в логе виден отказ external-defense).
- 2026-07-13 — **PR3 code-complete** (все чекбоксы; коммит — по запросу):
    - `common/utils/localApiPaths.ts` — единственная копия правила «`/api/bricks/**` и `/mock-api/**` всегда локальны» (segment-boundary): `matchesPathPrefix`, `isLocalApiPathname`, `isLocalApiRequest` (терпит query/hash, абсолютные URL и пути без ведущего слэша — не локальные). Серверный `proxyRouting.ts` переиспользует предикат (вторая копия удалена); `useApiClient.ts` — третья копия удалена вместе с `hasLocalDatabase`: bricks/mock-api пути локальны независимо от БД и PROXY_URL, не-bricks `/api/*` на SSR по-прежнему уходят на `bricksSsrProxyUrl || bricksProxyUrl`. Тест: `test/commonLocalApiPaths.spec.ts` (8 юнитов чистой функции решения local-vs-external).
    - Deprecation `bricksSsrProxyUrl`: build-time warning в `module-runtime-config.ts` при заданном `proxy.ssrUrl` / `NUXT_SERVER_CACHE_URL` (удаление — отдельный мажорный шаг).
    - `docs/external-backend-contract.md` — контракт Р2 целиком: конфигурация/env, транспорт (camelCase-запросы, top-level snake→camel нормализация ответов, ISO-даты, Bearer, таймаут 10 с, redirect: 'error'), таблица ручек, формат ошибок (404, 409 `data.code` — только точные коды), таблицы обязательных полей `IBricksPageRow`/`IMediaItem`, public lookup (горячий путь, синтез проекции), идемпотентность `POST media` по url, инвариант версионирования, readiness; референс — `scripts/external-smoke-backend.mjs`.
    - README: ссылка на контракт-док из раздела external; новый раздел «Dev-прокси host-API (PROXY_URL)» — dev-only семантика, transition-гайд с legacy PROXY_URL (fail-fast → external/builtin), deprecation `proxy.ssrUrl`/`NUXT_SERVER_CACHE_URL`. CLAUDE.md правок не потребовал: после консолидации 547396d эксплуатационные таблицы живут в README, стейл `SERVER_API_URL` уже убран.
    - Обновлены README `common/utils` (строка `localApiPaths.ts`) и `common/composables` (описание useApiClient).
    - Верификация: vue-tsc чисто, oxlint чисто, vitest 560/560 (65 файлов), depcruise (468 модулей) и knip чисто, format:check зелёный.
- 2026-07-13 — **ре-ревью PR3** (1 P1 + 1 P2 внешнего ревью, оба закрыты):
    - [P1 → fix] Контракт external backend не попадал в npm-пакет: README и build-time ошибка legacy PROXY_URL ссылаются на `docs/external-backend-contract.md`, но `files` публиковал только dist и migrations — установившие пакет документа не получали. Файл добавлен в `package.json#files` (npm pack: 16.2kB docs/external-backend-contract.md); pack-smoke проверяет его наличие в установленном пакете.
    - [P2 → fix] Runtime-override deprecated-ключа активировался молча: build-time warning видит только nuxt.config/NUXT_SERVER_CACHE_URL сборки, а `NUXT_BRICKS_SSR_PROXY_URL` Nitro применяет после module setup. Добавлен всегда регистрируемый Nitro-плагин `server/plugins/deprecationWarnings.ts` — предупреждение на старте сервера по финальному значению runtimeConfig (ловит оба пути); README-абзац deprecation дополнен env-именем и двухуровневой схемой предупреждений.
