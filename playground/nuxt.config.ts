export default defineNuxtConfig({
    modules: ['../src/module'],
    bricks: {
        backend: {
            mode: 'builtin', // 'builtin' (PostgreSQL) | 'external' (свой HTTP-backend)
        },
        auth: {
            mode: 'database', // 'basic' (дефолт) | 'database'
            sessionMaxAgeSeconds: 604800, // срок cookie-сессии, 7 дней (только database)
        },
    },
    devtools: { enabled: true },
    // Workaround гоночной баги Nuxt 3.x (nuxt/nuxt#33606): Vite сканирует manifest.js
    // раньше, чем Nitro регистрирует виртуальный #app-manifest → Pre-transform error.
    // Playground не использует routeRules/детект устаревшего деплоя — отключение безопасно.
    experimental: { appManifest: false },
    compatibilityDate: '2025-01-01',
});
