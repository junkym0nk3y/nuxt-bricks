# layouts-blocks/composables

| File                               | Purpose                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useLayoutDropZone.ts`             | Dispatching the bubbling `layout-drop` event (listened for by the canvas root — a link with no import of builder) |
| `useResponsiveLayoutStyles.ts`     | Injecting the CSS rules that pick the active responsive variables (`--bricks-*`) by viewport/media query          |
| `useResponsiveVisibilityStyles.ts` | Injecting the CSS rules that hide by device (builder: `data-bricks-viewport`, published: `@media`)                |
| `useSliderDropTarget.ts`           | The index and the flow target for inserting a slide by the cursor (with no Swiper duplicates under loop)          |
