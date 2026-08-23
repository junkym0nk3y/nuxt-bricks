import type { Page } from '@playwright/test';

/**
 * Waits until Nuxt hydrates the SSR markup. A click on an SSR button before that
 * moment goes through visually, but the Vue handler is not attached yet.
 */
export async function waitForNuxtHydration(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const root = document.getElementById('__nuxt');
        return Boolean(root && Reflect.get(root, '__vue_app__'));
    });
}
