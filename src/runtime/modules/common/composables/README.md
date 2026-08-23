# common/composables

Shared composables (used by 2+ domains). A domain's own composables live next to its code —
every `composables/`/`utils/` folder has a README of its own with a table of its files.

| File                      | Purpose                                                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBricksConfig.ts`      | The builder's configuration with its default values. Reads out of `app.config.ts` (the device set is not here — see `useBricksDevices.ts`)                                                                                                                                                         |
| `useBricksDevices.ts`     | The device set of the project (the `bricks.devices` module option over `constants/devices.ts`) and the resolve of a particular page's set on top of it; `deviceRanges` — the window width ranges. The width of a device serves both as a sheet of the canvas and as the threshold of a media query |
| `useApiClient.ts`         | Working with the API: the `/api/bricks/**` paths are always local (`utils/localApiPaths.ts`), the rest of /api/\* go to the API host of the project (the SSR headers out of `utils/ssrRequestHeaders.ts`, CSRF, a 401 → login in database-auth)                                                    |
| `useBrickImports.ts`      | The dynamic import of the brick files of the components: the loader lookup by the `brickPath` out of the schema (the keys of the glob = the entries of the manifest, see `src/bricks-manifest.ts`)                                                                                                 |
| `useBricksStyles.ts`      | Generating the `.bricks-container` styles and injecting them into `<head>` (the canvas + the published media queries)                                                                                                                                                                              |
| `useBricksRoutePaths.ts`  | The paths of the bricks surfaces (`bricks.routes` + `app.baseURL`) for `window.location`/`window.open`/`<a href>`; inside Vue Router the named routes are used instead                                                                                                                             |
| `useBricksAssetUrl.ts`    | The URLs of the module's public assets (`/_bricks/` + `app.baseURL`) — a wrapper over `resolveBricksAssetUrl` for a setup context                                                                                                                                                                  |
| `useBricksPageAddress.ts` | Whether the addresses of a page are available by the REAL routing (`router.resolve`): the live address and the editor's address. Catches both the builder's surfaces and the pages of the consumer application — there is no list of reserved names                                                |

## Rules

1. **Interfaces** are kept in the `types/` of the domain (`*.d.ts`), never inline in the files
2. **Comments** are written in English
3. **JSDoc** is mandatory for every public function
4. **#region** comments group the code
5. A new composable goes into the domain that consumes it; into `common/` only when 2+ domains
   use it
