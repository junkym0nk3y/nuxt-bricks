// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { buildDropFlowEntries } from '../../src/runtime/modules/builder/core/utils/dragVisuals';

/**
 * Создаёт минимальный компонент канваса для проверки порядка записей потока.
 *
 * @param id - Идентификатор компонента.
 * @returns Компонент схемы.
 */
function makeComponent(id: string): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'BlockText',
        brickPath: '',
        zIndex: 0,
        props: {},
    };
}

const CHILDREN = [makeComponent('a'), makeComponent('b'), makeComponent('c')];

describe('drop flow entries', () => {
    it('отдаёт только блоки, когда драг не над зоной', () => {
        const entries = buildDropFlowEntries(CHILDREN, null, 'root-drop');

        expect(entries.map((entry) => entry.kind)).toEqual(['item', 'item', 'item']);
        expect(entries.map((entry) => entry.key)).toEqual(['a', 'b', 'c']);
    });

    it('вставляет место вставки перед блоком с целевым индексом', () => {
        const entries = buildDropFlowEntries(CHILDREN, 1, 'root-drop');

        expect(entries.map((entry) => entry.kind)).toEqual(['item', 'placeholder', 'item', 'item']);
        expect(entries[1].key).toBe('root-drop');
    });

    it('ставит место вставки в конец потока', () => {
        const entries = buildDropFlowEntries(CHILDREN, CHILDREN.length, 'root-drop');

        expect(entries.at(-1)?.kind).toBe('placeholder');
        expect(entries.filter((entry) => entry.kind === 'placeholder')).toHaveLength(1);
    });

    it('держит ключ плейсхолдера стабильным при переносе места вставки', () => {
        const first = buildDropFlowEntries(CHILDREN, 0, 'slot-drop-default');
        const last = buildDropFlowEntries(CHILDREN, 3, 'slot-drop-default');

        expect(first[0].key).toBe('slot-drop-default');
        expect(last.at(-1)?.key).toBe('slot-drop-default');
    });

    it('не рендерит место вставки при индексе за пределами списка', () => {
        const entries = buildDropFlowEntries(CHILDREN, 9, 'root-drop');

        expect(entries.every((entry) => entry.kind === 'item')).toBe(true);
    });

    it('показывает одно место вставки в пустой зоне', () => {
        const entries = buildDropFlowEntries([], 0, 'root-drop');

        expect(entries).toEqual([{ kind: 'placeholder', key: 'root-drop' }]);
    });
});
