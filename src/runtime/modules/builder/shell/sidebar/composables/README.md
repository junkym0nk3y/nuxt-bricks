# builder/shell/sidebar/composables

Composables of the sidebar: the properties panel and the publication form.

| File                            | Purpose                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useSidebarPropertiesPanel.ts`  | The facade of the properties panel: the responsive scope + the media selection + the i18n resolve of the description out of the store |
| `useSidebarResponsiveScope.ts`  | The responsive scope of the panel: the device tabs, merging the overrides into the props, syncing with the canvas viewport            |
| `useSidebarMediaSelection.ts`   | Choosing media out of the gallery: the context of the request (a property / an image gallery)                                         |
| `usePropertyVariants.ts`        | Turning the property definitions into the variants for the different kinds of editors                                                 |
| `useSpacingEditor.ts`           | The box-model editor of a spacing group: the side slots (steppers/mirrors), the step, the inline input                                |
| `useComponentCardPreview.ts`    | The preview of a library card: the lazy load of the brick component, the contain scale, ResizeObserver                                |
| `useComponentCardDrag.ts`       | The dragstart of a card through the injected drag composable (`dragComposable`)                                                       |
| `useSidebarPublishForm.ts`      | The publication form of the sidebar: the state out of the publish store, the layout options, the preview URL, the handlers            |
| `usePublishValidationSchema.ts` | A wrapper over `publish/utils/validationSchema` (the store + i18n, with `editingPageId` excluded)                                     |
