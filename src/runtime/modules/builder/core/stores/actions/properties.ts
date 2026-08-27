import type { IComponentsPropertyActions, IComponentsStore } from '../types';
import type { TBricksDeviceKey, TBrickPropValue } from '../../../../common/types/brick';

// Utils
import { scheduleHistorySave } from './historyDebounce';
import { withResponsiveProps } from '../../utils/responsiveProps';

/**
 * A string that holds a plain decimal number becomes one.
 *
 * The last heuristic border of the store: the panel already coerces by the declared
 * type of the property, but a generic input, a direct call of the store and the other
 * editors reach the props through here. Anything the pattern does not accept — an
 * exponent, a leading plus, a bare dot — stays the string it arrived as, in its
 * original form rather than trimmed.
 *
 * @param value - New value coming from the UI.
 * @returns The number, or the value unchanged.
 */
function coerceNumericString(value: TBrickPropValue): TBrickPropValue {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmedValue = value.trim();
    if (trimmedValue === '') {
        return '';
    }

    if (!/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
        return value;
    }

    const numValue = Number(trimmedValue);

    return Number.isNaN(numValue) ? value : numValue;
}

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

        component.props = {
            ...component.props,
            [propName]: coerceNumericString(value),
        };

        scheduleHistorySave(this);
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

        // The map is written AFTER the patch is merged: a `responsive` of the patch
        // itself must not slip past the invariant of the key
        component.props = withResponsiveProps({ ...currentProps, ...patch }, nextResponsive);

        scheduleHistorySave(this);
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

        const currentProps = component.props as Record<string, unknown>;
        const responsive = (currentProps.responsive ?? {}) as Record<string, unknown>;
        const deviceOverrides = ((responsive as Record<string, unknown>)[device] ?? {}) as Record<
            string,
            unknown
        >;

        component.props = withResponsiveProps(currentProps, {
            ...responsive,
            [device]: {
                ...deviceOverrides,
                [propName]: coerceNumericString(value),
            },
        });

        scheduleHistorySave(this);
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

        component.props = withResponsiveProps(currentProps, rest);

        this.saveToHistory();
    },
};
