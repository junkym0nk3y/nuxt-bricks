# layouts-blocks/utils

| File                     | Purpose                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `canvasBindings.ts`      | The canvas bindings shared by the definitions: boundProps + componentId of the leaf blocks with inline editing (Text/Svg), the generic binding of a container            |
| `gridDimensions.ts`      | `resolveGridCellCapacity` — the cells a Grid declares on a concrete viewport (the responsive overrides included); reads the registry, so no definition may import it     |
| `gridTracks.ts`          | `normalizeGridTrackCount` — folding the declared `rows`/`columns` of an untrusted schema into whole tracks; pure, shared by the SFC and the definition                   |
| `gridDropPlacement.ts`   | Computing the targetIndex (the grid cell) by the cursor: the canvas scale, the padding, the gap and the actual tracks                                                    |
| `gridOverlayGeometry.ts` | The pure geometry of the SVG visualization of a BlockGrid's grid (the column/row lines, the rectangles of the gaps)                                                      |
| `linearDropPlacement.ts` | The insertion index of a linear drop zone by the cursor, plus the shared selection of the children of a zone                                                             |
| `inlineContent.ts`       | `applyColorToSvgContent` — trimming an inline SVG and substituting `currentColor` into its fill/stroke (BlockSvg)                                                        |
| `publishedProps.ts`      | `resolvePublishedProps` — merging the definition defaults with the schema props for the published render                                                                 |
| `responsiveCss.ts`       | Generating the CSS rules out of the `responsiveCssVars` of the definitions (the breakpoints of a published page)                                                         |
| `responsiveVars.ts`      | `makeResponsiveVars` — the per-device CSS variables and the grid positioning for the published render                                                                    |
| `flexAlignment.ts`       | `mapFlexJustify`/`mapFlexAlign` — the single alignment tables of Flex, shared by the SFC and the definition                                                              |
| `sectionContentWidth.ts` | `sectionLayoutStyle`/`hasSectionContentLimit`/`toSectionMaxWidth` — the maximum content width of Section as a centered grid column, shared by the SFC and the definition |
| `spaceSize.ts`           | `normalizeSpaceSize` — the single `size` normalization of Space, shared by the SFC and the definition                                                                    |
| `propertyCoercion.ts`    | `coerceNumberProperty` — folding an untrusted `number` property into its declared bounds; the registry and the published render share these rules                        |
| `sliderCaptions.ts`      | Parsing the captions of a slider (`parseSliderCaptions`)                                                                                                                 |
| `slotContent.ts`         | `countSlotContent` — how many nodes of a slot actually paint (v-if anchors and empty fragments do not count)                                                             |
| `deviceVisibilityCss.ts` | `buildDeviceVisibilityCss` — the rules that hide by the devices of the set, for the canvas and for published                                                             |
| `slider.ts`              | `normalizeSlidesPerView` — the shared normalization of the number of slides for the SFC and for the definition                                                           |
