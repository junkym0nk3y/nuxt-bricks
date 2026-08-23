# builder/templates/utils

| File                  | Purpose                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templatesApi.ts`     | The requests of `/api/bricks/templates/**`: the list of summaries, the full template by point lookup, creation, editing the label, deletion                                                     |
| `templateErrors.ts`   | Telling the refusals apart: a taken name (`TEMPLATE_NAME_CONFLICT`) under the field, the message keys by status, a text of its own for an abort by the waiting ceiling (the outcome is unknown) |
| `templateSummary.ts`  | `toTemplateSummary` — the full row of a record's response → a summary of the list (the number of blocks is counted out of the schema: the full row does not carry it)                           |
| `validationSchema.ts` | The yup schema of the template form (the name and the description) — shared by saving and renaming; the bounds come out of `common/constants/templates.ts`                                      |
