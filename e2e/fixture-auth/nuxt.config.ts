/**
 * The fixture of the browser test for database auth.
 *
 * A second fixture rather than a switch of the first one: the two authorization
 * modes are two supported deployments, and the basic one must keep its browser
 * coverage. It cannot be one app either — `auth.mode: 'database'` and
 * `backend.mode: 'external'` are incompatible by build, and two runtime guards
 * answer 503 on top of that.
 *
 * So the data lives in `builtin` mode, and both of its adapters are replaced by
 * test doubles in `server/plugins/testAdapters.ts`: the accounts by an in-memory
 * store, the pages and the media by the same fake backend the basic fixture talks
 * to. The connection string is a formality the middleware demands before it looks
 * at the adapter at all — nothing ever connects by it.
 */
export default defineNuxtConfig({
    modules: ['../../src/module'],
    bricks: {
        backend: {
            mode: 'builtin',
        },
        auth: {
            mode: 'database',
        },
        i18n: {
            defaultLocale: 'en',
        },
    },
    experimental: {
        appManifest: false,
    },
    compatibilityDate: '2025-01-01',
});
