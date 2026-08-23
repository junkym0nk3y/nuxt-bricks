<script setup lang="ts">
/**
 * @description A device row of the set editor: the glyph, the label, the width and the
 * three rem fields, plus the removal of an intermediate device.
 *
 * Decisions held by the style section: the cells are centered rather than aligned to
 * the top — they share a height (a 3.6rem field, a 3.6rem icon button, a 3.2rem lock),
 * and aligned to the top the lock and the cross sat higher than the row of values. The
 * cross appears on hover over the row and reaches the dangerous color only on hover
 * over the cross itself: a removal is a destructive action. The glyph is 1.6rem by the
 * design — with no explicit size the icon inherited the font size of the surrounding
 * text and dangled in the middle of its 3.2rem box as a small dot.
 */

// #region Imports
// Types
import type { IPublishDeviceRow } from '../types/devices';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BuilderPublishDeviceIconPopover from './BuilderPublishDeviceIconPopover.vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        row: IPublishDeviceRow;
        disabled?: boolean;
    }>(),
    { disabled: false }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    update: [key: string, patch: Partial<IPublishDeviceRow>];
    remove: [key: string];
}>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Passes an edit of the device label upwards.
 *
 * The key does not change with it: it was built when the row was created, and
 * recomputing it would orphan the block overrides bound to the previous key.
 *
 * @param value - The new label.
 */
function handleLabel(value: string): void {
    emit('update', props.row.key, { label: value });
}

/**
 * Passes an edit of the device width upwards.
 *
 * @param value - The new value of the field.
 */
function handleWidth(value: string): void {
    emit('update', props.row.key, { width: Number.parseInt(value, 10) });
}

/**
 * Passes an edit of a rem field upwards.
 *
 * An empty field of `maxWidth`/`minWidth` is a legitimate "not set": in the CSS
 * such properties are simply not written, so the value is dropped rather than
 * zeroed.
 *
 * @param field - Field name.
 * @param value - The new value of the field.
 */
function handleRem(field: 'aside' | 'maxWidth' | 'minWidth', value: string): void {
    const trimmed = value.trim();

    if (!trimmed && field !== 'aside') {
        emit('update', props.row.key, { [field]: undefined });
        return;
    }

    emit('update', props.row.key, { [field]: Number.parseFloat(trimmed) || 0 });
}

/**
 * Asks for the device to be removed.
 */
function handleRemove(): void {
    emit('remove', props.row.key);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDeviceRow">
        <div :class="$style.device">
            <BuilderPublishDeviceIconPopover
                :icon="props.row.icon"
                :disabled="props.disabled"
                @update:icon="(icon: string) => emit('update', props.row.key, { icon })"
            />
            <BricksInput
                :value="props.row.label"
                :disabled="props.disabled"
                :error-message="props.row.labelError"
                :aria-label="t('bricks.devices.columns.device')"
                @update:value="handleLabel"
            />
        </div>

        <BricksInput
            :value="props.row.width"
            type="number"
            :step="1"
            :disabled="props.disabled"
            :error-message="props.row.widthError"
            :aria-label="t('bricks.devices.columns.width')"
            @update:value="handleWidth"
        />

        <BricksInput
            :value="props.row.aside"
            type="number"
            :step="0.2"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.columns.aside')"
            @update:value="(value: string) => handleRem('aside', value)"
        />

        <BricksInput
            :value="props.row.maxWidth ?? ''"
            type="number"
            :step="0.2"
            placeholder="—"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.columns.maxWidth')"
            @update:value="(value: string) => handleRem('maxWidth', value)"
        />

        <BricksInput
            :value="props.row.minWidth ?? ''"
            type="number"
            :step="0.2"
            placeholder="—"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.columns.minWidth')"
            @update:value="(value: string) => handleRem('minWidth', value)"
        />

        <span v-if="props.row.isLocked" :class="$style.lock" :title="t('bricks.devices.locked')">
            <BricksIcon icon="ta:outline-lock" />
        </span>
        <BricksIconButton
            v-else
            variant="ghost"
            size="lg"
            icon="ta:outline-x"
            :label="t('bricks.devices.remove', { label: props.row.label })"
            danger
            :disabled="props.disabled"
            @click="handleRemove"
        />
    </div>
</template>

<style module lang="scss">
.BuilderPublishDeviceRow {
    display: grid;
    grid-template-columns: 23.6rem 9.6rem 9.6rem 9.6rem 9.6rem 3.2rem;
    align-items: center;
    gap: 1.2rem;
    padding: 0.8rem 0;

    &:hover .remove {
        color: var(--bricks-base-500);
    }
}

.device {
    display: flex;
    align-items: center;
    height: 3.6rem;
    gap: 0.8rem;
}

.lock {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    font-size: 1.6rem;
    color: var(--bricks-base-300);
}
</style>
