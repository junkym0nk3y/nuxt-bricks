import { expect, request as playwrightRequest, test } from '@playwright/test';
import { clearPages, createPage } from '../support/api';
import { waitForNuxtHydration } from '../support/ui';

/**
 * The rest of the lifecycle of a page, from a browser: replacing the content with
 * an imported file, publishing from the interface, and the conflict of two edits
 * with the recovery that follows it.
 *
 * Each of the three used to live only in unit specs over mocked stores, that is
 * the paths between the button and the backend — the file input, the confirmation,
 * the precondition of the write, the refresh after the refusal — were covered by
 * nothing at all.
 */

/** Marker of the imported schema: the text every check below looks for */
const IMPORTED_HEADLINE = 'Imported by the browser test';

test.beforeEach(async ({ request }) => {
    await clearPages(request);
});

/**
 * Opens the dashboard row of a page and its details panel.
 *
 * @param page - The browser page standing anywhere in the builder.
 * @param title - Title of the page to open.
 */
async function openDetails(page: import('@playwright/test').Page, title: string) {
    await page.goto('/bricks');
    await waitForNuxtHydration(page);

    const row = page.locator('article').filter({ has: page.getByRole('heading', { name: title }) });

    // The row comes from the server render as well, so a click can land before the
    // handler is attached and go nowhere. Hydration of the app says nothing about
    // this list in particular — the panel opening is the only reliable answer, so
    // the click is retried until it does
    await expect(async () => {
        await row.click();
        await expect(page.getByRole('complementary')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
}

test('replaces the content of a page with an imported file', async ({ page, request }) => {
    const created = await createPage(request, {
        pagename: 'import-target',
        title: 'Import target',
        schema: {
            components: [
                {
                    id: 'before-import',
                    componentName: 'E2eCard',
                    brickPath: '/components/E2eCard.brick.ts',
                    props: { headline: 'Before the import' },
                    parent: null,
                    children: [],
                },
            ],
        },
    });

    await openDetails(page, 'Import target');

    // The section is collapsed until it is asked for: the panel keeps the schema
    // behind its own heading
    await page.getByRole('button', { name: 'Schema' }).click();

    // The file goes straight into the input the button opens: waiting for the native
    // chooser makes the test depend on a dialog of the browser rather than on the
    // path of the application
    await page.getByRole('button', { name: 'Import JSON' }).click();
    await page.locator('input[type="file"]').setInputFiles({
        name: 'imported-schema.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
            JSON.stringify({
                version: 1,
                schema: {
                    components: [
                        {
                            id: 'after-import',
                            componentName: 'E2eCard',
                            brickPath: '/components/E2eCard.brick.ts',
                            props: { headline: IMPORTED_HEADLINE },
                            parent: null,
                            children: [],
                        },
                    ],
                },
            })
        ),
    });

    // The answer of the server rather than the toast: a toast would go green on a
    // request that never reached the storage. The import writes with a PATCH — it
    // replaces the schema and leaves the rest of the page alone.
    //
    // The wait is armed BEFORE the click: `waitForResponse` starts listening when it
    // is called, so a fast answer to a click made earlier is simply missed
    const saved = page.waitForResponse(
        (response) =>
            response.request().method() === 'PATCH' &&
            response.url().includes(`/api/bricks/${created.id}/`) &&
            response.ok()
    );

    // The confirmation is part of the path: the import replaces the content of the
    // page, and a silent replacement is exactly what it protects against
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    expect((await saved).status()).toBe(200);

    const stored = await (await request.get(`/api/bricks/${created.id}/`)).json();

    expect(JSON.stringify(stored.schema)).toContain(IMPORTED_HEADLINE);
    expect(JSON.stringify(stored.schema)).not.toContain('Before the import');
    expect(stored.revision).toBeGreaterThan(created.revision);
});

test('publishes a page from the interface and serves it to a visitor', async ({
    page,
    request,
}) => {
    await createPage(request, {
        pagename: 'publish-from-ui',
        title: 'Publish from UI',
        schema: {
            components: [
                {
                    id: 'published-card',
                    componentName: 'E2eCard',
                    brickPath: '/components/E2eCard.brick.ts',
                    props: { headline: 'Visible to a visitor' },
                    parent: null,
                    children: [],
                },
            ],
        },
    });

    // A context without credentials: the `request` fixture of the project carries the
    // basic pair on every call, so a "visitor" built on it would be authorized — and
    // a published route that accidentally became protected would still answer 200
    const visitorContext = await playwrightRequest.newContext({
        baseURL: test.info().project.use.baseURL,
    });
    const anonymous = await visitorContext.get('/publish-from-ui');

    expect(anonymous.status()).toBe(404);

    await openDetails(page, 'Publish from UI');

    const published = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.ok()
    );

    await page.getByRole('switch').first().click();
    await published;

    // The visitor is the check, not the switch: an optimistic toggle turns green on
    // its own and rolls back later, and the page is either served or it is not
    const visitor = await visitorContext.get('/publish-from-ui');

    expect(visitor.status()).toBe(200);
    expect(await visitor.text()).toContain('Visible to a visitor');

    await visitorContext.dispose();

    // And the state survives a reload of the dashboard: a switch that only looks
    // flipped would come back a draft
    await page.reload();
    await waitForNuxtHydration(page);
    // A published row carries its status on the dot rather than in a pill: the
    // accessible name of that dot is the whole visible statement of the state
    await expect(
        page
            .locator('article')
            .filter({ has: page.getByRole('heading', { name: 'Publish from UI' }) })
            .getByRole('img', { name: 'Published' })
    ).toBeVisible();
});

test('meets a conflict of two edits and saves after the refresh', async ({ page, request }) => {
    const created = await createPage(request, {
        pagename: 'conflict-target',
        title: 'Conflict target',
    });

    await page.goto('/bricks/conflict-target');
    await waitForNuxtHydration(page);
    await page.getByRole('button', { name: 'Settings' }).click();

    // Somebody else edits the same page while the editor holds the revision it
    // loaded: the next save of the browser goes out with a stale precondition
    const foreignEdit = await request.put(`/api/bricks/${created.id}/`, {
        headers: { 'x-bricks-csrf': '1' },
        data: {
            expectedRevision: created.revision,
            description: 'Changed by somebody else entirely',
        },
    });

    expect(
        foreignEdit.ok(),
        `the foreign edit must go through: ${foreignEdit.status()} ${await foreignEdit.text()}`
    ).toBeTruthy();

    await page.getByRole('textbox', { name: 'Title *' }).fill('Mine wins after the refresh');

    const conflict = page.waitForResponse(
        (response) => response.request().method() === 'PUT' && response.status() === 409
    );

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Save changes', { exact: true }).click();
    await conflict;

    // The refusal is explained rather than swallowed, and the edit is not lost with it
    await expect(page.getByText(/modified elsewhere/i).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title *' })).toHaveValue(
        'Mine wins after the refresh'
    );

    // The refused write must have written NOTHING. A backend that applied the stale
    // payload and only then answered 409 would pass every check above: the message
    // would be there, the local field would be there, and the data would already be
    // overwritten
    const afterConflict = await (await request.get(`/api/bricks/${created.id}/`)).json();

    expect(afterConflict.title).toBe('Conflict target');
    expect(afterConflict.description).toBe('Changed by somebody else entirely');
    expect(afterConflict.revision).toBe(created.revision + 1);

    // The retry is the point of the whole scenario: after the refresh the save goes
    // out with a fresh revision and goes through
    const retry = page.waitForResponse(
        (response) => response.request().method() === 'PUT' && response.ok()
    );

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Save changes', { exact: true }).click();
    await retry;

    const stored = await (await request.get(`/api/bricks/${created.id}/`)).json();

    expect(stored.title).toBe('Mine wins after the refresh');
    expect(stored.revision).toBeGreaterThan(created.revision + 1);
});
