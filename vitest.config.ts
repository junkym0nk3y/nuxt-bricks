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
             * The values stand a little under what the suite reaches today, so
             * rounding and one defensive branch do not turn the gate into noise. A
             * gap of five points and more stops being a gate at all, which is why
             * they are not rounded down to a comfortable number.
             *
             * What the margin buys and what it costs, both measured: a domain that
             * loses its spec file is caught at once (documentation went to 0% and the
             * run named the glob), while a single uncovered helper added to a domain
             * is not — it fits inside the margin. The gate watches for a domain losing
             * ground, not for every branch.
             */
            thresholds: {
                'src/*.ts': {
                    lines: 57.5,
                    statements: 57.5,
                    branches: 75.3,
                    functions: 90.3,
                },
                'src/runtime/server/**': {
                    lines: 52.1,
                    statements: 52.1,
                    branches: 79.6,
                    functions: 65.2,
                },
                'src/runtime/{middleware,plugins,layouts}/**': {
                    lines: 10.5,
                    statements: 10.5,
                    branches: 62.7,
                    functions: 84.5,
                },
                'src/runtime/modules/common/**': {
                    lines: 91,
                    statements: 91,
                    branches: 88.6,
                    functions: 92.6,
                },
                'src/runtime/modules/layouts-blocks/**': {
                    lines: 58.5,
                    statements: 58.5,
                    branches: 73.8,
                    functions: 42.2,
                },
                'src/runtime/modules/persistence/**': {
                    lines: 84.2,
                    statements: 84.2,
                    branches: 85.2,
                    functions: 83,
                },
                'src/runtime/modules/render/**': {
                    lines: 59.3,
                    statements: 59.3,
                    branches: 80.2,
                    functions: 75.2,
                },
                'src/runtime/modules/text-editor/**': {
                    lines: 10.1,
                    statements: 10.1,
                    branches: 70.6,
                    functions: 77,
                },
                'src/runtime/modules/ui/**': {
                    lines: 64.5,
                    statements: 64.5,
                    branches: 83.7,
                    functions: 58,
                },
                'src/runtime/modules/builder/app/**': {
                    lines: 47.4,
                    statements: 47.4,
                    branches: 83.9,
                    functions: 81.2,
                },
                'src/runtime/modules/builder/auth/**': {
                    lines: 65.8,
                    statements: 65.8,
                    branches: 84.7,
                    functions: 66.3,
                },
                'src/runtime/modules/builder/canvas/**': {
                    lines: 10.8,
                    statements: 10.8,
                    branches: 74.4,
                    functions: 78.3,
                },
                'src/runtime/modules/builder/core/**': {
                    lines: 57.2,
                    statements: 57.2,
                    branches: 68.2,
                    functions: 58.3,
                },
                'src/runtime/modules/builder/documentation/**': {
                    lines: 50.3,
                    statements: 50.3,
                    branches: 81.7,
                    functions: 92,
                },
                'src/runtime/modules/builder/media/**': {
                    lines: 66.5,
                    statements: 66.5,
                    branches: 77.8,
                    functions: 68.4,
                },
                'src/runtime/modules/builder/publish/**': {
                    lines: 60.7,
                    statements: 60.7,
                    branches: 82.7,
                    functions: 73.5,
                },
                'src/runtime/modules/builder/shell/**': {
                    lines: 36.5,
                    statements: 36.5,
                    branches: 71,
                    functions: 47.2,
                },
                'src/runtime/modules/builder/templates/**': {
                    lines: 33.4,
                    statements: 33.4,
                    branches: 76.6,
                    functions: 62.6,
                },
                'src/runtime/modules/builder/users/**': {
                    lines: 85.4,
                    statements: 85.4,
                    branches: 91.4,
                    functions: 61.7,
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
