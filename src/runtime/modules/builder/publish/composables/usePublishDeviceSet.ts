// #region Imports
// Types
import type { IBricksDeviceChoice, TBricksPageDeviceSet } from '../../../common/types/devices';
import type {
    IPublishDeviceRange,
    IPublishDeviceRow,
    IPublishDeviceSetOptions,
} from '../types/devices';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import {
    BASE_DEVICE_KEY,
    DEVICE_CHOICES,
    DEVICE_MAX_WIDTH,
    DEVICE_MIN_WIDTH,
    DEVICE_SET_MAX,
    NARROW_DEVICE_KEY,
} from '../../../common/constants/devices';

// Utils
import {
    cloneDeviceSet,
    deviceRanges,
    validateDeviceSet,
} from '../../../common/utils/bricks/devices';
// #endregion

/**
 * The draft of the device set of a page for the "Page devices" modal.
 *
 * The edits live here and travel into the publish form only on "Save": the set
 * dictates the layout of the whole page, and applying it on every character typed
 * would mean jerking the canvas and the preview around on intermediate states.
 *
 * @param options - The initial set of the page, the set of the project and the
 * active device.
 */
export function usePublishDeviceSet(options: IPublishDeviceSetOptions) {
    // #region Data
    const { t } = useI18n();

    /** The page has a set of its own (the position of the switch) */
    const isCustom = ref(false);

    /** The draft: edited freely, travels into the form only on "Save" */
    const draft = ref<TBricksPageDeviceSet>([]);
    // #endregion

    // #region Computed
    /**
     * The set that is shown: either the own draft or the set of the project in
     * read-only mode.
     */
    const shownDevices = computed<TBricksPageDeviceSet>(() =>
        isCustom.value
            ? draft.value
            : options.projectDevices().map(({ canvasHeight: _h, remBase: _r, ...device }) => device)
    );

    /**
     * The bounds of the range of the intermediate devices.
     *
     * By KEYS rather than by positions: the list is re-sorted on every width typed,
     * and "the first"/"the last" are merely the narrowest and the widest at that
     * moment. Give the mobile 1400 and it travels to the end, so by positions the
     * edges would turn out to be the tablet and the desktop — the lock would land
     * on the wrong device, and an invalid set would pass the check.
     */
    const bounds = computed(() => {
        const devices = shownDevices.value;
        const narrow = devices.find((d) => d.key === NARROW_DEVICE_KEY);
        const base = devices.find((d) => d.key === BASE_DEVICE_KEY);

        return {
            min: narrow?.width ?? DEVICE_MIN_WIDTH,
            max: base?.width ?? DEVICE_MAX_WIDTH,
            minLabel: narrow?.label ?? '',
            maxLabel: base?.label ?? '',
        };
    });

    const rows = computed<IPublishDeviceRow[]>(() =>
        shownDevices.value.map((device, index) => ({
            ...device,
            isLocked: device.key === NARROW_DEVICE_KEY || device.key === BASE_DEVICE_KEY,
            widthError: validateWidth(device, index),
            labelError: device.label.trim() ? '' : t('bricks.devices.errors.labelRequired'),
        }))
    );

    /**
     * The same set, ordered by width.
     *
     * The order is dictated by the width, yet the ROWS of the table are not
     * rearranged while the modal is open: a rearrangement moves the DOM node of a
     * row, and everything tied to its position at that moment breaks — typing into
     * the width field lost the focus after the first digit, and the cross of the
     * neighboring row managed to travel under the cursor between the press and the
     * release of the button, which made the confirmation offer to remove the wrong
     * device. The sorting is needed by the data rather than by the eye:
     * `deviceRanges` takes the upper bound from the neighbor on the right, and the
     * server contract rejects an unsorted array — so the ranges, the save check and
     * the value for the form are all computed over this copy. A person sees the new
     * order in the range scale at once, and in the table on the next opening of the
     * modal.
     */
    const sortedDevices = computed<TBricksPageDeviceSet>(() =>
        [...shownDevices.value].sort((a, b) => a.width - b.width)
    );

    const ranges = computed<IPublishDeviceRange[]>(() => {
        const devices = sortedDevices.value;
        const activeKey = options.activeDeviceKey();

        return deviceRanges(devices).map((range, index) => ({
            key: range.key,
            label: devices[index].label,
            icon: devices[index].icon,
            text: Number.isFinite(range.max)
                ? `${range.min} – ${range.max}`
                : t('bricks.devices.rangeFrom', { min: range.min }),
            isActive: range.key === activeKey,
        }));
    });

    /**
     * The devices of the catalog available to be added: not in the set yet, and by
     * width falling strictly between the edges.
     *
     * A list rather than one prepared entry: the device is picked by a person out of
     * a menu instead of being substituted silently — otherwise "Add" on a set of
     * three would have exactly one possible outcome, which a person would learn
     * about after the fact.
     */
    const availableChoices = computed<IBricksDeviceChoice[]>(() => {
        const occupied = new Set(draft.value.map((device) => device.key));

        return DEVICE_CHOICES.filter(
            (choice) =>
                !occupied.has(choice.key) &&
                choice.width > bounds.value.min &&
                choice.width < bounds.value.max
        );
    });

    const canAdd = computed<boolean>(
        () =>
            isCustom.value &&
            draft.value.length < DEVICE_SET_MAX &&
            availableChoices.value.length > 0
    );

    const hasErrors = computed<boolean>(() =>
        rows.value.some((row) => row.widthError || row.labelError)
    );

    /**
     * Saving is available only when the draft passes the same contract as the
     * server's.
     *
     * The per-field errors are not enough: they cover neither the rem fields nor the
     * order of the array, and a set that passed only them would travel into the form
     * and would fail with a 400 on the save of the page — by which time the modal is
     * closed and there is nowhere to show the error.
     */
    const canSave = computed<boolean>(
        () => !hasErrors.value && (!isCustom.value || validateDeviceSet(sortedDevices.value).ok)
    );
    // #endregion

    // #region Methods
    /**
     * Checks the width of a device against the rules of the design.
     *
     * @param device - The record being checked.
     * @param index - The position of the record in the set.
     * @returns The error text, or an empty string.
     */
    function validateWidth(device: { key: string; width: number }, index: number): string {
        const devices = shownDevices.value;

        if (!Number.isInteger(device.width) || device.width < DEVICE_MIN_WIDTH) {
            return t('bricks.devices.errors.widthMin', { min: DEVICE_MIN_WIDTH });
        }

        if (device.width > DEVICE_MAX_WIDTH) {
            return t('bricks.devices.errors.widthMax', { max: DEVICE_MAX_WIDTH });
        }

        const duplicate = devices.find(
            (other, otherIndex) => otherIndex !== index && other.width === device.width
        );

        if (duplicate) {
            return t('bricks.devices.errors.widthTaken', { label: duplicate.label });
        }

        const isEdge = device.key === NARROW_DEVICE_KEY || device.key === BASE_DEVICE_KEY;

        // The edges are obliged to stay the edges: the mobile no wider than any
        // intermediate device, the desktop no narrower
        if (isEdge && bounds.value.min >= bounds.value.max) {
            return t('bricks.devices.errors.edgeOrder');
        }

        if (!isEdge && (device.width <= bounds.value.min || device.width >= bounds.value.max)) {
            // The labels of the edges come by KEYS, like the bounds themselves:
            // the list is re-sorted by width, and a positional `devices[0]` would
            // name the wrong device to the error at exactly the moment the order is
            // broken
            return t('bricks.devices.errors.widthBetween', {
                min: bounds.value.min,
                minLabel: bounds.value.minLabel,
                max: bounds.value.max,
                maxLabel: bounds.value.maxLabel,
            });
        }

        return '';
    }

    /**
     * Turns the page's own set on or off.
     *
     * @param value - The new position of the switch.
     */
    function setCustom(value: boolean): void {
        // The copy is taken BEFORE the flag is switched: `shownDevices` looks at it
        // and after the switch would return the empty draft already — the set would
        // be copying itself into itself
        if (value && draft.value.length === 0) {
            draft.value = shownDevices.value.map((device) => ({ ...device }));
        }

        isCustom.value = value;
    }

    /**
     * Edits a field of a device in the draft.
     *
     * @param key - Device key.
     * @param patch - The fields being changed.
     */
    function updateDevice(key: string, patch: Partial<IPublishDeviceRow>): void {
        draft.value = draft.value.map((device) =>
            device.key === key ? { ...device, ...patch } : device
        );
    }

    /**
     * Adds the picked device of the catalog.
     *
     * The key comes from the catalog and never changes afterwards: the label is
     * edited freely, while recomputing the key would orphan every
     * `props.responsive[key]` of the blocks. The uniqueness of the key is guaranteed
     * by the pick itself — the devices already taken are not shown in the menu.
     *
     * @param key - The key of the catalog device.
     */
    function addDevice(key: string): void {
        const choice = availableChoices.value.find((item) => item.key === key);

        if (!canAdd.value || !choice) {
            return;
        }

        // The new row takes its place by width right away: a rearrangement is safe
        // here, the cursor is neither over the table nor in an input at that moment
        // — a person has just picked the device in the menu
        draft.value = [
            ...draft.value,
            {
                key: choice.key,
                label: choice.label,
                icon: choice.icon,
                width: choice.width,
                aside: choice.aside,
                ...(choice.maxWidth === undefined ? {} : { maxWidth: choice.maxWidth }),
            },
        ].sort((a, b) => a.width - b.width);
    }

    /**
     * Removes an intermediate device from the draft.
     *
     * @param key - Device key.
     */
    function removeDevice(key: string): void {
        if (key === NARROW_DEVICE_KEY || key === BASE_DEVICE_KEY) {
            return;
        }

        draft.value = draft.value.filter((device) => device.key !== key);
    }

    /**
     * Builds the value for the publish form.
     *
     * The set is handed over sorted regardless of the order of the rows: the
     * rearrangement is postponed until the typing is over, while the server rejects
     * an unsorted array.
     *
     * @returns The set of the page, or `null` (inheriting the set of the project).
     */
    function toFormValue(): TBricksPageDeviceSet | null {
        return isCustom.value ? cloneDeviceSet(sortedDevices.value) : null;
    }
    // #endregion

    // #region Lifecycle
    /**
     * Rebuilds the draft out of the set of the page.
     */
    function resetDraft(): void {
        const config = options.initial();

        isCustom.value = config !== null;
        draft.value = config ? config.map((device) => ({ ...device })) : [];
    }

    /**
     * The draft is rebuilt on EVERY opening of the modal rather than only on a
     * change of the set.
     *
     * The modal stays mounted in both of its parents, so "edited a width, hit
     * Cancel, opened it again" used to show the previous unsaved edits: there was
     * nothing for the cancelling to undo, and the watcher on `initial` did not fire
     * — the saved set had not changed.
     */
    // `flush: 'sync'` — the draft is obliged to be fresh before the first render of
    // the rows, otherwise the frame shows the previous edits
    watch(
        options.isOpen,
        (isOpen) => {
            if (isOpen) {
                resetDraft();
            }
        },
        { flush: 'sync' }
    );

    // A change of the set from the outside (a page being switched in the builder, a
    // draft being restored) has to reach the modal too
    watch(options.initial, resetDraft, { immediate: true });
    // #endregion

    return {
        isCustom,
        rows,
        ranges,
        availableChoices,
        canAdd,
        canSave,
        addDevice,
        removeDevice,
        updateDevice,
        setCustom,
        toFormValue,
    };
}
