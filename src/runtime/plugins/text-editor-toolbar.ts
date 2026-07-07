// Types
import type { NuxtApp } from '#app';

// Nuxt
import { defineNuxtPlugin } from '#imports';
import { runOnBuilderRoute } from './utils/builderRouteScope';

/**
 * Тонкий гейт: конфиг toolbar'а текстового редактора (~15KB) провайдится
 * lazy-чанком только на роутах билдера (/bricks/**) — published-страницы
 * его не грузят.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
    await runOnBuilderRoute(async () => {
        const { installTextEditorToolbar } = await import('./builder/textEditorToolbarSetup');
        installTextEditorToolbar(nuxtApp as NuxtApp);
    });
});
