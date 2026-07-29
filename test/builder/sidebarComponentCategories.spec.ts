// #region Imports
// Types
import type { IComponentLibraryItem } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { groupComponentsByCategory } from '../../src/runtime/modules/builder/shell/sidebar/utils/componentCategories';
// #endregion

/**
 * Собирает элемент библиотеки: для группировки значимы только имя и категория.
 *
 * @param name - Имя компонента.
 * @param category - Категория из brick-файла.
 * @returns Элемент библиотеки.
 */
function makeItem(name: string, category: string): IComponentLibraryItem {
    return {
        name,
        category,
        brickPath: `/components/${name}.brick.ts`,
    };
}

describe('groupComponentsByCategory: группировка библиотеки сайдбара', () => {
    // Категория берётся из brick-файла потребителя: на обычном объекте такой
    // ключ читается как член Object.prototype, и SSR страницы редактора падает
    it('категория __proto__ не роняет группировку', () => {
        const category = '__proto__';
        const grouped = groupComponentsByCategory([makeItem('Hero', category)]);

        expect(grouped.get(category)).toEqual([makeItem('Hero', category)]);
    });

    it('категория Modal исключается из библиотеки', () => {
        const grouped = groupComponentsByCategory([
            makeItem('Hero', 'Marketing'),
            makeItem('Login', 'Modal'),
        ]);

        expect([...grouped.keys()]).toEqual(['Marketing']);
    });

    it('группы идут в порядке первого появления категории, элементы — в исходном', () => {
        const grouped = groupComponentsByCategory([
            makeItem('Hero', 'Marketing'),
            makeItem('Grid', 'Layout'),
            makeItem('Footer', 'Marketing'),
        ]);

        expect([...grouped.keys()]).toEqual(['Marketing', 'Layout']);
        expect(grouped.get('Marketing')?.map((item) => item.name)).toEqual(['Hero', 'Footer']);
    });

    it('категории с разным регистром остаются разными группами', () => {
        const grouped = groupComponentsByCategory([
            makeItem('Hero', 'Marketing'),
            makeItem('Footer', 'marketing'),
        ]);

        expect([...grouped.keys()]).toEqual(['Marketing', 'marketing']);
    });

    it('пустой список → пустая Map', () => {
        expect(groupComponentsByCategory([]).size).toBe(0);
    });
});
