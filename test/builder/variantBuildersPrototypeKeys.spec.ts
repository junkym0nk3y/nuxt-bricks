// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IPropertyDefinition } from '../../src/runtime/modules/common/types/brick';
// Utils
import {
    VARIANT_BUILDERS,
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
 * Значение пропа читалось как `componentProps[property.name]`. Имя
 * объявляет brick-файл, а объект пропсов приходит из схемы, поэтому проп с
 * именем члена `Object.prototype` подхватывал метод прототипа: чекбокс и свитч
 * с именем `toString` были включены при любой схеме, а json-редактор получал
 * функцию вместо значения.
 */

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
    it('boolean-вариант не принимает унаследованный toString за значение', () => {
        const context = createContext(createProperty('toString', { type: 'boolean' }));

        VARIANT_BUILDERS.boolean?.(context, TOOLS);

        expect(context.variants.boolean[0].value).toBe(false);
    });

    it('boolean-вариант читает собственный проп с именем toString', () => {
        const context = createContext(
            createProperty('toString', { type: 'boolean' }),
            JSON.parse('{"toString": true}')
        );

        VARIANT_BUILDERS.boolean?.(context, TOOLS);

        expect(context.variants.boolean[0].value).toBe(true);
    });

    it('object-вариант использует default вместо унаследованного constructor', () => {
        const context = createContext(
            createProperty('constructor', { type: 'object', default: { mode: 'auto' } })
        );

        VARIANT_BUILDERS.object?.(context, TOOLS);

        expect(context.variants.json[0].value).toEqual({ mode: 'auto' });
    });
});
