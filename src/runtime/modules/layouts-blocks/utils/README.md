# layouts-blocks/utils

| Файл                     | Назначение                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `canvasBindings.ts`      | Канвас-биндинг leaf-блоков с inline editing (Text/Svg): boundProps + componentId                 |
| `gridDropPlacement.ts`   | Вычисление targetIndex (ячейки грида) по курсору: canvas scale, padding, gap и фактические треки |
| `gridOverlayGeometry.ts` | Чистая геометрия SVG-визуализации сетки BlockGrid (границы колонок/строк, прямоугольники gap'ов) |
| `inlineContent.ts`       | Создание/нормализация inline-content сегментов                                                   |
| `publishedProps.ts`      | `resolvePublishedProps` — merge дефолтов definition с пропсами схемы для published-рендера       |
| `responsiveCss.ts`       | Генерация CSS rules из `responsiveCssVars` definitions (брейкпоинты published-страницы)          |
| `responsiveVars.ts`      | `makeResponsiveVars` — per-device CSS-переменные и grid-позиционирование для published-рендера   |
| `sliderCaptions.ts`      | Парсинг подписей слайдера (`parseSliderCaptions`)                                                |
