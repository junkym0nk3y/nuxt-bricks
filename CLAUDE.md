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

## Architecture

### Доменная структура `src/runtime/modules/` (модульный монолит)

Все домены лежат в `src/runtime/modules/`. Каждый домен держит свои компоненты/композаблы/типы/утилиты рядом:

- `ui/` — Reka UI-кит (base/inputs/feedback/tooltip, общие типы в `types/`)
- `builder/` — редактор целиком, поддомены:
    - `app/` — composition root: `pages/` (builder.vue, [pagename].vue), `components/` (TheBuilderLoader), `composables/` (фасад useBuilderPage + useBuilderSession/DraftPersistence/PagenameSync, useComponentLibrary, useBuilderShortcuts, useBuilderToast, usePreviewSync, useModals, useDraggableComponent), `utils/` (brickSlots), `types/`
    - `core/` — ядро состояния: `stores/` (components + actions/, canvas, sidebar, history, navigation, componentActions), `utils/`, `constants/`, `composables/` (useComponentProperties), `components/` (BuilderLogo)
    - `shell/` — рамка редактора: `sidebar/` (components + property-editors/, composables, utils, types), `toolbar/` (чисто презентационный)
    - `canvas/` — слайсы `viewport/`, `item/`, `editing/` (каждый — `components/` + `composables/`) + общий `types/`
    - `publish/` — управление страницами: `pages/` (index.vue — дашборд), `components/` (TheBuilderPublishPagesModal, BuilderPublishPageCard), `stores/publish.ts`, `utils/` (черновики, payload, ошибки запросов), `types/`
    - `documentation/` — TheBuilderDocumentationModal, `composables/`, `docs/guide/` (markdown-статьи), `types/`
    - `media/` — медиа-галерея и image resolver: `stores/media.ts`, `composables/` (useMediaUpload, useSchemaImageResolver), `utils/`
- `text-editor/` — TipTap (бывший `editor/`): компоненты, расширения (`tiptap/`), inline editing, `stores/inlineEditing.ts`
- `render/` — рендер опубликованной страницы (самодостаточен, store не использует)
- `layouts-blocks/` — блоки лендинга (Grid/Flex/Section/Slider/...)
- `persistence/` — серверные адаптеры хранения (`server/postgres/`, `server/s3/`, `server/registry.ts`, `server/utils/` — общая логика Nitro-ручек); используется только из `src/runtime/server/api/bricks/**`
- `common/` — только общее (2+ доменов): `composables/` (useBricksConfig, useBrickImports, useApiClient, useBricksStyles), `utils/` (main, case-transform; `bricks/` — paths, components, deviceVisibility, publishedPage; `routing/` — build-time), `constants/` (injectionKeys), `types/`

Вне `modules/` в `src/runtime/` остаётся инфраструктура Nuxt: `plugins/`, `server/`, `middleware/`, `layouts/`, `assets/`, `types.d.ts` (шим, реэкспортирует `modules/common/types`).

Направления зависимостей: `builder/app` (composition root) → все поддомены builder + text-editor + ui; `builder/canvas`/`builder/shell` → `builder/core`, `builder/publish`, text-editor, layouts-blocks, ui, common; `builder/core` НЕ импортирует canvas/shell — stores остаются в `core/`, перенос в фичевые поддомены дал бы цикл canvas↔shell. `render` — только common + layouts-blocks; `layouts-blocks` → `text-editor` (viewport канваса блоки получают через inject `CANVAS_VIEWPORT_KEY` из `common/constants/injectionKeys`, прямых импортов builder нет). Tech-debt: `text-editor/composables/useInlineEditor.ts` → builder/core/stores/components и `core/composables/useComponentProperties.ts` → app/composables/useModals (`getModalOptions`) — кандидаты на DI из composition root. Импорты — явные относительные (auto-import локального кода отключён).

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
- `layouts-blocks/canvasBlockComponents.ts` — eager-мапа `.vue` для канваса (**bundle firewall**: импортируется только канвасом; definitions контейнеров Grid/Flex/Section/Space НЕ импортируют свои `.vue` — published рендерит их `h('div')` через `renderPublished`)

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

### Modal System

Компонент с `category: 'Modal'` в `.brick.ts` автоматически обнаруживается, исключается из сайдбара, появляется в `modal-select`.

> Добавление модалки: `/add-modal`

### Icons

`<BricksIcon icon="prefix:name" />`. Регистрация в `plugins/vue-icons.ts` → `SYSTEM_ICONS`.

> Добавление иконки: `/add-icon`

### Documentation (docs/guide/)

Markdown-статьи во встроенной документации билдера.

> Добавление статьи: `/add-doc-article`

## Environment Variables

**API Proxy:** `/api/*` → `PROXY_URL` (Python backend). `/mock-api/*` — локально.

- `PROXY_URL` — URL backend (обязателен)
- `NUXT_SERVER_CACHE_URL` — альтернативный URL для SSR
- `SERVER_API_URL` — fallback URL

**S3:** `YANDEX_STORAGE_ACCESS_KEY_ID`, `YANDEX_STORAGE_SECRET_ACCESS_KEY`, `YANDEX_STORAGE_BUCKET_NAME`

**Basic Auth:** `BASIC_AUTH_USERNAME` (дефолт: `admin`), `BASIC_AUTH_PASSWORD` (дефолт: `change-me`). Защищает `/builder/**`, preview, S3 и модифицирующие API.

## Известная проблема: glob-кэш Vite

После добавления нового `.brick.ts` файла компонент может не появиться в списке. Решение: **Hard refresh** (`Cmd+Shift+R`), или `rm -rf .nuxt node_modules/.vite && npm run dev`.

## URL Prefix и Subdomain

Опциональные поля `urlPrefix` и `subdomain` в `IPublishedPage`.

**Критические нюансы:**

- **`normalizePublishedPage`** (с `isBricksSchema`, `preserveSchema`) — единая копия в `common/utils/bricks/publishedPage.ts`, используется store'ом и middleware; новые поля добавлять только там
- **`validateOptionalRoutingFields`** — отдельный action в store, чтобы не превышать complexity (max 20)
- Preview (`?preview=true`) не проверяет subdomain
