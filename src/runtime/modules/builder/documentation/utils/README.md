# builder/documentation/utils

| File                             | Purpose                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sanitizeDocumentationHtml.ts`   | The sanitizer of an article ahead of `v-html`: the base rich-text profile widened by the markdown tables of the guide and by the cross-links between articles (`./NN-name.md`) |
| `documentationHeadingAnchors.ts` | The `id` of a heading (a Unicode slug of its text) and the reading of the fragment a link of an article points at                                                              |
