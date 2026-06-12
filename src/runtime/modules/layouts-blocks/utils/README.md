# layouts-blocks/utils

| Файл                     | Назначение                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `canvasBindings.ts`      | Канвас-биндинг leaf-блоков с inline editing (Title/Text/Svg): boundProps + componentId           |
| `gridDropPlacement.ts`   | Вычисление targetIndex (ячейки грида) по курсору с учётом canvas scale, padding и gap            |
| `gridOverlayGeometry.ts` | Чистая геометрия SVG-визуализации сетки BlockGrid (границы колонок/строк, прямоугольники gap'ов) |
| `inlineContent.ts`       | Создание/нормализация inline-content сегментов                                                   |
| `responsiveCss.ts`       | Генерация CSS rules из `responsiveCssVars` definitions (брейкпоинты published-страницы)          |
| `responsiveVars.ts`      | `makeResponsiveVars` — per-device CSS-переменные и grid-позиционирование для published-рендера   |
| `sliderCaptions.ts`      | Парсинг подписей слайдера (`parseSliderCaptions`)                                                |
