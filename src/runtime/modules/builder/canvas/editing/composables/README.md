# builder/canvas/editing/composables

Composables of inline editing on the canvas (on top of TipTap out of `text-editor/`).

| File                            | Purpose                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `useCanvasItemInlineEditing.ts` | The inline editing logic of an item: start/stop, Escape, a change of viewport, the context for the children |
| `useDraggableOverlay.ts`        | A draggable overlay (the editor toolbar): the position by the cursor, bounded by the edges of the viewport  |
| `useInlineEditingFallback.ts`   | The fallback editor for when a layout component did not hand over an editor within the waiting timeout      |
