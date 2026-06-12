# Добавление layout-блока

Ты — специализированный агент для добавления новых layout-блоков (домен `layouts-blocks`) в nuxt-bricks.

## Инструкция пользователя

$ARGUMENTS

---

## Контекст

Layout-блоки (Grid, Flex, Section, Space, Slider, Title, Text, Media, Accordion, Svg) живут в registry: один блок = `BlockX.vue` + `blockX.definition.ts` + 2 однострочные регистрации. Дефолты, свойства панели, responsive-поведение и published-рендер описываются **только** в definition — никаких дублей в builder/canvas/render/sidebar.

Все пути — от `src/runtime/modules/`.

Ключевые файлы:

- `layouts-blocks/types/registry.d.ts` — `IBlockDefinition`, контексты `IBlockCanvasContext` / `IBlockRenderContext`
- `layouts-blocks/registry.ts` — `BLOCK_REGISTRY` + derive-функции (`getLayoutLibraryItems`, `getBlockProperties`, `resolveBlockProps`, `resolveCanvasBind`)
- `layouts-blocks/canvasBlockComponents.ts` — eager-мапа `.vue` для канваса
- `layouts-blocks/utils/responsiveVars.ts` — `makeResponsiveVars`, `getResponsiveOverrides`, `gridPlacementStyle` для `renderPublished`
- `layouts-blocks/utils/canvasBindings.ts` — `bindBoundPropsWithComponentId` (inline editing)
- `layouts-blocks/utils/responsiveCss.ts` — генерация глобальных CSS rules из `responsiveCssVars`

**Bundle firewall (критично):** definition контейнерного блока (children в default slot) НЕ импортирует свой `.vue` — published-рендер контейнера это `h('div')` + CSS-vars. Leaf-блоки импортируют свой `.vue` в definition для `renderPublished`. Канвасные `.vue` попадают в бандл билдера только через `canvasBlockComponents.ts`.

## Алгоритм

### Шаг 1: Создать `BlockX.vue`

`layouts-blocks/components/BlockX.vue`. Конвенции: `.claude/rules/vue-sfc.md`, `.claude/rules/styles.md`, нейминг `Block<Имя>` (минимум два слова), корневой CSS-класс = имя компонента.

### Шаг 2: Создать `blockX.definition.ts` (colocated)

```typescript
// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока X: <краткое описание>.
 */
export const blockXDefinition: IBlockDefinition = {
    name: 'X', // componentName в схеме, PascalCase
    description: 'Описание для библиотеки компонентов.',
    thumbnail: '/images/layouts/x.svg', // playground/public/images/layouts/
    hasChildren: false, // true — контейнер: children в default slot
    responsiveMode: 'none', // 'all' — все пропсы device-scoped (device-табы в сайдбаре)
    properties: [
        // ILayoutProperty[]: name, type, label, default, min/max, options, group, unit, responsive
    ],
    extraDefaults: {
        // дефолты вне панели свойств (попадают в defaultProps создания)
    },
};
```

Решения по полям:

| Ситуация                                | Что делать                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Контейнер (children)                    | `hasChildren: true`; `renderPublished` = `h('div')` + CSS-vars (см. `blockGrid.definition.ts`), `.vue` НЕ импортировать                                                         |
| Leaf-блок                               | `renderPublished` импортирует свой `.vue` (см. `blockMedia.definition.ts`); без `renderPublished` блок на published не отрисуется                                               |
| Адаптивные размеры/отступы              | `responsiveMode: 'all'` + `responsive: true` на свойствах + `responsiveCssVars: { prefix, vars }`; в `renderPublished` ставить per-device переменные через `makeResponsiveVars` |
| Inline editing (Title/Text/Svg-паттерн) | `canvasBind: bindBoundPropsWithComponentId` из `utils/canvasBindings.ts`                                                                                                        |
| Нестандартный биндинг канваса           | свой `canvasBind(ctx)` (см. Slider/Media)                                                                                                                                       |
| Свойства зависят от runtime (шрифты)    | `properties` как функция `(ctx) => ILayoutProperty[]` (см. Title); коэрция тогда пропускается                                                                                   |

### Шаг 3: Две регистрации

1. `layouts-blocks/registry.ts` → `BLOCK_REGISTRY` (порядок ключей = порядок в библиотеке)
2. `layouts-blocks/canvasBlockComponents.ts` → `CANVAS_BLOCK_COMPONENTS`

### Шаг 4: Проверки

```bash
npx vue-tsc --noEmit 2>&1 | grep -i blockX
npx oxlint <изменённые файлы>
npm run test
npm run deps:check
```

Dev-smoke: `npm run dev` → блок виден в библиотеке, бросается на канвас с дефолтами, панель свойств работает (device-табы при `responsiveMode: 'all'`), после publish рендерится на published-странице.

## Чего НЕ делать

- ❌ Дублировать дефолты где-либо кроме definition (`builder/core/constants/layoutComponents.ts` и `builder/core/utils/layoutProperties.ts` — обёртки registry, не трогать)
- ❌ Импортировать `.vue` контейнера в definition (ломает bundle firewall published-страницы)
- ❌ Импортировать builder-stores из `layouts-blocks` (depcruise-правило `layouts-blocks-deps` = error); viewport — через `inject(CANVAS_VIEWPORT_KEY)` из `common/constants/injectionKeys.ts`
- ❌ Добавлять ветки в `BuilderCanvasItemLayout.vue` / `useRendererLayouts.ts` — диспатч generic, всё через definition
