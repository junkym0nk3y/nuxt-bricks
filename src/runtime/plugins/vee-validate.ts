// Types
import type { NuxtApp } from '#app';

// Nuxt
import { defineNuxtPlugin } from '#imports';
import { runOnBuilderRoute } from './utils/builderRouteScope';

/**
 * A thin gate: vee-validate + @vee-validate/rules + yup are initialized by a lazy
 * chunk on the builder routes alone (which routes those are — `runOnBuilderRoute`).
 * Published pages do not load them: every form of the package lives in the builder.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
    await runOnBuilderRoute(async () => {
        const { installVeeValidate } = await import('./builder/veeValidateSetup');
        installVeeValidate(nuxtApp as NuxtApp);
    });
});
