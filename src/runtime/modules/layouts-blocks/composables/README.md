# layouts-blocks/composables

| Файл                               | Назначение                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `useLayoutDropZone.ts`             | Диспатч bubbling-события `layout-drop` (слушается корнем канваса — связь без импорта builder)   |
| `useResponsiveLayoutStyles.ts`     | Инжект CSS-правил выбора активных responsive-переменных (`--bricks-*`) по viewport/media query  |
| `useResponsiveVisibilityStyles.ts` | Инжект CSS-правил скрытия по устройствам (builder: `data-bricks-viewport`, published: `@media`) |
| `useSliderDropIndicator.ts`        | Drop-индикатор слайдера: позиция линии вставки по курсору (без Swiper-дубликатов при loop)      |
