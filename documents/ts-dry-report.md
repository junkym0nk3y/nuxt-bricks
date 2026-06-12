# Отчёт: TypeScript — DRY и качество типизации

Дата: 2026-06-12. Методика: полный инвентарь `export interface/type` по `src/runtime` (grep + группировка), точечная сверка подозрительных файлов, инвентарь `any`/`as unknown as`. Мёртвые типы исключены (см. unused-code-report.md: `SidebarState` уже помечен на удаление).

---

## TL;DR — приоритеты

| # | Находка | Priority | Усилия |
| --- | --- | --- | --- |
| 1 | Безымянный value-union повторён ×7 → ввести `TBrickPropValue` | **high** | S |
| 2 | `TViewportType` ≡ `TBricksDeviceKey` — удалить дубль | **high** | S |
| 3 | 7 из 10 `as unknown as` — следствие п.1, вероятно лишние | **high** | S |
| 4 | `useDraggableComponent.ts`: 8×`any` при готовых типах | **high** | M |
| 5 | Дубль трио handlers в `sidebarProperties.d.ts` | medium | S |
| 6 | `brickSlots.ts` + `useComponentLibrary.ts`: any вместо `IBrickFileStructure` | medium | M |
| 7 | Нейминг: 17 интерфейсов без `I`, 11 type без `T` | medium | L (механика) |
| 8 | 16 компонентов с inline `defineProps<{...}>` | low | M |
| 9 | Modal-типы, Swiper-any, global.d.ts шимы | low | — |

---

## 1. Дублирование типов

### 1.1 Device-union (high)

- `TBricksDeviceKey = 'mobile' | 'tablet' | 'desktop'` — `common/types/brick.ts:7`, используется в 14 файлах. **Канонический.**
- `TViewportType = 'mobile' | 'tablet' | 'desktop'` — `builder/canvas/types/components.d.ts:41`, идентичный дубль, используется в 3 файлах (`useCanvasRemBase.ts`, `BuilderCanvasToolbar.vue`, `BuilderCanvasViewport.vue`).
- Плюс анонимный `Record<'mobile' | 'tablet' | 'desktop', number>` в `builder/core/stores/canvas.ts:8`.

**Фикс:** удалить `TViewportType`, 3 файла перевести на `TBricksDeviceKey` (направление зависимости canvas → common — допустимо); в `canvas.ts:8` — `Record<TBricksDeviceKey, number>`.

### 1.2 Безымянный value-union ×7 (high — корневая проблема)

Union `string | number | boolean | Record<string, unknown> | Array<unknown>` повторён дословно:

- `builder/shell/sidebar/types/sidebarProperties.d.ts:53,75` (`handleChangeValues` ×2)
- `builder/core/stores/types.ts:133,140`
- `builder/core/stores/actions/properties.ts:30`
- внутри `IBrickDemoValues` — `common/types/index.ts:17`
- (и как цель кастов — см. §3)

**Фикс:** именованный `export type TBrickPropValue = ...` в `common/types/` + замена всех вхождений. Один источник правды для «значения свойства брика».

### 1.3 Дубль трио handlers в sidebar (medium)

`ISidebarPropertyEditorRowProps` и соседний props-интерфейс в `sidebarProperties.d.ts` дублируют сигнатуры `handleNormalizeProps` / `handleChangeValues` / `handleOpenMediaGallery` (по ~4 строки каждая).

**Фикс:** база `interface ISidebarPropertyHandlers { ... }` + `extends` в обоих.

### 1.4 Modal-типы (low — можно не трогать)

`IPublishPagesModalProps` и `IDocumentationModalProps` — оба `{ isOpen: boolean }`; emits оба содержат `close: []`. Дублирование по 1 полю — выгода от общего `IModalBaseProps` минимальна, доменная автономия дороже. Рекомендация: **оставить как есть**, вернуться при появлении 3-й модалки с пропсами побогаче.

### 1.5 Что проверено и чисто 🎉

- **Одноимённых деклараций в разных файлах нет** (полный инвентарь экспортов).
- Гипотеза «8 layout-блоков дублируют props inline + в types-файлах» **не подтвердилась**: блоки импортируют `GridLayoutProps` и т.п. из `layouts-blocks/types/blockProps.d.ts`, inline — только обёртка `{ layoutProps, layoutId }`. Дублей нет.
- `canvas/types/composables.d.ts` и `sidebar/types/composables.d.ts` структурно не пересекаются.

## 2. `any` — 37 вхождений

### 2.1 Исправимые, высокая ценность

| Файл | Кол-во | Что делать |
| --- | --- | --- |
| `builder/app/composables/useDraggableComponent.ts` | 8 | `store: any` → уже существует `BricksComponentsStore` (`core/stores/components.ts:86`); `component/draggedComp: any` → `ComponentLibraryItem`/`BricksComponent` из `common/types/brick.ts`. Все типы готовы — только подставить |
| `builder/app/utils/brickSlots.ts` | 6 | `brickData: any` → `IBrickFileStructure` (`common/types/index.ts:1`); `(config as any).label` ×4 → типизировать `IBrickSlotDefinition` |
| `builder/app/composables/useComponentLibrary.ts` | 2 | `{ bricks: any[] }` → типизированный ответ mock-api |
| `common/utils/routing/vite-brick-watch.ts` | 2 | `server: any` → `ViteDevServer`, `ctx: any` → `HmrContext` (типы vite доступны) |
| `plugins/vue-icons.ts` | 1 | `iconComponent: any` → `Component` из vue |
| `common/types/brick.ts:123,124` | 2 | `default: any` и `options.value: any` в `PropertyDefinition` → `TBrickPropValue` из §1.2 |

### 2.2 Полулегитимные / низкий приоритет

| Файл | Кол-во | Комментарий |
| --- | --- | --- |
| `common/types/global.d.ts` | 6 | Ambient-шимы Nuxt auto-imports (`useRoute(): any`, `$fetch<T = any>`). Работают, но точнее — импорт реальных типов из `#app`/`ofetch`. Трогать осторожно: шимы существуют для сборки вне Nuxt-контекста |
| `layouts-blocks/components/BlockSlider.vue` | 3 | `as any` на Swiper-пропсах (`:autoplay`, `:navigation`, `:pagination`) — известная боль типов swiper/vue; можно убрать через `SwiperOptions`, ценность низкая |
| `common/utils/main.ts` (debounce) | 2 | `(...args: any[]) => any` в generic-констрейнте — идиоматичный паттерн debounce, допустимо |
| `BlockGrid.vue:27`, `BlockSection.vue:20` | 2 | `defineSlots<{ default?: any }>` → `Slot` из vue, косметика |

## 3. `as unknown as` — 10 вхождений

| Где | Кол-во | Вердикт |
| --- | --- | --- |
| `text-editor/composables/useInlineEditor.ts:105,194,232,265` + `BuilderShellSidebarPropertyEditorRow.vue:67,105,134` | 7 | Все — `X[] as unknown as Array<unknown>` для передачи в API с union из §1.2. `T[]` ковариантно присваивается `unknown[]` — касты **скорее всего лишние вовсе**; проверить простым удалением. Если компилятор всё же ругается — лечится введением `TBrickPropValue` (§1.2) |
| `text-editor/tiptap/resizableImage.ts:162,177` | 2 | Доступ к внутренностям TipTap NodeView — легитимно, оставить |
| `render/composables/useBricksDataSources.ts:77` | 1 | `pageSettings as unknown as Record<string, unknown>` — классическая боль «interface без index signature». Лечится сигнатурой `getValueByPath(obj: object, ...)` |

## 4. Конвенции нейминга (typescript.md: `I`/`T`/`E`)

Полный инвентарь нарушений среди экспортируемых типов:

- **17 интерфейсов без `I`**, в т.ч. ядро схемы в `common/types/brick.ts`: `BricksComponent`, `BricksSchema`, `BricksComponentSlot`, `ComponentSlotDefinition`, `PropertyDefinition`, `CanvasState`, `SelectedComponent`, `ComponentLibraryItem`, `PropertyVariantContext` + весь `layouts-blocks/types/blockProps.d.ts` (`GridLayoutProps`, `FlexLayoutProps`, `SpaceProps`, `SliderLayoutProps`, `SectionLayoutProps`, `AccordionLayoutProps`).
- **11 type без `T`**: `PropertyType`, `PropertyEditorType`, `SidebarView`, `LayoutProps`, `InlineEditingPropType`, `GridLayoutVariant`, `GridRowHeight`, `ComponentVariantsMap`, `BricksComponentsStore`, `IBrickDemoValues` (type с `I`-префиксом!), …
- **2 анти-кейса**: `type IItemStyle`, `type IComponentsActions` — `type` с `I`-префиксом интерфейса.

**Рекомендация:** механический rename через IDE/LSP (типы из `brick.ts` используются в десятках файлов — руками не делать). Отдельный коммит без смешивания с логикой. Приоритет medium: ценность консистентности, риска ноль, но объём большой. Начать с `blockProps.d.ts` (локальный, ~10 потребителей), `brick.ts` — последним.

## 5. Inline `defineProps<{...}>` — 16 компонентов (low)

58 компонентов используют импортируемые `I*Props` (норма), 16 — inline object literal, против правила «типы в d.ts»: 6 в `ui/` (`BricksToast`, `BricksActionButton`, `BricksTextEditorToolbar`, `BricksToolbarColorPicker`, `BricksSelectOption`, `BricksToolbarEditableSelect`), `BuilderLogo`, `TheBuilderLoader`, `TheBuilderShellSidebar`, `BuilderShellSidebarComponentsView`, 5 блоков (`BlockFlex/Section/Grid/Accordion/Space` — у этих inline лишь обёртка `{ layoutProps, layoutId }`, см. §1.5) и др.

**Рекомендация:** для блоков — допустимо оставить (двухполевая обёртка); для остальных — выносить в `types/components.d.ts` своего домена по мере касания файлов, не отдельным заходом.

## Журнал выполнения

**2026-06-12 — заходы 1–3 выполнены:**

- ✅ Заход 1: `TBrickPropValue` введён в `common/types/brick.ts`, все 7+ inline-union'ов заменены (включая `useSidebarPropertiesPanel`, `BuilderShellSidebarPropertyEditors.vue`, `property-editors/types.ts`); 7 кастов `as unknown as Array<unknown>` удалены (§3); `TViewportType` удалён, 3 потребителя + `canvas.ts` + `CanvasState` переведены на `TBricksDeviceKey` (§1.1); база `ISidebarPropertyHandlers` + `extends` (§1.3).
- ✅ Заход 2: типизированы `useDraggableComponent` (store → `TBricksComponentsStore`, payload → `TComponentInsertPayload`), `brickSlots` (`IBrickFileStructure`/`IBrickSlotDefinition`, добавлено `name?` в slot definition), `useComponentLibrary` (`IBricksResponse`/`IBrickListItem` в `app/types/composables.d.ts`), `vite-brick-watch` (`ViteDevServer`/`HotUpdateOptions`), `vue-icons` (`Component` + `PropType`). `PropertyDefinition.default`/`options.value` → `IBrickDemoValues` (не `TBrickPropValue`: реальные значения включают null/undefined); `IBrickDemoValues` перенесён в `brick.ts` (re-export из index), его array-член расширен до `Array<unknown>` (массивы интерфейсов типа `IInlineContentSegment[]`). Точечные касты: `useComponentProperties` (vars), `usePropertyVariants` ×2 (`?? {}`-выражения), `propertyValueCoercion` (fallback default). `IDragComposableCanvas.handleDrop.store: unknown` → типизирован.
- ✅ Заход 3: механический rename 15 интерфейсов + 12 типов (полный инвентарь, word-boundary perl по всем `.ts`/`.vue`): `I*` — BricksComponent(Slot), BricksSchema, CanvasState, ComponentLibraryItem, ComponentSlotDefinition, *LayoutProps ×6, PropertyDefinition, PropertyVariantContext, SelectedComponent; `T*` — BricksComponentsStore, ComponentVariantsMap, GridLayoutVariant, GridRowHeight, IBrickDemoValues→TBrickDemoValues, IComponentsActions→TComponentsActions, IItemStyle→TItemStyle, InlineEditingPropType, LayoutProps, PropertyEditorType, PropertyType, SidebarView. Обновлены упоминания в CLAUDE.md и naming.md.
- Не делалось (по плану): §1.4 modal-типы (оставить), §5 inline props (по мере касания файлов), §2.2 (global.d.ts шимы, Swiper, debounce — полулегитимные).
- Проверки: `vue-tsc --noEmit` — чисто (кроме 3 pre-existing ошибок: playground/definePageMeta, middleware/LayoutKey, useDocumentationArticles/glob query); `oxlint` — чисто.

## Рекомендуемый порядок выполнения

1. **Заход 1 (S, чистая выгода):** `TBrickPropValue` в common/types → замена ×7 (§1.2) → попытка удалить 7 кастов (§3) → удалить `TViewportType` (§1.1) → база handlers в sidebar (§1.3). Всё связано общим корнем, делается одним PR.
2. **Заход 2 (M):** типизация `useDraggableComponent` / `brickSlots` / `useComponentLibrary` / `vite-brick-watch` / `vue-icons` (§2.1).
3. **Заход 3 (L, механика):** rename'ы нейминга (§4) через LSP, отдельными коммитами по доменам.
4. **Фоном:** inline props (§5) — по мере касания файлов.

После каждого захода: `npx vue-tsc --noEmit` + `npm run lint:check`.
