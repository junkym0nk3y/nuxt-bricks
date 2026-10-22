import { expect, type Page } from '@playwright/test';

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

/**
 * Waits until the editor takes input. While its loader is on the screen, the toolbar and
 * the working area are `inert`: a click lands on the pointer blocker over them and opens
 * nothing, and axe skips an inert subtree, so a check run there passes on markup nobody
 * can reach yet. Hydration alone does not wait this out, and on a cold dev server the
 * loader outlives it by seconds.
 *
 * @param page - The page of the editor.
 */
export async function waitForBuilderUnlocked(page: Page): Promise<void> {
    await expect(page.locator('[inert]')).toHaveCount(0, { timeout: 30_000 });
}
