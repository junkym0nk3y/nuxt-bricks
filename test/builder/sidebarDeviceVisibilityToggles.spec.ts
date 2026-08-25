/**
 * @vitest-environment happy-dom
 *
 * Тумблеры видимости в панели свойств рисовались по трём захардкоженным ключам,
 * и у страницы со своим набором добавленное устройство в панели не появлялось:
 * скрыть на нём блок можно было только из контекстного меню канваса.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types и константа порядка редакторов лежат в одном модуле
import {
    PROPERTY_EDITOR_ORDER,
    type TComponentVariantsMap,
    type TPropertyEditorType,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';

// Vue
import { defineComponent, h, markRaw, type Component } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { canvasStoreMock } = vi.hoisted(() => ({
    canvasStoreMock: {
        devices: [
            { key: 'mobile', label: 'Mobile' },
            { key: 'tablet', label: 'Tablet' },
            { key: 'laptop', label: 'Laptop' },
            { key: 'desktop', label: 'Desktop' },
        ],
    },
}));

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', () => ({
    useCanvasStore: () => canvasStoreMock,
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));
// #endregion

import BuilderShellSidebarPropertyEditors from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarPropertyEditors.vue';

/** Заглушка булева редактора: подпись и значение выносятся в data-атрибуты. */
const BooleanEditorStub = markRaw(
    defineComponent({
        name: 'BooleanEditorStub',
        props: {
            label: { type: String, default: '' },
            value: { type: Boolean, default: false },
        },
        setup: (props) => () =>
            h('div', { 'data-toggle': props.label, 'data-value': String(props.value) }),
    })
);

/**
 * Карта редакторов на все типы свойств: панель принимает полный `Record`, и
 * заглушка стоит везде — тесту важен только блок видимости, а урезанная карта
 * потребовала бы каста и потеряла контракт компонента.
 */
const EDITOR_STUBS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: BooleanEditorStub }),
    {} as Record<TPropertyEditorType, Component>
);

/** Пустые списки свойств: панель рисует только блок видимости. */
const EMPTY_VARIANTS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: [] }),
    {} as TComponentVariantsMap
);

/**
 * Монтирует панель редакторов с одним булевым редактором.
 *
 * @param deviceVisibility - Текущая карта видимости блока.
 * @returns Обёртка @vue/test-utils.
 */
function mountEditors(deviceVisibility: Record<string, boolean>) {
    return mount(BuilderShellSidebarPropertyEditors, {
        props: {
            componentEditors: EDITOR_STUBS,
            componentVariants: EMPTY_VARIANTS,
            deviceScope: 'desktop' as const,
            fullWidthValue: false,
            showFullWidthControl: false,
            isHiddenValue: false,
            deviceVisibilityValue: deviceVisibility,
            handleToggleFullWidth: vi.fn(),
            handleToggleHidden: vi.fn(),
            handleToggleDeviceVisibility: vi.fn(),
            htmlIdValue: '',
            handleSetHtmlId: vi.fn(),
            handleChangeValues: vi.fn(),
            handleNormalizeProps: vi.fn(),
            handleOpenMediaGallery: vi.fn(),
        },
        global: { stubs: { BricksInput: true } },
    });
}

describe('тумблеры видимости в панели свойств', () => {
    it('рисуются по набору устройств страницы, а не по фиксированной тройке', () => {
        const wrapper = mountEditors({ laptop: false });

        const toggles = wrapper.findAll('[data-toggle]');
        const devices = toggles
            .map((node) => node.attributes('data-toggle'))
            .filter((label) => ['Mobile', 'Tablet', 'Laptop', 'Desktop'].includes(label ?? ''));

        expect(devices).toEqual(['Mobile', 'Tablet', 'Laptop', 'Desktop']);
        // Явный `false` в схеме — единственное «скрыто»; отсутствие ключа значит «видно»
        expect(
            toggles
                .find((node) => node.attributes('data-toggle') === 'Laptop')
                ?.attributes('data-value')
        ).toBe('false');
        expect(
            toggles
                .find((node) => node.attributes('data-toggle') === 'Tablet')
                ?.attributes('data-value')
        ).toBe('true');
    });
});
