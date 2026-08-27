// #region Imports
// Vitest
import { beforeEach, describe, expect, it } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Stores
import { adjustReorderTargetIndex } from '../../src/runtime/modules/builder/core/stores/actions/order';
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { useHistoryStore } from '../../src/runtime/modules/builder/core/stores/history';
// #endregion

// #region Helpers
/**
 * Компонент канваса: для порядка соседей важны только id, родитель и children.
 *
 * @param id - Идентификатор компонента.
 * @param overrides - Поля поверх дефолтных.
 */
function buildComponent(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: {},
        ...overrides,
    };
}

/**
 * Идентификаторы корневых компонентов в порядке следования.
 */
function rootIds(components: IBricksComponent[]): string[] {
    return components.filter((component) => !component.parent).map((component) => component.id);
}
// #endregion

describe('adjustReorderTargetIndex', () => {
    it('сдвигает destination назад после извлечения более раннего sibling-а', () => {
        expect(adjustReorderTargetIndex(0, 3)).toBe(2);
        expect(adjustReorderTargetIndex(1, 2)).toBe(1);
    });

    it('сохраняет destination при переносе вверх или из другого контейнера', () => {
        expect(adjustReorderTargetIndex(3, 1)).toBe(1);
        expect(adjustReorderTargetIndex(-1, 2)).toBe(2);
    });
});

describe('перемещение компонента на шаг вверх и вниз', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('корневой уровень: вниз отдаёт компонент за следующего соседа', () => {
        // `moveComponentToRoot` принимает зазор ДО извлечения компонента и правит
        // индекс сам, поэтому `index + 1` схлопывался обратно в текущую позицию и
        // движение вниз не делало ничего
        const store = useComponentsStore();
        store.components = [buildComponent('a'), buildComponent('b'), buildComponent('c')];

        store.moveComponentDown('b');

        expect(rootIds(store.components)).toEqual(['a', 'c', 'b']);
    });

    it('корневой уровень: вниз в середине длинного списка не проскакивает соседа', () => {
        const store = useComponentsStore();
        store.components = [
            buildComponent('a'),
            buildComponent('b'),
            buildComponent('c'),
            buildComponent('d'),
        ];

        store.moveComponentDown('b');

        expect(rootIds(store.components)).toEqual(['a', 'c', 'b', 'd']);
    });

    it('корневой уровень: вверх отдаёт компонент перед предыдущим соседом', () => {
        const store = useComponentsStore();
        store.components = [buildComponent('a'), buildComponent('b'), buildComponent('c')];

        store.moveComponentUp('b');

        expect(rootIds(store.components)).toEqual(['b', 'a', 'c']);
    });

    it('внутри контейнера двигает живой children родителя в обе стороны', () => {
        const store = useComponentsStore();
        const parent = buildComponent('parent', { children: ['x', 'y', 'z'] });
        store.components = [
            parent,
            buildComponent('x', { parent: 'parent' }),
            buildComponent('y', { parent: 'parent' }),
            buildComponent('z', { parent: 'parent' }),
        ];

        store.moveComponentDown('y');
        expect(parent.children).toEqual(['x', 'z', 'y']);

        store.moveComponentUp('y');
        expect(parent.children).toEqual(['x', 'y', 'z']);
    });

    it('края списка не двигаются и не пишут историю', () => {
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        const parent = buildComponent('parent', { children: ['x', 'y'] });
        store.components = [
            parent,
            buildComponent('x', { parent: 'parent' }),
            buildComponent('y', { parent: 'parent' }),
            buildComponent('root', {}),
        ];
        const historyLength = historyStore.history.length;

        store.moveComponentUp('x');
        store.moveComponentDown('y');
        store.moveComponentUp('parent');
        store.moveComponentDown('root');

        expect(parent.children).toEqual(['x', 'y']);
        expect(rootIds(store.components)).toEqual(['parent', 'root']);
        expect(historyStore.history.length).toBe(historyLength);
    });

    it('удавшееся перемещение внутри контейнера пишет один снимок истории', () => {
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        const parent = buildComponent('parent', { children: ['x', 'y'] });
        store.components = [
            parent,
            buildComponent('x', { parent: 'parent' }),
            buildComponent('y', { parent: 'parent' }),
        ];
        const historyLength = historyStore.history.length;

        store.moveComponentDown('x');

        expect(historyStore.history.length).toBe(historyLength + 1);
    });
});
