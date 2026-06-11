# Architecture Cleanup: граф зависимостей + registry для layouts-blocks

> Roadmap по результатам архитектурного ревью `src/runtime/modules/` (2026-06-11).
> Выполняется шагами (Часть C), каждый шаг независимо приземляем и проверяем.
> Все пути в документе — от `src/runtime/modules/`, если не указано иное.

## Цель

Подготовка к полному редизайну UI: каждый домен должен быть изолирован, общее —
вынесено в контракты (`common`) и за абстрактный контроллер (builder-stores).
Две рабочие нити:

- **Часть A** — устранение ~10 импортов-нарушений слоистости + машинная фиксация
  правил через dependency-cruiser.
- **Часть B** — registry для layout-блоков: сейчас добавление одного блока требует
  ручных правок в **10 местах в 5 доменах** с дублированием дефолтов. Цель:
  `BlockX.vue` + `blockX.definition.ts` + 2 однострочные регистрации.

## Принятые решения

| Вопрос | Решение |
|---|---|
| `render → ui` (BricksCloseButton) | **Не разрешать.** Кнопка копируется в `render/` как самостоятельный компонент (получит уникальный стиль при редизайне). Правило «render → только common + layouts-blocks» остаётся строгим. |
| Разъехавшиеся дефолты layout-блоков | **По поведению создания**: истинны значения из `builder/constants/layoutComponents.ts` (Flex `wrap: false`, Title `marginBottom: 0`, RU-текст в Text). Новые компоненты создаются ровно как сейчас. |
| Registry vs unification с `.brick.ts` | **Runtime TS-registry в `layouts-blocks/`.** `bricks.json` — build-time JSON: не может нести component-refs, render-функции, function-valued properties (Title зависит от runtime `availableFonts`), коэрцию. Unification всё равно потребовала бы второй runtime-механизм. |
| editor в графе зависимостей | editor — фичевый домен уровня canvas/sidebar: `editor → builder` (stores/utils/types/constants) разрешено; `builder/* (кроме pages) → editor` запрещено. |
| `ui → common` (решение на шаге A2, 2026-06-12) | **Разрешить.** common — нижний слой контрактов/утилит и наверх не смотрит; дублировать `validateHex`/`normalizeHex` и `IBrickDemoValues` в ui ради строгости — хуже для поддержки. Правило `ui-is-bottom`: `ui → (?!ui\|common)` запрещён. |

---

## Часть 0. Текущее состояние (факты из ревью)

### Матрица фактических зависимостей (количество импортов)

```
canvas  → builder 30, common 29, layouts-blocks 10, ui 5, editor 4
sidebar → builder 20, common 25, ui 25, layouts-blocks 6, media 3
builder → common 45, ui 13, media 8, layouts-blocks 3, editor 2, canvas/sidebar/toolbar (только pages)
render  → common 18, layouts-blocks 6, ui 1 ❌
editor  → ui 6, layouts-blocks 2, builder 2, media 1, common 1
media   → ui 7, common 5, builder 1 ❌, layouts-blocks 1
ui      → editor 6 ❌, common 6
common  → render 1 ❌, layouts-blocks 1 ❌
layouts-blocks → common 11, editor 4, media 1, builder 1 ❌ (BlockSlider, известный tech-debt)
persistence → common 5, media 5 (только типы)
toolbar → ui 7, builder 1 ✅
```

✅ canvas ↔ sidebar = 0 импортов в обе стороны — mediator через builder-stores работает.

### Нарушения

1. **`ui → editor`** — `ui/inputs/BricksTextArea.vue:29` рантаймово импортирует
   `useInlineEditingStore`; 5 ui-компонентов импортируют типы из
   `editor/types/text-editor-toolbar.d.ts`.
2. **Цикл builder ↔ editor** — `builder/composables/useBuilderPage.ts:26` →
   `editor/stores/inlineEditing` (runtime); `editor/composables/useInlineEditor.ts:18` →
   `builder/stores/components` (runtime); взаимный type-импорт
   `builder/utils/inlineEditableProp.ts:3` ↔ `editor/stores/inlineEditing.ts:5`.
3. **Цикл builder ↔ media** — `media/components/TheMediaGalleryModal.vue` →
   `builder/components/modal/ConfirmActionModal.vue`.
4. **`common` смотрит вверх** — `common/types/index.ts` импортирует
   `render/types/bricks-data-source` (~строка 94) и `layouts-blocks/types/layouts`.
5. **`render → ui`** — `render/pages/[pagename].vue` → `ui/base/modal/BricksCloseButton.vue`.
6. **`layouts-blocks → builder`** — `BlockSlider.vue:10` → `builder/stores/canvas`.
7. **Контрактные типы размазаны**: `layouts-blocks/types/layouts` и `media/types/media`
   импортируются 6 доменами каждый — это де-факто схема данных всей системы.

### Сюрпризы из исследования кода (важно для Части B)

- **Published-рендерер НЕ использует контейнерные Block-компоненты.**
  `render/composables/useRendererLayouts.ts` рендерит Grid/Flex/Section/Space как
  `h('div')` с inline-стилями и per-device CSS-vars (`--bricks-grid-*-{device}`),
  сознательно минуя `BlockGrid`/`BlockFlex`/… — те несут editor chrome (drop zones,
  пунктирные рамки, ResizeObserver-оверлей). Generic-рендер возможен только для
  leaf-блоков; контейнерам нужен escape hatch `renderPublished`.
- **Дефолты уже разъехались** между `layoutComponents.ts` и `layoutProperties.ts`
  (CLAUDE.md требует синхронность — её нет): Flex `wrap: false` vs `true`;
  Title `marginBottom: 0` vs `2`; Text `'<p>Введите текст</p>'` vs
  `'<p>Enter your text content here...</p>'`; лишний `padding: 0` у Grid/Flex;
  Slider `captions/captionPosition/showCaptionNavigation` есть только в properties;
  Media `autoplay/loop/muted/controls` и Svg `svgContent` — только в defaultProps.
- **`BricksTextArea` — это полноценный TipTap-редактор**, а не инпут: async-импорты
  `TheTextEditorModal`, `TiptapImageFloatPopover` и 8 расширений `editor/tiptap/*`.
  Развязка пропсами — фикция; честный фикс — переезд компонента в `editor/`.
- **Published-страница сегодня бандлит builder Pinia store** через цепочку
  render → `BlockSlider` → `builder/stores/canvas`. Фикс A6 — реальное уменьшение бандла.
- **Два параллельных механизма responsive в сайдбаре**: name-set
  `RESPONSIVE_LAYOUTS = Set(['Grid','Flex','Section','Space','Media','Svg'])` в
  `sidebar/composables/useSidebarPropertiesPanel.ts:90` (все пропсы этих layout'ов
  device-scoped) и флаги `responsive: true` на отдельных свойствах (управляют только
  CSS-var-рендерингом). Registry должен нести `responsiveMode` per-block.
- `editor/types/text-editor-toolbar.d.ts` содержит NuxtApp-аугментацию
  `$textEditorToolbar` — при переезде файла аугментация едет с ним, путь в
  `plugins/text-editor-toolbar.ts` обновить.
- `canvas/components/CanvasViewport.vue:48` провайдит `'canvasViewport'` как
  **сырую строку** (нереактивно — ок per-viewport в Figma mode). Новый провайдер на
  уровне `TheCanvas` для обычного режима должен быть `Ref`/`computed` — inject-контракт
  меняется для всех потребителей атомарно.

---

## Часть A. Исправление нарушений

### Этапы выполнения (разбивка по сессиям, чтобы не переполнять контекст)

- [x] **Этап 1** — A7: dependency-cruiser scaffold + baseline (warn) — выполнено 2026-06-11
- [x] **Этап 2** — A1: контрактные типы → `common/types/` → flip `common-is-bottom` — выполнено 2026-06-12
- [x] **Этап 3** — A4 + A2: `BricksConfirmModal` → ui; toolbar-типы → ui;
      `TextEditorArea` → editor → flip `media-deps`, `ui-is-bottom` — выполнено 2026-06-12
- [x] **Этап 4** — A3 + A5: `useBuilderPage` — editor-мост через DI (`IInlineMediaBridge`);
      `RendererCloseButton` → flip `builder-core-no-features`, `editor-deps`, `render-lean` — выполнено 2026-06-12
- [x] **Этап 5** — A6: viewport-inject (6 точек атомарно) → flip `layouts-blocks-deps`,
      `no-circular` — выполнено 2026-06-12. **Часть A полностью закрыта: 0 violations.**

### A7 (выполняется первым — scaffold). dependency-cruiser

- devDep `dependency-cruiser`; файл `.dependency-cruiser.cjs` в корне;
  скрипт `"deps:check": "depcruise src/runtime --config .dependency-cruiser.cjs"`;
  добавить в `lint:check` и CI.
- Стартуем со `severity: 'warn'` (текущие нарушения — задокументированный baseline),
  каждое правило флипается в `error` по мере выполнения соответствующего шага.
- Проверить, что depcruise парсит `.vue` (нужен резолв `@vue/compiler-sfc` — есть
  через Nuxt). Fallback — самописный import-scanner (~60 строк) на тот же allowlist.

**Статус: выполнено (2026-06-11).** `.dependency-cruiser.cjs` в корне, скрипт
`deps:check` добавлен в `lint:check`. depcruise парсит `.vue` из коробки —
fallback-сканер не понадобился. Baseline: **32 warnings, 0 errors**
(286 модулей, 926 зависимостей). Exit code 0 при warn — CI не падает до флипов.

Находки сверх ревью:

- **`ui → common` тоже флагается** (6 импортов: BricksSelect, BricksSelectOption,
  BricksHexInput, BricksToolbarColorPicker×1, BricksTextArea×1 → `common/types`,
  `common/utils/main`, `common/composables/useBricksConfig`). Правило `ui-is-bottom`
  сознательно строгое («ui не импортирует ничего вне ui»); разобраться на шаге A2.
- **Внутренние циклы canvas**: `CanvasItem ↔ CanvasItemLayout` и
  `CanvasItem ↔ CanvasItemComponent` — легитимная рекурсия Vue-компонентов
  (дерево канваса). Перед флипом `no-circular` в error добавить исключение
  (`viaNot` по `canvas/components`) — чинить их не нужно.
- `layouts-blocks/utils/inlineContent.ts → media/types/media.d.ts` — закрывается
  переездом media-типов в common (A1).

Скелет правил (forbidden-инверсии allowlist):

```js
const M = 'src/runtime/modules';
module.exports = { forbidden: [
  { name: 'no-circular',     severity: 'error', from: {}, to: { circular: true } },
  { name: 'ui-is-bottom',    from: { path: `^${M}/ui` },     to: { path: `^${M}/(?!ui)` } },
  { name: 'common-is-bottom',from: { path: `^${M}/common` }, to: { path: `^${M}/(?!common)` } },
  { name: 'render-lean',     from: { path: `^${M}/render` }, to: { path: `^${M}/(?!render|common|layouts-blocks)` } },
  { name: 'layouts-blocks-deps', from: { path: `^${M}/layouts-blocks` },
    to: { path: `^${M}/(?!layouts-blocks|common|ui|editor)` } },
  { name: 'editor-deps',     from: { path: `^${M}/editor` },
    to: { path: `^${M}/(?!editor|common|ui|media|builder/(stores|utils|types|constants)|layouts-blocks)` } },
  { name: 'builder-core-no-features', from: { path: `^${M}/builder/(?!pages)` },
    to: { path: `^${M}/(canvas|sidebar|toolbar|editor|render)` } },
  { name: 'toolbar-deps',    from: { path: `^${M}/toolbar` },
    to: { path: `^${M}/(?!toolbar|ui|common|builder/components)` } },
  { name: 'media-deps',      from: { path: `^${M}/media` },
    to: { path: `^${M}/(canvas|sidebar|toolbar|render|editor|builder)` } },
  // builder/pages — composition root, может импортировать всё; правило не нужно
]};
```

### A1. Консолидация контрактных типов в `common/types/`

Чистые type-переезды, нулевой поведенческий риск. Закрывает нарушения 4 и 7,
разблокирует A2/A3 и всю Часть B.

**Статус: выполнено (2026-06-12).** Создано 5 файлов в `common/types/`
(`dataSource`, `content`, `media`, `inlineEditing`, `layoutProperty`), удалены
`render/types/bricks-data-source.d.ts`, `layouts-blocks/types/layouts.d.ts`
(папка пустая — удалена), `builder/types/layoutProperties.d.ts`. Серверные типы
обработки медиа (`TFormData`, `IValidated*`, `IBuildUploadedItemParams`,
`TMediaOptimization`, `TResolvedMediaConfig`) и UI-типы галереи остались в
`media/types/media.d.ts` (persistence → media — легальное ребро). Обратная
совместимость: реэкспорты `InlineEditingPropType` из editor-store и
`IInlineEditableProp` из `builder/utils/inlineEditableProp.ts`. Baseline depcruise:
32 → 27 warnings; `common-is-bottom` флипнут в **error**. vue-tsc: 0 новых ошибок
(12 pre-existing, сверено через git stash).

| Новый файл в `common/types/` | Содержимое, откуда | Кого править |
|---|---|---|
| `dataSource.d.ts` | `IBrickDataSource`, `IBrickDataSourceParam`, `IBrickDataSourceContext` из `render/types/bricks-data-source.d.ts` | `render/composables/useBricksDataSources.ts`, `render/pages/[pagename].vue`, `common/types/index.ts` (инлайн-`import()` на ~94 становится локальным) |
| `content.d.ts` | `IInlineContentSegment`, `IGalleryItem` из `layouts-blocks/types/layouts.d.ts` | 9 импортёров: `builder/types/layoutProperties.d.ts`, `common/types/index.ts`, `editor/composables/useInlineEditor.ts`, `editor/utils/inlineContentTiptap.ts`, `media/utils/schemaImageExtractor.ts`, 4 файла sidebar. Остальное в `layouts.d.ts` (LayoutProps-юнион) остаётся до B1 |
| `media.d.ts` | data-типы (`IMediaItem`, `TMediaGalleryContext`, …) из `media/types/media.d.ts` | 14 импортёров в builder/editor/layouts-blocks/persistence/sidebar; UI-only типы галереи остаются в `media/types/` |
| `inlineEditing.d.ts` | `InlineEditingPropType` из `editor/stores/inlineEditing.ts` + `IInlineEditableProp` из `builder/utils/inlineEditableProp.ts` | оба файла-источника импортируют из common (editor-store оставляет `export type { … }` для обратной совместимости); убирает взаимный circular type-import |
| `layoutProperty.d.ts` | `ILayoutProperty` из `builder/types/layoutProperties.d.ts` | `builder/utils/layoutProperties.ts`, `builder/utils/inlineEditableProp.ts`, потребители в sidebar/canvas. **Обязательное условие Части B** — layouts-blocks не должен импортировать builder |

Что сознательно НЕ едет в common: `GridLayoutProps`…`LayoutProps` юнион — переезжает
в `layouts-blocks/types/blockProps.d.ts` на шаге B1 (его импортёры — canvas, render,
layouts-blocks — всем layouts-blocks доступен). В `common/types/brick.ts` остаются
`BricksComponent`, `ComponentLibraryItem`, `PropertyDefinition`, `TBricksDeviceKey`.

### A4. `ConfirmActionModal` → `ui/feedback/BricksConfirmModal.vue`

**Статус: выполнено (2026-06-12).** Типы — в новом `ui/feedback/types.d.ts`,
3 импортёра переведены, старый компонент и `IConfirmActionModal*` удалены.
`media-deps` флипнут в **error**.

Проверено: зависит только от `ui/base` и локальных типов — переезд чистый.

- `builder/components/modal/ConfirmActionModal.vue` → `ui/feedback/BricksConfirmModal.vue`
  (нейминг ui-кита; корневой CSS-класс → `BricksConfirmModal`; внутренние импорты → `../base/...`).
- `IConfirmActionModalProps/Emits` из `builder/components/modal/types.d.ts` →
  `ui/feedback/types.d.ts`, переименовать в `IBricksConfirmModalProps/Emits`.
- Импортёры (3): `media/components/TheMediaGalleryModal.vue`,
  `builder/components/modal/ThePublishedPagesModal.vue`, `builder/pages/[pagename].vue`.
- Результат: цикл builder ↔ media разорван.

### A2. Очистка `ui/` от editor-зависимостей

**Статус: выполнено (2026-06-12).** Типы тулбара → `ui/inputs/textEditorToolbar.d.ts`
(NuxtApp-аугментация уехала с файлом, путь в `plugins/text-editor-toolbar.ts` обновлён);
`BricksTextArea` → `editor/components/TextEditorArea.vue` (типы —
`ITextEditorAreaProps/Emits` в новом `editor/components/types.d.ts`; корневой
CSS-класс переименован). `editor/types/` опустела и удалена. Остаточные `ui → common`
(4 импорта) — разрешены решением выше. `ui-is-bottom` флипнут в **error**.
vue-tsc: 0 новых ошибок. Baseline: 27 → 10 → 5 warnings (после обоих флипов).

1. **Типы тулбара — в ui** (это контракт ui-примитивов тулбара):
   `editor/types/text-editor-toolbar.d.ts` → `ui/inputs/textEditorToolbar.d.ts`,
   NuxtApp-аугментация `$textEditorToolbar` едет вместе с файлом.
   Импортёры: 5 ui-компонентов (`BricksToolbarColorPicker`, `BricksTextEditorToolbar`,
   `BricksToolbarEditableSelect`, `BricksTableGridPicker`, `BricksTextArea` — до его
   переезда), `canvas/components/CanvasInlineEditingOverlay.vue`,
   `editor/components/TheTextEditorModal.vue`, `plugins/text-editor-toolbar.ts`.
   `import type { Editor } from '@tiptap/vue-3'` — type-only, рантайм-веса ui не добавляет.
2. **`BricksTextArea` — в editor**: `ui/inputs/BricksTextArea.vue` →
   `editor/components/TextEditorArea.vue` (правила нейминга: `Bricks`-префикс только
   в ui, минимум два слова; корневой CSS-класс → `TextEditorArea`). Проп/эмит-типы
   из `ui/inputs/types.d.ts` → `editor/components/types.d.ts`
   (`ITextEditorAreaProps/Emits`). Пути внутри компонента: `../base/button/...` →
   `../../ui/base/button/...`; editor-импорты становятся локальными (`./`, `../tiptap/`).
   Импортёры (2): `sidebar/composables/useSidebarPropertiesPanel.ts:65` (async-map для
   типа `textarea`), `sidebar/components/property-editors/PropertyAccordionItemsEditor.vue:11`.
   sidebar → editor — легальное ребро.

Результат: ui не импортирует ничего вне ui (+ vue / type-only tiptap) — настоящий нижний слой.

### A3. Разрыв цикла builder ↔ editor

**Статус: выполнено (2026-06-12), пересмотрено в тот же день.** Первая версия
перевозила `useBuilderPage.ts` в `builder/pages/` — отменено (композаблам не место
в `pages/`). Итоговое решение — **инверсия зависимости**: композабл остался в
`builder/composables/`, editor-связка вынесена в параметр
`inlineMediaBridge: IInlineMediaBridge` (`builder/types/composables.d.ts`:
`isRequestingMedia: ComputedRef<boolean>` + `resolveMediaRequest`/`cancelMediaRequest`).
Мост собирает `[pagename].vue` (composition root) из `useInlineEditingStore` —
editor подключается только там. Type-половина умерла в A1.
`builder-core-no-features` и `editor-deps` флипнуты в **error**.

- Type-половина цикла умирает в A1 (`common/types/inlineEditing.d.ts`).
- Runtime-половина: `useBuilderPage` использовал `useInlineEditingStore` только как
  мост media-запросов (watch `isRequestingMedia` → открыть галерею;
  `resolveMediaRequest`/`cancelMediaRequest`) — этот контракт инвертирован в параметр.
- `editor/composables/useInlineEditor.ts` → `builder/stores/components` —
  санкционированное ребро (editor — фичевый домен).

### A5. render → ui: копия кнопки

**Статус: выполнено (2026-06-12).** `RendererCloseButton.vue` — самодостаточная копия
(нативный `<button>` без импорта `BricksButton`, иначе render → ui осталось бы;
`BricksIcon` — глобальный компонент из плагина, импорта не требует). TODO-комментарий
на месте. `render-lean` флипнут в **error**.

- Скопировать `ui/base/modal/BricksCloseButton.vue` →
  `render/components/RendererCloseButton.vue` (нейминг по домену, без `Bricks`-префикса;
  корневой CSS-класс → `RendererCloseButton`).
- Обновить импорт в `render/pages/[pagename].vue`.
- TODO-комментарий в компоненте: «уникальный стиль при редизайне».
- Правило `render-lean` (только common + layouts-blocks) флипается в `error`.

### A6. BlockSlider: инъекция viewport вместо builder-store

**Статус: выполнено (2026-06-12).** Точек оказалось 6, а не 4 — добавились потребители
строкового ключа `'canvasViewport'`, не учтённые в ревью:

5. `canvas/components/CanvasItem.vue:43` — `figmaViewport` (детект Figma mode);
   переведён на `inject(CANVAS_VIEWPORT_KEY, null)`.
6. `canvas/composables/useCanvasItemActions.ts` — параметр `figmaViewport` сменил тип
   `string | null` → `Ref<TBricksDeviceKey> | null` (3 использования через `.value`).
   Безопасно: все ветки защищены `canvasStore.isFigmaMode`, в обычном режиме
   значение не читается.

`BlockSlider` больше не импортирует `builder/stores/canvas`; fallback на published —
`'desktop'` (Swiper работает через breakpoints). `layouts-blocks-deps` флипнут в
**error**. Бонус закрыт: Pinia + canvas-store ушли из бандла published-страницы.

Типизированный inject-контракт, работающий в обычном режиме, Figma mode и на published:

```ts
// common/constants/injectionKeys.ts (новый)
import type { InjectionKey, Ref } from 'vue';
import type { TBricksDeviceKey } from '../types/brick';
export const CANVAS_VIEWPORT_KEY: InjectionKey<Ref<TBricksDeviceKey>> = Symbol('canvasViewport');
```

Четыре точки, правятся **атомарно** (тип provided-значения меняется со строки на Ref):

1. `canvas/components/TheCanvas.vue`: `provide(CANVAS_VIEWPORT_KEY, computed(() => canvasStore.viewport))` — обычный режим, реактивно.
2. `canvas/components/CanvasViewport.vue:48`: `provide(CANVAS_VIEWPORT_KEY, computed(() => props.viewport))` — Figma mode, ближайший провайдер выигрывает (семантика не меняется).
3. `layouts-blocks/components/BlockSlider.vue`: удалить `useCanvasStore` (строки 10, 64); `const viewport = inject(CANVAS_VIEWPORT_KEY, null)`; `currentSlidesPerView` использует `viewport?.value ?? 'desktop'`. На published безопасно: `slidesPerView` из этого пути используется только при `isEditor`, published-режим работает через Swiper `breakpoints`.
4. `canvas/composables/useCanvasItemLayout.ts`: `effectiveViewport = computed(() => injectedViewport?.value ?? canvasStore.viewport)`.

Бонус: Pinia + builder/stores/canvas уходят из бандла published-страницы.

---

## Часть B. Registry для layouts-blocks

### Цель

Сейчас (10 точек): компонент → типы пропсов в `common/types/brick.ts` →
`LAYOUT_COMPONENTS` в `builder/constants/layoutComponents.ts` (defaultProps) →
`X_PROPERTIES` + map в `builder/utils/layoutProperties.ts` (дубль дефолтов) →
import + `v-else-if` в `canvas/components/CanvasItemLayout.vue` (10 веток) →
import + switch + render-функция в `render/composables/useRendererLayouts.ts` →
resolve-функция + name-allowlist в `canvas/composables/useCanvasItemLayout.ts` →
CSS-vars в `layouts-blocks/composables/useResponsiveLayoutStyles.ts` →
(опц.) handler в `sidebar/composables/usePropertyVariants.ts` → флаг `isInteractive`.

Станет: **`BlockX.vue` + `blockX.definition.ts` + 2 однострочные регистрации**
(map в `registry.ts` и map в `canvasBlockComponents.ts`; позже можно авто-glob).

### B1. Типы и утилиты

**Статус: выполнено (2026-06-12).** Создано: `layouts-blocks/types/registry.d.ts`
(по спеке ниже, без неиспользуемого импорта `Component`),
`layouts-blocks/types/blockProps.d.ts` (юнион + supporting-типы `ISliderCaption`,
`IAccordionItem`; `TBricksDeviceKey`/`IDeviceVisibilityConfig` остались в
`common/types/brick.ts`), `layouts-blocks/utils/responsiveVars.ts` (`toRem`,
`resolveResponsiveValue`, `makeResponsiveVars`, `getResponsiveOverrides`,
`gridPlacementStyle`). Импортёры обновлены: canvas ×2, render ×1, sidebar ×2
(`IAccordionItem`), layouts-blocks ×7. `useRendererLayouts.ts` переведён на утилиты —
10 дублей grid-placement-блоков заменены на `gridPlacementStyle`. Реэкспорта из
brick.ts нет (нарушил бы `common-is-bottom`). vue-tsc: 12 ошибок = baseline;
depcruise: 0 violations (296 модулей).

- `layouts-blocks/types/registry.d.ts`:

```ts
import type { Component, VNode, VNodeChild } from 'vue';
import type { BricksComponent } from '../../common/types/brick';
import type { ILayoutProperty } from '../../common/types/layoutProperty';

/** Контекст рендера published-страницы (из TheRenderer) */
export interface IBlockRenderContext {
    component: BricksComponent;
    extraClasses: string[];
    extraAttrs: Record<string, string | undefined>;
    styles: Record<string, string>; // CSS module
    renderChild: (child: BricksComponent) => VNodeChild;
    getChildComponents: (c: BricksComponent) => BricksComponent[];
}

/** Контекст биндинга на канвасе (из CanvasItemLayout) */
export interface IBlockCanvasContext {
    component: BricksComponent;
    layoutProps: Record<string, unknown>; // уже resolved по viewport
    boundProps: Record<string, unknown>;  // componentBoundProps
    childComponents: BricksComponent[];
    renderChild: (child: BricksComponent) => VNodeChild; // slider slides
}

export interface IBlockDefinition {
    name: string;            // 'Grid' — componentName в схеме
    description: string;
    thumbnail: string;       // '/images/layouts/grid.svg'
    isInteractive?: boolean;
    hasChildren?: boolean;   // контейнер: children в default slot
    /** Свойства панели; функция — для Title (availableFonts) */
    properties: ILayoutProperty[] | ((ctx: { availableFonts: string[] }) => ILayoutProperty[]);
    /** Дефолты вне properties (Media: muted/controls…, Svg: svgContent) */
    extraDefaults?: Record<string, unknown>;
    /** 'all' — все пропсы device-scoped (Grid/Flex/Section/Space/Media/Svg) */
    responsiveMode: 'all' | 'none';
    /** Кастомный биндинг канваса; undefined = generic layout-props */
    canvasBind?: (ctx: IBlockCanvasContext) => Record<string, unknown>;
    /** Кастомный published-рендер; undefined = generic h(component, props) */
    renderPublished?: (ctx: IBlockRenderContext) => VNode;
    /** Генерация responsive CSS-vars (шаг B6) */
    responsiveCssVars?: { prefix: string; vars: string[] };
}
```

- `layouts-blocks/types/blockProps.d.ts` — `GridLayoutProps`…`LayoutProps` юнион
  переезжают сюда из `common/types/brick.ts` (импортёры: canvas, render, layouts-blocks).
- `layouts-blocks/utils/responsiveVars.ts` — общие `toRem`, `makeResponsiveVars`,
  `getResponsiveOverrides`, `gridPlacementStyle(component)` (повторяющийся
  gridColumn/gridRow-блок) — выносятся из `useRendererLayouts.ts`.

### B2. Definitions + registry + parity-тест (ничего не потребляет — zero risk)

**Статус: выполнено (2026-06-12).** 10 файлов `block*.definition.ts` colocated с `.vue`
(data-only, `.vue` не импортируют — bundle firewall соблюдён), `registry.ts`
(`BLOCK_REGISTRY`, `getBlockDefinition` — регистронезависимый, канвас оперирует
lowercase; `getBlockProperties`, `getLayoutLibraryItems`, `resolveBlockProps`
с коэрцией number/boolean/select), `canvasBlockComponents.ts` (eager-мапа,
пока никем не импортируется — заберёт canvas на B4),
`test/blockRegistry.parity.spec.ts` (8 тестов, зелёные; случайные id
inline-сегментов нормализуются `stripSegmentIds`). `hasChildren: true` —
Grid/Flex/Section (Slider получит children через `canvasBind` на B4).
Находка сверх таблицы сверки: **Text `marginBottom`: 0 (создание) vs 2 (панель)** —
по принципу «истина — создание» взят `0`. vue-tsc: baseline; depcruise: 0 violations.

- 10 файлов `layouts-blocks/components/blockX.definition.ts`, colocated с `.vue`.
- `layouts-blocks/registry.ts`: `BLOCK_REGISTRY: Record<string, IBlockDefinition>` +
  - `getBlockDefinition(name)`;
  - `getLayoutLibraryItems(): ComponentLibraryItem[]` — derive `defaultProps` =
    `properties[].default` + `extraDefaults`; `storyPath = 'layout/' + name.toLowerCase()`;
    category `'Layout'`;
  - `getBlockProperties(name, { availableFonts })`;
  - `resolveBlockProps(name, baseProps, viewport)` — generic merge
    `props.responsive[viewport]` при `responsiveMode === 'all'` + коэрция по
    `ILayoutProperty` (`number` → `Number` + clamp `min/max`; `boolean` → `Boolean`;
    `select` → валидация по `options`) — воспроизводит `normalizeGridRowHeight`
    и justify/align-guards из текущего `useCanvasItemLayout.ts`.
- `layouts-blocks/canvasBlockComponents.ts` — eager-map всех 10 `.vue`.
  **Импортируется только canvas'ом** — это bundle firewall: definitions контейнеров
  НЕ импортируют свои `.vue` (published-бандл остаётся ровно с сегодняшним набором:
  leaf-definitions импортируют свои компоненты для `renderPublished` — как сейчас).
- **Parity-тест (vitest, временный)**: снапшот старых `LAYOUT_COMPONENTS` и
  `getLayoutProperties()` === выход registry. Удаляется вместе с legacy-файлами.

Сверка дефолтов при derive (истина — поведение создания, см. «Принятые решения»):

| Расхождение | Решение |
|---|---|
| Flex `wrap`: false (создание) vs true (панель) | `false`, дефолт свойства поправить |
| Title `marginBottom`: 0 vs 2 | `0` |
| Text `content`: RU vs EN строка | RU `'<p>Введите текст</p>'` |
| Grid/Flex лишний `padding: 0` в defaultProps | выкинуть (рендерер читает только paddingX/paddingY) |
| Slider `captions`/`captionPosition`/`showCaptionNavigation` только в панели | войдут в derived-дефолты (`'[]'`, `'top'`, `true`) — поведенчески нейтрально |
| Media `autoplay/loop/muted/controls`, Svg `svgContent` только в defaultProps | → `extraDefaults` |

### B3. builder — wrappers

**Статус: выполнено (2026-06-12).** Оба файла — обёртки над registry
(`LAYOUT_COMPONENTS = getLayoutLibraryItems()`; `getLayoutProperties` →
`getBlockProperties`), дублированные `X_PROPERTIES`-массивы удалены. 7 импортёров
(sidebar ×2, canvas ×2, builder ×1 и сами файлы) не тронуты — API сохранён.
Parity-тест после B3 тавтологичен по wrapper-ветке (ожидаемо, остаётся до шага 14).
Внимание: дефолты панели свойств изменились — Flex `wrap: false`,
Title `marginBottom: 0`, Text `content` RU / `marginBottom: 0` (санкционировано).

- `builder/constants/layoutComponents.ts` →
  `export const LAYOUT_COMPONENTS = getLayoutLibraryItems()` (места импорта не меняются).
- `builder/utils/layoutProperties.ts` → 5-строчный wrapper над `getBlockProperties`.
- Удалить дублированные массивы `X_PROPERTIES`. Parity-тест зелёный → удаление безопасно.

### B4. canvas — generic-диспатч

- `canvas/components/CanvasItemLayout.vue`: 10 импортов + 10 `v-else-if` →
  `<component :is="canvasBlockComponents[name]" v-bind="def.canvasBind?.(ctx) ?? genericBind(ctx)">`
  + `<CanvasItem v-for>` в default slot при `hasChildren`.
- `canvas/composables/useCanvasItemLayout.ts`: per-layout resolve-функции +
  name-allowlist → `resolveBlockProps` из registry. `clampGridColumnToColumns` /
  parent-grid-логика остаётся здесь (item-level, блок-агностична).
- sidebar: name-set `RESPONSIVE_LAYOUTS` в `useSidebarPropertiesPanel.ts:90` →
  `getBlockDefinition(name)?.responsiveMode === 'all'`.
- Самый тяжёлый smoke-шаг (см. Verification).

### B5. render — registry-диспатч

- `render/composables/useRendererLayouts.ts`: switch + 10 render-функций →
  `def.renderPublished?.(ctx) ?? genericPublishedRender(def, ctx)`.
- Контейнерные `h('div')`-рендеры (Grid/Flex/Section/Space) переезжают в их
  definitions как `renderPublished`; общие хелперы — в `utils/responsiveVars.ts` (B1).
- Проверка pixel-parity published-страницы (особенно Grid lead-варианты,
  Section responsive-vars, Space divider).

### B6 (опционально). Генерация CSS-vars

`layouts-blocks/composables/useResponsiveLayoutStyles.ts`: ручные CSS-блоки →
генерация из `responsiveCssVars` по 3 шаблонам (desktop-default,
`.bricks-canvas[data-bricks-viewport=…]`, published media queries).
До этого шага текущий файл работает нетронутым.

### Честные escape hatches (НЕ генерализуются)

- **Grid/Flex/Section/Space published** — custom `renderPublished` (`h('div')` +
  CSS-vars). Перенесено, не устранено: канвас-компоненты несут editor chrome — это
  инherentная асимметрия.
- **Slider** — custom `canvasBind` (`slides`, `renderSlide: ctx.renderChild`,
  `isEditor: true`; children через проп, не слот) + custom `renderPublished`.
- **Media/Svg** — custom `canvasBind` (boundProps + width/height/borderRadius из
  resolved layoutProps) и custom `renderPublished` (CSS-var-обёртка).
- **Title** — function-valued `properties` (availableFonts).
- **Title/Text/Svg canvas-bind** — нужен `componentId` для inline editing: общий
  хелпер `makeBoundPropsBind({ withComponentId: true })` или per-definition `canvasBind`.

---

## Часть C. Порядок шагов (чеклист)

Каждый шаг независимо приземляем; после него соответствующее depcruise-правило
переводится warn → error. Проверка на каждом шаге: `npx vue-tsc --noEmit`,
`npx oxlint` по изменённым файлам, `npm run test`, dev-smoke.

- [x] **1. A7** — dependency-cruiser (warn) + `deps:check` + baseline нарушений (2026-06-11, 32 warnings)
- [x] **2. A1** — контрактные типы → `common/types/` → flip `common-is-bottom` (2026-06-12, 27 warnings)
- [x] **3. A4** — `BricksConfirmModal` → ui/feedback → flip `media-deps` (2026-06-12)
- [x] **4. A2** — toolbar-типы → ui; `TextEditorArea` → editor → flip `ui-is-bottom` (2026-06-12, 5 warnings)
- [x] **5. A3** — `useBuilderPage`: editor-мост → параметр `IInlineMediaBridge` (DI из `[pagename].vue`) → flip `builder-core-no-features`, `editor-deps` (2026-06-12)
- [x] **6. A5** — `RendererCloseButton` копия в render → flip `render-lean` (2026-06-12, 3 warnings)
- [x] **7. A6** — viewport-inject (6 точек атомарно) → flip `layouts-blocks-deps`,
      `no-circular` (с `viaNot`-исключением для рекурсии CanvasItem*) (2026-06-12, **0 violations**)
- [x] **8. B1** — `registry.d.ts`, `blockProps.d.ts`, `utils/responsiveVars.ts` (2026-06-12)
- [x] **9. B2** — 10 definitions + `registry.ts` + `canvasBlockComponents.ts` + parity-тест (2026-06-12)
- [x] **10. B3** — builder-wrappers, удаление дублей (2026-06-12)
- [ ] **11. B4** — canvas generic + sidebar `responsiveMode`
- [ ] **12. B5** — render registry-диспатч
- [ ] **13. B6** (опц.) — генерация CSS-vars
- [ ] **14. Docs** — обновить CLAUDE.md (убрать «sync two files»-warning, новый процесс
      добавления блока), создать skill `/add-layout-block`, удалить parity-тест и legacy

## Часть D. Риски

- **Inject-контракт string → Ref** (A6): три провайдера/потребителя + BlockSlider
  правятся в одном коммите, иначе Figma mode молча получит нереактивный viewport.
- **vue-tsc на generic-шве канваса**: `Record<string, unknown>` на границе биндинга —
  держать касты `LayoutProps` внутри definitions, не размазывать по консьюмерам.
- **Write-path device-scope в сайдбаре**: перед B4 перечитать
  `useSidebarPropertiesPanel.ts` (~строки 360, 589) — убедиться, что
  `responsiveMode: 'all'` воспроизводит, какие пропсы пишутся в `props.responsive[device]`.
- **Сверка дефолтов** меняет дефолты панели свойств для Flex/Title/Text
  (существующие страницы не затронуты — у них конкретные props).
- **depcruise + `.vue`**: проверить на шаге 1; fallback — собственный сканер.

## Часть E. Backlog вне основного скоупа

Разрезка файлов >500 строк (правило vue-best-practices: SFC ≤ 300–500):

- `builder/stores/publish.ts` — 887 строк (плюс дубль `normalizePublishedPage`
  с `middleware/bricks-page-layout.global.ts` — кандидат на общий util при разрезке)
- `builder/pages/[pagename].vue` — 644 строки (composition root — трогается первым при редизайне)
- `sidebar/composables/useSidebarPropertiesPanel.ts` — 638 строк
- `canvas/components/TheCanvas.vue` — 637 строк

## Verification (сквозной сценарий после шагов B4/B5)

1. `npm run dev` → билдер открывается, библиотека компонентов показывает все 10 блоков
   с прежними thumbnail/описаниями.
2. Бросить Grid + Flex + Slider на канвас → дефолты создания совпадают с текущими.
3. Панель свойств: device-табы для Grid/Flex/Section/Space/Media/Svg; правка свойства
   на Tablet пишется в `props.responsive.tablet`.
4. Inline editing Title/Text (двойной клик) работает.
5. Figma mode: per-viewport рендер, слайдер показывает разный `slidesPerView`.
6. Publish → открыть published-страницу: pixel-parity (Grid lead-варианты, Section
   responsive-vars, Space divider, Slider на Swiper-breakpoints).
7. `npm run deps:check` — ноль errors; `npm run test` — parity-тест зелёный (до шага 14).
