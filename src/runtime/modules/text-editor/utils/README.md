# text-editor/utils

| File                       | Purpose                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createTiptapEditor.ts`    | The factory of a TipTap editor (the async load of the extensions, the initial content)                                 |
| `inlineContentTiptap.ts`   | The conversion of the inline-content segments ↔ a TipTap JSONContent (text/hardBreak/an image atom)                    |
| `insertMediaIntoEditor.ts` | Inserting media out of the gallery into the editor (a video — setVideo, an image — setImage)                           |
| `linkHref.ts`              | Normalizing and checking the address of a link out of the modal (a bare domain → https://, the `isSafeLinkUrl` policy) |
| `selectedMediaNode.ts`     | Finding the selected media node for the popover of the wrapping and the size                                           |
| `sizeUnits.ts`             | The pure conversions of the sizes of the media nodes (px/rem/em/%)                                                     |
