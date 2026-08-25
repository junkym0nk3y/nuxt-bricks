# builder/media/utils

| File                      | Purpose                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categoryLabels.ts`       | The label of a category by its slug (a label is user input, there are no preset categories)                                                                                |
| `draggedFiles.ts`         | How many files a drag carries (text and links do not count)                                                                                                                |
| `formatFileSize.ts`       | Formatting a file size into a human-readable form (B/KB/MB)                                                                                                                |
| `imageHosts.ts`           | Recognizing an image of an imported schema by its host (`bricks.media.imageHosts` plus the default pair): a signed link and an image proxy answer without a file extension |
| `mediaSummary.ts`         | The technical summaries of a file for the meta panel: the dimensions, the format, the weights of the variants                                                              |
| `normalizeMediaItem.ts`   | Bringing an item of an API response into shape: snake_case → camelCase, empty strings and missing fields                                                                   |
| `optimizationSummary.ts`  | The upload parameters as a single line (the tooltip of the upload button, the file receiver)                                                                               |
| `requestErrors.ts`        | Checking the shape of the media and category responses, bringing a refused request into a form fit for a person                                                            |
| `schemaImageExtractor.ts` | Extracting and replacing the image URLs of an `IBricksSchema`                                                                                                              |
| `storageImport.ts`        | The request to register in the media library the files that already lie in the publication storage (an admin operation)                                                    |
