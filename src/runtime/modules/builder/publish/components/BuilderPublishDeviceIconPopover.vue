<script setup lang="ts">
/**
 * @description The picker of a device glyph: a trigger with the current glyph and a
 * popover with the catalog.
 *
 * One decision is held by the style section: the glyph is 2rem by the design — with no
 * explicit size it inherited the font size of the text (1.4rem) and got lost inside
 * the 3.6rem button.
 */

// #region Imports
// Types
import type {
    IPublishDeviceIconPopoverEmits,
    IPublishDeviceIconPopoverProps,
} from '../types/devices';

// Vue
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import { DEVICE_ICON_CHOICES } from '../../../common/constants/devices';

// Utils
import { resolveDeviceIcon } from '../../../common/utils/bricks/devices';

// Components
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDeviceIconPopoverProps>(), { disabled: false });
// #endregion

// #region Emits
const emit = defineEmits<IPublishDeviceIconPopoverEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const isOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);
// #endregion

// #region Computed
const choices = computed(() =>
    DEVICE_ICON_CHOICES.map((choice) => ({
        value: choice,
        glyph: resolveDeviceIcon(choice),
        isSelected: choice === props.icon,
    }))
);
// #endregion

// #region Methods
/**
 * Opens or closes the glyph picker popover.
 */
function handleToggle(): void {
    if (props.disabled) {
        return;
    }

    isOpen.value = !isOpen.value;
}

/**
 * Picks a glyph and closes the popover.
 *
 * @param value - The short key of the glyph.
 */
function handleSelect(value: string): void {
    emit('update:icon', value);
    isOpen.value = false;
}

/**
 * Closes the popover on a click outside its area.
 *
 * @param event - Pointer event.
 */
function handleOutside(event: MouseEvent): void {
    if (isOpen.value && !rootRef.value?.contains(event.target as Node)) {
        isOpen.value = false;
    }
}

/**
 * Closes the popover on Escape without letting the event close the modal itself.
 *
 * @param event - Keyboard event.
 */
function handleEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen.value) {
        event.stopPropagation();
        isOpen.value = false;
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape, true);
});

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleOutside);
    document.removeEventListener('keydown', handleEscape, true);
});
// #endregion
</script>

<template>
    <div ref="rootRef" :class="$style.BuilderPublishDeviceIconPopover">
        <button
            type="button"
            :class="[$style.trigger, { [$style.triggerOpen]: isOpen }]"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.iconPicker')"
            :aria-expanded="isOpen"
            @click="handleToggle"
        >
            <BricksIcon :icon="resolveDeviceIcon(props.icon)" />
        </button>

        <BricksPopoverSurface
            v-if="isOpen"
            density="roomy"
            layer="local"
            :class="$style.popover"
            role="listbox"
        >
            <button
                v-for="choice in choices"
                :key="choice.value"
                type="button"
                role="option"
                :aria-selected="choice.isSelected"
                :class="[$style.choice, { [$style.choiceSelected]: choice.isSelected }]"
                @click="handleSelect(choice.value)"
            >
                <BricksIcon :icon="choice.glyph" />
            </button>
        </BricksPopoverSurface>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDeviceIconPopover {
    position: relative;
}

.trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-control);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 2rem;
    color: var(--bricks-base-600);
    transition: var(--bricks-default-transition);
    cursor: pointer;

    &:hover:not(:disabled) {
        border-color: var(--bricks-base-300);
    }

    &:disabled {
        color: var(--bricks-base-400);
        cursor: default;
    }
}

.triggerOpen {
    border-color: var(--bricks-primary-default);
}

.popover {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    display: grid;
    grid-template-columns: repeat(4, 3.6rem);
    gap: 0.4rem;
}

.choice {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-control);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 2rem;
    color: var(--bricks-base-600);
    transition: var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-base-300);
    }
}

.choiceSelected {
    border-color: var(--bricks-primary-default);
    background: var(--bricks-primary-50);
    color: var(--bricks-primary-default);
}
</style>
