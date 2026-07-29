// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    MAX_COMPONENT_TREE_DEPTH,
    isRenderableSchemaComponent,
    validateSchemaComponentGraph,
} from '../../src/runtime/modules/common/utils/bricks/schemaContract';
// #endregion

/**
 * Минимальный валидный компонент схемы.
 */
function makeComponent(id: string, overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id,
        type: 'component',
        componentName: 'Text',
        brickPath: 'components/text',
        zIndex: 0,
        props: {},
        ...overrides,
    };
}

/**
 * Layout-компонент с детьми.
 */
function makeLayout(id: string, children: string[], overrides: Partial<IBricksComponent> = {}) {
    return makeComponent(id, {
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        children,
        ...overrides,
    });
}

describe('validateSchemaComponentGraph: валидные схемы', () => {
    it('пустой список компонентов валиден', () => {
        expect(validateSchemaComponentGraph([])).toEqual([]);
    });

    it('дерево с двусторонними связями валидно', () => {
        const grid = makeLayout('grid-1', ['text-1']);
        const text = makeComponent('text-1', { parent: 'grid-1' });
        expect(validateSchemaComponentGraph([grid, text])).toEqual([]);
    });

    it('слотовые дети валидны (children живут в slots[].children)', () => {
        const host = makeComponent('host-1', {
            slots: [{ name: 'main', label: 'Main', allowMultiple: true, children: ['text-1'] }],
        });
        const text = makeComponent('text-1', { parent: 'host-1', slotName: 'main' });
        expect(validateSchemaComponentGraph([host, text])).toEqual([]);
    });

    it('parent: null трактуется как корень', () => {
        const component = makeComponent('a', { parent: null as unknown as string });
        expect(validateSchemaComponentGraph([component])).toEqual([]);
    });
});

describe('validateSchemaComponentGraph: форма компонента', () => {
    it.each([
        ['null-элемент', [null]],
        ['число', [42]],
        ['строка', ['x']],
        ['массив', [[]]],
    ])('отклоняет не-объект: %s', (_label, components) => {
        const errors = validateSchemaComponentGraph(components as unknown[]);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('components[0]');
    });

    it('отклоняет пустой объект (нет id)', () => {
        expect(validateSchemaComponentGraph([{}])[0]).toContain('id');
    });

    it('отклоняет отсутствие componentName и brickPath', () => {
        const errors = validateSchemaComponentGraph([{ id: 'a' }]);
        expect(errors.join(' ')).toContain('componentName');
        expect(errors.join(' ')).toContain('brickPath');
    });

    it('отклоняет неизвестный type', () => {
        const errors = validateSchemaComponentGraph([
            makeComponent('a', { type: 'weird' as never }),
        ]);
        expect(errors.join(' ')).toContain('type');
    });

    it('отклоняет props не-объект', () => {
        const errors = validateSchemaComponentGraph([
            makeComponent('a', { props: 'nope' as never }),
        ]);
        expect(errors.join(' ')).toContain('props');
    });

    it('отклоняет дубликат id', () => {
        const errors = validateSchemaComponentGraph([makeComponent('a'), makeComponent('a')]);
        expect(errors.join(' ')).toContain('Duplicate');
    });
});

describe('validateSchemaComponentGraph: связи и граф', () => {
    it('отклоняет dangling parent', () => {
        const errors = validateSchemaComponentGraph([makeComponent('a', { parent: 'ghost' })]);
        expect(errors.join(' ')).toContain('ghost');
    });

    it('отклоняет dangling child', () => {
        const errors = validateSchemaComponentGraph([makeLayout('grid-1', ['ghost'])]);
        expect(errors.join(' ')).toContain('ghost');
    });

    it('отклоняет self-loop (сам себе parent/child)', () => {
        expect(
            validateSchemaComponentGraph([makeLayout('a', ['a'], { parent: 'a' })]).length
        ).toBeGreaterThan(0);
    });

    it('отклоняет ребёнка, перечисленного двумя контейнерами', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('g1', ['text-1']),
            makeLayout('g2', ['text-1']),
            makeComponent('text-1', { parent: 'g1' }),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('отклоняет рассинхрон parent/children (child не перечислен родителем)', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('g1', []),
            makeComponent('text-1', { parent: 'g1' }),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('отклоняет рассинхрон children/parent (перечислен, но parent пуст)', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('g1', ['text-1']),
            makeComponent('text-1'),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('отклоняет двухузловой цикл', () => {
        const errors = validateSchemaComponentGraph([
            makeLayout('a', ['b'], { parent: 'b' }),
            makeLayout('b', ['a'], { parent: 'a' }),
        ]);
        expect(errors.join(' ')).toContain('cycle');
    });

    it('отклоняет превышение глубины дерева', () => {
        const chain: IBricksComponent[] = [];
        const depth = MAX_COMPONENT_TREE_DEPTH + 2;
        for (let i = 0; i < depth; i += 1) {
            chain.push(
                makeLayout(`n${i}`, i < depth - 1 ? [`n${i + 1}`] : [], {
                    parent: i > 0 ? `n${i - 1}` : undefined,
                })
            );
        }
        expect(validateSchemaComponentGraph(chain).join(' ')).toContain('depth');
    });

    it('ограничивает список ошибок (не взрывается на мусорном массиве)', () => {
        const garbage = Array.from({ length: 500 }, () => null);
        expect(validateSchemaComponentGraph(garbage).length).toBeLessThanOrEqual(20);
    });
});

describe('isRenderableSchemaComponent: guard рендера', () => {
    it('принимает минимальный валидный компонент', () => {
        expect(isRenderableSchemaComponent(makeComponent('a'))).toBe(true);
    });

    it.each([
        ['null', null],
        ['число', 42],
        ['без id', { componentName: 'Text' }],
        ['без componentName', { id: 'a' }],
    ])('отклоняет: %s', (_label, value) => {
        expect(isRenderableSchemaComponent(value)).toBe(false);
    });
});
