<script setup lang="ts">
/**
 * @description Select field: a reka select with the kit's own trigger and
 * dropdown surface.
 *
 * The label arrives as a prop rather than as an attribute: attribute inheritance
 * is off (`inheritAttrs: false`) and the component root is not a DOM node, so an
 * outer `aria-label` has nowhere to land anyway. An empty value creates no
 * attribute: `aria-label=""` gives no name while stopping the browser from taking
 * one from other sources. That the callers actually pass it is guarded by
 * `test/module/accessibleNameUsages.spec.ts`.
 *
 * The dropdown content is composed through `as-child`: the surface node and the
 * reka node are one and the same, otherwise the positioning and `data-state`
 * would end up on the outer wrapper and the look on the inner one.
 *
 * Two style decisions the CSS no longer explains. The field is flex, not block:
 * the caption inside is an inline element, and its line box picked up the height
 * of the parent's strut plus the baseline's descender gap, which made the field
 * 39 against `BricksInput`'s 36 and left the text above center; with flex the
 * height is computed from the padding and the line, as in an input. And the
 * visible part of the chevron triangle is the upper half of its `0.8rem` box, so
 * it is centered with `translateY(25%)` downwards rather than by the box center.
 */

// #region Imports
// Types
import type { IBricksSelectProps, IBricksSelectEmits } from './types.d.ts';
import type { TBrickDemoValues } from '../../common/types/index';

// Vue
import { computed, ref, toValue, useCssModule } from 'vue';

// Reka UI
import {
    SelectRoot,
    SelectTrigger,
    SelectValue,
    SelectPortal,
    SelectContent,
    SelectViewport,
    SelectItem,
    SelectItemText,
    type AcceptableValue,
} from 'reka-ui';

// Components
import BricksPopoverSurface from '../base/popover/BricksPopoverSurface.vue';
// #endregion

// #region Options
defineOptions({
    inheritAttrs: false,
});
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSelectProps>(), {
    disabled: false,
    ariaLabel: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksSelectEmits>();
// #endregion

// #region Data
const $style = useCssModule();
const isOpened = ref(false);

/**
 * Reka UI forbids a SelectItem with value === '' (the empty string is reserved
 * for clearing the selection). Empty option values ("Default" and the like) are
 * swapped for a sentinel inside the select and turned back into '' on the way out.
 */
const EMPTY_VALUE_SENTINEL = '__bricks-select-empty__';
// #endregion

// #region Computed
/**
 * The select is blocked if `disabled` was passed or the option list is empty.
 */
const isDisabled = computed(() => toValue(props.disabled) || toValue(props.specs)?.length === 0);

/**
 * Returns the label of the selected option for display in the trigger.
 */
const selectedLabel = computed(
    () => props.specs.find((spec) => props.value === spec.value)?.label ?? ''
);

/**
 * State classes, compatible with the previous markup.
 */
const classList = computed(() => [
    {
        [$style._opened]: isOpened.value,
        [$style._disabled]: isDisabled.value,
        [$style._empty]: !selectedLabel.value,
    },
]);
// #endregion

// #region Methods
/**
 * Swaps an empty string for the sentinel value Reka UI needs.
 *
 * @param value - External option value.
 */
function toInternalValue(value: unknown): AcceptableValue {
    return (value === '' ? EMPTY_VALUE_SENTINEL : value) as AcceptableValue;
}

/**
 * Handles the option choice and passes the value outwards, turning the sentinel
 * back into an empty string.
 *
 * @param value - Value of the selected option.
 */
function onUpdate(value: AcceptableValue): void {
    const external = value === EMPTY_VALUE_SENTINEL ? '' : value;
    emit('update:value', (external ?? null) as TBrickDemoValues | null);
}
// #endregion
</script>

<template>
    <SelectRoot
        :model-value="toInternalValue(props.value)"
        :disabled="isDisabled"
        @update:model-value="onUpdate"
        @update:open="isOpened = $event"
    >
        <div :class="[$style.BricksSelect, classList]">
            <SelectTrigger :class="$style.field" :aria-label="props.ariaLabel || undefined">
                <SelectValue :class="$style.nativeInput">{{ selectedLabel }}</SelectValue>
            </SelectTrigger>
        </div>

        <SelectPortal>
            <SelectContent as-child position="popper" :side-offset="4">
                <BricksPopoverSurface :class="$style.dropdown">
                    <SelectViewport class="bricks-scrollbox" :class="$style.optionsWrapper">
                        <SelectItem
                            v-for="(spec, index) in props.specs"
                            :key="`${index}_${spec.value}`"
                            :value="toInternalValue(spec.value)"
                            :disabled="!props.facets.includes(spec.value)"
                            :class="$style.listItem"
                        >
                            <SelectItemText>{{ spec.label }}</SelectItemText>
                        </SelectItem>
                    </SelectViewport>
                </BricksPopoverSurface>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>

<style lang="scss" module>
.BricksSelect {
    position: relative;
    user-select: none;

    .field {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0.8rem 3.2rem 0.8rem 1.2rem;
        border-radius: var(--bricks-border-radius-xs);
        border: 1px solid var(--bricks-base-300);
        background: transparent;
        text-align: left;
        transition:
            border-color var(--bricks-default-transition),
            background-color var(--bricks-default-transition),
            box-shadow var(--bricks-default-transition);
        cursor: pointer;

        &:hover {
            border-color: var(--bricks-base-400);
            background-color: var(--bricks-surface-raised);
        }

        &:after {
            content: '';
            position: absolute;
            top: calc(50% - 0.4rem);
            right: 1.2rem;
            width: 0;
            height: 0;
            border: 0.4rem solid transparent;
            border-top-color: currentcolor;
            color: var(--bricks-base-900);
            transform: translateY(25%);
            transition:
                color 0.2s ease,
                transform 0.2s ease;
            pointer-events: none;
        }
    }

    .nativeInput {
        overflow: hidden;
        display: block;
        width: 100%;
        min-width: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 1.4rem;
        font-weight: 500;
        line-height: 1.8rem;
        color: var(--bricks-base-900);
        transition:
            color var(--bricks-default-transition),
            opacity var(--bricks-default-transition),
            background var(--bricks-default-transition);
        cursor: pointer;
        user-select: none;

        @media (width <= 1024px) {
            font-size: 1.6rem;
        }
    }

    &._disabled {
        cursor: not-allowed;

        .nativeInput {
            color: var(--bricks-base-300);
            -webkit-text-fill-color: var(--bricks-base-300);
            opacity: 1;
        }

        .field {
            background-color: var(--bricks-base-50);
            pointer-events: none;
        }
    }

    &._opened .field {
        border-color: var(--bricks-primary);
        background-color: var(--bricks-surface-raised);
        box-shadow: var(--bricks-shadow-focus);

        &:after {
            color: var(--bricks-base-400);
            transform: translateY(-25%) rotate(180deg);
        }
    }

    &._empty .nativeInput {
        color: var(--bricks-text-muted);
    }
}

.dropdown {
    width: var(--reka-select-trigger-width);
    color: var(--bricks-base-900);
}

.optionsWrapper {
    max-height: 28.8rem;
}

.listItem {
    margin: 0 0 0.2rem;
    padding: 0.8rem 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    background-color: transparent;
    outline: none;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.4rem;
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    user-select: none;

    &:last-child {
        margin-bottom: 0;
    }

    &[data-highlighted] {
        background-color: var(--bricks-base-100);
    }

    &[data-state='checked'] {
        background-color: var(--bricks-primary-50);
        color: var(--bricks-primary);
    }

    &[data-disabled] {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }
}
</style>
