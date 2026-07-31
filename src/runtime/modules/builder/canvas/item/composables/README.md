# builder/canvas/item/composables

Композаблы элемента канваса (BuilderCanvasItem): загрузка, layout, действия, drag&drop.

| Файл                      | Назначение                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `useCanvasItemActions.ts` | Обработчики контекстного меню (ПКМ) и выбор компонента: удаление, буфер обмена, скрытие, перемещение, избранное |
| `useCanvasItemDrag.ts`    | Drag-and-drop элемента: drag-image с клоном, dataTransfer, очистка состояния                                    |
| `useCanvasItemLayout.ts`  | Резолв layout-пропов через registry, `effectiveViewport` (inject в Figma mode)                                  |
| `useCanvasItemLoader.ts`  | Асинхронная загрузка Vue-компонента из brick-модуля, перерендер по forceRender-пропам из метаданных манифеста   |
| `useComponentSlots.ts`    | Слоты элемента канваса: связка с дочерними компонентами, добор определений из метаданных манифеста              |
| `useSlotDragDrop.ts`      | Drag-and-drop внутрь слотов компонента (drop-индикатор)                                                         |
