# render/utils

The pure utilities of the render of a published page (isomorphic, with no Nuxt context).

| File                           | Purpose                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `dataSourceLogging.ts`         | Redacting the production logs of the data sources: a URL → its target (`local`/the origin), an error → the allow-list `{name, statusCode}` |
| `dataSourcePolicy.ts`          | The policy of the data sources: the allow-list of the methods (GET/HEAD) and of the URLs (relative ones / the permitted hosts)             |
| `dataSourceResponseReading.ts` | `readResponseWithinByteBudget` — the streaming read of a response within a byte budget BEFORE JSON.parse                                   |
| `pageLookupDeadline.ts`        | `withPageLookupDeadline` — the outer deadline of the SSR lookup of a page (the reading ceiling plus a margin)                              |
| `requestPool.ts`               | `runWithConcurrencyLimit` — a pool of promises with a concurrency limit (the SSR requests of the data sources)                             |
