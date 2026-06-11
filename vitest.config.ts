import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * Registry layout-блоков импортирует `.vue`-компоненты (renderPublished leaf-блоков),
 * поэтому тестам нужен SFC-transform.
 */
export default defineConfig({
    plugins: [vue()],
});
