# builder/canvas/item/composables

Композаблы элемента канваса (BuilderCanvasItem): загрузка, layout, действия, drag&drop.

| Файл                       | Назначение                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `useCanvasItemActions.ts`  | Обработчики тулбара и выбор компонента: удаление, дублирование, скрытие, перемещение, избранное |
| `useCanvasItemDrag.ts`     | Drag-and-drop элемента: drag-image с клоном, dataTransfer, очистка состояния                    |
| `useCanvasItemLayout.ts`   | Резолв layout-пропов через registry, `effectiveViewport` (inject в Figma mode)                  |
| `useCanvasItemLoader.ts`   | Асинхронная загрузка Vue-компонента из brick-модуля, перерендер по forceRender-пропам           |
| `useComponentSlots.ts`     | Нормализация сырых определений слотов из brick в `IComponentSlotDefinition`                     |
| `useSlotDragDrop.ts`       | Drag-and-drop внутрь слотов компонента (drop-индикатор)                                         |
