/**
 * Nitro-плагин runtime-deprecation-предупреждений (регистрируется всегда).
 *
 * Build-time warning (module-runtime-config.ts) видит только nuxt.config и
 * env сборки; runtime-override NUXT_BRICKS_SSR_PROXY_URL Nitro применяет уже
 * после module setup — без проверки на старте сервера deprecated-механизм
 * активировался бы в production молча (ре-ревью PR3).
 */
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';

export default defineNitroPlugin(() => {
    const config = useRuntimeConfig();

    if (config.bricksSsrProxyUrl) {
        console.warn(
            '[nuxt-bricks] proxy.ssrUrl / NUXT_SERVER_CACHE_URL / NUXT_BRICKS_SSR_PROXY_URL — ' +
                'deprecated: используйте единый PROXY_URL для SSR и клиентского dev-прокси; ' +
                'ключ будет удалён в следующем мажорном релизе.'
        );
    }
});
