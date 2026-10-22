/**
 * The route middleware that applies the interface language of the builder. It has to
 * stay off every route that is not the builder or the preview — those are the pages a
 * proxy caches — and off the hydration, where the server has already decided. Leaving
 * the builder by a client transition gives the host its locale back.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { registry, cookieJar, hostLocaleState } = vi.hoisted(() => ({
    registry: {
        middleware: null as ((to: { path: string }) => Promise<void>) | null,
    },
    cookieJar: { value: undefined as string | undefined },
    hostLocaleState: { value: null as string | null },
}));

vi.mock('#imports', () => ({
    defineNuxtPlugin: (plugin: unknown) => plugin,
    addRouteMiddleware: (_name: string, middleware: (to: { path: string }) => Promise<void>) => {
        registry.middleware = middleware;
    },
    useCookie: () => cookieJar,
    useRuntimeConfig: () => ({ public: {} }),
    useState: (_key: string, init: () => string | null) => {
        hostLocaleState.value ??= init();
        return hostLocaleState;
    },
}));
// #endregion

import plugin from '../../src/runtime/plugins/builder-locale';

/**
 * A Nuxt app with the members of i18n the middleware reads.
 *
 * @param overrides - Hydration flag, the browser locale and the locale applied so far.
 * @returns The app and the spy of the locale switch.
 */
function createApp(overrides: { isHydrating?: boolean; browser?: string; locale?: string } = {}) {
    const locale = { value: overrides.locale ?? 'ru' };
    const setLocale = vi.fn((next: string) => {
        locale.value = next;
        return Promise.resolve();
    });
    const app = {
        isHydrating: overrides.isHydrating ?? false,
        $i18n: {
            locale,
            getBrowserLocale: () => overrides.browser,
            setLocale,
        },
    };

    (plugin as unknown as { setup: (nuxtApp: unknown) => void }).setup(app);

    return { setLocale, locale };
}

/**
 * Runs the registered middleware for a path.
 *
 * @param path - Path of the route.
 */
async function navigate(path: string): Promise<void> {
    await registry.middleware?.({ path });
}

beforeEach(() => {
    registry.middleware = null;
    cookieJar.value = undefined;
    hostLocaleState.value = null;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('builder locale middleware', () => {
    it('applies the saved language on a builder route', async () => {
        cookieJar.value = 'en';
        const { setLocale } = createApp({ browser: 'ru' });

        await navigate('/bricks/landing');

        expect(setLocale).toHaveBeenCalledWith('en');
    });

    it('keeps the default locale on the preview when nothing is saved', async () => {
        const { setLocale } = createApp();

        await navigate('/bricks-preview/landing');

        expect(setLocale).not.toHaveBeenCalled();
    });

    it('does not follow the language of the browser', async () => {
        // A Russian-speaking team on English browsers got the English interface and a
        // documentation without English articles
        const { setLocale } = createApp({ browser: 'en' });

        await navigate('/bricks/landing');

        expect(setLocale).not.toHaveBeenCalled();
    });

    it('leaves a published page alone', async () => {
        cookieJar.value = 'en';
        const { setLocale } = createApp({ browser: 'en' });

        await navigate('/landing');
        await navigate('/');

        expect(setLocale).not.toHaveBeenCalled();
    });

    it('does not switch to the locale already applied', async () => {
        cookieJar.value = 'ru';
        const { setLocale } = createApp({ browser: 'en' });

        await navigate('/bricks');

        expect(setLocale).not.toHaveBeenCalled();
    });

    it('moves a host running in a locale of its own to Russian', async () => {
        const { setLocale } = createApp({ browser: 'de', locale: 'de' });

        await navigate('/bricks');

        expect(setLocale).toHaveBeenCalledWith('ru');
    });

    it('does nothing in an application without i18n', async () => {
        cookieJar.value = 'en';
        (plugin as unknown as { setup: (nuxtApp: unknown) => void }).setup({ isHydrating: false });

        await expect(navigate('/bricks')).resolves.toBeUndefined();
    });

    it('gives the host its locale back on the way out of the builder', async () => {
        cookieJar.value = 'en';
        const { setLocale, locale } = createApp({ browser: 'de', locale: 'de' });

        await navigate('/bricks');
        await navigate('/bricks/landing');
        await navigate('/landing');

        expect(setLocale.mock.calls).toEqual([['en'], ['de']]);
        expect(locale.value).toBe('de');
        expect(hostLocaleState.value).toBeNull();
    });

    it('restores the host locale only once', async () => {
        cookieJar.value = 'en';
        const { setLocale } = createApp();

        await navigate('/bricks');
        await navigate('/landing');
        setLocale.mockClear();
        await navigate('/about');

        expect(setLocale).not.toHaveBeenCalled();
    });

    it('does not switch when the host locale is already applied on the way out', async () => {
        const { setLocale } = createApp({ browser: 'ru' });

        await navigate('/bricks');
        await navigate('/landing');

        expect(setLocale).not.toHaveBeenCalled();
        expect(hostLocaleState.value).toBeNull();
    });

    it('keeps the choice of the server during the hydration', async () => {
        vi.stubGlobal('__BRICKS_TEST_CLIENT__', true);
        const { setLocale } = createApp({ isHydrating: true, browser: 'en' });

        await navigate('/bricks');

        expect(setLocale).not.toHaveBeenCalled();
    });

    it('restores the host locale the server remembered before the hydration', async () => {
        vi.stubGlobal('__BRICKS_TEST_CLIENT__', true);
        hostLocaleState.value = 'ru';
        const app = createApp({ isHydrating: true, locale: 'en' });

        await navigate('/bricks');
        await navigate('/landing');

        expect(app.setLocale.mock.calls).toEqual([['ru']]);
    });

    it('applies the language on a client transition after the hydration', async () => {
        vi.stubGlobal('__BRICKS_TEST_CLIENT__', true);
        cookieJar.value = 'en';
        const { setLocale } = createApp({ isHydrating: false });

        await navigate('/bricks');

        expect(setLocale).toHaveBeenCalledWith('en');
    });
});
