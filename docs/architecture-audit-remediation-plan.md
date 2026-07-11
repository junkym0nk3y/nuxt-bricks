# План доведения tech-sprint до закрытого состояния

Дата: 11 июля 2026  
Базовая ревизия: `051ef4d`  
Рассматриваемые коммиты: `cfb81da`, `051ef4d`  
Источник: `docs/architecture-audit.md` и повторная проверка кода после tech-sprint

## 1. Цель и критерий успеха

Цель следующей проходки — не расширять функциональность билдера, а закрыть разрыв
между формулировкой «P0/P1 закрыты» и фактическими гарантиями на границах безопасности,
конкурентной записи, host-изоляции и поставки npm-пакета.

Рекомендуемый release decision:

- внутреннее single-tenant использование за auth допустимо после закрытия `R0.1–R0.4`;
- внешний production rollout или публичный npm-релиз — только после `R0` и `R1`;
- `R2` не блокирует ограниченный rollout, но должен остаться явно открытым backlog, а не
  быть отмечен как закрытый.

План оценивает именно закоммиченный baseline `051ef4d`. Незакоммиченный WIP в рабочем
дереве, включая текущую переработку CSS reset, не считается закрытием до отдельного
review, тестов и фиксации в истории.

## 2. Приоритеты

| ID   | Приоритет | Результат                                                              | Состояние в `051ef4d` |
| ---- | --------- | ---------------------------------------------------------------------- | --------------------- |
| R0.1 | P0        | Полная политика URL в HTML/SVG и безопасный исходный SVG-файл          | Частично              |
| R0.2 | P0        | Ограничение глубины/сложности schema до сериализации                   | Частично              |
| R0.3 | P0        | `Save as Copy` атомарно переключает page/store/URL/draft               | Не закрыто            |
| R0.4 | P0        | Restore версии участвует в optimistic locking                          | Не закрыто            |
| R1.1 | P1        | CSS и public assets не протекают в host и учитывают `app.baseURL`      | Частично              |
| R1.2 | P1        | Health routes всегда локальны, readiness отражает реальную зависимость | Частично              |
| R1.3 | P1        | Production-логи data sources не раскрывают URL и тело ошибки           | Частично              |
| R1.4 | P1        | Fresh-consumer smoke проверяет БД, все миграции и рабочий CRUD         | Частично              |
| R1.5 | P1        | Audit и release-документация отражают проверяемый статус               | Не закрыто            |
| R2.1 | P2        | Ограничение ответа data source и эксплуатационные метрики              | Не закрыто            |
| R2.2 | P2        | Tenant/RBAC/E2E/coverage и release automation                          | Не закрыто            |

Зависимости между работами:

1. Сначала добавить regression-тесты для `R0.1–R0.4` — они фиксируют обнаруженные
   контрпримеры.
2. Затем независимо реализовать sanitizer, schema limits, session transition и restore
   precondition.
3. После стабилизации контрактов закрыть assets/baseURL, readiness и redaction.
4. Последним собрать настоящий integration gate и обновить audit по фактическим зелёным
   проверкам.

## 3. R0 — обязательно до rollout

### R0.1. Довести HTML/SVG sanitizer и санитизировать загружаемый файл

#### Почему

Текущий sanitizer проверяет `href`/`xlink:href` в SVG и `href`/`src` в rich text, но
URL существуют и в других разрешённых атрибутах. В текущем baseline сохраняются, в
частности, такие значения:

```html
<rect fill="url(javascript:alert(1))" />
<g filter="url(https://evil.example/filter.svg#x)"></g>
<path clip-path="url(data:image/svg+xml,...)"></path>
<video poster="javascript:alert(1)"></video>
```

Кроме того, при upload SVG в БД записывается очищенный `svgContent`, но в S3 отправляется
исходный `buffer`. Прямое открытие объекта хранилища поэтому обходит гарантию sanitizer.

#### Где менять

- `src/runtime/modules/common/utils/sanitize/sanitizeSvg.ts`
- `src/runtime/modules/common/utils/sanitize/sanitizeRichText.ts`
- новый helper `src/runtime/modules/common/utils/sanitize/urlPolicy.ts`
- `src/runtime/server/api/bricks/media/upload.post.ts`, функция `prepareUpload`
- при необходимости `src/runtime/modules/persistence/server/utils/mediaProcessing.ts`
- `test/commonSanitize.spec.ts`
- новый `test/persistenceMediaUploadSvg.spec.ts` или сценарий в
  `test/persistenceMediaOrchestration.spec.ts`

#### Что сделать

1. Вынести URL-политику в чистые функции без DOM, чтобы одинаково выполнять её на SSR и
   клиенте.
2. Для `filter`, `clip-path`, `mask` разрешить только `none` или одну локальную ссылку
   `url(#fragment)`.
3. Для `fill` и `stroke` оставить обычные paint-значения, но при наличии `url(...)`
   разрешать только локальный fragment. Значения с CSS escape-последовательностями в
   URL-контексте отклонять, а не пытаться декодировать собственным неполным парсером.
4. Для `style` выбрать deny-by-default: декларации с `url(...)` удалять. Если локальные
   gradient-ссылки в `style` нужны для совместимости, разбирать CSS полноценным value
   parser и разрешать только точный `url(#fragment)`. Не добавлять общий permissive regex.
5. В rich text применять media URL policy к `src` и `poster`; запретить
   protocol-relative URL `//host/path`. Для `href` сохранить `http(s)`, `mailto`, `tel`,
   `#fragment` и root-relative `/(?!/)`.
6. Для SVG один раз получить очищенную строку и использовать её и для `svgContent`, и
   для фактически загружаемого `Buffer`.

Ориентир для кода:

```ts
const STRICT_LOCAL_REFERENCE_ATTRS = new Set(['filter', 'clip-path', 'mask']);
const PAINT_REFERENCE_ATTRS = new Set(['fill', 'stroke']);
const LOCAL_FRAGMENT = /^#[\w:.-]+$/;

function isLocalSvgReferenceValue(value: string): boolean {
    const normalized = value.trim();
    return normalized === 'none' || /^url\(\s*#[\w:.-]+\s*\)$/i.test(normalized);
}

function containsUnsafeSvgReference(value: string): boolean {
    // Backslash в URL-контексте может маскировать CSS-токен; безопаснее удалить.
    if (value.includes('\\')) return true;

    const matches = [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
    return (
        /url\s*\(/i.test(value) &&
        (matches.length === 0 || matches.some((match) => !LOCAL_FRAGMENT.test(match[2].trim())))
    );
}

// В safeAttrValue:
if (STRICT_LOCAL_REFERENCE_ATTRS.has(name) && !isLocalSvgReferenceValue(value)) return '';
if (PAINT_REFERENCE_ATTRS.has(name) && containsUnsafeSvgReference(value)) return '';
if (name === 'style' && /url\s*\(|\\/i.test(value)) return '';
```

Для upload:

```ts
const sanitizedSvg = sanitizeSvgMarkup(validated.optimizedBuffer.toString('utf8'));

return {
    buffer: Buffer.from(sanitizedSvg, 'utf8'),
    mimeType: validated.mimeType,
    targetExtension: validated.targetExtension,
    svgContent: sanitizedSvg,
};
```

Это пример целевого поведения, а не готовая замена parser: тесты должны включать
регистр, пробелы, кавычки, fallback paint, CSS escapes и несколько `url()` в одном
значении.

#### Тесты

- удаляются `javascript:`, `data:`, `http(s)://` и `//host` во всех URL-bearing SVG
  атрибутах;
- сохраняются `fill="#fff"`, `stroke="currentColor"`, `filter="url(#blur)"`;
- удаляется `style="fill:url(https://evil.example/x)"`;
- `poster="javascript:..."` и `poster="//evil.example/x"` удаляются;
- root-relative и `https` media URL остаются;
- mock publish adapter получает уже очищенный SVG buffer;
- `svgContent` побайтно соответствует загруженному buffer после UTF-8 декодирования;
- повторная санитизация идемпотентна.

#### Критерий приёмки

- Ни один разрешённый HTML/SVG-атрибут не может содержать внешний или исполняемый URL,
  кроме явно разрешённых `http(s)` media/link полей.
- Один и тот же безопасный SVG хранится в БД и object storage.
- Все hostile-примеры выше закреплены regression-тестами.

### R0.2. Ограничить глубину и сложность schema до `JSON.stringify`

#### Почему

Текущая `validateSchema` проверяет только объект, `components.length` и размер результата
`JSON.stringify`. Глубоко вложенный JSON небольшого размера парсится, после чего
`JSON.stringify` падает с `RangeError: Maximum call stack size exceeded`; API отвечает
500 вместо контролируемого 400.

#### Где менять

- новый `src/runtime/modules/persistence/server/utils/schemaPayloadValidation.ts`
- `src/runtime/modules/persistence/server/utils/payloadValidation.ts`
- `test/persistencePayloadValidation.spec.ts`
- integration-сценарий HTTP в `R1.4`

#### Что сделать

1. До сериализации выполнить итеративный обход, без рекурсии.
2. Ограничить:
    - глубину: `64`;
    - число JSON-узлов: `100_000`;
    - число компонентов: существующие `5_000`;
    - сериализованный размер: `2 MiB` в UTF-8, а не число UTF-16 символов.
3. Разрешать только JSON-типы: `null`, string, finite number, boolean, array и plain
   object. Отклонять `Date`, `Map`, class instances, `undefined`, functions, symbols и
   циклы в unit-вызовах.
4. После ресурсных лимитов валидировать минимальный контракт каждого component, не
   ограничивая пользовательские `props`:
    - `id`, `componentName`, `brickPath` — непустые строки с верхней границей;
    - `type` — `layout | component`;
    - `zIndex` — конечное число;
    - `props` — plain object;
    - `parent`, `children`, `slots[].children` — строки/массивы строк;
    - `id` уникальны.
5. Проверку ссылочной целостности `parent/children` вводить после проверки legacy-схем.
   Если существующие данные не проходят — сначала report/migration, затем hard reject.

Ориентир итеративного обхода:

```ts
interface INodeToVisit {
    value: unknown;
    depth: number;
}

const stack: INodeToVisit[] = [{ value: schema, depth: 0 }];
const seen = new Set<object>();
let nodes = 0;

while (stack.length) {
    const current = stack.pop()!;
    if (++nodes > MAX_SCHEMA_NODES) invalid('Schema is too complex');
    if (current.depth > MAX_SCHEMA_DEPTH) invalid('Schema is too deeply nested');

    if (Array.isArray(current.value)) {
        if (seen.has(current.value)) invalid('Schema must not contain cycles');
        seen.add(current.value);
        for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
        continue;
    }

    if (isPlainRecord(current.value)) {
        if (seen.has(current.value)) invalid('Schema must not contain cycles');
        seen.add(current.value);
        for (const child of Object.values(current.value)) {
            stack.push({ value: child, depth: current.depth + 1 });
        }
        continue;
    }

    assertJsonPrimitive(current.value);
}

const json = JSON.stringify(schema);
if (Buffer.byteLength(json, 'utf8') > MAX_SCHEMA_JSON_BYTES) invalid('Schema payload is too large');
```

#### Тесты

- depth `64` проходит, `65` возвращает 400;
- node limit проверяется на широком, но маленьком по байтам объекте;
- 20 000 уровней вложенности возвращают validation error, а не `RangeError`;
- Unicode payload проверяется в байтах;
- duplicate component ID отклоняется;
- неизвестные ключи внутри `props` сохраняются;
- legacy fixture-примеры прогоняются перед включением строгой component shape.

#### Критерий приёмки

- Любое JSON-тело в пределах request body limit либо валидируется, либо получает
  детерминированный `400/413`; stack overflow и неконтролируемый 500 невозможны.
- Ограничения экспортированы только там, где нужны тестам; сервер остаётся источником
  истины, клиентская yup-валидация — только UX.

### R0.3. Сделать `Save as Copy` единым переходом сессии

#### Почему

`handleSaveAsCopy` переключает `editingPageId`, но не вызывает `renameSession`. URL и
`sessionPagename` остаются от оригинала. Следующий autosave может записать draft копии под
slug оригинала, а reload предложит восстановить данные не той страницы. Дополнительно
restore draft сейчас не сверяет `draft.pageId` с ID открытой страницы.

#### Где менять

- `src/runtime/modules/builder/app/composables/useBuilderPage.ts`, `handleSaveAsCopy`
- `src/runtime/modules/builder/app/composables/useBuilderPagename.ts`, `renameSession`
- `src/runtime/modules/builder/app/composables/useBuilderSession.ts`
- `src/runtime/modules/builder/app/types/composables.d.ts`
- `src/runtime/modules/builder/publish/stores/publish.ts`, `saveCurrentPageAsCopy`
- `src/runtime/modules/builder/publish/types/builderDrafts.d.ts`
- `src/runtime/modules/builder/publish/utils/draftStorage.ts`
- `test/builderPagenameSession.spec.ts`
- новый `test/builderSaveAsCopySession.spec.ts`

#### Что сделать

1. Возвращать из `saveCurrentPageAsCopy` не голый ID, а минимум
   `{ id, pagename, revision }` или нормализованную страницу. Это убирает зависимость
   перехода от повторного list refresh.
2. Ввести один orchestration-метод, например `switchToSavedPage(copy)`, который в
   фиксированном порядке:
    - проверяет наличие copy;
    - переводит store в edit mode;
    - меняет route и `sessionPagename`;
    - переносит/удаляет draft;
    - фиксирует новый `savedSnapshot`;
    - только после этого показывает success toast и запускает thumbnail.
3. Не использовать `lastSuccessfulSaveAt` как единственный неявный сигнал для copy:
   snapshot должен фиксироваться после завершения session transition.
4. Сделать rename транзакционным. При ошибке `router.replace` вернуть прежние
   `sessionPagename` и localStorage key либо сначала завершить навигацию под флагом
   `isRenaming`, а затем переносить draft.
5. При открытии существующей страницы разрешать edit draft только при точном совпадении
   `draft.pageId === existingPage.id`. Draft без `pageId` считать legacy/stale,
   удалить или переместить в quarantine key и показать нейтральное предупреждение.

Целевой happy path в `handleSaveAsCopy`:

```ts
const copy = await publishStore.saveCurrentPageAsCopy(schema);
if (!copy) return showCopyError();

await switchToSavedPage(copy); // store + route + draft + savedSnapshot
showToast(t('bricks.publish.toasts.copySaved'), 'success');
void captureAndUploadThumbnail(copy.id);
```

#### Тесты

- после Save as Copy совпадают `editingPageId`, form pagename, route param и
  `sessionPagename`;
- autosave пишет только `bricks-builder:draft:<copy-slug>`;
- reload copy URL открывает copy, а не original;
- draft оригинала с другим `pageId` не предлагается для restore;
- ошибка route replace не оставляет два ключа и расходящееся состояние;
- ошибка list refresh не отменяет уже созданную copy и даёт возможность продолжить по
  данным ответа create.

#### Критерий приёмки

После успешной операции существует ровно одна активная идентичность страницы во всех
слоях: server ID, publish store, route, session key и draft snapshot.

### R0.4. Добавить optimistic locking в restore версии

#### Почему

Обычный update требует `expectedRevision`, но restore вызывает `storage.updatePage`
без precondition. Один редактор может незаметно затереть изменения другого, хотя UI и
storage уже поддерживают 409 conflict.

#### Где менять

- `src/runtime/server/api/bricks/[id]/versions/[versionId]/restore.post.ts`
- `src/runtime/modules/persistence/server/utils/payloadPrimitives.ts`
- `src/runtime/modules/persistence/server/utils/payloadValidation.ts`
- `src/runtime/modules/builder/publish/utils/publishApi.ts`
- `src/runtime/modules/builder/publish/stores/publish.ts`
- `src/runtime/modules/builder/publish/composables/usePublishVersionRestore.ts`
- `test/persistenceStorageAdapterPages.spec.ts`
- новый `test/publishVersionRestore.spec.ts`
- Postgres integration-сценарий из `R1.4`

#### Что сделать

1. Вынести проверку positive safe integer в общий helper и использовать её и для page
   update, и для restore payload.
2. Изменить контракт restore на:

```http
POST /api/bricks/:id/versions/:versionId/restore
Content-Type: application/json

{ "expectedRevision": 7 }
```

3. Прочитать body через `readNormalizedBody`, отклонить unknown keys и передать
   `expectedRevision` в `storage.updatePage` вместе со snapshot fields.
4. В route catch использовать `toPageHttpError`, иначе
   `BricksRevisionConflictError` превращается в generic 500 вместо 409.
5. Клиентская сигнатура:

```ts
restorePageVersionRequest(id, versionId, expectedRevision);
```

6. Store берёт revision из актуальной страницы, передаёт её в запрос и обрабатывает 409
   через тот же `toPageWriteError`, что и обычный update: refresh list + понятное
   сообщение пользователю.
7. Документировать оставшиеся last-write-wins операции. Минимум проверить delete,
   thumbnail update и published toggle; если они сознательно без precondition — это
   должно быть явным контрактом.

#### Тесты

- актуальная revision: restore 200, revision увеличена, прежнее состояние сохранено как
  новая версия;
- stale revision: 409 с `data.code = revision`, страница и список версий не изменены;
- отсутствующий/нулевой/string `expectedRevision`: 400;
- version другой страницы не восстанавливается;
- UI после 409 обновляет summary и не показывает success toast.

#### Критерий приёмки

Любая операция, меняющая versioned page state, либо выполняется относительно явно
прочитанной revision, либо документирована как last-write-wins.

## 4. R1 — обязательно до публичного релиза

### R1.1. Завершить CSS isolation и namespace public assets

#### Почему

В committed baseline `src/runtime/assets/scss/default.scss` содержит root-level `*`,
хотя audit утверждает, что глобальных selectors нет. Public dir регистрируется в
`src/module.ts` без `baseURL`, поэтому пакет занимает общие `/images/**` и `/docs/**`,
может конфликтовать с host-приложением и ломается при `app.baseURL !== '/'`.

Текущий незакоммиченный WIP уже перерабатывает reset через scoped zones и
`_normalize.scss`; его следует проверить по критериям ниже, а не реализовывать второй
конкурирующий вариант.

#### Где менять

- `src/runtime/assets/scss/default.scss`
- текущий WIP `src/runtime/assets/scss/common/_normalize.scss`
- `src/runtime/modules/render/pages/[pagename].vue`
- `src/module.ts`
- новый `src/runtime/modules/common/utils/bricks/assetPaths.ts`
- новый `src/runtime/modules/common/composables/useBricksAssetUrl.ts`
- `src/runtime/modules/layouts-blocks/components/block*.definition.ts`
- `src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarComponentCard.vue`
- `src/runtime/modules/builder/media/utils/schemaImageExtractor.ts`
- `src/runtime/modules/builder/documentation/composables/useMarkdownRenderer.ts`
- `test/commonRoutePaths.spec.ts` или новый `test/commonAssetPaths.spec.ts`
- новый `test/styleIsolation.spec.ts`
- fresh consumer с non-root baseURL в `R1.4`

#### Что сделать

1. Удалить root-level universal selector из итогового compiled CSS. Reset разрешён только
   внутри явно принадлежащих модулю surfaces, например `.bricks-canvas`,
   `body.bricks-render`, `body.bricks-page`.
2. Проверить текущую двухзонную модель:
    - content reset внутри `@layer bricks-reset`;
    - builder chrome вне canvas;
    - teleport-контент остаётся покрыт;
    - published и canvas имеют одинаковые базовые стили;
    - host route без bricks-класса не получает ни одного reset-правила.
3. Смонтировать public assets под уникальным логическим prefix, например
   `/_bricks/`, и только когда включён builder:

```ts
if (isBuilderEnabled) {
    nitroConfig.publicAssets.push({
        dir: resolve(runtimeDir, 'public'),
        baseURL: '/_bricks/',
        maxAge: 60 * 60 * 24 * 7,
    });
}
```

4. Хранить в definitions логический module path
   `/_bricks/images/layouts/grid.svg`, а при выводе в браузер добавлять
   `app.baseURL` через один helper. Не размножать конкатенацию строк по компонентам.
5. Перевести:
    - layout thumbnails с `/images/layouts/*`;
    - placeholder `/images/brick-empty.webp`;
    - docs rewrite `/docs/guide/images/*`.
6. Helper должен сохранять absolute external URL и корректно обрабатывать `/`,
   `/app/`, `/tenant/app/`, trailing slash и query/hash.

Целевой helper:

```ts
export const BRICKS_ASSET_PREFIX = '/_bricks/';

export function resolveBricksAssetUrl(baseURL: string, assetPath: string): string {
    if (/^https?:\/\//i.test(assetPath)) return assetPath;
    return joinPathBase(baseURL, assetPath);
}
```

#### Тесты

- compiled CSS не содержит top-level `*`, `html`, `body`, `button`, `input` вне
  bricks surface или нулевой-specificity published fallback;
- hostile host stylesheet не меняет builder chrome, а host page не получает reset;
- с `app.baseURL = '/app/'` assets отвечают по
  `/app/_bricks/images/layouts/grid.svg` и не занимают `/images/layouts/grid.svg`;
- `features.builder = false` не регистрирует docs/thumbnails public assets;
- markdown images и placeholder используют тот же resolver.

#### Критерий приёмки

У host-приложения нет общих route names и CSS selectors, занятых пакетом. Все внутренние
asset URL работают как на `/`, так и под non-root `app.baseURL`.

### R1.2. Оставить health routes локальными и сделать readiness честным

#### Почему

В proxy mode без local DB middleware проксирует все `/api/**`, включая
`/api/bricks/health` и `/api/bricks/health/ready`. Локальный liveness может быть
обойдён. При этом default storage `checkHealth` без DB просто возвращает success и не
проверяет downstream backend, поэтому readiness даёт ложный 200.

#### Где менять

- `src/runtime/server/middleware/proxy.client.ts`
- новый `src/runtime/server/utils/proxyRouting.ts`
- `src/runtime/server/api/bricks/health/ready.get.ts`
- `src/runtime/modules/persistence/server/postgres/postgresStorageAdapter.ts`
- `src/module.ts`, опции `proxy`
- `src/module-runtime-config.ts`
- новый `test/serverProxyRouting.spec.ts`
- новый `test/serverHealthReadiness.spec.ts`

#### Что сделать

1. Вынести pure `shouldProxy(pathname, { hasDatabase, hasProxy })` и сравнивать
   разобранный pathname, а не произвольный `startsWith` URL с query.
2. Точные `GET/HEAD /api/bricks/health` и
   `GET/HEAD /api/bricks/health/ready` всегда обслуживать локально. Похожие пути,
   например `/api/bricks/healthcheck`, исключением не являются.
3. Liveness проверяет только живой процесс и не зависит от DB/proxy.
4. Readiness использовать по mode matrix:

| Режим                                      | Проверка                                      |
| ------------------------------------------ | --------------------------------------------- |
| `database.url` задан                       | `storage.checkHealth()` / `SELECT 1`          |
| DB нет, `proxy.url` задан                  | direct server-side probe downstream с timeout |
| custom adapter с `checkHealth`             | adapter check                                 |
| persistence нужен, но DB/proxy отсутствуют | 503 misconfigured                             |

5. Добавить `proxy.readinessPath?: string | false`; рекомендуемый default для bricks
   backend — `/api/bricks/health/ready`. Probe выполнять напрямую к server-only target,
   не через local proxy, без cookies/authorization пользователя, без redirect и с
   timeout 2–5 секунд.
6. В production-log не выводить target с userinfo/query; наружу всегда отдавать generic 503.

#### Тесты и критерий приёмки

- матрица `shouldProxy` покрывает DB/proxy/no-config, query и похожие пути;
- liveness всегда 200 при живом процессе, даже если downstream упал;
- readiness 503 при недоступной DB/downstream и 200 после восстановления;
- probe не рекурсирует в собственный proxy и не пересылает visitor identity.

### R1.3. Закрыть redaction production-логов data sources

#### Почему

`useBricksDataSources` не пишет `params` в production, но пишет уже подставленный `url`
и raw `error`. Секрет может находиться в path/query, а `ofetch` error — содержать request,
response body и options.

#### Где менять

- `src/runtime/modules/render/composables/useBricksDataSources.ts`
- новый `src/runtime/modules/render/utils/dataSourceLogging.ts`
- `test/renderDataSources.spec.ts`

#### Что сделать

1. В production не логировать resolved URL. Оставить `source.key`, method,
   componentId, brickPath и безопасный target kind/origin.
2. Для relative URL логировать `target: 'local'`; для absolute — только
   `URL.origin`. Path/query/hash не логировать.
3. Raw error заменить allow-list полей: `name`, нормализованный status/statusCode и
   внутренний correlation ID. `message`, `request`, `response`, `data`, `options` в
   production не писать, поскольку они могут включать URL или payload.
4. В dev сохранить подробный лог, явно отделив его compile-time веткой
   `import.meta.dev`.

Пример production payload:

```ts
{
    key: source.key,
    method,
    target: safeTarget(source.url), // "local" или "https://api.example.com"
    componentId: component.id,
    brickPath: component.brickPath,
    error: toSafeFetchError(error), // { name, statusCode }
}
```

#### Тесты и критерий приёмки

- error fixture содержит secret одновременно в param, path, query, message, response
  body и request options;
- `JSON.stringify(console.error payload)` не содержит ни одного secret marker;
- status code и component/source identity остаются доступны для диагностики.

### R1.4. Разделить package smoke и настоящий integration smoke

#### Почему

Текущий `scripts/pack-smoke.mjs` хорошо проверяет tarball и fresh consumer, но намеренно
запускается без Postgres и допускает 500 после успешной auth. Он проверяет наличие только
`0001_init.sql`, а не применение `0001–0003`. Поэтому зелёный job не доказывает рабочий
persistence contract.

#### Где менять

- `scripts/pack-smoke.mjs`
- новый `scripts/integration-smoke.mjs` либо `test/integration/*.spec.ts`
- `package.json`
- `.github/workflows/ci.yml`
- migrations `0001_init.sql`, `0002_media_unique_url.sql`,
  `0003_page_revision.sql`
- новый `docs/release-checklist.md`

#### Что сделать

1. Оставить `smoke:pack` быстрым packaging gate:
    - tarball строится;
    - exports/bin/dist присутствуют;
    - присутствуют все файлы migration registry, а не hardcode только `0001`;
    - clean consumer устанавливается и собирается;
    - liveness/auth boundary работают;
    - authorized persistence API без DB не считается успешным CRUD.
2. Добавить `test:integration` с Postgres service:
    - установить именно tarball в temp consumer;
    - запустить установленный `bricks-migrate status` и `migrate`;
    - проверить, что применены `0001`, `0002`, `0003`;
    - повторный migrate идемпотентен;
    - поднять production `.output` с DB;
    - проверить create/read/update с revision, stale 409, version list/restore, delete;
    - проверить public draft 404 и published 200;
    - проверить liveness/readiness.
3. Добавить MinIO/LocalStack этап для upload/delete/owned URL и очищенного SVG buffer.
   Если это слишком тяжело для каждого PR, Postgres job сделать required, а S3 job —
   nightly до стабилизации.
4. В CI сделать integration job required после build. Full `npm audit` также не должен
   быть вечным `|| true`: либо зафиксировать policy/allow-list, либо блокировать high и
   critical во всех dependencies.
5. Добавить `packageManager` с версией npm, которой создан lockfile, и
   `permissions: contents: read`. Для release workflow и branch protection зафиксировать
   ручные настройки в release checklist.

Минимальная новая script surface:

```json
{
    "scripts": {
        "test:integration": "node ./scripts/integration-smoke.mjs",
        "verify": "npm run format:check && npm run lint:check && npm run type-check && npm test"
    }
}
```

#### Критерий приёмки

Зелёный required CI доказывает не только сборку consumer, но и рабочую установку
актуальной схемы БД и основные production HTTP-контракты без допуска generic 500.

### R1.5. Превратить audit в проверяемый status ledger

#### Почему

`docs/architecture-audit.md` смешивает исходное состояние, журнал исправлений и текущий
вердикт. В нём одновременно остаются старые результаты type-check/audit и заявления о
закрытии, а часть формулировок уже опровергается кодом: глобальный `*`, неполная URL
sanitization, schema depth и restore без revision.

#### Где менять

- `docs/architecture-audit.md`
- этот план
- `README.md`
- `CLAUDE.md`
- новый `CHANGELOG.md`
- новый `docs/migration-guide.md`

#### Что сделать

1. Сохранить первоначальные findings как «Baseline/audit history», не выдавая их за
   текущее состояние.
2. Для каждого пункта завести поля: `status = open | partial | closed`, owner/PR,
   acceptance criteria, automated evidence, last verified commit/date.
3. `closed` ставить только при наличии regression-теста или воспроизводимой команды.
4. Исправить stale endpoint/file references после public/editorial split.
5. Отдельно перечислить breaking/consumer-visible изменения sprint:
    - Swiper `11 → 14`;
    - обязательный `IPublishAdapter.isOwnedUrl`;
    - migrations/CLI deployment step;
    - namespace public assets;
    - restore body с `expectedRevision`.
6. Для pre-1.0 пакета выпустить как минимум `0.2.0`, а не оставлять значимые контрактные
   изменения в `0.1.0`; приложить migration guide.

#### Критерий приёмки

Новый участник может по одному документу понять, что закрыто, какой тест это доказывает
и что ещё блокирует release, не восстанавливая историю по двум большим коммитам.

## 5. R2 — следующий этап, не маскировать как закрытый

### R2.1. Ограничить размер ответа data source

`ofetch` буферизует response до возврата composable. Allow-listed или локальный backend
может вернуть очень большой ответ и исчерпать память SSR процесса.

Рекомендация:

- добавить `dataSources.maxResponseBytes` в `src/module.ts` и
  `src/module-runtime-config.ts`, default 2–5 MiB;
- в `useDataSourceClient.ts` читать response stream с abort после лимита либо использовать
  fetch layer, который проверяет `Content-Length` и фактически прочитанные bytes;
- не доверять одному `Content-Length`;
- добавить metrics: duration, status class, rejected-by-policy, timeout, size-limit;
- тестировать chunked response без `Content-Length`.

### R2.2. Tenant/RBAC, E2E и release automation

Для внешнего multi-tenant применения нужны отдельные решения, а не локальные patch:

- tenant key во всех таблицах и unique constraints;
- exact host/subdomain mapping и запрет cross-tenant ID access;
- роли viewer/editor/publisher/admin вместо единого builder auth;
- browser E2E для builder → save → publish → reload → restore conflict;
- coverage thresholds по security/persistence/session слоям;
- signed/provenance npm release workflow, changelog и rollback checklist.

До появления этих механизмов deployment должен называться single-tenant и не обещать
tenant isolation.

## 6. Рекомендуемая нарезка PR/коммитов

Не повторять формат sprint-коммитов на 70/232 файла: security и state fixes должны быть
маленькими, независимо откатываемыми и иметь собственное доказательство.

1. `fix(security): harden svg and rich text url policies`
2. `fix(api): bound schema depth and complexity`
3. `fix(builder): keep copied page session identity consistent`
4. `fix(persistence): require revision when restoring versions`
5. `fix(module): namespace assets and finish style isolation`
6. `fix(server): keep health probes local and verify proxy readiness`
7. `fix(render): redact data source failure logs`
8. `test(ci): add database-backed fresh consumer integration`
9. `docs(release): reconcile audit statuses and migration contract`

Для каждого PR порядок один:

1. Отдельный failing regression-test или сохранённый HTTP repro.
2. Минимальное изменение production-кода.
3. Проверка negative path, а не только happy path.
4. Обновление contract docs рядом с изменением.
5. Зелёные scoped checks, затем полный gate перед merge.

## 7. Матрица проверок

После каждого PR:

```bash
npm run format:check
npm run lint:check
npm run type-check
npm test
```

После изменений runtime/module/package:

```bash
npm run build
npm run dev:build
npm run budget:bundle
npm run smoke:pack
```

Перед release:

```bash
npm run test:integration
npm audit
```

Дополнительная release-матрица:

| Сценарий                               | Ожидание                                      |
| -------------------------------------- | --------------------------------------------- |
| host на `/`, builder on                | builder/assets/API работают                   |
| host на `/app/`, builder on            | те же контракты без root URL                  |
| builder off, published on              | нет builder pages/chunks/docs assets          |
| local Postgres                         | readiness и CRUD 200, stale write 409         |
| proxy без DB                           | health local, readiness зависит от downstream |
| no DB/no proxy при persistence surface | readiness 503                                 |
| hostile HTML/SVG/schema                | sanitized либо 400, никогда 500               |
| две параллельные редакторские сессии   | update/restore не теряют запись молча         |

## 8. Definition of Done всего remediation

- [ ] `R0.1–R0.4` закрыты adversarial regression-тестами.
- [ ] Нет generic 500 на пользовательском JSON в пределах body limit.
- [ ] Все page-changing операции имеют зафиксированную concurrency policy.
- [ ] Compiled CSS и public routes не протекают в host namespace.
- [ ] `app.baseURL` проверен в fresh consumer, а не только pure helper-тестом.
- [ ] Readiness различает local DB, proxy и misconfiguration.
- [ ] Production logs проходят secret-marker тест.
- [ ] Tarball применяет все migrations и проходит DB-backed CRUD/restore smoke.
- [ ] `docs/architecture-audit.md` не содержит взаимоисключающих статусов.
- [ ] Consumer-visible изменения перечислены в changelog/migration guide.
- [ ] Все required CI jobs зелёные на точном release commit.

После выполнения этого списка результат sprint можно считать удовлетворительным и
закрытым. До этого корректная формулировка статуса: «основной архитектурный рефакторинг
выполнен, критические границы частично закрыты, release hardening продолжается».
