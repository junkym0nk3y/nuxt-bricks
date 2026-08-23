export default defineNuxtConfig({
    modules: ['../src/module'],
    bricks: {
        backend: {
            mode: 'builtin', // 'builtin' (PostgreSQL) | 'external' (an own HTTP backend)
        },
        auth: {
            mode: 'database', // 'basic' (the default) | 'database'
            sessionMaxAgeSeconds: 604800, // cookie session lifetime, 7 days (database only)
        },
    },
    devtools: { enabled: true },
    // Works around a Nuxt 3.x race (nuxt/nuxt#33606): Vite scans manifest.js earlier than
    // Nitro registers the virtual #app-manifest, which ends in a Pre-transform error. The
    // playground uses neither routeRules nor stale-deployment detection, so turning the
    // manifest off is safe here.
    experimental: { appManifest: false },
    compatibilityDate: '2025-01-01',
});
