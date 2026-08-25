import { expect, test } from '@playwright/test';
import { waitForNuxtHydration } from '../support/ui';

/**
 * The way in under database auth: the redirect of a protected path, the form, the
 * session cookie and the way back out.
 *
 * The suite used to enter the builder with HTTP Basic credentials sitting on the
 * transport, so the login page, the session and the logout had no browser coverage
 * at all — the one path every installation with accounts starts from.
 */

const USERNAME = 'e2e-editor';
const PASSWORD = 'e2e-password';
const SESSION_COOKIE = 'bricks-session';

/**
 * Fills the login form and submits it.
 *
 * @param page - The page standing on the login screen.
 * @param password - The password to type.
 */
async function submitLogin(page: import('@playwright/test').Page, password: string) {
    await page.getByRole('textbox').first().fill(USERNAME);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /sign in|log in|войти/i }).click();
}

test('sends an anonymous visitor to the login page and back after the login', async ({
    page,
    context,
}) => {
    await page.goto('/bricks');

    await expect(page).toHaveURL(/\/bricks\/bricks-login/);
    // Only the session matters here: the app is free to keep cookies of its own
    // (the chosen locale, for one), and they say nothing about being logged in
    expect(
        (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
    ).toBeUndefined();

    await waitForNuxtHydration(page);
    await submitLogin(page, PASSWORD);

    // The dashboard itself, not merely the address: a redirect with the screen of
    // the login still on it would pass a check of the URL alone
    await expect(page).toHaveURL(/\/bricks$/);
    await expect(page.getByRole('button', { name: '+ Create page', exact: true })).toBeVisible();

    const session = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE);

    expect(session).toBeDefined();
    // The cookie is the session itself: script must not be able to read it, and a
    // cross-site request must not carry it
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain(SESSION_COOKIE);
});

test('refuses a wrong password without opening a session', async ({ page, context }) => {
    await page.goto('/bricks/bricks-login');
    await waitForNuxtHydration(page);

    const refusal = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' && response.url().includes('/api/bricks/auth/')
    );

    await submitLogin(page, 'not-the-password');

    expect((await refusal).status()).toBe(401);
    await expect(page).toHaveURL(/\/bricks\/bricks-login/);
    expect(
        (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
    ).toBeUndefined();

    // The refusal is shown rather than swallowed: without it the form looks like it
    // did nothing at all. It is matched by its role: the message appears after the
    // answer of the server, so it has to announce itself — visible on screen and
    // silent by ear is the same failure for a person who does not look at the form
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
});

test('closes the session on logout and asks for the login again', async ({ page, context }) => {
    await page.goto('/bricks/bricks-login');
    await waitForNuxtHydration(page);
    await submitLogin(page, PASSWORD);
    await expect(page).toHaveURL(/\/bricks$/);

    const sessionBeforeLogout = (await context.cookies()).find(
        (cookie) => cookie.name === SESSION_COOKIE
    );

    expect(sessionBeforeLogout).toBeDefined();

    const logout = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' && response.url().includes('/auth/logout')
    );

    await page.getByRole('button', { name: new RegExp(USERNAME, 'i') }).click();
    await page.getByRole('menuitem', { name: /log out|sign out|выход|выйти/i }).click();
    await logout;

    expect(
        (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
    ).toBeUndefined();

    await page.goto('/bricks');

    await expect(page).toHaveURL(/\/bricks\/bricks-login/);

    // The session died on the server rather than only in the browser: handing the old
    // cookie back must not open the door again. Without this the check would pass over
    // a logout that clears the cookie and leaves the session alive — anybody holding a
    // copy of it would still be inside
    await context.addCookies([sessionBeforeLogout!]);
    await page.goto('/bricks');

    await expect(page).toHaveURL(/\/bricks\/bricks-login/);
});
