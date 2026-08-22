import type { IComponentsPropertyActions, IComponentsStore } from '../types';
import type { TBricksDeviceKey, TBrickPropValue } from '../../../../common/types/brick';

// Utils
import { useDebounceFn } from '@vueuse/core';

/**
 * A debounced saveToHistory for property updates.
 * It keeps a fast run of value changes — the plus and minus buttons, for instance —
 * from serializing the schema dozens of times.
 */
const debouncedSaveToHistory = useDebounceFn((store: IComponentsStore) => {
    store.saveToHistory();
}, 300);

/**
 * Actions that update the props of components already placed on the canvas.
 */
export const propertyActions: IComponentsPropertyActions = {
    /**
     * Updates the value of a single prop, coercing the type where it applies (a string
     * that holds a number becomes one).
     *
     * @param id - Id of the component.
     * @param propName - Name of the property being edited.
     * @param value - New value coming from the UI.
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
     * Writes the set of props describing ONE entity in a single change — and drops
     * their per-device overrides.
     *
     * Picking an image from the gallery needs this. The address of the file, the
     * addresses of its scaled variants and its pixel size are one indivisible fact:
     * "this file is the chosen one". While they were written one by one, a pick made
     * on mobile drifted apart: `src` went into `responsive.mobile` (a property of a
     * responsive block), while the variants and the sizes landed in the base props.
     * On desktop the canvas then showed the address of the previous file at the
     * aspect ratio of the new one and swapped in its preview, and published, which
     * does not read a per-device address at all, showed the previous file entirely.
     *
     * Dropping the overrides is mandatory: without it the very same mismatch would
     * live on in schemas edited before this fix.
     *
     * @param id - Id of the component.
     * @param patch - Every prop of the entity.
     */
    updateComponentIdentityProps(
        this: IComponentsStore,
        id: string,
        patch: Record<string, TBrickPropValue>
    ) {
        const component = this.getComponentById(id);

        if (!component) {
            console.warn('[Bricks Store] updateComponentIdentityProps: component not found', id);
            return;
        }

        const currentProps = component.props as Record<string, unknown>;
        const responsive = currentProps.responsive as Record<string, unknown> | undefined;
        const patchedKeys = Object.keys(patch);
        const nextResponsive: Record<string, unknown> = {};

        for (const [device, overrides] of Object.entries(responsive ?? {})) {
            const kept = Object.fromEntries(
                Object.entries((overrides ?? {}) as Record<string, unknown>).filter(
                    ([key]) => !patchedKeys.includes(key)
                )
            );

            if (Object.keys(kept).length > 0) {
                nextResponsive[device] = kept;
            }
        }

        component.props = {
            ...currentProps,
            ...patch,
            ...(Object.keys(nextResponsive).length > 0 ? { responsive: nextResponsive } : {}),
        };

        // An empty `responsive` is not left behind as a stub key — the reason is at
        // `utils/deviceKeyCleanup.cleanComponent`, which strips the same key
        if (Object.keys(nextResponsive).length === 0) {
            delete (component.props as Record<string, unknown>).responsive;
        }

        debouncedSaveToHistory(this);
    },

    /**
     * Updates a prop inside `props.responsive[device]`, the per-device layout
     * overrides.
     *
     * @param id - Id of the component.
     * @param device - Device key of the set.
     * @param propName - Name of the property being edited.
     * @param value - New value coming from the UI.
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
     * Removes every responsive override of one device.
     *
     * @param id - Id of the component.
     * @param device - Device key of the set.
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
