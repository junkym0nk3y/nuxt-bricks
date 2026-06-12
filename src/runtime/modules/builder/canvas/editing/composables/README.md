# builder/canvas/editing/composables

Композаблы inline-редактирования на канвасе (поверх TipTap из `text-editor/`).

| Файл                            | Назначение                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `useCanvasItemInlineEditing.ts` | Логика inline-редактирования элемента: старт/стоп, Escape, смена viewport, контекст детям  |
| `useDraggableOverlay.ts`        | Перетаскиваемый overlay (тулбар редактора): позиция у курсора, ограничение краями viewport |
| `useInlineEditingFallback.ts`   | Fallback-редактор, если layout-компонент не отдал editor за таймаут ожидания               |
