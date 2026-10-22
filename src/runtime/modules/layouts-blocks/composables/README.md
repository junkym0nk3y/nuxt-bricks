# layouts-blocks/composables

| File                               | Purpose                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useLayoutDropZone.ts`             | Dispatching the bubbling `layout-drop` event (listened for by the canvas root — a link with no import of builder) |
| `useResponsiveLayoutStyles.ts`     | Injecting the CSS rules that pick the active responsive variables (`--bricks-*`) by viewport/media query          |
| `useResponsiveVisibilityStyles.ts` | Injecting the CSS rules that hide by device (builder: `data-bricks-viewport`, published: `@media`)                |
| `useSliderDropTarget.ts`           | The Swiper slide selection (no loop duplicates) and the insertion index computed over it                          |
| `useGridDropZone.ts`               | The drop zone of a Grid: the cell under the cursor and the placeholder pinned to it, over the shared zone         |
| `useGridOverlayMetrics.ts`         | The measured content box and row heights the grid underlay of a BlockGrid is drawn from                           |
