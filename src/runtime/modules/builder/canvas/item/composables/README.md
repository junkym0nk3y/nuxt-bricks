# builder/canvas/item/composables

Composables of a canvas item (BuilderCanvasItem): loading, layout, actions, drag and drop.

| File                      | Purpose                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `useCanvasItemActions.ts` | The handlers of the context menu (right click) and of selecting a component: deletion, the clipboard, hiding, moving, favorites |
| `useCanvasItemDrag.ts`    | Drag-and-drop of an item: the drag image with a clone, dataTransfer, clearing the state                                         |
| `useCanvasItemLayout.ts`  | Resolving the layout props through the registry, `effectiveViewport` (injected in Figma mode)                                   |
| `useCanvasItemLoader.ts`  | The async load of the Vue component out of a brick module, a re-render by the forceRender props out of the manifest metadata    |
| `useComponentSlots.ts`    | The slots of a canvas item: the binding to the child components, the definitions picked up out of the manifest metadata         |
| `useSlotDragDrop.ts`      | Drag-and-drop into the slots of a component (the drop indicator)                                                                |
