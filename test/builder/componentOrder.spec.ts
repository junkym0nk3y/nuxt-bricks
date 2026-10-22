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

    it('ребёнок слота двигается по списку слота в обе стороны', () => {
        // The children of a slot live in `slots[].children` of the owner rather than in
        // its `children`: looking for neighbors in `children` alone left the command
        // with no list, and the step silently did nothing
        const store = useComponentsStore();
        const owner = buildComponent('owner', {
            type: 'component',
            componentName: 'SlotOwner',
            brickPath: 'components/SlotOwner.vue',
            children: undefined,
            slots: [
                { name: 'body', label: 'body', allowMultiple: true, children: ['x', 'y', 'z'] },
            ],
        });
        store.components = [
            owner,
            buildComponent('x', { parent: 'owner', slotName: 'body' }),
            buildComponent('y', { parent: 'owner', slotName: 'body' }),
            buildComponent('z', { parent: 'owner', slotName: 'body' }),
        ];

        store.moveComponentDown('y');
        expect(owner.slots?.[0]?.children).toEqual(['x', 'z', 'y']);

        store.moveComponentUp('y');
        expect(owner.slots?.[0]?.children).toEqual(['x', 'y', 'z']);
    });

    it('перестановка внутри слота не вынимает ребёнка из слота', () => {
        const store = useComponentsStore();
        const owner = buildComponent('owner', {
            type: 'component',
            componentName: 'SlotOwner',
            brickPath: 'components/SlotOwner.vue',
            children: undefined,
            slots: [{ name: 'body', label: 'body', allowMultiple: true, children: ['x', 'y'] }],
        });
        const child = buildComponent('y', { parent: 'owner', slotName: 'body' });
        store.components = [
            owner,
            buildComponent('x', { parent: 'owner', slotName: 'body' }),
            child,
        ];

        store.moveComponentUp('y');

        expect(child.parent).toBe('owner');
        expect(child.slotName).toBe('body');
        expect(owner.children).toBeUndefined();
    });

    it('края слота не двигаются и не пишут историю', () => {
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        const owner = buildComponent('owner', {
            type: 'component',
            componentName: 'SlotOwner',
            brickPath: 'components/SlotOwner.vue',
            children: undefined,
            slots: [{ name: 'body', label: 'body', allowMultiple: true, children: ['x', 'y'] }],
        });
        store.components = [
            owner,
            buildComponent('x', { parent: 'owner', slotName: 'body' }),
            buildComponent('y', { parent: 'owner', slotName: 'body' }),
        ];
        const historyLength = historyStore.history.length;

        store.moveComponentUp('x');
        store.moveComponentDown('y');

        expect(owner.slots?.[0]?.children).toEqual(['x', 'y']);
        expect(historyStore.history.length).toBe(historyLength);
    });

    it('удавшаяся перестановка внутри слота пишет один снимок истории', () => {
        const store = useComponentsStore();
        const historyStore = useHistoryStore();
        const owner = buildComponent('owner', {
            type: 'component',
            componentName: 'SlotOwner',
            brickPath: 'components/SlotOwner.vue',
            children: undefined,
            slots: [{ name: 'body', label: 'body', allowMultiple: true, children: ['x', 'y'] }],
        });
        store.components = [
            owner,
            buildComponent('x', { parent: 'owner', slotName: 'body' }),
            buildComponent('y', { parent: 'owner', slotName: 'body' }),
        ];
        const historyLength = historyStore.history.length;

        store.moveComponentDown('x');

        expect(historyStore.history.length).toBe(historyLength + 1);
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
