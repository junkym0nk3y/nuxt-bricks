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
    '/builder/app/composables/usePreviewSync.ts',
    '/middleware/bricks-page-layout.global.ts',
];

/**
 * Client-only branches are fenced off by `import.meta.client`, which the Nuxt build
 * sets; in tests it is always `undefined`, and code that lives in the browser alone (the
 * preview sync) is unreachable — a spec for it would be green on nothing.
 *
 * The flag is replaced by a global variable rather than by the literal `true`: the
 * variable is unset by default, that is the behavior stays as it was, and a spec that
 * needs the browser turns it on itself.
 */
const clientFlagPlugin = {
    name: 'bricks-test-client-flag',
    enforce: 'pre' as const,

    /**
     * @param code - Module source.
     * @param id - Module path.
     * @returns The code with the flag replaced, or `null` when there is nothing to replace.
     */
    transform(code: string, id: string) {
        if (!CLIENT_FLAG_MODULES.some((suffix) => id.includes(suffix))) {
            return null;
        }

        return {
            code: code.replaceAll(
                'import.meta.client',
                '(globalThis.__BRICKS_TEST_CLIENT__ === true)'
            ),
            map: null,
        };
    },
};

export default defineConfig({
    plugins: [vue(), clientFlagPlugin],
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
             * is a fine-grained unit, while functions run from fourteen to a few
             * hundred — one uncovered function costs seven points of the smallest
             * glob. Percentages there measure the shape of the decomposition rather
             * than the loss of behavior: breaking one covered function into five
             * named ones drops the number without touching what the suite proves,
             * and that is exactly how these thresholds went red once already.
             *
             * The caps are exact — they record the uncovered debt as measured, with
             * no margin. Growth past a cap turns the gate red, and the answer is one
             * of two: a test that distinguishes a real defect, or a deliberate raise
             * of the cap here, visible in review.
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
             * Two files sit in the report as accepted debt rather than as a signal:
             * `src/module.ts` and the canvas `useCanvasPan.ts` are loaded by no test,
             * and for such a file v8 reports one uncovered function for the whole
             * file. That single count says "never executed", not "one function is
             * missing a test": the real map of nested functions only appears once
             * something imports the file, so an import written to turn `0/1` into
             * `1/1` would buy a number and no knowledge.
             */
            thresholds: {
                'src/*.ts': {
                    lines: 57.5,
                    statements: 57.5,
                    branches: -42,
                    functions: -7,
                },
                'src/runtime/server/**': {
                    lines: 52.1,
                    statements: 52.1,
                    branches: -92,
                    functions: -36,
                },
                'src/runtime/{middleware,plugins,layouts}/**': {
                    lines: 10.5,
                    statements: 10.5,
                    branches: -10,
                    functions: -1,
                },
                'src/runtime/modules/common/**': {
                    lines: 91,
                    statements: 91,
                    branches: -64,
                    functions: -9,
                },
                'src/runtime/modules/layouts-blocks/**': {
                    lines: 58.5,
                    statements: 58.5,
                    branches: -77,
                    functions: -31,
                },
                'src/runtime/modules/persistence/**': {
                    lines: 84.2,
                    statements: 84.2,
                    branches: -138,
                    functions: -39,
                },
                'src/runtime/modules/render/**': {
                    lines: 59.3,
                    statements: 59.3,
                    branches: -52,
                    functions: -12,
                },
                'src/runtime/modules/text-editor/**': {
                    lines: 10.1,
                    statements: 10.1,
                    branches: -51,
                    functions: -13,
                },
                'src/runtime/modules/ui/**': {
                    lines: 64.5,
                    statements: 64.5,
                    branches: -39,
                    functions: -26,
                },
                'src/runtime/modules/builder/app/**': {
                    lines: 47.4,
                    statements: 47.4,
                    branches: -48,
                    functions: -19,
                },
                'src/runtime/modules/builder/auth/**': {
                    lines: 65.8,
                    statements: 65.8,
                    branches: -12,
                    functions: -16,
                },
                'src/runtime/modules/builder/canvas/**': {
                    lines: 10.8,
                    statements: 10.8,
                    branches: -37,
                    functions: -24,
                },
                'src/runtime/modules/builder/core/**': {
                    lines: 57.2,
                    statements: 57.2,
                    branches: -127,
                    functions: -65,
                },
                'src/runtime/modules/builder/documentation/**': {
                    lines: 50.3,
                    statements: 50.3,
                    branches: -9,
                    functions: -1,
                },
                'src/runtime/modules/builder/media/**': {
                    lines: 66.5,
                    statements: 66.5,
                    branches: -104,
                    functions: -49,
                },
                'src/runtime/modules/builder/publish/**': {
                    lines: 60.7,
                    statements: 60.7,
                    branches: -129,
                    functions: -62,
                },
                'src/runtime/modules/builder/shell/**': {
                    lines: 36.5,
                    statements: 36.5,
                    branches: -86,
                    functions: -72,
                },
                'src/runtime/modules/builder/templates/**': {
                    lines: 33.4,
                    statements: 33.4,
                    branches: -11,
                    functions: -11,
                },
                'src/runtime/modules/builder/users/**': {
                    lines: 85.4,
                    statements: 85.4,
                    branches: -15,
                    functions: -25,
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
