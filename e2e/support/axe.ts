import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * The accessibility gate of the browser suite.
 *
 * The rule set is WCAG 2.0, 2.1 and 2.2 up to AA — the level the package claims.
 * Best-practice rules are deliberately out: they carry opinions rather than
 * failures, and a gate that fails on an opinion gets muted within a week.
 *
 * Two subtrees are excluded, and neither of them is ours: the error overlay of
 * Nuxt and the panel of its devtools live in every dev page (the suite runs
 * against a dev server), and they bring their own violations — an unnamed button,
 * an untitled frame, a low-contrast label. Excluding a subtree of the application
 * itself is not allowed here: what the product renders, the product answers for.
 *
 * The overlay is excluded from the RULES but not from the check: an overlay that is
 * actually showing means the surface under it has crashed, and analyzing what is
 * left of it would report a clean page for a broken one. So its visibility is
 * demanded first, and only then are its internals ignored.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Subtrees of the development tooling, not of the package */
const TOOLING_SELECTORS = ['nuxt-error-overlay', 'nuxt-devtools-frame'];

/**
 * Runs axe over the current state of the page and demands a clean result.
 *
 * The full report is attached to the test when it fails: a list of rule ids in the
 * message says nothing about WHICH node is broken, and the html of the node is the
 * first thing a fix needs.
 *
 * @param page - The page in the state to check.
 * @param testInfo - The running test, for the attachment.
 * @param state - Human-readable name of the state, shown in the failure.
 */
export async function expectNoAccessibilityViolations(
    page: Page,
    testInfo: TestInfo,
    state: string
): Promise<void> {
    // Transitions are waited out first. A panel caught mid-fade is measured by axe in
    // the blended colors of that very frame — a normal caption reads as `#a3a6ac` on
    // `#fbfcfc` and fails the contrast rule that the settled page passes. That is how
    // the check turned red only inside a warm suite, where the click lands sooner.
    // Endless animations (spinners, the pulse of the loader) are skipped: waiting for
    // one would never return
    await page.evaluate(() =>
        Promise.all(
            document
                .getAnimations()
                .filter(
                    (animation) =>
                        animation.playState === 'running' &&
                        animation.effect?.getComputedTiming().iterations !== Infinity
                )
                .map((animation) => animation.finished.catch(() => undefined))
        )
    );

    // An inert subtree is not analyzed at all. The editor puts its toolbar and working
    // area under `inert` while the loader is showing, and the check run in that window
    // passed on a page whose header and properties panel nobody had looked at: the
    // violations there turned up only on a runner slow enough to see the loader go
    await expect(
        page.locator('[inert]'),
        `${state}: a part of the page is inert, and axe would skip it`
    ).toHaveCount(0);

    // The frame of the overlay exists only while Nuxt is showing an error; the custom
    // element itself sits in the page at all times
    await expect(
        page.locator('nuxt-error-overlay #frame'),
        `${state}: the page is showing the Nuxt error overlay, so there is nothing to check`
    ).toHaveCount(0);

    let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);

    for (const selector of TOOLING_SELECTORS) {
        builder = builder.exclude(selector);
    }

    const result = await builder.analyze();

    if (result.violations.length > 0) {
        await testInfo.attach(`axe-${state}`, {
            body: JSON.stringify(result.violations, null, 2),
            contentType: 'application/json',
        });
    }

    expect(
        result.violations.map((violation) => ({
            state,
            rule: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.map((node) => node.target.join(' ')),
        }))
    ).toEqual([]);
}
