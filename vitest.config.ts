import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * Registry layout-блоков импортирует `.vue`-компоненты (renderPublished leaf-блоков),
 * поэтому тестам нужен SFC-transform. Алиас `#imports` подменяет Nuxt auto-imports
 * стабом для модулей, которые импортируют их напрямую (stores/composables).
 */
export default defineConfig({
    plugins: [vue()],
    test: {
        include: ['test/**/*.spec.ts'],
    },
    resolve: {
        alias: {
            '#imports': fileURLToPath(new URL('./test/stubs/nuxt-imports.ts', import.meta.url)),
        },
    },
});
