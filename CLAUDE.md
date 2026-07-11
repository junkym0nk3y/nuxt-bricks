# CLAUDE.md

## Обязательная проверка после изменений

После **каждого** изменения `.vue`, `.ts` файлов запускать:

```bash
npx vue-tsc --noEmit 2>&1 | grep <changed-file>
npx oxlint <changed-file>
```

Не ждать, пока пользователь сообщит об ошибке — проверять самостоятельно.

## Project Overview

`nuxt-bricks` — визуальный билдер лендингов для Nuxt 3 с drag-and-drop компонентами.
Самостоятельный Nuxt Module.

## Development Commands

- `npm run dev` — dev server (playground из `playground/`)
- `npm run build` / `npm run preview` — production build
- `npm run type-check` — TypeScript проверка
- `npm run lint:fix` — все линтеры + форматтеры
- `npm run bricks:gen` — генерация `bricks.json` из `.brick.ts`
- `npm run smoke:pack` — fresh-consumer smoke опубликованного tarball (`scripts/pack-smoke.mjs`: npm pack → чистый consumer во временной папке → nuxi build → boot + auth-матрица); тот же скрипт гоняет CI (`.github/workflows/ci.yml` — jobs checks/build/pack-smoke/audit на каждый PR и push в main; обновления зависимостей — Dependabot)
- `npm run budget:bundle` — bundle budget: gzip-размер initial JS поверхностей entry/published против бюджетов в `scripts/bundle-budget.mjs` (нужен свежий `npm run dev:build`; в CI — шаг job `build`); атрибуция состава чанков — `npx nuxi analyze playground`

## Initial bundle (2026-07-11)

Посетитель published-страницы не должен получать код билдера: (1) definitions leaf-блоков импортируют `.vue` через `defineAsyncComponent` (см. Registry layout-блоков); (2) prefetch-хинты builder-only чанков отключает хук `build:manifest` (`disableBuilderChunkPrefetch`, `src/module-setup.ts`): паттерн `BUILDER_ONLY_CHUNK_PATTERN` + замыкание статических imports (dynamicImports не обходить — через entry-чанк зафлагуются все lazy-чанки приложения, включая потребительские); `preload` не трогать — нужен гидратации. Новая builder-only зависимость/поддомен → дополнить паттерн. Бюджеты (gzip: entry 122 КБ, published 132 КБ) — константы `scripts/bundle-budget.mjs`, осознанный рост фиксируется diff'ом бюджета. Заголовки статей документации резолвятся лениво (`useDocumentationArticles`) — второй eager-glob `.md` не добавлять (инлайнит весь markdown в бандл).

## Architecture

### Доменная структура `src/runtime/modules/` (модульный монолит)

Все домены лежат в `src/runtime/modules/`. Каждый домен держит свои компоненты/композаблы/типы/утилиты рядом:

- `ui/` — Reka UI-кит (base/inputs/feedback/tooltip, общие типы в `types/`)
- `builder/` — редактор целиком, поддомены:
    - `app/` — composition root: `pages/` (builder.vue, [pagename].vue), `components/` (TheBuilderLoader), `composables/` (фасад useBuilderPage + useBuilderPagename/Session/DraftPersistence/PagenameSync, useComponentLibrary, useBuilderShortcuts, useBuilderToast, usePreviewSync, useModals, useDraggableComponent), `utils/` (brickSlots), `types/`; pagename: `route.params` — источник истины URL, `sessionPagename` (useBuilderPagename) — ключ черновиков localStorage; rename сессии — `renameSession` (миграция черновика + router.replace), страница билдера имеет статический page key (`definePageMeta.key`), поэтому rename не перемонтирует канвас, а навигацию на другую страницу обрабатывает watcher useBuilderSession
    - `core/` — ядро состояния: `stores/` (components + actions/, canvas, sidebar, history, navigation, componentActions), `utils/`, `constants/`, `composables/` (useComponentProperties), `components/` (BuilderLogo)
    - `shell/` — рамка редактора: `sidebar/` (components + property-editors/, composables, utils, types), `toolbar/` (чисто презентационный)
    - `canvas/` — слайсы `viewport/`, `item/`, `editing/` (каждый — `components/` + `composables/`) + общий `types/`
    - `publish/` — управление страницами: `pages/` (index.vue — полноэкранный дашборд, единственная поверхность управления страницами), `components/` (TheBuilderPublishDashboard + Nav/PagesList/PagesListRow/DetailsPanel + секции DetailsPanel SeoFields/OgImage/Routing/Versions, TheBuilderPublishCreatePageModal), `composables/` (usePublishDashboard, usePublishPageForm, usePublishCreatePageForm, usePublishPreview, usePublishPageVersions, usePublishVersionRestore), `stores/publish.ts`, `utils/` (черновики, payload, ошибки запросов, validationSchema — общая yup-фабрика meta-полей, dates, slugify, formState), `types/`; дашборд живёт на `/bricks`, редактор — `/bricks/<pagename>`, кнопка pages тулбара билдера ведёт на `/bricks` (emit `openPagesManager`), Publish-модалка удалена (2026-07-04)
    - `auth/` — database-auth UI: `pages/` (login.vue — страница `<builderPrefix>/login`, дефолт `/bricks/login`), `composables/` (useAuthSession, useAuthLoginForm), `utils/` (redirects — анти-open-redirect, validationSchema), `types/`; зависимости только ui+common
    - `documentation/` — TheBuilderDocumentationModal, `composables/`, `docs/guide/` (markdown-статьи), `types/`
    - `media/` — медиа-галерея и image resolver: `stores/media.ts`, `composables/` (useMediaUpload, useSchemaImageResolver), `utils/`
- `text-editor/` — TipTap (бывший `editor/`): компоненты, расширения (`tiptap/`), inline editing, `stores/inlineEditing.ts`
- `render/` — рендер опубликованной страницы (самодостаточен, store не использует); встроенный превью-роут `/preview/<pagename>` (имя роута `bricks-preview`, всегда preview-режим), live — два статических catch-all маршрута из `module.ts` (`bricks-page` `/:pagename(...)` и `bricks-page-prefixed` `/:urlPrefix(...)+/:pagename(...)`, regex-сегмент — `PAGE_ROUTE_SEGMENT` из `common/constants/publish.ts`); страница резолвится прямым lookup в `bricks-page-layout.global.ts`, там же — проверка соответствия urlPrefix/subdomain фактическому URL (route-per-page плагин `bricks-dynamic-routes.ts` удалён 2026-07-10: грузил весь список published на каждый SSR, не имел SPA-invalidation); live-lookup идёт через публичный клиент `usePublicPageClient` (без cookie/CSRF/401-редиректа на login, таймаут 10 с — паттерн `useDataSourceClient`), preview-ветка — через админский `useApiClient` (2026-07-11)
- `layouts-blocks/` — блоки лендинга (Grid/Flex/Section/Slider/...)
- `persistence/` — серверные адаптеры хранения (`server/postgres/`, `server/s3/`, `server/registry.ts`, `server/utils/` — общая логика Nitro-ручек); используется только из `src/runtime/server/api/bricks/**`; версионирование страниц (`bricks_page_versions`) — внутри `postgresStorageAdapter.updatePage` (см. «Версионирование страниц»)
- `common/` — только общее (2+ доменов): `composables/` (useBricksConfig, useBrickImports, useApiClient, useBricksStyles), `utils/` (main, case-transform; `bricks/` — paths, components, deviceVisibility, publishedPage; `routing/` — build-time), `constants/` (injectionKeys), `types/`

Вне `modules/` в `src/runtime/` остаётся инфраструктура Nuxt: `plugins/`, `server/`, `middleware/`, `layouts/`, `assets/`, `types.d.ts` (шим, реэкспортирует `modules/common/types`).

Направления зависимостей: `builder/app` (composition root) → все поддомены builder + text-editor + ui; `builder/canvas`/`builder/shell` → `builder/core`, `builder/publish`, text-editor, layouts-blocks, ui, common; `builder/core` НЕ импортирует canvas/shell — stores остаются в `core/`, перенос в фичевые поддомены дал бы цикл canvas↔shell. `render` — только common + layouts-blocks; `layouts-blocks` → `text-editor` (viewport канваса блоки получают через inject `CANVAS_VIEWPORT_KEY` из `common/constants/injectionKeys`, прямых импортов builder нет). Бывший tech-debt закрыт (2026-07-07): `useInlineEditor` декаплен через порт `IInlineEditorHost` (inject `INLINE_EDITOR_HOST_KEY`, провайдит `TheBuilderCanvas.vue`), `getModalOptions` живёт в `builder/core/composables/useModalOptions.ts` (`app/useModals` — фасад загрузки компонентов модалок). Импорты — явные относительные (auto-import локального кода отключён).

В каждой папке `composables/` и `utils/` лежит `README.md` с таблицей «файл → назначение» для навигации — поддерживать при добавлении/удалении файлов.

### Component System (Brick-based)

1. **Brick Files** (`.brick.ts`) — метаданные компонента + редактируемые свойства (`category`, `values`)
2. **Discovery** — `npm run bricks:gen` сканирует `.brick.ts` → `public/bricks.json`
3. **Property Editing** — панель свойств рендерит контролы по brick definitions

### Available Property Types

`input`, `select`, `tabs`, `switch`, `boolean`, `modal-select`, `image`, `video`, `textarea`, `array`, `object`, `inline-content`, `image-gallery`, `color`, `readonly`, `tags`, `json`, `accordion-items`, `interaction`

> Добавление нового типа: `/add-property-editor`

### Property Groups (Подгруппы свойств)

Свойства в панели редактора можно группировать в сворачиваемые аккордеоны через поле `group` в определении свойства.

```typescript
// В .brick.ts
export const brick = {
    values: {
        paddingTop: { default: 4, type: 'number', group: 'Отступы' },
        paddingBottom: { default: 4, type: 'number', group: 'Отступы' },
        backgroundColor: { default: '', type: 'color', group: 'Фон' },
    },
};

// В layoutProperties.ts (ILayoutProperty)
{ name: 'paddingTop', type: 'number', label: 'Padding', default: 4, group: 'Отступы' }
```

- Свойства с одинаковым `group` объединяются в сворачиваемую секцию
- Свойства без `group` отображаются плоско (обратная совместимость)
- Группы открыты по умолчанию

**Ключевые файлы** (пути — от `src/runtime/modules/`):

- `common/types/brick.ts` → `IPropertyDefinition.group`
- `common/types/index.ts` → `IBrickValues.group`
- `common/types/layoutProperty.d.ts` → `ILayoutProperty.group`
- `builder/shell/sidebar/components/BuilderShellSidebarPropertyEditors.vue` → рендеринг аккордеонов

### Property Unit Suffix

Поле `unit` в определении свойства добавляет суффикс единицы измерения в инпуте:

```typescript
{ name: 'width', type: 'input', label: 'Width', default: '100%', unit: 'rem' }
```

Суффикс отображается в `ui/inputs/BricksInput.vue` справа от поля (серый текст, read-only).

### Responsive Properties (Адаптивные свойства)

Поле `responsive: true` в определении свойства помечает его как адаптивное.

#### Для Layout-компонентов (Grid, Flex, Section, Space, Media, Svg)

```typescript
// layoutProperties.ts
{ name: 'paddingTop', type: 'number', default: 4, responsive: true, group: 'Отступы' }
```

**Архитектура CSS-переменных (published page):**

- Рендерер ставит per-device inline CSS vars: `--bricks-section-pt-mobile`, `--bricks-section-pt-tablet`, `--bricks-section-pt-desktop`
- CSS rules в `useResponsiveLayoutStyles.ts` выбирают активную переменную по viewport/media query

**Архитектура на канвасе (builder):**

- `useCanvasItemLayout.ts` → `effectiveViewport` использует `inject('canvasViewport')` в Figma mode, иначе `canvasStore.viewport`
- `resolveLayoutProps()` merge'ит `props.responsive.{device}` overrides

#### Для Brick Values (обычные UI-компоненты)

```typescript
// .brick.ts
export const brick: IBrickFileStructure = {
    values: {
        height: { default: 62, type: 'input', responsive: true },
        slidesPerView: { default: 1.5, type: 'input', responsive: true },
        speed: { default: 600, type: 'input' }, // НЕ адаптивный — всегда base value
    },
};
```

**Как работает:**

- Если хотя бы одно brick-свойство имеет `responsive: true` — в сайдбаре появляются device-табы (Desktop/Tablet/Mobile)
- При редактировании на non-desktop табе: свойства с `responsive: true` пишутся в `props.responsive[device]`, остальные — обновляют base value
- Рендерер передаёт `props.responsive` компоненту как есть → компонент **сам** резолвит значения по viewport
- Компонент должен реализовать резолвинг `props.responsive?.[device]?.[key]` (через ResizeObserver / `data-bricks-viewport` для билдера)

**Паттерн в компоненте:**

```typescript
function resolveResponsive(base: number, key: string): number {
    const bp = currentBreakpoint.value; // 'desktop' | 'tablet' | 'mobile'
    if (bp === 'desktop') return base;
    const override = props.responsive?.[bp]?.[key];
    return override !== undefined ? Number(override) : base;
}
```

**Ключевые файлы:**

- `layouts-blocks/utils/responsiveCss.ts` — генерация CSS rules из `responsiveCssVars` definitions (инжект — `composables/useResponsiveLayoutStyles.ts`)
- `layouts-blocks/components/blockX.definition.ts` — `renderPublished` с CSS-переменными (`makeResponsiveVars` из `utils/responsiveVars.ts`), разметка `responsive: true` и `group` в `properties`
- `render/composables/useRendererLayouts.ts` — диспатч published-рендера через registry
- `builder/canvas/item/composables/useCanvasItemLayout.ts` — `effectiveViewport`, `resolveBlockProps` из registry
- `builder/shell/sidebar/composables/useSidebarPropertiesPanel.ts` — `isResponsiveComponent`, `layoutDeviceScope` (по `responsiveMode` definition)

### Toolbar: % и rem в letter-spacing / line-height

`BricksToolbarEditableSelect` поддерживает ввод `%` рядом с числовыми значениями. Ввод `120%` для line-height или `5%` для letter-spacing сохраняется как есть в inline style.

**Ключевые файлы:**

- `plugins/text-editor-toolbar.ts` — `transformInput` различает `%` и `rem`
- `ui/inputs/BricksToolbarEditableSelect.vue` — `sanitizeNumericInput()` сохраняет `%`

### Canvas & Layout

- Ширина канваса = `width` активного viewport из конфига (дефолт desktop: 1600px), responsive viewports (mobile/tablet/desktop)
- Layout-компоненты (`BlockGrid`, `BlockFlex`, `BlockSpace`) содержат children
- Компоненты имеют `parent` (layout ID) и `children` (массив ID)

#### Registry layout-блоков (single source of truth)

Каждый блок описан **одним** файлом `layouts-blocks/components/blockX.definition.ts`
(`IBlockDefinition`): свойства панели (`properties` + `default`), `extraDefaults`,
`responsiveMode`, `responsiveCssVars`, опциональные `canvasBind`/`renderPublished`.
Всё остальное derived:

- `layouts-blocks/registry.ts` — `BLOCK_REGISTRY`, `getBlockDefinition`, `getBlockProperties`, `resolveBlockProps`, `getLayoutLibraryItems` (defaultProps = `properties[].default` + `extraDefaults`)
- `builder/core/constants/layoutComponents.ts`, `builder/core/utils/layoutProperties.ts` — тонкие обёртки над registry (API сохранён)
- `layouts-blocks/canvasBlockComponents.ts` — eager-мапа `.vue` для канваса (**bundle firewall**: импортируется только канвасом; definitions контейнеров Grid/Flex/Section/Space НЕ импортируют свои `.vue` — published рендерит их `h('div')` через `renderPublished`; definitions leaf-блоков (Text/Media/Accordion/Svg/Slider) импортируют свои `.vue` **только** через `defineAsyncComponent` — registry импортируется плагином bricks-styles на каждой странице, статический импорт утащил бы компонент и его зависимости (reka-ui, js-xss, swiper) в entry-бандл всех страниц потребителя, см. «Initial bundle»)

**Добавление блока:** `BlockX.vue` + `blockX.definition.ts` + 2 однострочные регистрации (`registry.ts`, `canvasBlockComponents.ts`).

> Добавление layout-блока: `/add-layout-block`

#### Rem-компенсация (`remBase`)

Если проект использует нестандартный `html { font-size }` (например, `0.6944vw`), в билдере rem-значения будут некорректными, т.к. `rem` всегда привязан к `<html>`.

**Решение:** билдер принудительно ставит `html { font-size: 10px }` инлайном (перебивает любой проектный CSS), а канвас компенсирует разницу через модификатор scale:

```
canvasScale = fitScale * remCompensation
remCompensation = targetRemPx / 10
```

**Конфигурация** — поле `remBase` в breakpoint'ах (`app.config.ts`):

```typescript
bricks: {
    breakpoints: {
        desktop: { width: 1600, remBase: '0.6944vw' }, // 0.6944 * 1600 / 100 = 11.11px → compensation = 1.111
        tablet:  { width: 768,  remBase: '10px' },      // compensation = 1.0
        mobile:  { width: 375,  remBase: '10px' },      // compensation = 1.0
    }
}
```

Без `remBase` → дефолт `10px` → `remCompensation = 1` → нулевой эффект.

**Ключевые файлы:**

- `builder/canvas/viewport/composables/useCanvasRemBase.ts` — вычисление коэффициента
- `builder/canvas/viewport/composables/useCanvas.ts` — применение к `canvasTransform`
- `builder/app/pages/builder.vue` — инлайн `font-size: 10px` на `<html>`

**Figma Mode:** каждый viewport применяет свою компенсацию через `transform: scale()` на `.canvas` элементе (inject `getRemCompensation` из `TheBuilderCanvas.vue`).

#### Контейнер контента (`.bricks-container`)

Билдер полностью владеет контейнером контента — и на канвасе, и на published-странице. Проектный `.container` не используется и не наследуется (бывший костыль `overrideContainer` удалён 2026-06-11). Единственный источник значений — `aside`/`maxWidth`/`minWidth` в breakpoint'ах (`app.config.ts`):

```typescript
bricks: {
    breakpoints: {
        desktop: { width: 1600, aside: '2rem', maxWidth: '192rem' },
        tablet:  { width: 768,  aside: '0.8rem' },
        mobile:  { width: 375,  aside: '0.4rem' },
    }
}
```

**Как работает:**

- `useBricksStyles.ts` генерирует CSS для `.bricks-container` безусловно
- Канвас: правила `[data-bricks-viewport]` (по выбранному viewport билдера)
- Published: media queries по device breakpoints (`device.breakpoints`), селектор обёрнут в `:where(:not(.bricks-canvas *))`, чтобы не протекать в канвас
- Fallback'и без конфига: maxWidth = `width` в rem, aside = `2rem`/`0.8rem`/`0.4rem`

**Ключевые файлы:**

- `common/composables/useBricksStyles.ts` — генерация CSS (канвас + published)
- `render/components/TheRenderer.vue` — обёртка `bricks-container` на published
- `builder/canvas/viewport/components/BuilderCanvasConditionalContainer.vue` — обёртка на канвасе
- `plugins/bricks-styles.ts` — инжектит стили на все страницы (и builder, и published)

### Inline Editing (TipTap)

Двойной клик на канвасе → TipTap-редактор поверх контента. Типы: `textarea` (HTML) и `inline-content` (сегменты).

> Добавление inline editing: `/add-inline-editing`

#### Критические паттерны

- **`shallowRef` для Editor** — TipTap Editor нельзя делать глубоко реактивным (`shallowRef`, не `ref`)
- **`isInternalUpdate` флаг** — предотвращает цикл canvas→store→canvas. Сбрасывается через `Promise.resolve().then()`
- **`@mousedown.prevent`** на кнопках тулбара — иначе теряется фокус TipTap
- **`watchEffect` + `editor.on('transaction')`** — реактивность toolbar через счётчик транзакций

#### Конвенция: `data-tiptap-content`

Если компонент рендерит проп с `type: 'textarea'` через `v-html`, на элемент **обязательно** `data-tiptap-content`:

```html
<!-- ✅ rich-text стили (ul, ol, p, blockquote) работают -->
<div data-tiptap-content v-html="props.text" />
```

Без атрибута — `ul`/`ol` внутри не получат стили. **НЕ** добавлять на `v-html` с простым текстом и на `ul`/`ol` в собственной вёрстке.

CSS: `.bricks-text [data-tiptap-content]` — **с пробелом** (descendant selector)! Без пробела не матчится.

### i18n (ru/en)

Переводы билдера — через `@nuxtjs/i18n` v10, паттерн «модуль-поставщик переводов»:

- Блок живёт в `setupBricksBuilderModules` (`src/module-setup.ts`), выполняется только при `features.builder !== false`: подписка на хук `i18n:registerModule` (ДО `installModule`) регистрирует `src/runtime/locales/ru.json` / `en.json`; дефолты i18n (`strategy: 'no_prefix'`, cookie `bricks-locale`, детект браузера, `defaultLocale` из `bricks.i18n.defaultLocale`) применяются через `defu` до установки i18n (голая стратегия `prefix_except_default` переписала бы маршруты → 404 на дашборде); опции потребителя из `nuxt.options.i18n` побеждают.
- **Порядок модулей критичен и fail-fast (2026-07-10)**: `nuxt-bricks` должен стоять **до** `@nuxtjs/i18n` в `modules` потребителя. Если i18n уже установлен к моменту setup bricks, его setup прочитал опции без bricks-дефолтов — маршруты билдера переписываются/переименовываются и отдают 404 (проверено живой сборкой; сам хук `i18n:registerModule` в v10 вызывается из `modules:done` при любом порядке, так что прежний warn «хук не сработал» реальную поломку не ловил). Теперь неверный порядок валит сборку сразу: ранний `throw` в `setupBricksBuilderModules` при `hasNuxtModule('@nuxtjs/i18n')`; проверка «хук не вызван» в `app:resolve` осталась защитой контракта для будущих версий i18n и тоже кидает ошибку.
- Все ключи — под префиксом `bricks.*` (проектные сообщения потребителя всегда побеждают). Неймспейсы: `common`, `toolbar`, `nav`, `auth`, `library`, `properties`, `publish`, `media`, `schema`, `canvas`, `textEditor`, `docs`, `validation`, `blocks`.
- Labels из definitions резолвятся через `resolveBricksLabel` (`common/utils/i18nLabels.ts`): ключи `bricks.*` переводятся, кастомные строки потребителя проходят как есть.
- **Ограничения значений словарей** (message compiler unplugin-vue-i18n валит загрузку **всей** локали): никакого HTML (`<p>…</p>` запрещён — обёртку добавлять в коде) и никаких literal-`{...}` вне именованных плейсхолдеров (`{текст, с пробелами}` → ошибка компиляции).
- В компонентах — `useI18n()`; в stores/composables без setup-контекста — `useNuxtApp().$i18n.t(...)`.
- vee-validate/yup (`plugins/vee-validate.ts`): сообщения — функции с `t()`, резолвятся в момент валидации → реактивны к смене локали без watch; `$i18n` в плагине резолвится лениво.

### Modal System

Компонент с `category: 'Modal'` в `.brick.ts` автоматически обнаруживается, исключается из сайдбара, появляется в `modal-select`.

> Добавление модалки: `/add-modal`

### Icons

`<BricksIcon icon="prefix:name" />`. Реестр: `plugins/icons/systemIconsRegistry.ts` — ядро для published/preview (photo/video/x/device-\*), `plugins/icons/builderIcons.ts` — `BUILDER_ICONS`, весь UI билдера (lazy-чанк, доливается только на `/bricks` через `runOnBuilderRoute`). Новые иконки — в `BUILDER_ICONS`, если не нужны на published.

> Добавление иконки: `/add-icon`

### Documentation (docs/guide/)

Markdown-статьи во встроенной документации билдера, разложены по локалям: `docs/guide/ru/` (полный набор), `docs/guide/en/` (частичный). `useDocumentationArticles.ts` фильтрует glob по папке активной локали; если папка локали пуста — fallback на `ru`. Кросс-ссылки (`./02-interface.md`) резолвятся только внутри активной локали — не ссылаться на статьи, которых нет в той же папке.

> Добавление статьи: `/add-doc-article`

## Environment Variables

**API Proxy:** `/api/*` → `PROXY_URL` (Python backend). `/mock-api/*` — локально.

- `PROXY_URL` — URL backend (обязателен)
- `NUXT_SERVER_CACHE_URL` — альтернативный URL для SSR
- `SERVER_API_URL` — fallback URL

**S3:** `YANDEX_STORAGE_ACCESS_KEY_ID`, `YANDEX_STORAGE_SECRET_ACCESS_KEY`, `YANDEX_STORAGE_BUCKET_NAME`

**Версии страниц:** `NUXT_BRICKS_VERSIONS_LIMIT` — глубина истории (дефолт 5, `0` — выкл; runtime-override без ребилда)

**Миграции БД:** `migrations/*.sql` (в npm-пакете, `files`), CLI `npm run bricks:migrate -- status|migrate` (`npx bricks-migrate`); подключение — `--url` / `NUXT_BRICKS_DATABASE_URL` / `DATABASE_URL`; реестр — `bricks_schema_migrations`, серия под advisory lock. docker-compose монтирует `migrations/` в initdb (бывший `database/init.sql` удалён 2026-07-10). Runtime-DDL в адаптерах нет (ensureSchema удалён 2026-07-10): миграции — единственный источник схемы; непримененная схема (42P01/42703 на `bricks_*`) логирует подсказку про `bricks-migrate` (`postgres/client.ts`).

**Auth** (`bricks.auth.mode`, env `BRICKS_AUTH_MODE`: `basic` | `database`, дефолт `basic`). Оба режима защищают одну матрицу путей (страничные префиксы — из `bricks.routes`, дефолты `/bricks` и `/preview`; матрица работает с логическим путём — `app.baseURL` стрипается в middleware): `<builderPrefix>/**` (менеджер страниц + редактор), `<previewPrefix>/**` (превью рендера), S3 и **весь editorial API `/api/bricks/**`включая GET** — списки страниц с drafts/schema, медиатека, версии (P0-аудит 2026-07-10). Открыт только public read-model`GET/HEAD /api/bricks/public/\*\*`— единственная ручка`public/pages/:pagename`(published-страница без editor-полей, прямой lookup для live-пути`bricks-page-layout.global.ts`; проекция — `persistence/server/utils/publicProjection.ts`; list-ручка `public/pages`удалена 2026-07-10 вместе с route-per-page плагином). Матрица —`server/utils/auth/routeProtection.ts`; middleware — `server/middleware/auth.ts`.

- **basic** — HTTP Basic Auth: `BASIC_AUTH_USERNAME` (дефолт: `admin`), `BASIC_AUTH_PASSWORD` (дефолт: `change-me`).
- **database** — пользователи в Postgres (scrypt-хеш), страница логина `/bricks/login`, cookie-сессии в БД (`bricks_users`/`bricks_sessions`; схема — только миграции, runtime-DDL нет). Срок сессии — `BRICKS_AUTH_SESSION_MAX_AGE` (сек, дефолт 604800). Требует `bricks.database.url`. Дефолтных пользователей нет — провижининг вручную: `npm run bricks:hash -- <password> --username <name>` → INSERT через psql. Смена пароля — тот же CLI, затем `UPDATE bricks_users SET password_hash = '<hash>' WHERE username = '<name>';` (+ опционально `DELETE FROM bricks_sessions WHERE user_id = ...` для отзыва активных сессий). Деактивация без удаления: `is_active = false`. Хранилище подменяемо: `setBricksAuthAdapter` из `nuxt-bricks/persistence`.
- **Runtime-нюанс NUXT\_-override**: `NUXT_BRICKS_AUTH_MODE` меняет только server-ключ — для клиента (401-интерцептор, login-страница) нужен и `NUXT_PUBLIC_BRICKS_AUTH_MODE`.
- **Нюансы database-режима**: rate limiter логина per-process (multi-replica ослабляет лимит); SPA-навигация с мёртвой сессией показывает публичные GET-данные до первой мутации (401 → авторедирект). `login` — зарезервированный pagename.
- Направления зависимостей: `builder/auth` → только ui+common; `persistence` используется из `src/runtime/server/api/bricks/**` **и** `server/middleware/auth.ts`.

## Известная проблема: glob-кэш Vite

После добавления нового `.brick.ts` файла компонент может не появиться в списке. Решение: **Hard refresh** (`Cmd+Shift+R`), или `rm -rf .nuxt node_modules/.vite && npm run dev`.

## URL Prefix и Subdomain

Опциональные поля `urlPrefix` и `subdomain` в `IPublishedPage`.

**Критические нюансы:**

- **`normalizePublishedPage`** (с `preserveSchema`; внутренний guard `isBricksSchema`) — единая копия в `common/utils/bricks/publishedPage.ts`, используется store'ом и middleware; новые поля добавлять только там
- Валидация формы (включая опциональные routing-поля) — чистая `validatePublishFormState` в `publish/utils/formValidation.ts` (бывший action `validateOptionalRoutingFields` удалён 2026-07-07)
- Preview (`/preview/<pagename>` — режим определяется роутом, query `?preview=true` удалён 2026-07-04) не проверяет subdomain

## Санитизация HTML/SVG (2026-07-10)

Всё, что уходит в `v-html`/`innerHTML` из недоверенных данных (schema, медиа), проходит через allow-list санитайзеры `common/utils/sanitize/` (js-xss, изоморфные — SSR и клиент дают одинаковый результат): `sanitizeRichTextHtml` (whitelist ровно под TipTap-набор `createTiptapEditor` — при добавлении расширения TipTap дополнять whitelist) и `sanitizeSvgMarkup` (статичная графика; script/foreignObject/SMIL/`<style>`/event-атрибуты/внешние href вырезаются). `svgContent` медиа санитизируется на записи (POST media, импорт из бакета). Импортировать js-xss напрямую нельзя — только через `sanitize/xssInterop.ts` (CJS-пакет: named value-импорты падают и в Node ESM prod, и в vite-node dev; interop — default-импорт с unwrap до module.exports, named — только type-only). Для кастомных brick-компонентов потребителя — публичный экспорт `nuxt-bricks/sanitize`; новый `v-html` во встроенном коде без санитайзера не добавлять.

## Версионирование страниц (2026-07-10)

Дефолтный Postgres-адаптер хранит последние N снапшотов каждой страницы (`bricks_page_versions`, FK CASCADE); UI — секция «Версии» в DetailsPanel дашборда (превью + откат с confirm-модалкой). Лимит — `bricks.versionsLimit` (дефолт 5, `0` — выкл), env `NUXT_BRICKS_VERSIONS_LIMIT`; резолвер в адаптере: env-строка, невалидное/отрицательное → 5. План/журнал — `docs/multi-ver.md`.

## Гонки записи и optimistic locking страниц (2026-07-10)

`bricks_pages.revision` (миграция `0003_page_revision.sql`) — монотонный счётчик: каждый контентный UPDATE инкрементит его; апдейт только `thumbnailUrl` — revision-neutral (превью пишется fire-and-forget PATCH'ем после сохранения, иначе он ронял бы следующее сохранение ложным 409; список полей — `REVISION_NEUTRAL_FIELDS` адаптера).

- **Precondition**: PUT/PATCH `/api/bricks/:id` принимают `expectedRevision` (полем данных не считается — «только precondition» → 400). Несовпадение → 409 `data.code=REVISION_CONFLICT`, занятый pagename (unique constraint, pre-check'ов SELECT-then-INSERT больше нет — гонка create/rename ловится по 23505) → 409 `PAGENAME_CONFLICT`. Коды — `PAGE_CONFLICT_CODES` (`common/constants/publish.ts`), доменные ошибки `BricksPagenameConflictError`/`BricksRevisionConflictError` — экспорт `nuxt-bricks/persistence` (кастомные IStorageAdapter обязаны кидать их же); HTTP-маппер — `toPageHttpError` (handlerHelpers). В транзакционном пути updatePage (payload со schema) конфликт откатывает снапшот версии вместе с транзакцией.
- **Клиент**: PUT билдера и PATCH meta-формы дашборда шлют `expectedRevision` (из записи стора); toggle published и thumbnail-PATCH — сознательно без precondition (однополевые PATCH ничего не перетирают). Конфликт → `toPageWriteError` (`publish/utils/requestErrors.ts`): refetch списка + toast `bricks.publish.toasts.revisionConflict` — повторное сохранение проходит и осознанно перезаписывает. `IPublishedPage.revision` опциональна: public projection и старые localStorage-снапшоты поля не имеют → запись без precondition (last-write-wins, мягкая деградация). Стор после PUT/PATCH/restore заменяет запись ответом сервера (`syncPageInList`); `updatePageRequest` возвращает нормализованную страницу — ответ PUT не выбрасывать.
- Все мутации адаптера — `INSERT`/`UPDATE`/`DELETE ... RETURNING` без предварительных SELECT; runtime-DDL нет (см. «Миграции БД»).

## Медиа-хранилище: managed namespace и атомарные операции (2026-07-10)

Пара «файл S3 + запись `bricks_media`» всегда меняется сервером атомарно, клиент делает один запрос (оркестрация — `persistence/server/utils/mediaOrchestration.ts`, DI-функции с юнит-тестами):

- **Upload** — `POST /api/bricks/media/upload` (multipart `file` + `category`): валидация/оптимизация → S3 → `createMedia`; ошибка БД компенсируется удалением файла. `svgContent` читает и санитизирует сервер (клиент файл не читает). Прежние `mock-api/s3-image`/`s3-delete` удалены; `s3-page-thumbnail` и `s3-media-proxy` остались (снапшот превью, CORS-проксирование для dom-to-image).
- **Delete** — `DELETE /api/bricks/media/:id`: file-first (S3-delete идемпотентен → безопасный ретрай); ошибка хранилища — 502, запись остаётся; URL вне managed-хранилища (legacy) — удаляется только запись. `DELETE /api/bricks/:id` страницы best-effort чистит её превью (`cleanupPageThumbnail`, `?v=`-cache-buster срезает политика ключей).
- **Managed namespace** — модуль оперирует только своими префиксами бакета: `bricks.s3.prefix` (дефолт `bricks-media/`) и `bricks.s3.thumbnailsPrefix` (дефолт `bricks-thumbnails/`). Ключи строит только `IPublishAdapter.buildFileKey(kind, filename)` — **хардкод префиксов в ручках запрещён**; `deleteFile`/`isOwnedUrl`/`uploadFile` отказывают ключам вне namespace (чистые функции — `s3/s3KeyPolicy.ts`). Регистрация URL бакета вне префиксов через `POST /api/bricks/media` — 400.
- **Уникальность url** — миграция `0002_media_unique_url.sql` (дедуп + unique index); `createMedia` идемпотентен по `url` (unique_violation → возвращает существующую запись; `isUniqueViolation` в `queryBuilders.ts`). Контракт расширен: кастомные `IStorageAdapter` обязаны реализовать `getMedia(id)`, `IPublishAdapter` — `buildFileKey` (компилятор заставит).
- Ошибка удаления в галерее теперь показывается пользователю (toast), элемент из списка не исчезает.

## Ingress и resource controls (2026-07-10)

Серверные ручки не доверяют ни размеру, ни содержимому входящих данных; читатели h3 (`readBody`/`readMultipartFormData`) в ручках модуля запрещены — только лимитированные из `persistence/server/utils/requestBodyLimits.ts`:

- **Лимиты тела** — два барьера: `Content-Length` pre-check (413 до чтения) + стрим-чтение с обрывом при превышении (chunked без заголовка не обходит). Multipart парсится из лимитированного буфера через `Response.formData()` (undici), тип части — `IUploadedFilePart` (persistence/types/media). Лимиты: upload — `max(image, video) + 1 МБ` конверта; thumbnail — 10 МБ; JSON editorial (через `readNormalizedBody`) — 4 МБ; login покрыт тем же `readNormalizedBody`; media-proxy request — 16 КБ.
- **Magic bytes** (`fileSignatures.ts`) — `sniffImageFormat`/`sniffVideoFormat`/`looksLikeSvgMarkup`: содержимое, не соответствующее заявленному классу (растр/SVG/видео), — 400; проверяется в `validateAndOptimizeImage`/`validateVideo` и в `s3-page-thumbnail`.
- **Sharp** — единственная точка вызова `optimizeToWebp` (`imageProcessing.ts`): `limitInputPixels` 100 МП + семафор `concurrencyGate.ts` (4 одновременных, очередь 32, переполнение → 503); `s3-page-thumbnail` тоже идёт через неё, прямые вызовы sharp в ручках не добавлять.
- **Rate limit** — `server/utils/requestRateLimiter.ts` (fixed window per IP, sweep + maxEntries по паттерну loginRateLimiter): upload и thumbnail — 30/мин на IP, 429 + `Retry-After`; лимитер per-process (multi-replica ослабляет).
- **Клиентский IP лимитеров** — `server/utils/requestClientIp.ts` (единственная точка: upload/thumbnail/login): дефолт — только socket-адрес (x-forwarded-\* не доверяем); за reverse proxy per-IP-ключи схлопываются в один bucket → опт-ин `bricks.trustProxy` / env `NUXT_BRICKS_TRUST_PROXY` (runtime-override) — берётся **последний** элемент `x-forwarded-for` (дописан ближайшим прокси; первый — spoof'ится клиентом при аппендящем прокси). Ровно один доверенный хоп; `getRequestIP(event, { xForwardedFor: true })` h3 в новом коде не использовать (берёт первый элемент).
- `fetchSvgContent` (импорт из бакета) — fetch с `redirect: 'error'`, таймаутом 10 с и стрим-лимитом 2 МБ.
- Reverse proxy с собственным body-лимитом — рекомендация для production (README «Лимиты запросов и ресурсов»).

## Read-models списков (2026-07-11)

`GET /api/bricks` отдаёт **сводки без `schema`** (`PAGE_SUMMARY_FIELDS` — паттерн `VERSION_SUMMARY_FIELDS`); полная строка — только point-lookup `GET /api/bricks/:id`. Клиент: `publishStore.publishedPages` типизирован `TPublishedPageSummary[]` (нормализация — `normalizePublishedPageSummary`), `syncPageInList` срезает `schema` из ответов PUT/PATCH; схему канваса `useBuilderSession` и `duplicatePage` берут через `fetchPageRequest(id)` (`publishApi.ts`). Контракт `IStorageAdapter.listPages(): TBricksPageSummaryRow[]` — кастомные адаптеры обязаны вернуть сводку без schema. Новые поля страницы, нужные дашборду/precondition'ам, добавлять в обе проекции (`PAGE_SELECT_FIELDS` + `PAGE_SUMMARY_FIELDS`). S3 `listFiles` дочитывает листинг по `NextContinuationToken` (>1000 объектов); импорт бакета (`mediaImport.ts`) дедупится идемпотентным `createMedia` — per-file SELECT не добавлять. Читать `schema` из записей списка стора нельзя — поля там больше нет (компилятор поймает).

## Data sources published-страниц (2026-07-11)

Запросы `dataSources` brick-компонентов идут через выделенный публичный клиент `useDataSourceClient` (render/composables) — НЕ через `useApiClient` (тот пробрасывает cookie/x-forwarded-\* и редиректит посетителя на login при 401): без cookies/identity/CSRF, таймаут (дефолт 10 с, `retry: 0`). Политика — чистые функции `render/utils/dataSourcePolicy.ts`: методы только GET/HEAD (тип `TBrickDataSourceMethod` сужен), относительные URL всегда разрешены, абсолютные — http(s) + хост из `bricks.dataSources.allowedHosts` (`runtimeConfig.public.bricksDataSources`; дефолты timeoutMs/concurrency — константы policy-файла). Выполнение (`useRendererDataSources`): пул `runWithConcurrencyLimit` (`render/utils/requestPool.ts`, дефолт 6 одновременных) + dedup одинаковых (method+url) запросов одного прогона (`TDataSourceRequestCache` — Map на каждый прогон, refresh получает свежие данные). Логи: детали (params/componentProps/превью ответов) — только `import.meta.dev`; в prod — key/url/method/componentId и причина отказа политики. Build-time заполнение runtimeConfig вынесено из module.ts в `src/module-runtime-config.ts` (max-lines).

## Health-пробы и error envelope (2026-07-11)

- `GET /api/bricks/health` (liveness) и `GET /api/bricks/health/ready` (readiness: опциональный `IStorageAdapter.checkHealth`; дефолтный Postgres-адаптер — `SELECT 1`, без сконфигурированной БД проверка пропускается; недоступное хранилище → 503 без деталей, таймаут 5 с) — открыты в auth-матрице (только GET/HEAD), `isPublic` в `BRICKS_API_HANDLERS` (живут и в render-only режиме).
- `toHttpError` (handlerHelpers) — generic 500-envelope: внутренние сообщения ошибок наружу не отдаются; в ответе `data.errorId`, тот же id — в server-логе (корреляция). Новые 5xx не должны интерполировать `error.message` в `statusMessage`.
- `docker-compose.yml` — только локальная dev-среда (порт на localhost, пароль через env `POSTGRES_PASSWORD`); production runbook — README «Production deployment и operability».

## Маршруты и поверхности модуля (2026-07-10)

Пути страниц и поверхности конфигурируемы (build-time, env-override нет — был бы рассинхрон с зарегистрированными маршрутами):

- **`bricks.routes`** — `builderPrefix` (дефолт `/bricks`: дашборд, редактор `<prefix>/:pagename`, логин `<prefix>/login`) и `previewPrefix` (дефолт `/preview`). Валидация fail-fast в setup (`validateBricksRoutePrefixes`): формат `/[a-z0-9-]+(/…)`, без trailing slash, без пересечения префиксов и зарезервированных корней (`api`, `mock-api`, `_nuxt`). Значения кладутся в `runtimeConfig.public.bricksRoutes`.
- **`bricks.features`** — `builder` (false → render-only: нет страниц билдера/логина/превью, плагинов vee-validate/text-editor-toolbar, mock-api, editorial API — из `BRICKS_API_HANDLERS` регистрируются только записи с `isPublic`; Pinia и i18n не подключаются) и `publishedPages` (false → нет catch-all live-маршрутов). Auth-матрица от флагов не зависит (fail-closed).
- **Единый источник путей** — `common/utils/bricks/routePaths.ts` (+ композабл `common/composables/useBricksRoutePaths.ts`: `withBase`/`stripBase`/`builderLoginPath`/`previewPagePath`); имена роутов — константы `BRICKS_ROUTE_NAMES` (`common/constants/routes.ts`). **Хардкод `/bricks`/`/preview` и строковых имён роутов в новом коде запрещён**: внутри Vue Router — переходы по именам (`router.push({ name })`), для `window.location`/`window.open`/`<a href>`/серверных редиректов — композабл/утилиты (учитывают `app.baseURL`).
- **`app.baseURL` поддержан по всей цепочке**: auth-middleware стрипает base до матрицы и строит login-redirect с base (redirect-параметр — логический путь, его потом получает `navigateTo`); `useApiClient` строит локальный base как `origin + app.baseURL` (вне base Nitro отвечает 302 — GET переживает, POST превращался бы в GET и ломался); гейт плагинов билдера (`builderRouteScope`) стрипает base из начального pathname.
- **Публичные ассеты модуля — под `/_bricks/`** (2026-07-12): publicAssets регистрируются с `baseURL: BRICKS_PUBLIC_ASSETS_BASE` и только при включённом builder (ассеты билдерные: превью layout-блоков, плейсхолдер `brick-empty.webp`, картинки документации). URL строит `resolveBricksAssetUrl` (`common/utils/bricks/assetPaths.ts`, композабл `useBricksAssetUrl` — учитывают `app.baseURL`); **хардкод `/images/...` запрещён**. `thumbnail` в `IBlockDefinition` — asset-путь без префикса (`'images/layouts/grid.svg'`), резолвится в точке рендера (`BuilderShellSidebarComponentCard`); плейсхолдер в схемах распознаётся суффиксом (legacy `/images/brick-empty.webp` из старых схем остаётся валидным маркером, но URL по нему уже не отдаётся).
- Build-time хелперы setup'а — `src/module-setup.ts` (резолв surfaces, Pinia/i18n билдера, registerBricksPages/registerBricksServerHandlers); `src/module.ts` остаётся тонким.

## Изоляция стилей от host-приложения (2026-07-10, двухзонный reset — 2026-07-11)

Модуль не добавляет глобальных селекторов; reset в `assets/scss/default.scss` — **двухзонный** (npm-зависимость normalize.css не возвращать — вендорен как `@mixin bricks-normalize` в `assets/scss/common/_normalize.scss`, без html-правила):

- **Зона контента** — `@layer bricks-reset { :where(.bricks-canvas, body.bricks-render) { normalize + strip-reset } }`: канвас билдера и published/preview (класс `bricks-render` ставит `render/pages/[pagename].vue`). Layered-стили проигрывают любому нелейерному правилу проекта (даже голому `button {}`) → канвас и published ведут себя идентично и наследуют проектные стили — это фича. `@layer bricks-reset, bricks-typography;` в начале файла — типографика TipTap побеждает reset.
- **Зона хрома билдера** — нелейерный reset (0,0,1): `:where(body.bricks-page)` + `:not(:where(.bricks-canvas *))`-хвосты. Проигрывает CSS-модулям билдера (0,1,0), выигрывает у element-стилей проекта по порядку загрузки (bricks-CSS пушится в `nuxt.options.css` после CSS потребителя); классовые селекторы проекта хром не матчат (хешированные CSS-модули). Teleport-контент модалок — дочерние элементы body, покрыт зоной хрома; `.ProseMirror`-правила — под `body.bricks-page`. Reset выше (0,0,1) в зоне хрома не поднимать (перебьёт CSS-модули — уже ловили); новые reset-правила — только в эти две зоны, strip-reset-списки зон держать синхронными.
- Принятые ограничения: наследуемые проектные стили с `html`/`body` (font-family и т.п.) в канвас не попадают (их перекрывает `body.bricks-page` — поверхностный блок (0,1,1), единственное расхождение канвас/published); проектные element-селекторы повышенной специфичности (`#app button`) могут пробить хром — та же экспозиция, что при бывшем глобальном normalize.

Published/preview: fallback'и **нулевой специфичности** — `:where(html){font-size:10px;line-height:1.15;-webkit-text-size-adjust:100%}` + `:where(body){margin:0}` инжектит `render/pages/[pagename].vue` (проектная rem-база всегда побеждает, см. `remBase`), контентный мини-reset `:where(.bricks-container ...)` — в default.scss (страховка для рендера вне bricks-маршрутов). Все CSS-переменные (`--bricks-shadow-*`, `--bricks-border-radius-*`, `--bricks-rgb-*`, `--bricks-overlay-*`, `--bricks-font-size-*`, `--bricks-default-transition`), transition-имена (`bricks-sidebar`, `bricks-fade`, ...) и utility-классы (`.bricks-scrollbox`) — с префиксом; id корня layout — `#bricks-app` (attach тултипов). Swiper CSS импортирует `BlockSlider.vue` (едет в чанк слайдера, не в глобальный css). Шрифт остался под именем `Inter` сознательно: legacy-схемы и `useBricksConfig.defaultFont` ссылаются literal'ом. Новые глобальные селекторы/переменные без префикса `bricks-` не добавлять.

**Критические нюансы:**

- Снапшот создаёт **`postgresStorageAdapter.updatePage` в транзакции** (`withTransaction` из `server/postgres/client.ts`: INSERT прежней строки — он же existence-чек → UPDATE → prune), и только когда payload содержит `schema` и лимит > 0. Meta-only PATCH (title/published/thumbnail) версий не плодит; POST create тоже (первая версия — при первом сохранении schema). Контракт — в JSDoc `IStorageAdapter.updatePage`; интерфейс расширен методами `listPageVersions`/`getPageVersion` — **кастомные storage-адаптеры потребителей обязаны их дореализовать** (компилятор заставит) и сами отвечают за свою стратегию снапшотов.
- **Restore** (`POST /api/bricks/:id/versions/:versionId/restore`) применяет только `schema` + `layout` + `backgroundColor` — pagename/title/SEO/published не трогает (нет конфликтов уникальности pagename и SEO-откатов). Идёт через `updatePage` → пре-restore состояние само снапшотится («откат отката» бесплатно). Все ручки версий (GET и POST) — под auth-middleware, как и весь editorial API (с 2026-07-10).
- Роуты `/api/bricks/**` **не автосканируются** — манифест перенесён из module.ts в `src/api-handlers.ts` (`BRICKS_API_HANDLERS`); специфичные пути (`/versions`) регистрировать до generic `/api/bricks/:id`.
- **Превью версии** (`usePublishPreview.previewPageVersion`) кладёт полный снапшот в `localStorage('bricks-preview-page')` с **текущим** `pagename` (не из версии — должен совпасть с роутом `/preview/<pagename>`). Ограничение v1: открытая вкладка билдера той же страницы перекроет превью живой схемой канваса через `BroadcastChannel('bricks-preview-sync')`; `window.open` происходит после fetch снапшота — при аномально медленном ответе браузер может убить transient activation и заблокировать попап.
- Секция «Версии» **ленивая**: список грузится при открытии аккордеона, перезагрузка по `watch(page.updatedAt)` только у открытой секции; смена страницы сворачивает секцию. Даты — `formatPageDateTime` (DD.MM.YYYY HH:mm, `publish/utils/dates.ts`).
- Понижение лимита ужимает историю при следующем сохранении (prune на каждом снапшоте, `ORDER BY created_at DESC, id DESC`). Удаление страницы удаляет версии каскадом.
