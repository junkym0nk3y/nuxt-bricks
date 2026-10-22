// #region Imports
// Vitest
import { beforeEach, describe, expect, it } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksComponent, IBricksSchema } from '../../src/runtime/modules/common/types/brick';

// Utils
import {
    clampHistory,
    deserializeSchema,
    serializeSchema,
} from '../../src/runtime/modules/builder/core/utils/history';

// Pinia stores
import { useHistoryStore } from '../../src/runtime/modules/builder/core/stores/history';
// #endregion

/**
 * Собирает минимальный компонент канваса с переопределениями.
 *
 * @param overrides - Переопределяемые поля.
 * @returns Компонент для фикстур.
 */
function buildComponent(overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id: 'component-1',
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick.brick.ts',
        zIndex: 1,
        props: { title: 'Hello' },
        ...overrides,
    };
}

/**
 * Собирает схему с единственным маркерным компонентом.
 *
 * @param marker - Значение, различающее снапшоты в истории.
 * @returns Схема для фикстур.
 */
function buildSchema(marker: string): IBricksSchema {
    return { components: [buildComponent({ id: marker })] };
}

describe('clampHistory', () => {
    it('не меняет историю в пределах лимита', () => {
        const history = [buildSchema('a'), buildSchema('b')];
        const result = clampHistory(history, 1, 50);

        expect(result.history).toEqual(history);
        expect(result.historyIndex).toBe(1);
    });

    it('отрезает старые записи сверх лимита и сдвигает индекс', () => {
        const history = [buildSchema('a'), buildSchema('b'), buildSchema('c')];
        const result = clampHistory(history, 2, 2);

        expect(result.history.map((schema) => schema.components[0].id)).toEqual(['b', 'c']);
        expect(result.historyIndex).toBe(1);
    });

    it('не опускает индекс ниже нуля', () => {
        const history = [buildSchema('a'), buildSchema('b'), buildSchema('c')];
        const result = clampHistory(history, 0, 1);

        expect(result.historyIndex).toBe(0);
        expect(result.history).toHaveLength(1);
    });

    it('не мутирует исходный массив', () => {
        const history = [buildSchema('a'), buildSchema('b')];
        clampHistory(history, 1, 1);
        expect(history).toHaveLength(2);
    });
});

describe('serializeSchema / deserializeSchema', () => {
    it('round-trip сохраняет компоненты и разрывает ссылки', () => {
        const component = buildComponent({ children: ['child-1'], props: { nested: { a: 1 } } });
        const schema = serializeSchema([component]);
        const restored = deserializeSchema(schema);

        expect(restored[0].id).toBe(component.id);
        expect(restored[0].props).toEqual(component.props);
        expect(restored[0].props).not.toBe(component.props);
        expect(restored[0].children).not.toBe(component.children);
    });

    it('нормализует Windows-пути brickPath', () => {
        const schema = serializeSchema([buildComponent({ brickPath: 'bricks\\Test.brick.ts' })]);
        expect(schema.components[0].brickPath).toBe('bricks/Test.brick.ts');
    });

    it('сохраняет meta только если она не пуста', () => {
        expect(serializeSchema([], {}).meta).toBeUndefined();

        const meta = { navigation: { items: [] } };
        expect(serializeSchema([], meta).meta).toEqual(meta);
    });

    it('deserializeSchema не дописывает недостающие ключи видимости', () => {
        // Ключи устройств зависят от набора страницы: дописывание вернуло бы в
        // схему ступени, которых у страницы уже нет
        const restored = deserializeSchema({
            components: [buildComponent({ deviceVisibility: { mobile: false } })],
        });

        expect(restored[0].deviceVisibility).toEqual({ mobile: false });
    });

    it('deserializeSchema переживает схему без components', () => {
        expect(deserializeSchema({} as IBricksSchema)).toEqual([]);
    });
});

/**
 * Own-ключ `__proto__` в пропсах непредставим в Nuxt payload — devalue
 * бросает «Cannot stringify objects with `__proto__` keys», то есть роняет SSR и
 * билдера, и опубликованной страницы. `JSON.parse` такой ключ создаёт штатно,
 * так что схема из API или импортированного файла его приносит. Отбрасываем на
 * входе в стор, безусловно, а не в отдельных утилитах по случаю.
 */
describe('deserializeSchema: own-ключ __proto__ в пропсах', () => {
    it('отбрасывает ключ на верхнем уровне пропсов', () => {
        const restored = deserializeSchema({
            components: [
                buildComponent({
                    props: JSON.parse('{"__proto__": {"mode": "custom"}, "title": "Hello"}'),
                }),
            ],
        });

        expect(Object.getOwnPropertyNames(restored[0].props)).toEqual(['title']);
        expect(Object.getPrototypeOf(restored[0].props)).toBe(Object.prototype);
    });

    it('отбрасывает ключ на любой глубине, включая элементы массивов', () => {
        const restored = deserializeSchema({
            components: [
                buildComponent({
                    props: JSON.parse(
                        '{"nested": {"__proto__": {"x": 1}, "keep": 1}, "items": [{"__proto__": 2, "id": "a"}]}'
                    ),
                }),
            ],
        });

        const props = restored[0].props as {
            nested: Record<string, unknown>;
            items: Array<Record<string, unknown>>;
        };

        expect(Object.getOwnPropertyNames(props.nested)).toEqual(['keep']);
        expect(Object.getOwnPropertyNames(props.items[0])).toEqual(['id']);
    });

    it('обычные имена членов прототипа остаются собственными пропами', () => {
        const restored = deserializeSchema({
            components: [
                buildComponent({
                    props: JSON.parse('{"constructor": "a", "toString": "b", "title": "c"}'),
                }),
            ],
        });

        expect(Object.getOwnPropertyNames(restored[0].props)).toEqual([
            'constructor',
            'toString',
            'title',
        ]);
    });
});

describe('useHistoryStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('в пустом состоянии undo/redo недоступны', () => {
        const store = useHistoryStore();

        expect(store.canUndo).toBe(false);
        expect(store.canRedo).toBe(false);
        expect(store.undo()).toBeNull();
        expect(store.redo()).toBeNull();
    });

    it('capture добавляет снапшоты, undo/redo ходят по ним без off-by-one', () => {
        const store = useHistoryStore();
        store.capture(buildSchema('a'));
        store.capture(buildSchema('b'));
        store.capture(buildSchema('c'));

        expect(store.canUndo).toBe(true);
        expect(store.canRedo).toBe(false);

        expect(store.undo()?.components[0].id).toBe('b');
        expect(store.undo()?.components[0].id).toBe('a');
        expect(store.canUndo).toBe(false);
        expect(store.undo()).toBeNull();

        expect(store.redo()?.components[0].id).toBe('b');
        expect(store.redo()?.components[0].id).toBe('c');
        expect(store.canRedo).toBe(false);
        expect(store.redo()).toBeNull();
    });

    it('capture после undo отрезает redo-ветку', () => {
        const store = useHistoryStore();
        store.capture(buildSchema('a'));
        store.capture(buildSchema('b'));
        store.capture(buildSchema('c'));

        store.undo();
        store.undo();
        store.capture(buildSchema('d'));

        expect(store.canRedo).toBe(false);
        expect(store.history.map((schema) => schema.components[0].id)).toEqual(['a', 'd']);
        expect(store.undo()?.components[0].id).toBe('a');
    });

    it('история ограничена 50 снапшотами', () => {
        const store = useHistoryStore();

        for (let index = 0; index < 60; index++) {
            store.capture(buildSchema(`s${index}`));
        }

        expect(store.history).toHaveLength(50);
        expect(store.history[0].components[0].id).toBe('s10');
        expect(store.historyIndex).toBe(49);
        expect(store.canRedo).toBe(false);
    });

    it('reset очищает историю', () => {
        const store = useHistoryStore();
        store.capture(buildSchema('a'));
        store.reset();

        expect(store.history).toEqual([]);
        expect(store.historyIndex).toBe(-1);
        expect(store.canUndo).toBe(false);
    });
});
