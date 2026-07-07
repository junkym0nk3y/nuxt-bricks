import type { IComponentsPropertyActions, IComponentsStore } from '../types';
import type { TBricksDeviceKey, TBrickPropValue } from '../../../../common/types/brick';

// Utils
import { useDebounceFn } from '@vueuse/core';

/**
 * Debounced saveToHistory для property-обновлений.
 * Предотвращает десятки сериализаций при быстром изменении значений (напр. кнопки +/-).
 */
const debouncedSaveToHistory = useDebounceFn((store: IComponentsStore) => {
    store.saveToHistory();
}, 300);

/**
 * Действия по обновлению props уже размещённых компонентов.
 */
export const propertyActions: IComponentsPropertyActions = {
    /**
     * Обновляет значение конкретного пропса с приведением типов (строка → число и т.д.).
     *
     * @param id - Идентификатор компонента.
     * @param propName - Имя редактируемого свойства.
     * @param value - Новое значение из UI.
     */
    updateComponentProp(
        this: IComponentsStore,
        id: string,
        propName: string,
        value: TBrickPropValue
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            console.warn('[Bricks Store] updateComponentProp: component not found', id);
            return;
        }

        let finalValue: TBrickPropValue = value;

        if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '') {
                finalValue = '';
            } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                const numValue = Number(trimmedValue);
                if (!Number.isNaN(numValue)) {
                    finalValue = numValue;
                }
            }
        }

        component.props = {
            ...component.props,
            [propName]: finalValue,
        };

        debouncedSaveToHistory(this);
    },

    /**
     * Обновляет значение пропса в `props.responsive[device]` для responsive layout-настроек.
     *
     * @param id - Идентификатор компонента.
     * @param device - Устройство (mobile/tablet/desktop).
     * @param propName - Имя редактируемого свойства.
     * @param value - Новое значение из UI.
     */
    updateComponentResponsiveProp(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey,
        propName: string,
        value: TBrickPropValue
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            console.warn('[Bricks Store] updateComponentResponsiveProp: component not found', id);
            return;
        }

        let finalValue: TBrickPropValue = value;

        if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '') {
                finalValue = '';
            } else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                const numValue = Number(trimmedValue);
                if (!Number.isNaN(numValue)) {
                    finalValue = numValue;
                }
            }
        }

        const currentProps = component.props as Record<string, unknown>;
        const responsive = (currentProps.responsive ?? {}) as Record<string, unknown>;
        const deviceOverrides = ((responsive as Record<string, unknown>)[device] ?? {}) as Record<
            string,
            unknown
        >;

        component.props = {
            ...currentProps,
            responsive: {
                ...responsive,
                [device]: {
                    ...deviceOverrides,
                    [propName]: finalValue,
                },
            },
        };

        debouncedSaveToHistory(this);
    },

    /**
     * Удаляет все responsive overrides для выбранного устройства.
     *
     * @param id - Идентификатор компонента.
     * @param device - Устройство (mobile/tablet/desktop).
     */
    resetComponentResponsivePropsForDevice(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            console.warn(
                '[Bricks Store] resetComponentResponsivePropsForDevice: component not found',
                id
            );
            return;
        }

        const currentProps = component.props as Record<string, unknown>;
        const responsive = (currentProps.responsive ?? {}) as Record<string, unknown>;

        if (!(device in responsive)) {
            return;
        }

        const { [device]: _removed, ...rest } = responsive as Record<string, unknown>;

        const nextResponsive = rest;

        if (Object.keys(nextResponsive).length === 0) {
            const { responsive: _responsiveKey, ...withoutResponsive } = currentProps;
            component.props = {
                ...withoutResponsive,
            };
        } else {
            component.props = {
                ...currentProps,
                responsive: nextResponsive,
            };
        }

        this.saveToHistory();
    },
};
