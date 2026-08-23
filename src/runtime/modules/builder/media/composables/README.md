# builder/media/composables

| File                         | Purpose                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `useMediaUpload.ts`          | Uploading files into the media gallery: the limits out of the app config, validating the type and the size, the media store              |
| `useSchemaImageResolver.ts`  | Resolving the images of an imported JSON schema: the modal of the choice (keep / stand-in)                                               |
| `useMediaCategoryActions.ts` | Creating and deleting the categories of the media library: the write flags, the deletion confirmation, the text of the confirmation      |
| `useMediaGalleryFileDrop.ts` | The file receiver of the gallery: the counter of the dragged files, `drop`, the safeguard against a stuck overlay                        |
| `useMediaMetaDrafts.ts`      | The drafts of the name and the alt of the selected file: a commit when the focus leaves, the input protected from the server's responses |
