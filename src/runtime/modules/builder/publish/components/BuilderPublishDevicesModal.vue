<script setup lang="ts">
/**
 * @description The "Page devices" modal: the switch of the page's own set, the table
 * of the devices, the scale of the ranges and the two confirmations of destructive
 * changes.
 *
 * Decisions held by the markup: `true-value`/`false-value` on the switch are
 * mandatory — by default both of them equal `false` on the kit switch, and the toggle
 * works inverted.
 *
 * Decisions held by the style section: the 0.8rem gap between the header, the rows
 * and the add button comes from the design — pressed together the rows read as one
 * block. The column labels are lifted into a header row so that the values are read
 * top to bottom down a column instead of being hunted for anew in every row.
 */

// #region Imports
// Types
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { IPublishDeviceRow } from '../types/devices';
import type { IPublishDevicesModalEmits, IPublishDevicesModalProps } from '../types/dashboard';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishDeviceSet } from '../composables/usePublishDeviceSet';

// Constants
import { DEVICE_SET_MAX } from '../../../common/constants/devices';

// Utils
import { countDeviceOverrides, describeAbsorbedRange } from '../utils/deviceImpact';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BuilderPublishDeviceAddMenu from './BuilderPublishDeviceAddMenu.vue';
import BuilderPublishDeviceRanges from './BuilderPublishDeviceRanges.vue';
import BuilderPublishDeviceRow from './BuilderPublishDeviceRow.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDevicesModalProps>(), {
    layer: 'modal',
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDevicesModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const {
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
} = usePublishDeviceSet({
    isOpen: () => props.isOpen,
    initial: () => props.viewportConfig,
    projectDevices: () => props.projectDevices,
    activeDeviceKey: () => props.activeDeviceKey,
});

/** The key of the device the removal confirmation is open for */
const pendingRemovalKey = ref<string | null>(null);

/** The confirmation of the return to the project set is open */
const isRevertConfirmOpen = ref(false);

// The confirmations must not outlive the closing of the modal: opened again, it
// would show the removal dialog of a device the person is no longer choosing
watch(
    () => props.isOpen,
    (isOpen) => {
        if (isOpen) {
            pendingRemovalKey.value = null;
            isRevertConfirmOpen.value = false;
        }
    }
);
// #endregion

// #region Computed
// The counter counts the rows rather than the ability to add: with the switch off
// adding is not allowed, but "4 of 4 — the maximum" on a set of three is simply a lie
const addLabel = computed(() =>
    rows.value.length >= DEVICE_SET_MAX
        ? t('bricks.devices.addMaxReached', { max: DEVICE_SET_MAX })
        : t('bricks.devices.addCounter', { current: rows.value.length, max: DEVICE_SET_MAX })
);

/**
 * The text of the removal confirmation: how many overrides will disappear and which
 * device the freed range goes to.
 */
const removalDescription = computed<string>(() => {
    const key = pendingRemovalKey.value;

    if (!key) {
        return '';
    }

    const absorbed = describeAbsorbedRange(
        rows.value.map(({ key: deviceKey, label, width }) => ({ key: deviceKey, label, width })),
        key
    );

    return t('bricks.devices.removeConfirm.description', {
        count: countDeviceOverrides(props.schemaComponents, key),
        range: absorbed.range,
        label: absorbed.label,
    });
});

const pendingRemovalLabel = computed<string>(
    () => rows.value.find((row) => row.key === pendingRemovalKey.value)?.label ?? ''
);
// #endregion

// #region Methods
/**
 * Toggles the page's own set.
 *
 * Turning it off is a destructive action (some of the overrides will be gone), so it
 * goes through a confirmation; turning it on merely copies the set of the project.
 *
 * @param value - The new position of the switch.
 */
function handleToggleCustom(value: boolean | string): void {
    if (value === false && isCustom.value) {
        isRevertConfirmOpen.value = true;
        return;
    }

    setCustom(Boolean(value));
}

/**
 * Asks for a device to be removed.
 *
 * @param key - Device key.
 */
function handleRequestRemove(key: string): void {
    pendingRemovalKey.value = key;
}

/**
 * Confirms the removal of the device.
 */
function handleConfirmRemove(): void {
    if (pendingRemovalKey.value) {
        removeDevice(pendingRemovalKey.value);
    }

    pendingRemovalKey.value = null;
}

/**
 * Confirms the return to the set of the project.
 */
function handleConfirmRevert(): void {
    setCustom(false);
    isRevertConfirmOpen.value = false;
}

/**
 * Edits a field of a device.
 *
 * @param key - Device key.
 * @param patch - The fields being changed.
 */
function handleUpdate(key: string, patch: Partial<IPublishDeviceRow>): void {
    updateDevice(key, patch);
}

/**
 * Hands the set upwards and closes the modal.
 *
 * Saving commits the set into the state of the editor rather than writing to the
 * server: the schema and the set travel together in the shared save of the page —
 * otherwise a point PATCH would slip past the snapshot of the version.
 */
function handleSave(): void {
    if (!canSave.value) {
        return;
    }

    const value: TBricksPageDeviceSet | null = toFormValue();

    emit('save', value);
    emit('close');
}
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :layer="props.layer"
        :title="t('bricks.devices.title')"
        padded
        @close="emit('close')"
    >
        <div :class="$style.BuilderPublishDevicesModal">
            <BricksModalHeader @close="emit('close')" />

            <div :class="$style.body">
                <div :class="$style.inherit">
                    <div :class="$style.inheritText">
                        <span :class="$style.inheritTitle">{{ t('bricks.devices.ownTitle') }}</span>
                        <span :class="$style.inheritHint">
                            {{
                                isCustom
                                    ? t('bricks.devices.ownHintOn', { count: rows.length })
                                    : t('bricks.devices.ownHintOff', { count: rows.length })
                            }}
                        </span>
                    </div>
                    <BricksSwitch
                        :value="isCustom"
                        :true-value="true"
                        :false-value="false"
                        true-label=""
                        false-label=""
                        @update:value="handleToggleCustom"
                    />
                </div>

                <div :class="$style.table">
                    <div :class="$style.columns">
                        <span>{{ t('bricks.devices.columns.device') }}</span>
                        <span>{{ t('bricks.devices.columns.width') }}</span>
                        <span>{{ t('bricks.devices.columns.aside') }}</span>
                        <span>{{ t('bricks.devices.columns.maxWidth') }}</span>
                        <span>{{ t('bricks.devices.columns.minWidth') }}</span>
                        <span />
                    </div>

                    <BuilderPublishDeviceRow
                        v-for="row in rows"
                        :key="row.key"
                        :row="row"
                        :disabled="!isCustom"
                        @update="handleUpdate"
                        @remove="handleRequestRemove"
                    />

                    <BuilderPublishDeviceAddMenu
                        :choices="availableChoices"
                        :counter="addLabel"
                        :disabled="!canAdd"
                        @select="addDevice"
                    />
                </div>

                <BuilderPublishDeviceRanges :ranges="ranges" />
            </div>

            <BricksModalFooter>
                <BricksButton variant="ghost" @click="emit('close')">
                    {{ t('bricks.common.cancel') }}
                </BricksButton>
                <BricksButton variant="primary" :disabled="!canSave" @click="handleSave">
                    {{ t('bricks.common.save') }}
                </BricksButton>
            </BricksModalFooter>
        </div>
    </BricksModal>

    <BricksConfirmModal
        :is-open="pendingRemovalKey !== null"
        :title="t('bricks.devices.removeConfirm.title', { label: pendingRemovalLabel })"
        :description="removalDescription"
        :confirm-text="t('bricks.common.delete')"
        confirm-variant="danger"
        @close="pendingRemovalKey = null"
        @confirm="handleConfirmRemove"
    />

    <BricksConfirmModal
        :is-open="isRevertConfirmOpen"
        :title="t('bricks.devices.revertConfirm.title')"
        :description="t('bricks.devices.revertConfirm.description')"
        :confirm-text="t('bricks.common.delete')"
        confirm-variant="danger"
        @close="isRevertConfirmOpen = false"
        @confirm="handleConfirmRevert"
    />
</template>

<style module lang="scss">
.BuilderPublishDevicesModal {
    display: flex;
    flex-direction: column;
    width: 76rem;
    max-width: 100%;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.body {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
}

.inherit {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-surface-raised);
    gap: 1.6rem;
}

.inheritText {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.inheritTitle {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.inheritHint {
    font-size: 1.1rem;
    color: var(--bricks-base-500);
}

.table {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.columns {
    display: grid;
    text-transform: uppercase;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-500);
    grid-template-columns: 23.6rem 9.6rem 9.6rem 9.6rem 9.6rem 3.2rem;
    gap: 1.2rem;
}
</style>
