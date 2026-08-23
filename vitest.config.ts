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
const CLIENT_FLAG_MODULES = ['/builder/app/composables/usePreviewSync.ts'];

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
    },
    resolve: {
        alias: {
            '#imports': fileURLToPath(new URL('./test/stubs/nuxt-imports.ts', import.meta.url)),
        },
    },
});
