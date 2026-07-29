import type { Page } from '@playwright/test';

/**
 * Ждёт, пока Nuxt гидрирует SSR-разметку. Клик по SSR-кнопке до этого момента
 * визуально проходит, но Vue-обработчик ещё не подключён.
 */
export async function waitForNuxtHydration(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const root = document.getElementById('__nuxt');
        return Boolean(root && Reflect.get(root, '__vue_app__'));
    });
}
