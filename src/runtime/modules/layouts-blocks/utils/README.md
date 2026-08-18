# layouts-blocks/utils

| Файл                     | Назначение                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `canvasBindings.ts`      | Канвас-биндинг leaf-блоков с inline editing (Text/Svg): boundProps + componentId                 |
| `gridDropPlacement.ts`   | Вычисление targetIndex (ячейки грида) по курсору: canvas scale, padding, gap и фактические треки |
| `gridOverlayGeometry.ts` | Чистая геометрия SVG-визуализации сетки BlockGrid (границы колонок/строк, прямоугольники gap'ов) |
| `inlineContent.ts`       | `applyColorToSvgContent` — подстановка `currentColor` в fill/stroke inline-SVG (BlockSvg)        |
| `publishedProps.ts`      | `resolvePublishedProps` — merge дефолтов definition с пропсами схемы для published-рендера       |
| `responsiveCss.ts`       | Генерация CSS rules из `responsiveCssVars` definitions (брейкпоинты published-страницы)          |
| `responsiveVars.ts`      | `makeResponsiveVars` — per-device CSS-переменные и grid-позиционирование для published-рендера   |
| `sliderCaptions.ts`      | Парсинг подписей слайдера (`parseSliderCaptions`)                                                |
| `slotContent.ts`         | `countSlotContent` — сколько узлов слота рисуют (анкоры v-if и пустые фрагменты не считаются)    |
| `deviceVisibilityCss.ts` | `buildDeviceVisibilityCss` — правила скрытия по устройствам набора для канваса и published       |
| `slider.ts`              | `normalizeSlidesPerView` — общая нормализация числа слайдов для SFC и definition                 |
