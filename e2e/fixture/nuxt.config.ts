export default defineNuxtConfig({
    modules: ['../../src/module'],
    bricks: {
        backend: {
            mode: 'external',
            url: process.env.NUXT_BRICKS_BACKEND_URL,
            token: process.env.NUXT_BRICKS_BACKEND_TOKEN,
        },
        auth: {
            mode: 'basic',
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
