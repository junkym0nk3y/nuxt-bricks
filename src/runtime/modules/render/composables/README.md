# render/composables

Composables of the render of a published page (common + layouts-blocks only, no stores).

| File                        | Purpose                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRendererLayouts.ts`     | Rendering the layout blocks through the registry: every block carries its own `renderPublished` in its definition                                                                                                                           |
| `useRendererBricks.ts`      | Extracting the Vue component out of a loaded brick module                                                                                                                                                                                   |
| `useDataSourceClient.ts`    | The dedicated public HTTP client of the data sources: no cookie, no identity, no CSRF, no 401 redirect; a timeout, the policy configuration                                                                                                 |
| `usePublicPageClient.ts`    | The public HTTP client of the lookup of a published page (the live path of the middleware): the same policy as the data sources have                                                                                                        |
| `useBricksDataSources.ts`   | Running a data source: resolving the params and the URL, the policy (GET/HEAD, an allow-list of hosts), deduplicating the requests, the redacted logs                                                                                       |
| `useRendererDataSources.ts` | The orchestration of a page's data sources: loading the declarations out of the brick files (cached), useAsyncData, a pool with a limit, merging the props                                                                                  |
| `useRendererPreviewSync.ts` | The live sync of the preview with the builder tab: the localStorage snapshot, a BroadcastChannel, visibilitychange, the banner (the device and the resolution); a preview of a version (`?version=`) gets neither the sync nor the snapshot |
