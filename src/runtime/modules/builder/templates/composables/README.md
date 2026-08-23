# builder/templates/composables

| File                       | Purpose                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTemplatesData.ts`      | The templates list in a `useState`: the read with an SSR deadline, the state of the section (`error` — a refused read, retried by a button), the point edits (`upsertTemplate`, `removeTemplate`), the counter of the rail |
| `useTemplatesList.ts`      | The view of the grid: the debounced search out of the dashboard header, the "the search found nothing" flag                                                                                                                |
| `useTemplateSaveForm.ts`   | The "Save as template" form: the validation, `POST /api/bricks/templates`, a taken name under the field, an aborted wait — the list is re-read                                                                             |
| `useTemplateRenameForm.ts` | The form for editing the label: `PATCH /api/bricks/templates/:id` (the content of the shot is not updated)                                                                                                                 |
| `useTemplateActions.ts`    | The actions that need no input: confirming and deleting a template; the busy state is one per section                                                                                                                      |
