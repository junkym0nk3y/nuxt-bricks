export default defineNuxtConfig({
    modules: ['../src/module'],
    bricks: {
        auth: {
            mode: 'database', // 'basic' (дефолт) | 'database'
            sessionMaxAgeSeconds: 604800, // срок cookie-сессии, 7 дней (только database)
        },
    },
    devtools: { enabled: true },
    compatibilityDate: '2025-01-01',
});
