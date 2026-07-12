# Комплексный аудит nuxt-bricks

**Дата:** 12 июля 2026 года  
**Версия:** `0.1.0`  
**Коммит:** `9f5c895dbca2f63002d6a75789ff6fae2629508b` (`feat(refactor): svg sanitize`)  
**Объект аудита:** Nuxt-модуль визуального конструктора, playground, server API, Postgres/S3 persistence, CLI, npm-пакет, тесты и документация.

## Резюме

Проект имеет сильную инженерную основу: модульные границы проверяются автоматически, типизация и линтеры проходят, публичная DTO-проекция построена через allowlist, запросы к Postgres параметризованы, загрузка медиа проверяет фактический тип и санитизирует SVG, а npm-пакет успешно устанавливается и запускается в чистом consumer-проекте.

Текущая версия **не готова к публичному production-релизу без исправления двух блокеров**:

1. проверка принадлежности S3-ключа допускает URL с сегментами `..`, из-за чего фактический URL может выйти из managed namespace;
2. сервер принимает структурно некорректные и циклические схемы страниц, которые способны сломать опубликованный SSR-рендер.

Дополнительно выявлены девять проблем среднего и четыре низкого приоритета. Наиболее важные из них: неполная CSRF-защита, обход rate limit перебором имён пользователей, ложноположительный readiness, отсутствие реального Postgres/S3 и browser-E2E гейта, timezone-зависимые даты и неточное сравнение subdomain.

| Уровень      | Количество | Решение                                                    |
| ------------ | ---------: | ---------------------------------------------------------- |
| Высокий / P0 |          2 | Блокирует релиз (A-01 — P1 в single-tenant, см. пересмотр) |
| Средний / P1 |          8 | Закрыть до production-rollout                              |
| Низкий / P2  |          5 | Включить в ближайший технический спринт                    |

В рамках аудита не обнаружены подтверждённые unauthenticated RCE, SQL injection, обход основной матрицы авторизации или известные уязвимости npm-зависимостей. Это не заменяет внешний penetration test.

## Верификация и пересмотр приоритетов (2026-07-12)

Все находки перепроверены против кода на `HEAD`; **фактических ошибок не выявлено** — каждый code-level claim подтверждается, устаревших пунктов нет. Скорректирована **калибровка серьёзности** трёх находок с учётом фактической модели угроз (см. «Архитектурные ограничения»): система **single-tenant с единственным уровнем editor-доступа**, поэтому находки, гейтированные аутентифицированным editor'ом, эксплуатируются только доверенным админом, который и так владеет бакетом, страницами и БД.

- **A-01** — механизм подтверждён исполняемо, но это **не кросс-хостовый SSRF**, а escape managed-namespace _внутри того же бакета_ (хост и бакет зафиксированы `startsWith`-префиксом). Единственный воспроизводимо доказанный вектор — media-proxy (`fetch` нормализует `../`); для `deleteFile` резолвинг `../` зависит от кодирования пути S3 SDK и не гарантирован. Практически — чтение соседних объектов своего же бакета аутентифицированным админом. **P0 сохраняется как обязательный до multi-tenant / до публичного npm-релиза, но в текущей single-tenant модели практический вес — P1.**
- **A-02** — краш подтверждён (`null` в `components` роняет SSR-рендер `[pagename].vue`; циклический граф → неограниченная рекурсия). Основной реалистичный сценарий — **случайная порча** схемы при импорте JSON (свой же published-рендер), а не атака. **P0 по влиянию на доступность сохраняется**; злоумышленный вектор гейтирован доверенным editor'ом.
- **A-11** — `scrypt N=2^14, r=8, p=1` — это документированный OWASP-минимум (с `p=5` вместо `p=1`); формулировка «ниже baseline» жёстче реальности, практический риск низкий. **Понижено до P2.**

Итоговая рекомендация release gate скорректирована соответственно (см. раздел «Итоговый release gate»).

## Объём и методика

Проверены:

- архитектура Nuxt-модуля и runtime-слоёв;
- маршруты builder/public API, auth и session lifecycle;
- payload/schema validation, sanitization и SSR-render pipeline;
- Postgres-адаптер, SQL-миграции и optimistic locking;
- S3 upload, регистрация, proxy и delete policy;
- data sources, SSR-сетевые ограничения и публичная проекция;
- интерфейс билдера на базовые accessibility-риски;
- CLI, package metadata, документация и release-процесс;
- тесты, типы, форматирование, статический анализ, сборка, bundle budgets;
- содержимое и установка собранного npm-пакета;
- lockfile через `npm audit`, включая production-only граф.

Статический аудит выполнен по всему репозиторию (около 67,5 тыс. строк; 354 TypeScript- и 100 Vue-файлов на момент инвентаризации). Ключевые security-находки дополнительно подтверждены исполняемыми минимальными примерами.

### Ограничения

- Не поднимались реальные Postgres, S3/MinIO и внешний proxy backend.
- Не выполнялся ручной кросс-браузерный UX/a11y-аудит и browser-E2E.
- Не проводились DAST, нагрузочные испытания и внешний penetration test.
- Аудит начат с чистого `HEAD`. Во время работы в дереве появились параллельные изменения в стилях, loader, `docs/audit-tech-sprint2.md` и новый `test/styleIsolation.spec.ts`; они не изменялись в рамках этого отчёта и не приписываются аудиту.

## Матрица проверок

| Проверка                | Результат             | Комментарий                                                                                                          |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run lint:check`    | ✅                    | oxlint, stylelint, dependency-cruiser и knip; 455 модулей, 1 588 зависимостей, нарушений границ нет                  |
| `npm run type-check`    | ✅                    | `vue-tsc --noEmit`                                                                                                   |
| `npm test`              | ✅                    | Финальный снимок: 50 файлов, 365 тестов; до параллельного WIP — 49 файлов, 360 тестов                                |
| `npm run build`         | ✅                    | module dist около 2,78 МБ                                                                                            |
| `npm run dev:build`     | ✅ с предупреждениями | builder chunk около 1 049 КБ minified / 316 КБ gzip; несколько компонентов импортируются и статически, и динамически |
| `npm run budget:bundle` | ✅                    | entry 110 КБ gzip при лимите 122; published 120 КБ при лимите 132                                                    |
| `npm audit --omit=dev`  | ✅                    | 0 известных уязвимостей                                                                                              |
| `npm audit`             | ✅                    | 0 известных уязвимостей во всём lockfile                                                                             |
| `npm run smoke:pack`    | ✅                    | tarball установлен в чистый consumer, consumer собран и запущен, auth HTTP matrix прошла                             |
| `npm pack --dry-run`    | ✅                    | 1,2 МБ tarball, 2,8 МБ unpacked, 934 файла                                                                           |
| `npm run format:check`  | ✅                    | Финальное дерево проходит; исходный `HEAD` имел один Prettier diff в `docs/audit-tech-sprint2.md`, исправленный WIP  |

Smoke-тест сознательно принимает `500` от авторизованного `/api/bricks` без подключённой БД. Поэтому его успешный результат подтверждает упаковку, boot и auth routing, но не persistence lifecycle.

## Приоритетный реестр

| ID   | Приоритет    | Область                 | Суть                                                                  |
| ---- | ------------ | ----------------------- | --------------------------------------------------------------------- |
| A-01 | P0 / высокий | S3, media               | Неканонический URL обходит managed namespace                          |
| A-02 | P0 / высокий | Schema, SSR             | Невалидная/циклическая схема сохраняется и ломает public render       |
| A-03 | P1 / средний | Web security            | Нет серверной CSRF-проверки unsafe-запросов                           |
| A-04 | P1 / средний | Auth availability       | Rate limit обходится сменой username; Basic Auth не лимитируется      |
| A-05 | P1 / средний | Operations              | Readiness возвращает `200`, когда persistence фактически недоступен   |
| A-06 | P1 / средний | QA/release              | Нет production-like Postgres/S3 и browser-E2E гейта                   |
| A-07 | P1 / средний | Database                | Абсолютные даты хранятся как `TIMESTAMP` без timezone                 |
| A-08 | P1 / средний | Routing                 | Subdomain проверяется подстрокой hostname                             |
| A-09 | P1 / средний | SSR/data sources        | Нет лимита ответа, числа запросов и общего SSR deadline               |
| A-10 | P1 / средний | Migrations              | Глобальное имя trigger-функции и отсутствие checksum миграций         |
| A-11 | P2 / низкий  | Password storage        | Параметры scrypt на уровне OWASP-минимума (пересмотрено с P1)         |
| A-12 | P2 / низкий  | CLI                     | Пароль попадает в argv либо отображается при вводе                    |
| A-13 | P2 / низкий  | Accessibility           | Интерактивные `div`, безымянные icon-buttons и неполный modal pattern |
| A-14 | P2 / низкий  | npm/release             | Нет MIT LICENSE в пакете, repository metadata расходится с remote     |
| A-15 | P2 / низкий  | Performance/maintenance | Builder bundle без бюджета; deprecated transitive packages            |

## Детальные находки

### A-01. Неканонический S3 URL обходит managed namespace

**Приоритет:** P0 / высокий (в single-tenant — практически P1, см. «Верификация и пересмотр приоритетов»).  
**Верифицировано исполняемо (2026-07-12):** это escape managed-namespace _внутри того же бакета_, не кросс-хостовый SSRF — хост и бакет зафиксированы `startsWith`-префиксом. Единственный воспроизводимо доказанный вектор — media-proxy (`s3-media-proxy.post.ts:66`, `fetch(media.url, { redirect: 'error' })` нормализует `../` по WHATWG-парсеру и читает объект вне префиксов). Для `deleteFile` (S3 `DeleteObjectCommand`) ключ уходит литералом — резолвинг `../` зависит от кодирования пути SDK и однозначно не подтверждён.  
**Файлы:** `src/runtime/modules/persistence/server/s3/s3KeyPolicy.ts:28-49`, `src/runtime/server/api/bricks/media/index.post.ts:13-39`.

`extractStorageKey()` проверяет сырой `startsWith()` и вырезает строку без URL-канонизации. Для примера:

```text
https://storage.example/shared/bricks-media/../private.txt
```

функция возвращает `bricks-media/../private.txt`, а `isManagedStorageKey()` считает его управляемым. При этом URL-парсер и HTTP-клиент нормализуют адрес до:

```text
https://storage.example/shared/private.txt
```

То же воспроизводится с `%2e%2e`. S3 допускает относительные сегменты в object key при определённых ограничениях, а period-only segments могут нормализоваться промежуточными системами; следовательно, строковый prefix check недостаточен ([AWS S3 Object Key Naming Guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html)).

Риск усиливает legacy `POST /api/bricks/media`: endpoint всё ещё зарегистрирован, хотя комментарий ссылается на удалённый `/mock-api/s3-image`, и принимает от клиента URL/metadata уже якобы загруженного объекта. После регистрации URL становится доверенным для media proxy.

**Воздействие:** нарушение заявленной гарантии, что модуль в shared bucket работает только со своими префиксами; чтение/регистрация чужого публичного объекта и некорректная delete-семантика. Требуется авторизованный editor, но это нарушение security boundary.

**Исправление:**

1. Разбирать и нормализовать адрес через `new URL()`; проверять точные protocol/origin/bucket path.
2. Отклонять raw и percent-encoded `.`, `..`, backslash, control characters и неоднозначное двойное кодирование.
3. Сопоставлять ключ только после decode/canonicalize и проверять round-trip `key -> canonical URL`.
4. Удалить legacy endpoint или разрешать регистрацию только результата серверного upload flow.
5. Применить единую функцию к register/proxy/delete.

**Критерий приёмки:** table-driven тесты для `../`, `%2e%2e`, `%252e%252e`, backslash, query/fragment, похожего origin и похожего bucket; ни register, ни proxy, ни delete не выходят за managed prefix.

### A-02. Сервер сохраняет невалидные и циклические схемы

**Приоритет:** P0 / высокий (по влиянию на доступность; злоумышленный вектор гейтирован доверенным editor'ом — основной реалистичный сценарий — случайная порча схемы при импорте JSON).  
**Файлы:** `src/runtime/modules/persistence/server/utils/payloadValidation.ts:88-115`, `src/runtime/modules/render/pages/[pagename].vue:80-99`, `src/runtime/modules/render/composables/useRendererLayouts.ts:31-83`, `src/runtime/modules/builder/shell/sidebar/composables/useSchemaFileTransfer.ts:68-77`.

`validateSchema()` проверяет только объект, массив `components`, общий размер и сложность. Исполняемая проверка подтвердила, что payloads с `components: [null]`, `[42]` и `[{}]` принимаются. Public renderer сразу обращается к `c.isHidden` и `component.brickPath`; `null` приводит к runtime exception.

Связи layout-компонентов также не проверяются как граф. Цикл `A.children = [B]`, `B.children = [A]` способен запустить неограниченную рекурсию render pipeline. Импорт JSON в builder требует лишь наличие массива, поэтому повреждение возможно не только злоумышленно, но и случайно.

**Воздействие:** авторизованный editor может опубликовать страницу, которая стабильно отвечает ошибкой SSR либо исчерпывает стек/CPU. Ошибка затрагивает публичную доступность.

**Исправление:** ввести versioned schema contract: объект компонента, допустимые типы, обязательные `id`, `componentName`, `brickPath`, уникальность ID, существование parent/children, согласованность двусторонних связей, acyclic graph и максимальную render depth. Ту же проверку использовать при import, create, update, publish и restore.

**Критерий приёмки:** API возвращает `400` для примитивов, duplicate/dangling IDs, self-loop и multi-node cycle; legacy-схемы либо мигрируются, либо отклоняются с диагностикой; adversarial render-тест не падает и не зависает.

### A-03. CSRF-защита unsafe API неполна

**Приоритет:** P1 / средний.  
**Файлы:** `src/runtime/server/middleware/auth.ts:204-232`, `src/runtime/server/utils/auth/sessionCookie.ts:52-66`, `src/runtime/modules/common/composables/useApiClient.ts:145-155`, `src/runtime/modules/persistence/server/utils/requestBodyLimits.ts:151-168`.

Auth middleware проверяет логин, но не `Origin`, `Referer`, Fetch Metadata или серверный CSRF token. Session cookie использует `SameSite=Lax`, а локальный backend не создаёт и не валидирует CSRF-токен. Заголовок `X-CSRFToken` относится только к внешнему Django backend. JSON reader не требует `application/json`.

`SameSite` полезен как defense-in-depth, но не заменяет token/origin validation и не защищает от всех same-site сценариев с sibling subdomain ([OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)). Для Basic Auth риск также релевантен из-за автоматически повторяемых браузером credentials.

**Исправление:** централизованно отклонять unsafe methods без доверенного same-origin `Origin`/`Referer` или валидного CSRF token/custom header; учитывать reverse proxy trusted origin; требовать корректный JSON content type; по возможности использовать `__Host-` cookie.

**Критерий приёмки:** HTTP-тесты для cross-origin form/plain-text, same-site sibling origin, отсутствующего Origin, корректного proxy origin и валидного token/header.

### A-04. Auth throttling допускает обход и CPU/DB exhaustion

**Приоритет:** P1 / средний.  
**Файлы:** `src/runtime/server/utils/auth/loginRateLimiter.ts:1-36`, `src/runtime/server/api/bricks/auth/login.post.ts:94-113`, `src/runtime/server/middleware/auth.ts:82-116`.

Database login лимитируется по ключу `IP|username`. Атакующий может менять username, каждый раз проходить DB lookup и дорогой dummy scrypt, не достигая пяти ошибок по одному ключу. Basic Auth не имеет rate limiting. Состояние database limiter хранится per-process, поэтому несколько реплик дополнительно умножают допустимую скорость.

**Исправление:** комбинировать per-IP и per-IP+identity buckets, добавить общий bounded semaphore/queue для scrypt и внешний shared limiter для multi-replica; защитить Basic Auth на ingress либо внутри middleware; корректно учитывать только доверенные proxy headers.

**Критерий приёмки:** смена 100 username с одного IP приводит к `429` до выполнения нового scrypt; число параллельных derive operations ограничено; multi-instance стратегия задокументирована и протестирована.

### A-05. Readiness может быть зелёным при неработающем API

**Приоритет:** P1 / средний.  
**Файлы:** `src/runtime/server/api/bricks/health/ready.get.ts:30-51`, `src/runtime/modules/persistence/server/postgres/postgresStorageAdapter.ts:149-160`, `scripts/pack-smoke.mjs`.

Без `bricksDatabaseUrl` default adapter пропускает health check, и `/api/bricks/health/ready` возвращает `200`. Если внешний proxy при этом тоже не настроен, protected CRUD фактически отвечает `500`. В proxy mode downstream также не проверяется. Pack smoke закрепляет это расхождение: авторизованный `500` без БД считается допустимым.

**Исправление:** конфигурация без DB и без proxy должна давать readiness `503`; proxy mode должен иметь downstream probe либо явный callback/health contract адаптера. Liveness оставить независимым.

**Критерий приёмки:** матрица DB up/down, proxy up/down и custom adapter; readiness становится `200` только когда выбранный persistence path действительно обслуживает минимальный запрос.

### A-06. Нет production-like integration и browser-E2E release gate

**Приоритет:** P1 / средний.  
**Файлы:** `package.json:52-76`, `.github/workflows/*`, `scripts/pack-smoke.mjs`.

360 unit-тестов дают хорошее покрытие функций, но в scripts отсутствуют integration suite, coverage thresholds и browser runner. Clean-consumer smoke не проверяет migrations, CRUD, publish/public projection, version restore, session persistence, реальный S3 upload/proxy/delete и полный builder workflow.

**Исправление:** добавить CI jobs с Postgres и MinIO/S3-compatible storage, применением миграций из tarball и black-box HTTP lifecycle. Затем browser-E2E: login → create/import → edit → save → publish → public reload → revision conflict/restore. Ввести отдельные coverage thresholds для security/persistence/session кода.

**Критерий приёмки:** релизный workflow не может пройти при несовместимой миграции, сломанном SQL mapping, недоступном storage, падении public render или нарушении auth/session flow.

### A-07. Абсолютные даты хранятся без timezone

**Приоритет:** P1 / средний.  
**Файлы:** `migrations/0001_init.sql:22-23,64-65,78-79,93-95,111`, session и page adapters.

Все абсолютные timestamps, включая `expires_at`, созданы как `TIMESTAMP` without time zone. `node-postgres` преобразует `DATE`/`TIMESTAMP` в локальном timezone процесса; один и тот же DB value будет означать разные instants при разных `TZ` приложения ([node-postgres type parsing](https://node-postgres.com/features/types), [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html)). Локальная проверка под `Europe/Moscow` преобразовала `2026-07-12 12:00:00` в `2026-07-12T09:00:00.000Z`.

**Воздействие:** преждевременное/запоздалое истечение сессии, неверная сортировка/отображение и расхождение между репликами с разным `TZ`.

**Исправление:** новая forward-only migration на `TIMESTAMPTZ`, с явным `AT TIME ZONE` для известного legacy timezone; нормализовать API в ISO 8601 UTC и тестировать DB/app с различными timezone.

### A-08. Subdomain сопоставляется подстрокой

**Приоритет:** P1 / средний.  
**Файл:** `src/runtime/middleware/bricks-page-layout.global.ts:124-133`.

`currentHost.includes(page.subdomain)` считает `notpromo.example` подходящим для subdomain `promo`; на SSR в `Host` также может присутствовать порт. Это создаёт неверную маршрутизацию и потенциально показывает страницу на нежелательном hostname.

**Исправление:** нормализовать hostname через URL parser и сравнивать точный первый label либо полный hostname из явного mapping. Учесть IDNA, регистр, trailing dot, порт и trusted forwarded host.

### A-09. Data sources не имеют полного resource budget

**Приоритет:** P1 / средний.  
**Файлы:** `src/runtime/modules/render/composables/useDataSourceClient.ts:30-52`, `src/runtime/modules/render/composables/useRendererDataSources.ts:95-156`.

Есть allowlist, timeout, deduplication и concurrency limit — это хорошие базовые меры. Однако `$fetch` буферизует ответ без `maxResponseBytes`; число запросов на страницу и общий SSR deadline не ограничены. Схема допускает до 5 000 компонентов, каждый brick может объявлять источники данных.

**Воздействие:** авторизованный editor способен создать страницу с высоким memory/latency cost; медленный набор разрешённых backend-запросов удерживает SSR даже при ограниченной параллельности.

**Исправление:** ограничить bytes на ответ, requests на страницу и суммарный wall-clock budget; прерывать оставшиеся запросы через `AbortController`; добавить метрики timeout/bytes/cache hit и безопасный fallback props.

### A-10. Миграции могут конфликтовать с host DB и не обнаруживают drift

**Приоритет:** P1 / средний.  
**Файлы:** `migrations/0001_init.sql:32-45`, `src/cli/bricks-migrate.mjs:108-123`.

Миграция выполняет `CREATE OR REPLACE FUNCTION update_updated_at_column()` с общим именем. В shared schema это может перезаписать функцию host-приложения. Реестр `bricks_schema_migrations` хранит только имя файла, поэтому изменение уже применённого SQL не обнаруживается.

**Исправление:** создать namespaced функцию вроде `bricks_update_updated_at_column`, перевести triggers отдельной forward migration; добавить SHA-256 checksum и отказ при drift. Не редактировать уже выпущенную `0001` без механизма совместимости.

### A-11. Параметры scrypt ниже актуального baseline

**Приоритет:** P2 / низкий (пересмотрено с P1 2026-07-12: `N=2^14` — документированный OWASP-минимум с `p=5`; текущий `p=1` немного ниже, но практический риск низкий, самоописывающий формат хеша уже допускает плавную миграцию).  
**Файлы:** `src/runtime/server/utils/auth/passwords.ts:11-27`, `src/cli/bricks-hash-password.mjs`.

Используется `N=2^14, r=8, p=1`. Текущая рекомендация OWASP для scrypt начинается с `N=2^17, r=8, p=1` либо эквивалентных trade-off конфигураций; вариант с `N=2^14` указан с `p=5`, а не `p=1` ([OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)). Самоописывающий формат уже позволяет плавную миграцию.

**Исправление:** benchmark на минимальном production instance, выбрать допустимый baseline, генерировать новые хеши с ним и rehash-on-login для старых; синхронно обновить dummy hash и ограничитель параллельных scrypt из A-04.

### A-12. CLI раскрывает пароль локальным наблюдателям

**Приоритет:** P2 / низкий.  
**Файлы:** `src/cli/bricks-hash-password.mjs:53-94`, `README.md:45-55`.

README рекомендует передавать пароль в argv, где он остаётся в shell history и может быть виден в process list. Интерактивный `readline.question()` отображает ввод.

**Исправление:** скрытый TTY prompt с подтверждением или чтение из stdin/file descriptor для automation; по умолчанию отклонять positional password и обновить документацию.

### A-13. Ключевые элементы media UI недоступны с клавиатуры

**Приоритет:** P2 / низкий.  
**Файлы:** `BuilderMediaGalleryGrid.vue:41-66`, `BuilderMediaGalleryPreviewLightbox.vue:28-50`, `BuilderShellSidebarPropertyImageGalleryEditor.vue:197-273`.

Выбор/замена медиа и empty state реализованы кликабельными `div` без button semantics и keyboard handler. Несколько icon-only buttons не имеют доступного имени. Lightbox не объявлен как dialog, не обрабатывает Escape, не управляет фокусом и не возвращает его инициатору.

**Исправление:** использовать настоящие `button`, добавить локализованные accessible names, реализовать modal dialog pattern с focus trap/restore и Escape; добавить axe-проверку в browser CI.

### A-14. npm-пакет не полностью готов юридически и операционно

**Приоритет:** P2 / низкий.  
**Файлы:** `package.json:2-10`, корень репозитория.

`package.json` объявляет MIT, но в корне и tarball нет файла с текстом MIT LICENSE; присутствует только лицензия шрифта Inter. Поле `repository` указывает `saintfr3ak/nuxt-bricks`, тогда как настроенный git remote — `junkym0nk3y/nuxt-bricks`. Нет `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md` и release workflow.

npm рекомендует SPDX identifier в `license` и файл `LICENSE` для распространения текста лицензии вместе с пакетом ([npm package.json documentation](https://docs.npmjs.com/files/package.json/)).

**Исправление:** подтвердить правообладателя/лицензию, добавить root `LICENSE`, исправить repository/homepage/bugs, подготовить changelog, security contact, provenance/release workflow и повторный pack smoke.

### A-15. Builder performance и deprecated dependencies не контролируются гейтом

**Приоритет:** P2 / низкий.

Published budgets проходят, но playground production build сообщает client chunk около 1,05 МБ minified / 316 КБ gzip и предупреждает, что несколько компонентов импортируются одновременно статически и динамически, поэтому code splitting для них не работает. Отдельного budget для builder route, CSS и fonts нет.

Fresh consumer install также сообщает deprecation для `vue-i18n@10.0.8`, `unplugin-vue-router@0.19.2` и `glob@10.5.0`; известных npm vulnerabilities при этом нет. Vue I18n 9/10 больше не поддерживаются, целевая линия — v11 ([Vue I18n maintenance policy](https://vue-i18n.intlify.dev/guide/maintenance.html)).

**Исправление:** добавить анализ/budget builder entry, устранить смешанные static/dynamic imports, проверить lazy boundaries и font delivery; обновить верхнеуровневые пакеты, которые удерживают deprecated transitives, после compatibility-тестов.

## Что реализовано хорошо

- `dependency-cruiser` контролирует runtime-границы, циклы не обнаружены; `knip` не находит неиспользуемые exports/dependencies.
- Request body, schema depth/node count и multipart имеют явные лимиты.
- SQL использует параметры и allowlist обновляемых полей; optimistic locking и revision restore покрыты тестами.
- Public DTO строится явной проекцией и не отдаёт draft page как published.
- Session token хранится в БД только как SHA-256 hash; cookie `HttpOnly`, `Secure` в production; сравнения credentials выполняются timing-safe.
- Production Basic Auth fail-closed при дефолтном пароле.
- Upload flow проверяет magic bytes, SVG sanitization, pixel/concurrency limits и managed prefix.
- Sanitization имеет hostile fixtures; сохраняется именно санитизированный SVG buffer.
- Server logs редактируют чувствительные headers/данные.
- Сборка npm-пакета воспроизводима, exports/types/bin доступны чистому consumer.
- Bundle budgets опубликованного runtime проходят с запасом; npm audit сообщает 0 известных уязвимостей.
- В tracked-файлах не обнаружены секреты; локальный `.env` игнорируется.

## Архитектурные ограничения, которые нужно зафиксировать явно

- Система сейчас single-tenant и имеет один уровень editor-доступа. Для SaaS/multi-user необходимы tenant key, ownership и RBAC во всех page/media/session запросах.
- In-memory limiters работают per-process; горизонтальное масштабирование требует shared store либо ingress enforcement.
- Multipart upload целиком буферизуется в памяти перед разбором и обработкой. Даже с текущими limits/concurrency нужны reverse-proxy body limits и memory sizing.
- Custom adapters могут не реализовать readiness semantics; контракт интерфейса должен сделать health behavior обязательным для production.

## План исправлений

### Перед любым публичным релизом

1. Закрыть A-01 и A-02 с adversarial regression tests.
2. Добавить CSRF/origin policy (A-03) и двухуровневый auth throttling (A-04).
3. Исправить readiness contract (A-05).
4. Поднять Postgres + MinIO integration gate из собранного tarball (A-06).

### Следующий технический спринт

1. Мигрировать даты на `TIMESTAMPTZ` и namespace/checksum миграций (A-07, A-10).
2. Исправить exact hostname mapping (A-08).
3. Ввести response/request/deadline budgets для data sources (A-09).
4. Усилить scrypt с безопасной миграцией и CLI input (A-11, A-12).
5. Добавить browser-E2E и axe на основной editor/public lifecycle (A-06, A-13).

### До версии 1.0

1. Завершить package/release metadata, license, changelog и security policy (A-14).
2. Ввести builder bundle budgets и обновить deprecated dependency chain (A-15).
3. Принять документированное решение по single-tenant/RBAC, distributed rate limits и upload memory sizing.

## Итоговый release gate

Рекомендация: **NO-GO для публичного production/npm-релиза до закрытия A-01 и A-02**. После этого решение остаётся условным до появления CSRF/auth hardening, корректного readiness и production-like integration suite. Текущий код подходит для дальнейшей разработки и внутреннего стенда при контролируемом доступе и явных инфраструктурных ограничениях.

**Поправка на модель угроз (2026-07-12):** обе P0-находки гейтированы аутентифицированным editor'ом, а система — single-tenant с одним уровнем доступа. Для **внутреннего стенда с контролируемым доступом** они не являются жёсткими блокерами: срочно закрыть стоит A-02 (риск случайной порчи своей же published-страницы) и A-05 (ложный readiness ломает оркестрацию); A-01 и полноценный component-shape контракт A-02 обязательны **до multi-tenant/RBAC и до публичного npm-релиза**. Для публичного npm-релиза дополнительно блокирует A-14 (отсутствует LICENSE-файл при заявленной MIT).

## Статус исправлений (2026-07-12)

Закрытие обоих P0 **проверено по коммитам и тестам** (2026-07-12): профильные
suites — `persistenceS3KeyPolicy` (37), `commonSchemaContract` (27),
`persistencePayloadValidation` (35), `persistencePageVersionRestore` (6),
`renderLayoutsCycleGuard` (3), `renderDataSourcesLegacySchema` (1) — 109/109
зелёные.

- **A-01 — закрыто** (коммиты `d9a5aa9` — канонизация URL + adversarial-тесты,
  `0113271` — удаление legacy-ручки `POST /api/bricks/media`).
  `s3KeyPolicy.ts` канонизирует URL до namespace-проверки
  (WHATWG-парсинг, одинарный decode, запрет dot-сегментов/`%`/backslash/control
  chars); adversarial-тесты `persistenceS3KeyPolicy.spec.ts` покрывают `../`,
  `%2e%2e`, `%252e%252e`, backslash, userinfo, порт, похожие origin/bucket.
  Legacy-ручка `POST /api/bricks/media` удалена — записи `bricks_media` создаёт
  только сервер (upload flow, импорт из бакета).
- **A-02 — закрыто** (коммиты `dcf1be7` — контракт-валидатор графа,
  `fc14d56` — enforcement на create/update/restore, `8458f8e` — валидация
  импорта JSON в билдере, `6e77101` — defensive-фильтр и cycle guard рендера,
  `10912dc` — review cleanups). Введён структурный контракт графа компонентов
  (`common/utils/bricks/schemaContract.ts`): 400 для примитивов, duplicate/
  dangling id, self-loop и multi-node cycle на create/update/restore; импорт
  JSON в билдере валидируется тем же модулем; public render дополнительно
  фильтрует мусорные legacy-компоненты и защищён cycle/depth guard'ом
  (`renderLayoutsCycleGuard.spec.ts`). Защита рендера покрывает и
  `useRendererDataSources.ts` — необработанный обход сырых `schema.components`
  до `isRenderableSchemaComponent`-фильтра был остаточным SSR-crash путём
  (legacy-строка без `brickPath` роняла TypeError до рендера); закрыт тем же
  guard'ом, регрессия — `renderDataSourcesLegacySchema.spec.ts`.

**Ревью 2026-07-12 нашло остаточный пробел A-02 в deferred-рендере:** cycle/depth
guard хранил цепочку предков только на время синхронного `renderPublished()` и
очищал её в `finally`, а Slider откладывает рендер детей через callback
`renderSlide`, который его `.vue`-компонент вызывает позднее (SSR fallback) —
к этому моменту цепочка уже пуста, и цикл `Slider A -> Grid B -> Slider A` не
останавливался (изолированная проверка: 100 переходов без обрыва; прежний
regression-тест гонял только синхронный Grid). **Закрыто** тем же днём:
`useRendererLayouts.ts` держит персистентный снимок цепочки предков в замыкании
`scopedRenderChild` — и eager- (Grid/Flex), и deferred-вызовы (renderSlide)
видят своих предков; регрессия — `renderSliderDeferredCycleGuard.spec.ts`
(deferred-цикл обрывается, валидный слайдер рендерится без обрезания).

Release gate обновлён: блокеров A-01/A-02 больше нет; условие релиза — бэклог P1 ниже.

## Бэклог (2026-07-12)

### Выполнено

| ID   | Статус     | Коммиты                                                                                       |
| ---- | ---------- | --------------------------------------------------------------------------------------------- |
| A-01 | ✅ закрыто | `d9a5aa9`, `0113271`                                                                          |
| A-02 | ✅ закрыто | `dcf1be7`, `fc14d56`, `8458f8e`, `6e77101`, `10912dc` + фикс deferred-цикла Slider (см. выше) |

### P1 по уровню приоритетности

Порядок — по внешней эксплуатируемости (кто атакующий), затем по операционному
влиянию и цене откладывания; трудоёмкость учтена как tie-breaker.

1. **A-03 — CSRF-защита unsafe API.** Единственный P1 с _внешним_ атакующим:
   эксплуатируется через браузер залогиненного editor'а без доступа к системе,
   single-tenant-модель угроз его не смягчает. `SameSite=Lax` не покрывает
   same-site sibling и Basic Auth (браузер автоповторяет credentials).
2. **A-04 — обход auth throttling.** Тоже внешний unauthenticated-вектор:
   перебор username обходит per-`IP|username` лимит и даёт CPU/DB exhaustion
   через дорогой dummy scrypt; Basic Auth не лимитирован вовсе. Логично
   закрывать вместе с A-03 (одна зона — auth middleware/ingress).
3. **A-05 — ложный readiness.** Ломает оркестрацию уже на внутреннем стенде
   (отмечен «срочным» в поправке на модель угроз): `200` без работающего
   persistence маскирует фактический `500` CRUD. Дешёвый фикс с большим
   операционным эффектом.
4. **A-08 — subdomain по подстроке.** Публичная поверхность: `notpromo.example`
   матчится под subdomain `promo` — показ страницы на чужом hostname без участия
   атакующего. Маленький, локализованный фикс (`bricks-page-layout.global.ts`).
5. **A-07 — `TIMESTAMP` без timezone.** Data-correctness (сроки сессий, сортировка,
   расхождение реплик с разным `TZ`); цена forward-миграции на `TIMESTAMPTZ`
   растёт с каждым днём накопления данных — откладывать дорого.
6. **A-10 — namespace/checksum миграций.** `CREATE OR REPLACE FUNCTION
update_updated_at_column()` может перезаписать функцию host-приложения в
   shared schema — обязательный пункт до публичного npm-релиза; checksum-drift —
   защита release-процесса. Выполнять после A-07 (обе — новые forward-миграции,
   можно одной серией).
7. **A-09 — resource budgets для data sources.** Гейтирован доверенным editor'ом
   (в single-tenant — низкая вероятность злоупотребления); базовые меры
   (allowlist, timeout, concurrency, dedup) уже есть, не хватает byte/request/
   deadline-лимитов.
8. **A-06 — production-like integration и browser-E2E gate.** Самый трудоёмкий
   пункт (CI-инфраструктура: Postgres + MinIO из tarball, black-box lifecycle,
   browser-E2E); не является уязвимостью сам по себе, но служит регрессионным
   гейтом для пунктов 1–7 — стоит вести параллельным треком и закрыть до
   production-rollout.

### P2 (следующий технический спринт, без изменения порядка аудита)

A-11 (scrypt baseline + rehash-on-login), A-12 (CLI password input),
A-13 (a11y media UI — объединить с browser-E2E из A-06), A-14 (LICENSE/metadata —
блокер только публичного npm-релиза), A-15 (builder bundle budget + deprecated
transitives).
