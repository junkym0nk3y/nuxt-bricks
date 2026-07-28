// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { computed } from 'vue';

// Types
import type { IBrickValues } from '../../src/runtime/modules/common/types/index';
import type {
    IPropertyDefinition,
    TBrickDemoValues,
} from '../../src/runtime/modules/common/types/brick';
import type { ISelectedComponentData } from '../../src/runtime/modules/builder/shell/sidebar/types/composables';
// #endregion

/**
 * BM-15 №3: условие `showWhen` сверялось как `componentProps[showWhen.field]`.
 * Имя поля объявляет brick-файл, объект пропсов приходит из схемы, поэтому поле
 * с именем члена `Object.prototype` возвращало метод прототипа: сравнение с
 * `equals` было ложным при любой схеме, и зависимый проп молча пропадал —
 * и из панели свойств, и из inline-редактирования.
 */

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        te: () => false,
    }),
}));
// #endregion

import { findAllInlineEditableBrickProps } from '../../src/runtime/modules/builder/core/utils/inlineEditableProp';
import { usePropertyVariants } from '../../src/runtime/modules/builder/shell/sidebar/composables/usePropertyVariants';

/** Имена, которые обычный объект «находит» в `Object.prototype`. */
const PROTOTYPE_KEYS = ['constructor', 'toString', 'hasOwnProperty'] as const;

/**
 * Собирает brick-value с условием показа.
 *
 * @param field - Имя поля, от которого зависит показ.
 * @param equals - Ожидаемое значение поля.
 * @returns Конфиг свойства из brick-файла.
 */
function createBrickValue(field: string, equals: TBrickDemoValues): IBrickValues {
    return { type: 'textarea', showWhen: { field, equals } };
}

/**
 * Собирает данные выбранного компонента для панели свойств.
 *
 * @param properties - Определения свойств.
 * @param props - Пропсы компонента из схемы.
 * @returns Данные для usePropertyVariants.
 */
function createSelectedData(
    properties: IPropertyDefinition[],
    props: Record<string, unknown>
): ISelectedComponentData {
    return {
        id: 'c1',
        component: {
            id: 'c1',
            type: 'component',
            componentName: 'TestBrick',
            brickPath: 'bricks/TestBrick.brick.ts',
            zIndex: 1,
            props,
        },
        properties,
    };
}

/**
 * Собирает определение зависимого свойства для панели.
 *
 * @param field - Имя поля условия.
 * @param equals - Ожидаемое значение поля.
 * @returns Определение свойства.
 */
function createDependentProperty(field: string, equals: TBrickDemoValues): IPropertyDefinition {
    return {
        name: 'dependent',
        type: 'input',
        label: 'Dependent',
        default: undefined,
        showWhen: { field, equals },
    };
}

describe('inlineEditableProp: showWhen с именем поля из Object.prototype', () => {
    it.each(PROTOTYPE_KEYS)('поле %s без own-пропа не выполняет условие', (key) => {
        const result = findAllInlineEditableBrickProps({ text: createBrickValue(key, 'yes') }, {});

        expect(result).toEqual([]);
    });

    it.each(PROTOTYPE_KEYS)('собственный проп %s с нужным значением показывает проп', (key) => {
        const result = findAllInlineEditableBrickProps(
            { text: createBrickValue(key, 'yes') },
            JSON.parse(`{"${key}": "yes"}`)
        );

        expect(result.map((item) => item.propName)).toEqual(['text']);
    });

    it('поле constructor со значением undefined в equals не проходит по прототипу', () => {
        const result = findAllInlineEditableBrickProps(
            { text: createBrickValue('constructor', undefined) },
            {}
        );

        // own-ключа нет → readOwnKey отдаёт undefined, условие выполнено
        expect(result.map((item) => item.propName)).toEqual(['text']);
    });
});

describe('usePropertyVariants: showWhen с именем поля из Object.prototype', () => {
    it.each(PROTOTYPE_KEYS)('свойство с условием на %s скрыто без own-пропа', (key) => {
        const selected = computed(() =>
            createSelectedData([createDependentProperty(key, 'yes')], {})
        );

        const { componentVariants } = usePropertyVariants(selected);

        expect(componentVariants.value.input).toEqual([]);
    });

    it.each(PROTOTYPE_KEYS)('свойство с условием на %s видно при own-пропе', (key) => {
        const selected = computed(() =>
            createSelectedData(
                [createDependentProperty(key, 'yes')],
                JSON.parse(`{"${key}": "yes"}`)
            )
        );

        const { componentVariants } = usePropertyVariants(selected);

        expect(componentVariants.value.input.map((variant) => variant.property.name)).toEqual([
            'dependent',
        ]);
    });
});
