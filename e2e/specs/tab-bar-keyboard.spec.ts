/**
 * Клавиатура таб-бара проверяется здесь, а не в unit-тестах: и happy-dom, и
 * jsdom доводят событие до reka (та вызывает `preventDefault`), но сам перенос
 * фокуса — обход коллекции узлов с вызовом `focus()` — в эмуляторах не
 * срабатывает, и тесты «падали» бы на исправном коде.
 *
 * Фокус ставится кликом, а не `locator.focus()`: у кнопок группы `tabindex`
 * равен «-1» (внутрь ведут стрелки, а не Tab), и программная фокусировка такого
 * элемента в headless-браузере не поднимает фокус — он остаётся на `body`.
 */

import { expect, test } from '@playwright/test';
import { clearPages, createPage } from '../support/api';
import { waitForNuxtHydration } from '../support/ui';

const VIEWPORT_GROUP = 'Canvas view mode';

test.beforeEach(async ({ request }) => {
    await clearPages(request);
});

test('moves focus across the viewport switcher without changing the selection', async ({
    page,
    request,
}) => {
    await createPage(request, { pagename: 'tab-bar-keys', title: 'Tab bar keys' });

    await page.goto('/bricks/tab-bar-keys');
    await waitForNuxtHydration(page);

    const group = page.getByRole('group', { name: VIEWPORT_GROUP });
    const mobile = group.getByRole('button', { name: 'Mobile' });
    const tablet = group.getByRole('button', { name: 'Tablet' });

    await mobile.click();
    await expect(mobile).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowRight');

    await expect(tablet).toBeFocused();
    await expect(tablet).toHaveAttribute('aria-pressed', 'false');
    await expect(mobile).toHaveAttribute('aria-pressed', 'true');
});

test('selects the focused viewport on Enter', async ({ page, request }) => {
    await createPage(request, { pagename: 'tab-bar-enter', title: 'Tab bar enter' });

    await page.goto('/bricks/tab-bar-enter');
    await waitForNuxtHydration(page);

    const group = page.getByRole('group', { name: VIEWPORT_GROUP });
    const mobile = group.getByRole('button', { name: 'Mobile' });
    const tablet = group.getByRole('button', { name: 'Tablet' });

    await mobile.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(tablet).toHaveAttribute('aria-pressed', 'true');
    await expect(mobile).toHaveAttribute('aria-pressed', 'false');
});

test('wraps focus from the last button back to the first', async ({ page, request }) => {
    await createPage(request, { pagename: 'tab-bar-wrap', title: 'Tab bar wrap' });

    await page.goto('/bricks/tab-bar-wrap');
    await waitForNuxtHydration(page);

    const group = page.getByRole('group', { name: VIEWPORT_GROUP });
    const mobile = group.getByRole('button', { name: 'Mobile' });

    await mobile.click();
    await page.keyboard.press('End');

    await expect(group.getByRole('button', { name: 'Figma Like' })).toBeFocused();

    await page.keyboard.press('ArrowRight');

    await expect(mobile).toBeFocused();
});
