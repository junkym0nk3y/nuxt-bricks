import { expect, test } from '@playwright/test';
import { clearPages, createPage } from '../support/api';
import { waitForNuxtHydration } from '../support/ui';

test.beforeEach(async ({ request }) => {
    await clearPages(request);
});

test('creates a page and discovers the consumer brick in the component library', async ({
    page,
}) => {
    await page.goto('/bricks');
    await waitForNuxtHydration(page);

    // The button comes from the server render as well, so a click can land before its
    // handler is attached and go nowhere: hydration of the app says nothing about this
    // screen in particular. The opened window is the only reliable answer, so the click
    // is retried until it comes
    await expect(async () => {
        await page.getByRole('button', { name: '+ Create page', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'New page' })).toBeVisible({
            timeout: 2_000,
        });
    }).toPass({ timeout: 20_000 });

    await page.getByRole('textbox', { name: 'Page title' }).fill('E2E Landing');
    await page.getByRole('textbox', { name: 'Description' }).fill('Created through the browser');
    await page.getByRole('button', { name: 'Create and open in editor' }).click();

    await expect(page).toHaveURL(/\/bricks\/e2e-landing$/);
    await page.getByRole('button', { name: 'Components' }).click();
    await expect(page.getByText('E2eCard', { exact: true })).toBeVisible();
});

test('restores the last form edit after an immediate page reload', async ({ page, request }) => {
    await createPage(request, {
        pagename: 'draft-reload',
        title: 'Before reload',
    });

    await page.goto('/bricks/draft-reload');
    await page.getByRole('button', { name: 'Settings' }).click();
    const title = page.getByRole('textbox', { name: 'Title *' });
    await title.fill('Survives reload');
    await page.reload();

    // The offer arrives as a toast after the load: there is nothing to ask with in the
    // middle of it, the loader is still on the screen. The button in the toast restores
    // right away; a click on the toast itself opens the dialog with the date and the
    // discard action
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('textbox', { name: 'Title *' })).toHaveValue('Survives reload');
});

test('shows a blocking session error and opens the page after retry', async ({ page, request }) => {
    const created = await createPage(request, {
        pagename: 'retry-session',
        title: 'Retry session',
    });
    let shouldFail = true;

    await page.route(`**/api/bricks/${created.id}/**`, async (route) => {
        if (route.request().method() === 'GET' && shouldFail) {
            shouldFail = false;
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'E2E bootstrap failure' }),
            });
            return;
        }
        await route.continue();
    });

    await page.goto('/bricks/retry-session');
    const errorDialog = page.getByRole('alertdialog');
    await expect(errorDialog).toContainText('The page did not load');
    await expect(errorDialog).toContainText('500 Internal Server Error');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();

    // The screen covers the working area for the pointer alone. Without `inert` on it
    // the keyboard walked past the screen into the sidebar, the properties panel and
    // the fields of the publish form — where the autosave turns every edit down by
    // the readiness of the session, so the work was lost without a word
    const workspaceNavSettings = page.getByRole('button', { name: 'Settings' });
    await workspaceNavSettings.focus();
    await expect(workspaceNavSettings).not.toBeFocused();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(errorDialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeEnabled();
});

test('ignores a late save response after the user opens another page', async ({
    page,
    request,
}) => {
    const first = await createPage(request, {
        pagename: 'slow-save-a',
        title: 'Page A',
    });
    await createPage(request, {
        pagename: 'slow-save-b',
        title: 'Page B',
    });

    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve;
    });
    let saveStarted!: () => void;
    const saveStartedGate = new Promise<void>((resolve) => {
        saveStarted = resolve;
    });

    await page.route(`**/api/bricks/${first.id}/**`, async (route) => {
        if (route.request().method() !== 'PUT') {
            await route.continue();
            return;
        }
        const response = await route.fetch();
        saveStarted();
        await saveGate;
        await route.fulfill({ response });
    });

    await page.goto('/bricks/slow-save-a');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('textbox', { name: 'Title *' }).fill('Page A changed');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Save changes', { exact: true }).click();
    await saveStartedGate;

    await page.getByRole('button', { name: 'Select page' }).click();
    await page.getByRole('button', { name: 'All pages' }).click();
    await expect(page).toHaveURL(/\/bricks$/);
    const pageBRow = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name: 'Page B' }) });
    await pageBRow.click();
    await page.getByRole('button', { name: 'Open in editor' }).click();
    await expect(page).toHaveURL(/\/bricks\/slow-save-b$/);
    // The heading of the header, not an intermediate state: it holds as long as the page
    // is open, so the check does not depend on what managed to render
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Page B');

    const lateResponse = page.waitForResponse(
        (response) =>
            response.request().method() === 'PUT' &&
            response.url().includes(`/api/bricks/${first.id}/`)
    );
    releaseSave();
    await lateResponse;

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('textbox', { name: 'Title *' })).toHaveValue('Page B');
    await expect(page).toHaveURL(/\/bricks\/slow-save-b$/);
});

test('renders a published consumer brick in the server response', async ({ request }) => {
    await createPage(request, {
        pagename: 'published-brick',
        title: 'Published brick',
        published: true,
        schema: {
            components: [
                {
                    id: 'e2e-card-1',
                    componentName: 'E2eCard',
                    brickPath: '/components/E2eCard.brick.ts',
                    props: {
                        headline: 'Rendered by SSR',
                    },
                    parent: null,
                    children: [],
                },
            ],
        },
    });

    const response = await request.get('/published-brick');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Rendered by SSR');
});
