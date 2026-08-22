// Types
import type { NuxtApp } from '#app';

// Nuxt
import { defineNuxtPlugin } from '#imports';
import { runOnBuilderRoute } from './utils/builderRouteScope';

/**
 * A thin gate: the config of the text editor toolbar (~15KB) is provided by a lazy
 * chunk on the builder routes alone (which routes those are — `runOnBuilderRoute`).
 * Published pages do not load it.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
    await runOnBuilderRoute(async () => {
        const { installTextEditorToolbar } = await import('./builder/textEditorToolbarSetup');
        installTextEditorToolbar(nuxtApp as NuxtApp);
    });
});
