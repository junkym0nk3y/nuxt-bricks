# layouts-blocks/utils

| File                     | Purpose                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvasBindings.ts`      | The canvas binding of the leaf blocks with inline editing (Text/Svg): boundProps + componentId                                                                                |
| `gridDimensions.ts`      | The declared dimensions of a Grid: normalizing `rows`/`columns` out of an untrusted schema and the number of cells on a concrete viewport (the responsive overrides included) |
| `gridDropPlacement.ts`   | Computing the targetIndex (the grid cell) by the cursor: the canvas scale, the padding, the gap and the actual tracks                                                         |
| `gridOverlayGeometry.ts` | The pure geometry of the SVG visualization of a BlockGrid's grid (the column/row lines, the rectangles of the gaps)                                                           |
| `linearDropPlacement.ts` | The insertion index of a linear drop zone by the cursor, plus the shared selection of the children of a zone                                                                  |
| `inlineContent.ts`       | `applyColorToSvgContent` — substituting `currentColor` into the fill/stroke of an inline SVG (BlockSvg)                                                                       |
| `publishedProps.ts`      | `resolvePublishedProps` — merging the definition defaults with the schema props for the published render                                                                      |
| `responsiveCss.ts`       | Generating the CSS rules out of the `responsiveCssVars` of the definitions (the breakpoints of a published page)                                                              |
| `responsiveVars.ts`      | `makeResponsiveVars` — the per-device CSS variables and the grid positioning for the published render                                                                         |
| `sliderCaptions.ts`      | Parsing the captions of a slider (`parseSliderCaptions`)                                                                                                                      |
| `slotContent.ts`         | `countSlotContent` — how many nodes of a slot actually paint (v-if anchors and empty fragments do not count)                                                                  |
| `deviceVisibilityCss.ts` | `buildDeviceVisibilityCss` — the rules that hide by the devices of the set, for the canvas and for published                                                                  |
| `slider.ts`              | `normalizeSlidesPerView` — the shared normalization of the number of slides for the SFC and for the definition                                                                |
