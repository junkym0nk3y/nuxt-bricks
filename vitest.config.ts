import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * The layout-block registry imports `.vue` components (the renderPublished of leaf
 * blocks), so the tests need the SFC transform. The `#imports` alias replaces the Nuxt
 * auto-imports with a stub for the modules that import them directly (stores,
 * composables).
 */
/**
 * Modules that need a client-side `import.meta.client` in tests.
 *
 * The list is pointed rather than "the whole runtime": the flag is paired with
 * `import.meta.server`, and a broad replacement would hand the modules reading both a
 * combination impossible in a real application. Every new entry is a deliberate decision
 * that the spec checks the browser branch of that very module.
 */
const CLIENT_FLAG_MODULES = [
    '/builder/app/composables/useBuilderPage.ts',
    '/builder/app/composables/usePreviewSync.ts',
    '/middleware/bricks-page-layout.global.ts',
    '/plugins/builder-locale.ts',
];

/**
 * Modules that need a server-side `import.meta.server` in tests, under the same rule as
 * the client list. A module goes into one list only: one with both flags replaced could
 * be switched into a client and a server at once.
 */
const SERVER_FLAG_MODULES = [
    '/render/composables/useRendererPageCode.ts',
    '/render/components/TheRenderer.vue',
];

/**
 * Build flags replaced by a global variable, each in its own list of modules.
 */
const TEST_FLAGS = [
    { flag: 'import.meta.client', global: '__BRICKS_TEST_CLIENT__', modules: CLIENT_FLAG_MODULES },
    { flag: 'import.meta.server', global: '__BRICKS_TEST_SERVER__', modules: SERVER_FLAG_MODULES },
];

/**
 * Client-only and server-only branches are fenced off by `import.meta.client` and
 * `import.meta.server`, which the Nuxt build sets; in tests they are always `undefined`,
 * and code that lives on one side alone (the preview sync, the SSR hand-off of the page
 * code) is unreachable — a spec for it would be green on nothing.
 *
 * The flag is replaced by a global variable rather than by the literal `true`: the
 * variable is unset by default, that is the behavior stays as it was, and a spec that
 * needs the browser or the server turns it on itself.
 */
const testFlagPlugin = {
    name: 'bricks-test-build-flags',
    enforce: 'pre' as const,

    /**
     * @param code - Module source.
     * @param id - Module path.
     * @returns The code with the flag replaced, or `null` when there is nothing to replace.
     */
    transform(code: string, id: string) {
        const entry = TEST_FLAGS.find(({ modules }) =>
            modules.some((suffix) => id.includes(suffix))
        );

        if (!entry) {
            return null;
        }

        return {
            code: code.replaceAll(entry.flag, `(globalThis.${entry.global} === true)`),
            map: null,
        };
    },
};

export default defineConfig({
    plugins: [vue(), testFlagPlugin],
    test: {
        include: ['test/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            /**
             * The gate measures the shipped code, SFC included: a noticeable part of
             * the builder behavior lives in `.vue`, and leaving components out would
             * buy a comfortable number at the price of a blind spot. The CLI stays
             * out because it is `.mjs` — its contract is checked by the pack smoke,
             * not by unit tests.
             */
            include: ['src/**/*.{ts,vue}'],
            reporter: ['text'],
            /** The table has to be readable when the run itself went red */
            reportOnFailure: true,
            /**
             * Thresholds are set per directory rather than globally: a single number
             * over the whole package lets a domain lose its tests unnoticed as long
             * as the neighbors keep the average up. Builder is split by subdomain for
             * the same reason — its well-covered core would mask a hole in `media` or
             * `templates`.
             *
             * Lines and statements are percentages; functions and branches are
             * negative, and a negative threshold caps the absolute number of
             * uncovered entities instead. The split is not a matter of taste: line
             * counts run into the hundreds and thousands per domain, where a percent
             * is a fine-grained unit, while functions run from a few dozen to a few
             * hundred — one uncovered function costs two points of the smallest
             * glob. Percentages there measure the shape of the decomposition rather
             * than the loss of behavior: breaking one covered function into five
             * named ones drops the number without touching what the suite proves,
             * and that is exactly how these thresholds went red once already.
             *
             * The caps are exact — they record the uncovered debt as measured, with
             * no margin. Growth past a cap turns the gate red, and the answer is one
             * of two: a test that distinguishes a real defect, or a deliberate raise
             * of the cap here, visible in review. Exact means down to one entity for
             * functions and branches only: a percentage threshold is as fine as its
             * tenth of a point, and in a domain of several thousand statements that
             * tenth spans a few of them, so growth inside it still passes green.
             *
             * Pulling a cap back down once coverage improves is a manual step, and
             * nothing in the run performs it: `autoUpdate` stays off, because a gate
             * that moves its own bar is not a gate. The exactness therefore holds on
             * the day a cap is written and decays from there — while the freed slack
             * sits unrecorded, a regression back into it passes green. Take the slack
             * out in the same change that frees it.
             *
             * What the gate does NOT promise, so that nobody reads more into a green
             * run: it does not prove that every helper has a test, and it does not
             * catch the deletion of any spec file — a spec may uniquely cover a
             * single function, or its coverage may be duplicated by a neighbor. What
             * it catches is the uncovered debt of a domain growing past the number
             * written here. Behavior is the business of review and of the live
             * verification.
             *
             * A file that no test loads is measured in full: the v8 provider remaps
             * coverage through the AST, so such a file reports every one of its
             * functions and branches as uncovered instead of a single placeholder
             * entry. A spec that mounts a component for the first time therefore
             * lowers the uncovered counts of its domain, and the cap comes down in the
             * same change. `src/module.ts` and the canvas `useCanvasPan.ts` are loaded
             * by no test and sit in their caps whole, as accepted debt.
             *
             * The caps below were re-measured all at once, and that is a repair rather
             * than the routine: several changes in a row added uncovered branches
             * without raising their caps, so the gate stood red and stopped reporting
             * anything, while other domains freed slack nobody took out. Both halves are
             * corrected here. The reason it went unnoticed is worth knowing: the
             * pre-commit hook runs `lint-staged` alone and `npm test` does not look at
             * the thresholds, so `npm run test:coverage` has to be run by hand before a
             * push that touches shipped code or the specs — CI reports this one after
             * the fact, not before.
             *
             * They were measured once more when Vitest moved from 3 to 4. The provider
             * dropped the v8-to-istanbul conversion for AST-based remapping, and the
             * same suite yields different numbers: whole maps for unloaded files and
             * line counts that follow the istanbul convention. Some percentages went
             * down and some went up without a single test being added or removed —
             * the values were taken as measured, not adjusted to the old ones.
             */
            thresholds: {
                // No test loads `src/module.ts`: every line of wiring it gains counts as
                // uncovered, while the helpers it calls live in files of their own
                'src/*.ts': {
                    lines: 67.6,
                    statements: 67.6,
                    branches: -119,
                    functions: -18,
                },
                'src/runtime/server/**': {
                    lines: 65.8,
                    statements: 65.9,
                    branches: -202,
                    functions: -53,
                },
                'src/runtime/{middleware,plugins,layouts}/**': {
                    lines: 31.1,
                    statements: 31,
                    branches: -97,
                    functions: -74,
                },
                // The SVG sanitizer keeps a name it finds no canonical spelling for. js-xss
                // writes only the names of the allow-list the spelling map is built from,
                // so both fallbacks stay uncovered on purpose
                'src/runtime/modules/common/**': {
                    lines: 92.2,
                    statements: 92.3,
                    branches: -89,
                    functions: -11,
                },
                'src/runtime/modules/layouts-blocks/**': {
                    lines: 71.9,
                    statements: 70.5,
                    branches: -310,
                    functions: -90,
                },
                'src/runtime/modules/persistence/**': {
                    lines: 87.1,
                    statements: 86.9,
                    branches: -191,
                    functions: -55,
                },
                // The noindex meta of the render page: no unit test mounts `[pagename].vue`,
                // the live verification covers it
                'src/runtime/modules/render/**': {
                    lines: 72.9,
                    statements: 71.3,
                    branches: -164,
                    functions: -52,
                },
                'src/runtime/modules/text-editor/**': {
                    lines: 23.6,
                    statements: 23.3,
                    branches: -516,
                    functions: -251,
                },
                'src/runtime/modules/ui/**': {
                    lines: 51.9,
                    statements: 52.4,
                    branches: -290,
                    functions: -157,
                },
                'src/runtime/modules/builder/app/**': {
                    lines: 58.3,
                    statements: 57.9,
                    branches: -308,
                    functions: -122,
                },
                'src/runtime/modules/builder/auth/**': {
                    lines: 34.9,
                    statements: 34.7,
                    branches: -137,
                    functions: -86,
                },
                // No unit test mounts the sheets of Figma mode: their geometry needs a layout
                // engine, which happy-dom lacks, and the live verification covers it
                'src/runtime/modules/builder/canvas/**': {
                    lines: 18.6,
                    statements: 18.1,
                    branches: -592,
                    functions: -333,
                },
                'src/runtime/modules/builder/core/**': {
                    lines: 63.4,
                    statements: 63.5,
                    branches: -296,
                    functions: -103,
                },
                // The modal of the documentation is mounted by a single spec — the
                // one proving the sanitizer stands at the `v-html` boundary. Part of
                // the modal is closed by tests in that same spec (the close, the
                // intercept of a cross-link, the scroll reset); the rest is what a
                // spec about the sanitizer has no business covering.
                'src/runtime/modules/builder/documentation/**': {
                    lines: 91.1,
                    statements: 90.4,
                    branches: -25,
                    functions: -4,
                },
                'src/runtime/modules/builder/media/**': {
                    lines: 70.2,
                    statements: 70.4,
                    branches: -225,
                    functions: -128,
                },
                'src/runtime/modules/builder/publish/**': {
                    lines: 58.9,
                    statements: 58.5,
                    branches: -487,
                    functions: -324,
                },
                'src/runtime/modules/builder/shell/**': {
                    lines: 44.3,
                    statements: 43.7,
                    branches: -655,
                    functions: -370,
                },
                'src/runtime/modules/builder/templates/**': {
                    lines: 42.3,
                    statements: 40.6,
                    branches: -83,
                    functions: -86,
                },
                'src/runtime/modules/builder/users/**': {
                    lines: 77,
                    statements: 77.2,
                    branches: -53,
                    functions: -65,
                },
            },
        },
    },
    resolve: {
        alias: {
            '#imports': fileURLToPath(new URL('./test/stubs/nuxt-imports.ts', import.meta.url)),
        },
    },
});
