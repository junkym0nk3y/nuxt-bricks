# test/

Vitest-тесты модуля (node-окружение, без браузера). Директория = домен
(`src/runtime/modules/<домен>`, серверный или билд-слой), имя файла —
проверяемая фича.

Запуск: `npm test` (весь набор) или `npx vitest run test/<домен>/<файл>`
(точечно). Runtime-зависимости Nuxt/Nitro стабятся через `vi.mock` в самих
спеках; общий стаб auto-imports — `stubs/nuxt-imports.ts`.

## Вспомогательные папки

- `helpers/publishFixtures.ts` — билдеры fixtures publish-домена
  (`createPageBuilder`, `createFormStateBuilder` c пофайловыми дефолтами,
  `makeConflictFetchError` для 409 REVISION_CONFLICT).
- `helpers/builderSessionHarness.ts` — harness session-тестов билдера:
  `mountBuilderContext` (проводка composables как в `pages/[pagename].vue`),
  `createWindowStub` (localStorage + таймеры + шина событий вместо jsdom),
  debounce-константы; типы — `helpers/types.d.ts`.
- `stubs/nuxt-imports.ts` — стаб `#imports` для node-тестов.

## builder/ — сессия билдера и его утилиты

- `pagenameSession.spec.ts` — rename/autosave/reload страницы билдера:
  миграция черновика localStorage, синхронизация URL, восстановление после
  перезагрузки.
- `saveAsCopySession.spec.ts` — Save as Copy как единый переход сессии:
  editingPageId/форма/route/черновики, restore-гейт по `draft.pageId`.
- `draftPersistence.spec.ts` — автосейв черновика и сброс при уходе со страницы:
  правка формы внутри окна debounce уходит по `pagehide`, правка пропса (там
  таймера нет вовсе), защита черновика при ошибке открытия сессии
  (`isSessionReady`), проход через guard'ы после сохранения, сброс на остановке
  scope (SPA-навигация), автосейв канваса после заполнения истории, снятие
  слушателя со scope.
- `coreHistory.spec.ts` — undo/redo стор билдера: clamp, сериализация схемы.
- `documentationArticles.spec.ts` — реестр статей встроенной документации.
- `schemaImageExtractor.spec.ts` — извлечение первого изображения схемы
  для превью страницы.

## common/ — нижний слой (утилиты, контракты)

- `sanitize.spec.ts` — санитизация rich-text HTML и SVG (allow-list,
  URL-политика) — основной XSS-барьер перед `v-html`.
- `schemaContract.spec.ts` — полный контракт графа компонентов схемы:
  форма компонента, связи parent/children, циклы, guard рендера.
- `routePaths.spec.ts` — построение/матчинг путей поверхностей
  (`/bricks`, `/preview`), baseURL, fail-fast валидация префиксов.
- `localApiPaths.spec.ts` — решение local-vs-external в `useApiClient`.
- `publishedPage.spec.ts` — нормализация страницы/сводки из API,
  urlPrefix-матчинг.
- `caseTransform.spec.ts` — camelCase/snake_case конвертация payload'ов.
- `assetPaths.spec.ts` — резолв URL публичных assets модуля.
- `cookieHeader.spec.ts` — вырезание cookie по имени из заголовка.
- `deviceVisibility.spec.ts` — видимость блоков по устройствам
  (классы + aria-hidden).

## layouts-blocks/ — layout-блоки

- `sliderSsr.spec.ts` — SSR-fallback блока слайдера.
- `responsiveLayoutCss.spec.ts` — генерация responsive-CSS layout'а страницы.

## persistence/ — server-only хранилище (Postgres + S3)

- `payloadValidation.spec.ts` — server-first DTO-валидация
  create/update/restore payload'ов: unknown-ключи, pagename, depth/node/byte
  лимиты схемы (защита от RangeError-DoS).
- `storageAdapterPages.spec.ts` — postgres-адаптер: конфликты
  уникальности, RETURNING-мутации, checkHealth.
- `httpStorageAdapter.spec.ts` — external-режим: маппинг методов
  IStorageAdapter на контрактные HTTP-ручки, заголовки, нормализация ответов.
- `queryBuilders.spec.ts` — динамический UPDATE с whitelist колонок,
  распознавание unique_violation.
- `pageVersionRestore.spec.ts` — серверный откат версии: lookup,
  revision-precondition, отказ на невалидной схеме.
- `mediaOrchestration.spec.ts` — оркестрация медиа: файл + запись
  одним флоу, file-first удаление, best-effort чистка превью.
- `mediaImport.spec.ts` — импорт бакета в БД без N+1
  (идемпотентный createMedia).
- `mediaUploadSvg.spec.ts` — SVG-загрузка: в S3 и БД уходит один и
  тот же санитизированный контент.
- `fileSignatures.spec.ts` — сниффинг форматов по magic bytes
  (защита от подмены mime).
- `s3KeyPolicy.spec.ts` — namespace ключей бакета: канонизация URL,
  adversarial-пути не выходят из `bricks-*`.
- `s3ListFiles.spec.ts` — пагинация ListObjectsV2.
- `requestBodyLimits.spec.ts` — лимитированное чтение тела запроса.
- `concurrencyGate.spec.ts` — семафор тяжёлых операций.
- `handlerHelpers.spec.ts` — generic 500-envelope, требование
  application/json.
- `publicProjection.spec.ts` — публичная проекция страницы
  (без editorial-полей).

## publish/ — стор публикации и его утилиты (клиент билдера)

- `storeCreatePage.spec.ts` / `storeDuplicatePage.spec.ts` —
  создание и дублирование страниц через стор.
- `storeUpdatePage.spec.ts` — optimistic locking при сохранении:
  обязательный expected_revision, обработка 409.
- `versionRestore.spec.ts` — откат версии из стора: обязательный
  revision-precondition, refetch после конфликта.
- `pagePayload.spec.ts` — сборка payload'ов create/update и meta-PATCH.
- `requestErrors.spec.ts` — приведение ошибок запросов,
  `requirePageRevision`.
- `validationSchema.spec.ts` — yup-схема meta-полей формы публикации.
- `dashboardFilters.spec.ts` — поиск и фильтры списка страниц дашборда.
- `slugify.spec.ts` — авто-slug из названия страницы.
- `dates.spec.ts` — форматирование дат в списке/панели деталей.

## render/ — published-рендерер и data sources

- `dataSources.spec.ts` — выполнение data source: подстановка параметров,
  политика хостов/методов, дедуп запросов, бюджет запросов на прогон.
- `dataSourcePolicy.spec.ts` — политика data sources: методы, allow-list
  URL, resource budget.
- `dataSourceLogging.spec.ts` — redaction production-логов (секреты не
  утекают в console).
- `dataSourceResponseReading.spec.ts` — байтовый лимит ответа до
  JSON.parse (потоковое чтение).
- `dataSourcesMalformedSchema.spec.ts` — повреждённая схема из БД не
  роняет SSR.
- `abortSignals.spec.ts` — комбинирование abort-сигналов
  (таймаут + общий дедлайн).
- `requestPool.spec.ts` — пул с лимитом конкурентности.
- `layoutsCycleGuard.spec.ts` / `sliderDeferredCycleGuard.spec.ts` —
  защита рендера layout'ов от циклов и глубины (включая отложенный
  renderSlide слайдера).
- `publicPageClient.spec.ts` — клиент публичной read-model страниц.

## server/ — Nitro-инфраструктура (auth, proxy, лимитеры)

- `authCsrfProtection.spec.ts` — CSRF-проверка контекста запроса.
- `authRouteProtection.spec.ts` — матрица защищённых путей, кастомные
  префиксы `bricks.routes`.
- `authPasswords.spec.ts` — scrypt hash/verify паролей.
- `authScryptGate.spec.ts` — bounded-семафор scrypt-дериваций
  (анти-DoS логина).
- `authRateLimiter.spec.ts` — in-memory лимитер логина.
- `requestRateLimiter.spec.ts` — fixed-window лимитер ingest-ручек.
- `requestClientIp.spec.ts` — резолв клиентского IP с учётом trust-proxy.
- `proxyRouting.spec.ts` — матчинг и сборка target-URL прокси.
- `devProxy.spec.ts` — dev-fallback proxy: контракт передачи запроса,
  identity билдера.
- `readinessTarget.spec.ts` — выбор persistence-пути для readiness probe.

## module/ — build-time слой, CLI и глобальные проверки

- `apiHandlersManifest.spec.ts` — манифест хэндлеров `/api/bricks/**`
  (регистрация роутов модуля).
- `backendConfig.spec.ts` — резолв backend-конфига модуля
  (builtin vs external).
- `cliMigrationChecksum.spec.ts` — обнаружение drift применённых миграций
  (`bricks-migrate`).
- `styleIsolation.spec.ts` — изоляция стилей модуля от host-приложения.
