# builder/canvas/viewport/composables

Composables of the canvas root area: the scale, the scrolling, drag and drop onto free space.

| File                              | Purpose                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCanvas.ts`                    | A wrapper over the canvas store: the scale (`canvasTransform`), the container styles, the reaction to a resize                                                                |
| `useCanvasCentering.ts`           | Horizontal centering of the canvas (an rAF scheduler, watchers over scale/width/sidebar)                                                                                      |
| `useCanvasContainerMetrics.ts`    | Syncing the height of the canvas with its content (ResizeObserver, recomputed on a change of viewport)                                                                        |
| `useCanvasDrops.ts`               | The drag-and-drop logic of the canvas root area                                                                                                                               |
| `useCanvasDragAutoScroll.ts`      | Auto-scrolling `.canvasArea` while a drag is held at its edge (native DnD silences the wheel)                                                                                 |
| `useCanvasFlowGuard.ts`           | Silences the move transitions of the flow while the geometry of the canvas changes (zoom, viewport, sizes)                                                                    |
| `useCanvasPan.ts`                 | Panning with the middle mouse button                                                                                                                                          |
| `useCanvasWheel.ts`               | Ctrl(⌘)+scroll — zoom to the cursor, Shift+scroll — horizontal scrolling; the zoom of the ± buttons goes to the center                                                        |
| `useCanvasRemBase.ts`             | The rem compensation factor out of the `remBase` of a device of the project set (the builder forces `html { font-size: 10px }`, and the canvas has to match a published page) |
| `useInteractivePreviewDismiss.ts` | Dismissing the interactive preview on a click outside the component (pointerdown in capture)                                                                                  |
