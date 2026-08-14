import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/**
 * Registry layout-блоков импортирует `.vue`-компоненты (renderPublished leaf-блоков),
 * поэтому тестам нужен SFC-transform. Алиас `#imports` подменяет Nuxt auto-imports
 * стабом для модулей, которые импортируют их напрямую (stores/composables).
 */
/**
 * Модули, которым в тестах нужен клиентский `import.meta.client`.
 *
 * Список точечный, а не «весь рантайм»: флаг парный с `import.meta.server`, и
 * широкая подмена дала бы модулям, читающим оба, сочетание, невозможное в
 * реальном приложении. Каждая новая запись — осознанное решение, что спека
 * проверяет именно браузерную ветку этого модуля.
 */
const CLIENT_FLAG_MODULES = ['/builder/app/composables/usePreviewSync.ts'];

/**
 * Клиентские ветки огорожены `import.meta.client`, который ставит сборка Nuxt;
 * в тестах он всегда `undefined`, и код, живущий только в браузере (синк
 * превью), недостижим — спека на него была бы зелёной ни на чём.
 *
 * Флаг подменяется на глобальную переменную, а не на литерал `true`: по
 * умолчанию она не задана, то есть поведение прежнее, а спека, которой нужен
 * браузер, включает её сама.
 */
const clientFlagPlugin = {
    name: 'bricks-test-client-flag',
    enforce: 'pre' as const,

    /**
     * @param code - Исходник модуля.
     * @param id - Путь модуля.
     * @returns Код с подменённым флагом либо `null`, если подменять нечего.
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
