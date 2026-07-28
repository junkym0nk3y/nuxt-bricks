// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, ref } from 'vue';

// Types
import type {
    IBricksComponent,
    IPropertyDefinition,
} from '../../src/runtime/modules/common/types/brick';
// #endregion

/**
 * BM-15 №3: приведение нового значения свойства читало предыдущее как
 * `previewProps[property.name]`. Имя объявляет brick-файл, пропсы приходят из
 * схемы, поэтому для имени `__proto__` «текущим значением» становился
 * `Object.prototype` — и `coerceObjectValue` записывал его в схему вместо
 * default'а свойства.
 */

// #region Mocks
const { storeMock, selectedForVariantsMock } = vi.hoisted(() => ({
    storeMock: {
        selectedComponentData: null as { id: string; component: IBricksComponent } | null,
        updateComponentProp: vi.fn(),
        updateComponentResponsiveProp: vi.fn(),
        setComponentFullWidth: vi.fn(),
        setComponentHidden: vi.fn(),
        setComponentDeviceVisibilityFlag: vi.fn(),
        setComponentHtmlId: vi.fn(),
    },
    selectedForVariantsMock: { value: null as { component: IBricksComponent } | null },
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => storeMock,
}));

vi.mock(
    '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarResponsiveScope',
    () => ({
        useSidebarResponsiveScope: () => ({
            isResponsiveLayout: ref(false),
            isResponsiveComponent: ref(false),
            layoutDeviceScope: ref('desktop'),
            hasResponsiveOverridesForScope: ref(false),
            selectedComponentDataForVariants: computed(() => selectedForVariantsMock.value),
            handleSetLayoutDeviceScope: vi.fn(),
            handleResetLayoutDeviceScopeOverrides: vi.fn(),
        }),
    })
);

vi.mock(
    '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarMediaSelection',
    () => ({
        useSidebarMediaSelection: () => ({
            handleOpenMediaGallery: vi.fn(),
            handleMediaSelect: vi.fn(),
        }),
    })
);

vi.mock(
    '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarBrickDescription',
    () => ({
        useSidebarBrickDescription: () => ({ brickDescription: ref('') }),
    })
);

vi.mock('../../src/runtime/modules/builder/shell/sidebar/composables/usePropertyVariants', () => ({
    usePropertyVariants: () => ({
        componentVariants: computed(() => ({})),
        handleNormalizeProps: vi.fn(),
    }),
}));

vi.mock('../../src/runtime/modules/builder/shell/sidebar/utils/propertyEditorComponents', () => ({
    componentEditors: {},
}));
// #endregion

import { useSidebarPropertiesPanel } from '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarPropertiesPanel';

/**
 * Подставляет выбранный компонент с заданными пропсами в оба источника панели.
 *
 * @param props - Пропсы компонента из схемы.
 */
function selectComponentWithProps(props: Record<string, unknown>): void {
    const component: IBricksComponent = {
        id: 'c1',
        type: 'component',
        componentName: 'TestBrick',
        brickPath: 'bricks/TestBrick.brick.ts',
        zIndex: 1,
        props,
    };

    storeMock.selectedComponentData = { id: 'c1', component };
    selectedForVariantsMock.value = { component };
}

/**
 * Собирает определение object-свойства с заданным именем.
 *
 * @param name - Имя свойства (из brick-файла).
 * @returns Определение свойства.
 */
function createObjectProperty(name: string): IPropertyDefinition {
    return { name, type: 'object', label: name, default: { mode: 'auto' } };
}

describe('useSidebarPropertiesPanel: имя свойства из Object.prototype', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        storeMock.updateComponentProp.mockReset();
        storeMock.updateComponentResponsiveProp.mockReset();
    });

    it('свойство __proto__ не подхватывает прототип как текущее значение', () => {
        selectComponentWithProps({});
        const panel = useSidebarPropertiesPanel({ onOpenMediaGallery: vi.fn() });

        // Не-объектный JSON: coerceObjectValue падает на текущее значение,
        // а при его отсутствии — на default свойства
        panel.handleChangeValues(createObjectProperty('__proto__'), '5');

        expect(storeMock.updateComponentProp).toHaveBeenCalledWith('c1', '__proto__', {
            mode: 'auto',
        });
    });

    it('свойство toString не подхватывает метод прототипа как текущее значение', () => {
        selectComponentWithProps({});
        const panel = useSidebarPropertiesPanel({ onOpenMediaGallery: vi.fn() });

        panel.handleChangeValues(createObjectProperty('toString'), '5');

        expect(storeMock.updateComponentProp).toHaveBeenCalledWith('c1', 'toString', {
            mode: 'auto',
        });
    });

    it('собственный проп с именем toString остаётся текущим значением', () => {
        selectComponentWithProps(JSON.parse('{"toString": {"mode": "custom"}}'));
        const panel = useSidebarPropertiesPanel({ onOpenMediaGallery: vi.fn() });

        panel.handleChangeValues(createObjectProperty('toString'), '5');

        expect(storeMock.updateComponentProp).toHaveBeenCalledWith('c1', 'toString', {
            mode: 'custom',
        });
    });
});
