// Types
import type { Composer } from 'vue-i18n';

// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    isProtectedBricksHtmlPath,
    type IBricksRoutePrefixes,
} from '../modules/common/utils/bricks/routePaths';
import { pickBuilderLocale } from '../modules/builder/core/utils/builderLocale';

// Constants
import {
    BUILDER_HOST_LOCALE_STATE,
    BUILDER_LOCALE_COOKIE,
} from '../modules/builder/core/constants/locale';

// Nuxt
import {
    addRouteMiddleware,
    defineNuxtPlugin,
    useCookie,
    useRuntimeConfig,
    useState,
} from '#imports';

/**
 * The interface language of the builder and preview routes.
 *
 * The browser-language detection of `@nuxtjs/i18n` is off (see module-setup): it wrote
 * its cookie into every SSR response of the host. The language is applied here
 * instead, on the bricks routes alone, and only read: the cookie is written by the
 * switch. Published pages keep the default locale and carry no `Set-Cookie`.
 *
 * The locale is global state of i18n, so the builder gives it back: the locale of the
 * host is remembered on the way in and restored by the first client transition out to
 * a route of the host, which would otherwise go on in the language of the builder.
 *
 * The middleware runs after the one of i18n, which would otherwise put the current
 * locale back on a client transition. During the hydration it does nothing: the server
 * has already applied the locale, and i18n hands that choice to the client through the
 * payload.
 */
export default defineNuxtPlugin({
    name: 'bricks:builder-locale',
    dependsOn: ['i18n:plugin:route-locale-detect'],
    setup(nuxtApp) {
        const prefixes =
            (useRuntimeConfig().public.bricksRoutes as IBricksRoutePrefixes | undefined) ??
            DEFAULT_BRICKS_ROUTE_PREFIXES;
        const hostLocale = useState<string | null>(BUILDER_HOST_LOCALE_STATE, () => null);

        /**
         * Gives the host its locale back once the builder is left.
         *
         * @param i18n - The i18n instance of the application.
         */
        async function restoreHostLocale(i18n: Composer): Promise<void> {
            const locale = hostLocale.value;

            if (locale === null) {
                return;
            }

            hostLocale.value = null;

            if (locale !== i18n.locale.value) {
                await i18n.setLocale(locale);
            }
        }

        addRouteMiddleware(
            'bricks-builder-locale',
            async (to) => {
                const i18n = nuxtApp.$i18n as Composer | undefined;

                if (!i18n) {
                    return;
                }

                if (!isProtectedBricksHtmlPath(prefixes, to.path)) {
                    await restoreHostLocale(i18n);
                    return;
                }

                if (import.meta.client && nuxtApp.isHydrating) {
                    return;
                }

                hostLocale.value ??= i18n.locale.value;

                const saved = useCookie<string | null>(BUILDER_LOCALE_COOKIE, {
                    readonly: true,
                }).value;
                const locale = pickBuilderLocale(saved, i18n.locale.value);

                if (locale !== i18n.locale.value) {
                    await i18n.setLocale(locale);
                }
            },
            { global: true }
        );
    },
});
