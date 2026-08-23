/**
 * The keyboard of the tab bar is checked here rather than in unit tests: both
 * happy-dom and jsdom deliver the event to reka (which does call `preventDefault`),
 * but the focus move itself — a walk over the collection of nodes calling `focus()` —
 * never happens in the emulators, so the tests would "fail" on healthy code.
 *
 * Focus is placed by a click, not by `locator.focus()`: the buttons of the group carry
 * `tabindex` of "-1" (arrows lead inside, not Tab), and focusing such an element
 * programmatically in a headless browser raises no focus — it stays on `body`.
 */

import { expect, test } from '@playwright/test';
import { clearPages, createPage } from '../support/api';
import { waitForNuxtHydration } from '../support/ui';

const VIEWPORT_GROUP = 'Canvas view mode';

test.beforeEach(async ({ request }) => {
    await clearPages(request);
});

test('moves focus across the viewport switcher without changing the selection', async ({
    page,
    request,
}) => {
    await createPage(request, { pagename: 'tab-bar-keys', title: 'Tab bar keys' });

    await page.goto('/bricks/tab-bar-keys');
    await waitForNuxtHydration(page);

    const group = page.getByRole('group', { name: VIEWPORT_GROUP });
    const mobile = group.getByRole('button', { name: 'Mobile' });
    const tablet = group.getByRole('button', { name: 'Tablet' });

    await mobile.click();
    await expect(mobile).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowRight');

    await expect(tablet).toBeFocused();
    await expect(tablet).toHaveAttribute('aria-pressed', 'false');
    await expect(mobile).toHaveAttribute('aria-pressed', 'true');
});

test('selects the focused viewport on Enter', async ({ page, request }) => {
    await createPage(request, { pagename: 'tab-bar-enter', title: 'Tab bar enter' });

    await page.goto('/bricks/tab-bar-enter');
    await waitForNuxtHydration(page);

    const group = page.getByRole('group', { name: VIEWPORT_GROUP });
    const mobile = group.getByRole('button', { name: 'Mobile' });
    const tablet = group.getByRole('button', { name: 'Tablet' });

    await mobile.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(tablet).toHaveAttribute('aria-pressed', 'true');
    await expect(mobile).toHaveAttribute('aria-pressed', 'false');
});

test('wraps focus from the last button back to the first', async ({ page, request }) => {
    await createPage(request, { pagename: 'tab-bar-wrap', title: 'Tab bar wrap' });

    await page.goto('/bricks/tab-bar-wrap');
    await waitForNuxtHydration(page);

    const group = page.getByRole('group', { name: VIEWPORT_GROUP });
    const mobile = group.getByRole('button', { name: 'Mobile' });

    await mobile.click();
    await page.keyboard.press('End');

    await expect(group.getByRole('button', { name: 'Figma Like' })).toBeFocused();

    await page.keyboard.press('ArrowRight');

    await expect(mobile).toBeFocused();
});
