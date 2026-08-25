import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/axe';
import { clearPages, createPage } from '../support/api';
import { waitForNuxtHydration } from '../support/ui';

/**
 * The accessibility gate over the surfaces a person actually works on.
 *
 * States rather than routes: an empty dashboard and an editor with nothing
 * selected hide most of the interface, and a gate over them would be green on
 * markup nobody sees. So a page is opened with its details panel, and the editor
 * is opened with a component selected and its gallery editor unfolded — the panel
 * that used to be unreachable from the keyboard altogether.
 *
 * The keyboard itself is not checked here: axe reads the markup and knows nothing
 * about where the focus goes. Those checks live in the specs of their own surfaces.
 */

/** A tiny valid PNG: the media library needs a real file to hold a tile */
const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async ({ request }) => {
    await clearPages(request);
});

test('keeps the dashboard and the details of a page accessible', async ({
    page,
    request,
}, testInfo) => {
    await createPage(request, { pagename: 'a11y-dashboard', title: 'Accessible dashboard' });

    await page.goto('/bricks');
    await waitForNuxtHydration(page);

    const row = page
        .locator('article')
        .filter({ has: page.getByRole('heading', { name: 'Accessible dashboard' }) });

    await expect(async () => {
        await row.click();
        await expect(page.getByRole('complementary')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await expectNoAccessibilityViolations(page, testInfo, 'dashboard-with-details');
});

test('keeps the editor with the gallery property accessible', async ({
    page,
    request,
}, testInfo) => {
    await createPage(request, {
        pagename: 'a11y-editor',
        title: 'Accessible editor',
        schema: {
            components: [
                {
                    id: 'a11y-card',
                    type: 'component',
                    componentName: 'E2eCard',
                    brickPath: '/components/E2eCard.brick.ts',
                    props: {
                        headline: 'Card with a gallery',
                        gallery: [
                            { id: 'first', url: '/first.png', title: 'First shot' },
                            { id: 'second', url: '/second.png', title: 'Second shot' },
                        ],
                    },
                    parent: null,
                    children: [],
                },
            ],
        },
    });

    await page.goto('/bricks/a11y-editor');
    await waitForNuxtHydration(page);

    // The component is selected through its own handler: the wrapper of the canvas
    // swallows a pointer click, and the properties panel is the point of the check
    await expect(async () => {
        await page.evaluate(() => {
            document
                .querySelector('[data-component-id]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await expect(page.getByRole('button', { name: /Replace image 1/ })).toBeVisible({
            timeout: 2_000,
        });
    }).toPass({ timeout: 20_000 });

    await expectNoAccessibilityViolations(page, testInfo, 'editor-with-gallery-editor');
});

test('keeps the media library accessible with files in the grid', async ({
    page,
    request,
}, testInfo) => {
    await createPage(request, { pagename: 'a11y-media', title: 'Accessible media' });

    // A category first: the library of a fresh installation has none, and an upload
    // naming an unknown one is refused
    const category = await request.post('/api/bricks/media/categories', {
        headers: { 'x-bricks-csrf': '1' },
        data: { label: 'Shots' },
    });

    expect(category.ok()).toBeTruthy();

    for (const filename of ['first.png', 'second.png', 'third.png']) {
        const uploaded = await request.post('/api/bricks/media/upload', {
            headers: { 'x-bricks-csrf': '1' },
            multipart: {
                file: {
                    name: filename,
                    mimeType: 'image/png',
                    buffer: Buffer.from(PNG_BASE64, 'base64'),
                },
                category: 'shots',
            },
        });

        expect(uploaded.ok(), `upload of ${filename}: ${await uploaded.text()}`).toBeTruthy();
    }

    await page.goto('/bricks/a11y-media');
    await waitForNuxtHydration(page);
    await page.getByRole('button', { name: 'Media library', exact: true }).click();

    // The grid with its tiles, not the empty state: the roving tab stop and the
    // actions inside a cell are what this state is opened for
    await expect(page.getByRole('gridcell')).toHaveCount(3);

    await expectNoAccessibilityViolations(page, testInfo, 'media-library-with-files');
});

test('names the upload options dialog and gives the focus back when it closes', async ({
    page,
    request,
}) => {
    await createPage(request, { pagename: 'a11y-options', title: 'Accessible options' });

    await page.goto('/bricks/a11y-options');
    await waitForNuxtHydration(page);
    await page.getByRole('button', { name: 'Media library', exact: true }).click();

    const cog = page.getByRole('button', { name: 'Optimization settings' });

    await expect(cog).toBeVisible();
    await cog.click();

    // The popover is opened without a reka trigger — the wrapper of the tooltip would
    // take its attributes, and `aria-expanded` on a node with no role is broken ARIA.
    // The two things the trigger used to do are therefore checked here: the dialog
    // has a name, and the focus comes back to the cog when it closes
    // Addressed by its name, and that IS the check: the media library around it is a
    // dialog too, so a nameless popover would be indistinguishable from it
    const dialog = page.getByRole('dialog', { name: 'Optimization settings' });

    await expect(dialog).toBeVisible();
    await expect(cog).toHaveAttribute('aria-expanded', 'true');

    // The popover takes the focus inside itself when it opens, and that is what makes
    // the return matter: measured, a close without the handler leaves the focus on
    // `<body>`, that is a keyboard is thrown to the top of the document. Which control
    // inside receives it is the business of the primitive — the check is that the
    // focus went in at all
    await expect
        .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
        .toBe(true);

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(cog).toBeFocused();
});
