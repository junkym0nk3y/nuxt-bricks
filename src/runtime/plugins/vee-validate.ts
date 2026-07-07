// Types
import type { NuxtApp } from '#app';

// Nuxt
import { defineNuxtPlugin } from '#imports';
import { runOnBuilderRoute } from './utils/builderRouteScope';

/**
 * Тонкий гейт: vee-validate + @vee-validate/rules + yup инициализируются
 * lazy-чанком только на роутах билдера (/bricks/**) — published-страницы
 * их не грузят (формы есть только в publish/sidebar билдера).
 */
export default defineNuxtPlugin(async (nuxtApp) => {
    await runOnBuilderRoute(async () => {
        const { installVeeValidate } = await import('./builder/veeValidateSetup');
        installVeeValidate(nuxtApp as NuxtApp);
    });
});
