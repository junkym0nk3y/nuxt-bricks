# render/utils

The pure utilities of the render of a published page (isomorphic, with no Nuxt context).

| File                           | Purpose                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `componentIndex.ts`            | `buildRendererComponentIndex` — the "id → component" index of a schema, the first occurrence of a repeated id winning (a linear `find` answered with the first one)                              |
| `dataSourceLogging.ts`         | Redacting the production logs of the data sources: a URL → its target (`local`/the origin), an error → the allow-list `{name, statusCode}`                                                       |
| `dataSourceParams.ts`          | The URL parameters of the data sources: the check of a resolved value (a string, a finite number, a boolean) and the substitution into the template with a report of the unresolved placeholders |
| `dataSourcePolicy.ts`          | The policy of the data sources: the allow-list of the methods (GET/HEAD) and of the URLs (relative ones / the permitted hosts)                                                                   |
| `dataSourceResponseReading.ts` | `readResponseWithinByteBudget` — the streaming read of a response within a byte budget BEFORE JSON.parse                                                                                         |
| `pageCode.ts`                  | Page code: `appendPageCodeToHtml` writes it into the parts of the SSR document, `mountPageCode` inserts it into a live document so its scripts run (the preview)                                 |
| `pageLookupDeadline.ts`        | `withPageLookupDeadline` — the outer deadline of the SSR lookup of a page (the reading ceiling plus a margin)                                                                                    |
| `requestPool.ts`               | `runWithConcurrencyLimit` — a pool of promises with a concurrency limit (the SSR requests of the data sources)                                                                                   |
