import { test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/axe';
import { waitForNuxtHydration } from '../support/ui';

/**
 * The accessibility gate over the login screen.
 *
 * It lives in the fixture of database auth because that is the only place the
 * screen exists: under basic auth the browser asks for the credentials itself and
 * the package draws no form at all. The screen is the first one an installation
 * with accounts shows, and until now nothing checked it.
 */

test('keeps the login screen accessible', async ({ page }, testInfo) => {
    await page.goto('/bricks/bricks-login');
    await waitForNuxtHydration(page);

    await expectNoAccessibilityViolations(page, testInfo, 'login');
});
