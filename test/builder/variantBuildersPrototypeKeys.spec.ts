// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IPropertyDefinition } from '../../src/runtime/modules/common/types/brick';
// Utils
import {
    VARIANT_BUILDERS,
    buildInputVariant,
    buildSelectVariant,
    createEmptyVariants,
    type IVariantBuilderTools,
} from '../../src/runtime/modules/builder/shell/sidebar/utils/variantBuilders';

// Constants
import {
    PROPERTY_EDITOR_ORDER,
    type IPropertyVariantContext,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';
// #endregion

/**
 * BM-15 №3: значение пропа читалось как `componentProps[property.name]`. Имя
 * объявляет brick-файл, а объект пропсов приходит из схемы, поэтому проп с
 * именем члена `Object.prototype` подхватывал метод прототипа: чекбокс и свитч
 * с именем `toString` были включены при любой схеме, а json-редактор получал
 * функцию вместо значения.
 */

/** Имена, которые обычный объект «находит» в `Object.prototype`. */
const PROTOTYPE_KEYS = ['constructor', 'toString', 'hasOwnProperty'] as const;

const TOOLS: IVariantBuilderTools = {
    resolveLabel: (property) => property.label || property.name,
    t: (key) => key,
};

/**
 * Собирает контекст билдера варианта для одного свойства.
 *
 * @param property - Определение свойства из brick-файла.
 * @param componentProps - Пропсы компонента из схемы.
 * @returns Контекст с пустым набором вариантов.
 */
function createContext(
    property: IPropertyDefinition,
    componentProps: Record<string, unknown> = {}
): IPropertyVariantContext {
    return {
        property,
        componentProps,
        variants: createEmptyVariants(PROPERTY_EDITOR_ORDER),
    };
}

/**
 * Собирает определение свойства с заданным именем и типом.
 *
 * @param name - Имя свойства (из brick-файла).
 * @param overrides - Переопределения определения.
 * @returns Определение свойства.
 */
function createProperty(
    name: string,
    overrides: Partial<IPropertyDefinition> = {}
): IPropertyDefinition {
    return { name, type: 'input', label: name, default: undefined, ...overrides };
}

describe('variantBuilders: имена пропов из Object.prototype', () => {
    it.each(PROTOTYPE_KEYS)('boolean-вариант с именем %s выключен без own-пропа', (key) => {
        const context = createContext(createProperty(key, { type: 'boolean' }));

        VARIANT_BUILDERS.boolean?.(context, TOOLS);

        expect(context.variants.boolean[0].value).toBe(false);
    });

    it.each(PROTOTYPE_KEYS)('switch-вариант с именем %s выключен без own-пропа', (key) => {
        const context = createContext(createProperty(key, { type: 'switch' }));

        VARIANT_BUILDERS.switch?.(context, TOOLS);

        expect(context.variants.switch[0].value).toBe(false);
    });

    it('boolean-вариант читает собственный проп с именем toString', () => {
        const context = createContext(
            createProperty('toString', { type: 'boolean' }),
            JSON.parse('{"toString": true}')
        );

        VARIANT_BUILDERS.boolean?.(context, TOOLS);

        expect(context.variants.boolean[0].value).toBe(true);
    });

    it.each(PROTOTYPE_KEYS)('object-вариант с именем %s падает на default', (key) => {
        const context = createContext(
            createProperty(key, { type: 'object', default: { mode: 'auto' } })
        );

        VARIANT_BUILDERS.object?.(context, TOOLS);

        expect(context.variants.json[0].value).toEqual({ mode: 'auto' });
    });

    it.each(PROTOTYPE_KEYS)('array-вариант с именем %s падает на default', (key) => {
        const context = createContext(createProperty(key, { type: 'array', default: [1, 2] }));

        VARIANT_BUILDERS.array?.(context, TOOLS);

        expect(context.variants.input[0].value).toBe('1, 2');
    });

    it.each(PROTOTYPE_KEYS)('tags-вариант с именем %s падает на default', (key) => {
        const context = createContext(createProperty(key, { type: 'tags', default: ['a'] }));

        VARIANT_BUILDERS.tags?.(context, TOOLS);

        expect(context.variants.tags[0].value).toEqual(['a']);
    });

    it.each(PROTOTYPE_KEYS)('textarea-вариант с именем %s пуст без own-пропа', (key) => {
        const context = createContext(createProperty(key, { type: 'textarea' }));

        VARIANT_BUILDERS.textarea?.(context, TOOLS);

        expect(context.variants.textarea[0].value).toBe('');
    });

    it.each(PROTOTYPE_KEYS)('inline-content с именем %s падает на default', (key) => {
        const context = createContext(
            createProperty(key, { type: 'inline-content', default: [{ kind: 'text' }] })
        );

        VARIANT_BUILDERS['inline-content']?.(context, TOOLS);

        expect(context.variants['inline-content'][0].value).toEqual([{ kind: 'text' }]);
    });

    it.each(PROTOTYPE_KEYS)('select-вариант с именем %s встаёт на первую опцию', (key) => {
        const context = createContext(
            createProperty(key, {
                type: 'select',
                options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                ],
            })
        );

        expect(buildSelectVariant(context, TOOLS, (label) => label)).toBe(true);
        expect(context.variants.select[0].value).toBe('a');
    });

    it.each(PROTOTYPE_KEYS)('input-fallback с именем %s пуст без own-пропа', (key) => {
        const context = createContext(createProperty(key));

        buildInputVariant(context, TOOLS);

        expect(context.variants.input[0].value).toBe('');
    });

    it('color-вариант читает собственный проп с именем constructor', () => {
        const context = createContext(
            createProperty('constructor', { type: 'color' }),
            JSON.parse('{"constructor": "#ff0000"}')
        );

        VARIANT_BUILDERS.color?.(context, TOOLS);

        expect(context.variants.color[0].value).toBe('#ff0000');
    });
});
