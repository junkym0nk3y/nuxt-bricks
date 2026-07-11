# Tech Sprint 2 — доводка по итогам аудита и ревью Codex

Дата: 11 июля 2026
Базовая ревизия: `051ef4d` + WIP двухзонного CSS reset.
Источники: `docs/architecture-audit.md` (удаляется; открытый остаток перенесён в «Бэклог» ниже, журналы закрытия P0/P1/P2 остаются в git-истории файла) и `docs/architecture-audit-remediation-plan.md` (ревью Codex).

Все фактические претензии ревью перепроверены по коду (три независимые проходки + эмпирический тест Node): ~90% подтвердились дословно. Ниже — принятый scope; что отклонено/понижено и почему — в конце файла.

## Спринт 2 — задачи

Порядок для каждой задачи: failing regression-тест → минимальный фикс → negative path → зелёные проверки. Коммиты — маленькие и независимые (по задаче), не одной 70-файловой проходкой.

### 1. Save as Copy: единый переход сессии (R0.3) — приоритет 1

Единственный пункт, который бьёт по честным пользователям без злоумышленника: `handleSaveAsCopy` (`builder/app/composables/useBuilderPage.ts:223-248`) не вызывает `renameSession` и не чистит черновик — URL и `sessionPagename` остаются от оригинала, автосейв пишет контент копии под slug оригинала, reload оригинала предлагает восстановить чужие данные; `draft.pageId` пишется (`useBuilderDraftPersistence.ts:80`), но нигде не читается.

- `publish.ts` → `saveCurrentPageAsCopy` возвращает `{ id, pagename, revision }` (или нормализованную страницу) вместо голого id.
- В `useBuilderPage` — единый переход в фиксированном порядке: `startEditingPage` → `renameSession(copy.pagename)` (уже существует: `useBuilderPagename.ts:44-66`, мигрирует черновик + `router.replace`) → фиксация `savedSnapshot` → только потом toast/thumbnail.
- Restore-гейт черновика (`useBuilderSession.ts:102-111`): edit-draft предлагается только при `draft.pageId === existingPage.id`; черновик без `pageId` — legacy/stale.
- Тесты: новый `test/builderSaveAsCopySession.spec.ts` — после copy совпадают editingPageId/form pagename/route/sessionPagename; автосейв пишет только `bricks-builder:draft:<copy-slug>`; reload copy-URL открывает копию; черновик с чужим pageId не предлагается.

### 2. Restore версии с expectedRevision (R0.4)

`restore.post.ts:31-35` зовёт `updatePage` без precondition (клиент шлёт POST без тела) — restore молча перезаписывает конкурентные правки. Смягчение: пре-restore состояние авто-снапшотится, данные восстановимы — поэтому не P0, но фикс дешёвый и симметричен существующему PUT-пути.

- Сервер: `readNormalizedBody` + `expectedRevision` → `storage.updatePage`; catch → `toPageHttpError` (паттерн `pageUpdate.ts:38`), иначе `BricksRevisionConflictError` стал бы 500.
- Клиент: `restorePageVersionRequest(id, versionId, expectedRevision)`; store берёт revision из summary, 409 → существующий `toPageWriteError` (refetch + toast).
- Задокументировать сознательные last-write-wins: delete, thumbnail-PATCH, published-toggle (уже описаны в CLAUDE.md — сослаться из JSDoc ручки).
- Тесты: stale revision → 409 `REVISION_CONFLICT`, страница и версии не изменены; актуальная → 200 + снапшот пре-restore состояния; невалидный `expectedRevision` → 400.

### 3. Depth/node guard для schema до JSON.stringify (R0.2)

Подтверждено эмпирически (Node 22): `JSON.parse` итеративный — 20k вложенности парсится, а `JSON.stringify` в `validateSchema` (`payloadValidation.ts:106`) рекурсивный → `RangeError` → 500 + errorId вместо 400. Процесс не падает — это robustness, не дыра, но фикс маленький.

- Итеративный обход (стек, без рекурсии) до сериализации: depth ≤ 64, nodes ≤ 100k; только JSON-типы; размер — `Buffer.byteLength` (заодно).
- Скетч обхода из remediation-плана Codex (§R0.2) годный — брать его.
- **Не в этой задаче**: жёсткий component-shape контракт (id/componentName/type/…) — отдельно, после прогона legacy-схем (Codex сам это оговаривает в п. 5).
- Тесты: depth 64 проходит / 65 → 400; 20k вложенности → 400, не RangeError; node-limit на широком мелком объекте.

### 4. URL-политика санитайзера + санитизированный SVG в S3 (R0.1)

Подтверждено: значения `fill/stroke/filter/clip-path/mask` не проверяются на `url(...)` вообще (`sanitizeSvg.ts:205-215` проверяет только href), `poster` у whitelisted `video` в rich text не проверяется; в бакет летит исходный buffer, санитизированная строка — только в БД (`upload.post.ts:106-114`). Калибровка: `url(javascript:)` в этих атрибутах в современных браузерах **не исполняется** — реальный вектор это загрузка внешних ресурсов (tracking/exfil) и raw SVG на origin бакета; атакующий — аутентифицированный редактор. Фиксы дешёвые, закрывают целостность гарантии.

- S3 = БД: buffer для аплоада — из той же `sanitizeSvgMarkup`-строки, что `svgContent` (~3 строки в `prepareUpload`).
- URL-политика в `safeAttrValue`-override: `filter/clip-path/mask` → только `none`/`url(#id)`; `fill/stroke` → `url(` только с `#`-fragment; `style` с `url(` → drop declaration; rich text `src`/`poster` → media-политика + запрет protocol-relative `//host`.
- Нюанс против Codex: `style="...url(javascript:)"` js-xss уже блокирует — проходит только внешний/`data:` url на whitelisted-свойствах; тест-матрицу писать по фактическому поведению.
- **svgo как замена — отклонено**: это оптимизатор, а не санитайзер (`removeScriptElement` не в preset-default, `on*`-атрибуты легальны и переживают плагины, URL-политики для `fill/filter` нет); санитайзер изоморфный — svgo на клиенте это сотни КБ против бюджета entry 122 КБ gzip. Нужные ~30 строк — в уже существующем js-xss-override. svgo допустим отдельно как server-only оптимизация после санитайзера (не security, вне scope).
- Тесты: hostile-матрица из remediation-плана (§R0.1) + сохранение легальных `fill="#fff"`, `filter="url(#blur)"`; buffer в mock publish-адаптере == `svgContent`; идемпотентность повторной санитизации.

### 5. Redaction prod-логов data sources (R1.3)

`useBricksDataSources.ts:316-328`: в prod логируется резолвленный `url` (с подставленными params — «params только в dev» ничего не защищает) и сырой ofetch-error (request/response/options внутри).

- Prod-payload: `key`, `method`, `componentId`, `brickPath`, `target` (относительный → `'local'`, абсолютный → только `URL.origin`), `error` → allow-list `{ name, statusCode }`.
- Dev-ветка (`import.meta.dev`) — подробная, как сейчас.
- Тест: fixture с секретом в param/path/query/message/response — `JSON.stringify` prod-payload не содержит маркер секрета.

### 6. Health-ручки всегда локально в proxy-режиме (R1.2, часть 1)

`proxy.client.ts:52-73` матчит `startsWith('/api')` по полному URL с query — без локальной БД `/api/bricks/health(/ready)` уходят на PROXY_URL, локальные пробы обходятся.

- Чистая `shouldProxy(pathname, ...)` по разобранному pathname (не URL с query); точные `GET/HEAD /api/bricks/health` и `/health/ready` — всегда локально (похожие пути `/healthcheck` — нет).
- **Часть 2 отклонена**: сценарий «readiness врёт про мёртвый downstream» в текущем коде недостижим (ручка перехвачена тем же прокси — проверено); после этого фикса skip-200 без БД станет наблюдаемым → вместо `readinessPath`-probe и mode-матрицы — строка в README: readiness покрывает локальную БД, в proxy-режиме мониторить readiness backend'а напрямую. Вернуться к probe, только если появится реальный k8s-гейт на downstream.
- Тесты: матрица shouldProxy (DB/proxy/no-config, query, похожие пути).

### 7. Мелочи CI/пакета (из R1.4)

- `pack-smoke.mjs`: проверять все `migrations/*.sql` из реестра (сейчас только `0001` из трёх).
- `package.json`: поле `packageManager` (npm-версия lockfile).
- `ci.yml`: `permissions: contents: read`.
- «500 допустим после auth» в pack-smoke — оставить как есть: это сознательный packaging-гейт (комментарий в коде), персистентность проверит integration smoke на гейте публикации.

### 8. CSS: закоммитить двухзонный reset (R1.1, WIP)

В baseline `051ef4d` остался ровно один глобальный селектор `* { box-sizing }` (при комменте «глобальных селекторов нет» в том же файле). Текущий WIP (`default.scss` + `_normalize.scss`) уже убирает его полностью — довести и закоммитить, прогнав чек-лист из remediation-плана (§R1.1): host-страница без bricks-классов не получает ни одного правила; teleport покрыт; канвас == published; hostile host-stylesheet не ломает хром.

### 9. Assets под `/_bricks/` + baseURL helper (R1.1)

Калибровка против Codex: «модуль занимает /images и /docs у потребителя» — неверная модель, Nitro **мерджит** publicAssets-папки (`copyPublicAssets`: копирование `if (!existsSync)`, при точном совпадении пути молча побеждает первый). Реальный дефект: под non-root `app.baseURL` ассеты отдаются с префиксом, а код хардкодит `/images/...` → 404 превью блоков/плейсхолдера/картинок доков в билдере — при том что baseURL для роутов/API уже поддержан и проверен smoke'ом. Published не затронут.

- `module.ts:230-236`: publicAssets с `baseURL: '/_bricks/'` (и только при включённом builder — ассеты билдерные).
- Helper `resolveBricksAssetUrl` (паттерн `useBricksRoutePaths.withBase`, учёт `app.baseURL`), три точки: thumbnails в `block*.definition.ts`, `PLACEHOLDER_IMAGE_URL` (`schemaImageExtractor.ts:17`), rewrite в `useMarkdownRenderer.ts:49`.
- Тест: с `app.baseURL='/app/'` URL собирается `/app/_bricks/images/...`; абсолютные внешние URL не трогаются.

## Гейт первой публикации в npm (не в этом спринте)

Пакет ни разу не публиковался (404 в registry) — внешних потребителей ноль, поэтому release-церемония привязана к первой публикации, а не к спринту:

- **Integration smoke с Postgres-service** (Codex R1.4): tarball → чистый consumer → `bricks-migrate status/migrate` (0001–0003, идемпотентность) → прод-`.output` с БД → CRUD с revision / stale 409 / versions list+restore / delete / public draft 404 / readiness. MinIO-этап — nightly, не required.
- **Changelog + migration guide + версия**: перечислить consumer-visible изменения спринтов (Swiper 11→14, обязательные `IPublishAdapter.isOwnedUrl`/`buildFileKey`/`getMedia`, `listPages` → summary, migrations CLI как deployment step, `/_bricks/` assets, restore c `expectedRevision`) — на момент первой публикации.
- **Release workflow из CI** (NPM_TOKEN, публикация только из CI, branch protection) — остаток CI-проходки P1.
- Full `npm audit` без `|| true`: policy/allow-list либо блокировать high/critical (prod-audit уже блокирует).

## Бэклог (перенос из architecture-audit.md перед удалением + R2 Codex)

Открытые P2 аудита (журналов закрытия не имеют):

- **Integration/E2E coverage и quality budgets**: browser-E2E цикла builder → save → publish → reload → restore-conflict; coverage thresholds по security/persistence/session слоям. Частично пересекается с гейтом публикации (integration smoke).
- **Роль/tenant модель до multi-user** (+ Codex R2.2): Workspace/Site/Page/Asset, membership/RBAC (viewer/editor/publisher/admin), tenant key в таблицах и unique constraints, resource-scoped queries, **точная hostname-проверка subdomain** (сейчас `includes`-матчинг — перенесено из проходки «Server-to-self URL»), audit trail. До этого деплой честно называется single-tenant.
- **Документация поставки**: install matrix, adapter contract, SECURITY.md (disclosure policy), CONTRIBUTING, semantic-release changelog (частично уходит в гейт публикации).

Из Codex R2:

- **Лимит размера ответа data source + метрики** (R2.1): `dataSources.maxResponseBytes` (2–5 МиБ), стрим-чтение с abort (не доверять одному Content-Length), метрики duration/status/rejected/timeout; тест chunked-ответа без Content-Length.

Осознанно отложенное из закрытых проходок (хвосты журналов):

- Streaming-upload мимо памяти процесса; персистентный/распределённый rate limiter (все лимитеры per-process — multi-replica ослабляет).
- Cursor-pagination и ETag/cache списков (вернуться при multi-tenant/RBAC); media sync в отдельный job + MIME из object metadata.
- Кросс-запросный cache/SWR ответов data sources; per-source конфиг таймаута.
- Bundle: vue-i18n+intlify в entry published (~75 КБ min — цена `features.builder`, render-only снимает); ядро vue-icons; manualChunks-тюнинг vendor-чанка.

Отклонено/отложено из ревью Codex (с обоснованием в задачах выше):

- Component-shape валидация schema (R0.2 пп. 4–5) — после прогона legacy-схем.
- `proxy.readinessPath` + downstream readiness probe (R1.2 часть 2) — сценарий недостижим; сначала README-семантика.
- svgo как санитайзер — оптимизатор, не санитайзер.
- Немедленный bump 0.2.0/changelog — до первой публикации не к чему применять.

## Матрица проверок

После каждой задачи: `npx vue-tsc --noEmit` + `npx oxlint` по изменённым файлам; `npm test` (новый regression-тест задачи — красный до фикса).

Спринт целиком:

```bash
npm run format:check && npm run lint:check && npm run type-check && npm test
npm run build && npm run dev:build && npm run budget:bundle && npm run smoke:pack
```

Live-smoke в playground: Save as Copy → URL/черновик/reload копии; конкурентный restore → 409 + refetch; hostile SVG аплоад → объект в бакете без `<script>`/внешних `url()`; с `app.baseURL='/app/'` — превью блоков и картинки доков грузятся.
