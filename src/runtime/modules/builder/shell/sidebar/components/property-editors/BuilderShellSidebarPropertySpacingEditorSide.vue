<script setup lang="ts">
// #region Imports
// Types
import type { ISidebarPropertySpacingEditorSideProps } from '../../types/sidebarProperties';

// Utils
import { formatSpacingValue } from '../../composables/useSpacingEditor';

// Vue
import { useI18n } from 'vue-i18n';
// #endregion

// #region Interfaces
interface IEmits {
    step: [direction: 1 | -1];
    'start-edit': [];
    'commit-edit': [];
    'cancel-edit': [];
    'update:editingValue': [value: string];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertySpacingEditorSideProps>(), {
    isEditing: false,
    editingValue: '',
    vertical: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Localized caption of the side, used by the aria attributes.
 *
 * @returns Localized caption.
 */
function sideLabel(): string {
    return t(`bricks.properties.spacing.sides.${props.item.side}`);
}

/**
 * Forwards the text of the inline input upwards (v-model:editing-value).
 *
 * @param event - Input event of the native input.
 */
function onEditingInput(event: Event): void {
    emit('update:editingValue', (event.target as HTMLInputElement).value);
}

/**
 * Focuses the inline input and selects its text as soon as it appears.
 *
 * @param el - Element from the function ref.
 */
function focusInput(el: unknown): void {
    if (el instanceof HTMLInputElement && document.activeElement !== el) {
        el.focus();
        el.select();
    }
}
// #endregion
</script>

<template>
    <div
        v-if="props.item.kind === 'stepper'"
        :class="[
            $style.BuilderShellSidebarPropertySpacingEditorSide,
            props.vertical && $style._vertical,
        ]"
    >
        <button
            type="button"
            :class="$style.stepBtn"
            :disabled="props.item.variant.disabled"
            :aria-label="t('bricks.properties.spacing.decrease', { side: sideLabel() })"
            @click="emit('step', -1)"
        >
            −
        </button>
        <input
            v-if="props.isEditing"
            :ref="focusInput"
            :value="props.editingValue"
            :class="$style.valueInput"
            :aria-label="sideLabel()"
            @input="onEditingInput"
            @blur="emit('commit-edit')"
            @keydown.enter="emit('commit-edit')"
            @keydown.esc="emit('cancel-edit')"
        />
        <button
            v-else
            type="button"
            :class="$style.valueBtn"
            :aria-label="sideLabel()"
            @click="emit('start-edit')"
        >
            {{ formatSpacingValue(props.item.value) }}
        </button>
        <button
            type="button"
            :class="$style.stepBtn"
            :disabled="props.item.variant.disabled"
            :aria-label="t('bricks.properties.spacing.increase', { side: sideLabel() })"
            @click="emit('step', 1)"
        >
            +
        </button>
    </div>
    <span
        v-else
        :class="$style.mirrorChip"
        :aria-label="t('bricks.properties.spacing.mirrored', { side: sideLabel() })"
    >
        {{ formatSpacingValue(props.item.value) }}
    </span>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertySpacingEditorSide {
    display: flex;
    align-items: center;
    gap: 0.2rem;

    &._vertical {
        flex-direction: column;
    }
}

.stepBtn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.4rem;
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    font-size: 1.2rem;
    line-height: 1;
    color: var(--bricks-base-600);
    transition:
        border-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    user-select: none;

    &:hover:not(:disabled) {
        border-color: var(--bricks-base-400);
        color: var(--bricks-base-900);
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
}

.valueBtn {
    min-width: 3.6rem;
    height: 2rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid transparent;
    background: none;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
    transition: border-color var(--bricks-default-transition);
    cursor: text;
    font-variant-numeric: tabular-nums;

    &:hover {
        border-color: var(--bricks-base-200);
    }
}

.valueInput {
    width: 4.4rem;
    height: 2rem;
    padding: 0 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid var(--bricks-primary);
    background-color: var(--bricks-base-0);
    outline: none;
    text-align: center;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
    font-variant-numeric: tabular-nums;
}

.mirrorChip {
    font-size: 1.2rem;
    font-variant-numeric: tabular-nums;
    color: var(--bricks-base-500);
    opacity: 0.5;
    user-select: none;
}
</style>
