<script setup lang="ts">
// #region Imports
// Types
import type { IBricksSelectProps, IBricksSelectEmits } from './types.d.ts';
import type { IBrickDemoValues } from '../../common/types/index';

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
// #endregion

// #region Options
defineOptions({
    inheritAttrs: false,
});
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSelectProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksSelectEmits>();
// #endregion

// #region Data
const $style = useCssModule();
const isOpened = ref(false);
// #endregion

// #region Computed
/**
 * Select заблокирован, если передан disabled или список опций пуст.
 */
const isDisabled = computed(() => toValue(props.disabled) || toValue(props.specs)?.length === 0);

/**
 * Возвращает label выбранной опции для отображения в триггере.
 */
const selectedLabel = computed(
    () => props.specs.find((spec) => props.value === spec.value)?.label ?? ''
);

/**
 * Классы состояния, совместимые с прежней разметкой.
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
 * Обрабатывает выбор опции и пробрасывает значение наружу.
 *
 * @param value - Значение выбранной опции.
 */
function onUpdate(value: AcceptableValue): void {
    emit('update:value', (value ?? null) as IBrickDemoValues | null);
}
// #endregion
</script>

<template>
    <SelectRoot
        :model-value="(props.value as AcceptableValue)"
        :disabled="isDisabled"
        @update:model-value="onUpdate"
        @update:open="isOpened = $event"
    >
        <div :class="[$style.BricksSelect, classList]">
            <SelectTrigger :class="$style.field">
                <SelectValue :class="$style.nativeInput">{{ selectedLabel }}</SelectValue>
            </SelectTrigger>
        </div>

        <SelectPortal>
            <SelectContent :class="$style.dropdown" position="popper" :side-offset="4">
                <SelectViewport class="scrollbox" :class="$style.optionsWrapper">
                    <SelectItem
                        v-for="(spec, index) in props.specs"
                        :key="`${index}_${spec.value}`"
                        :value="(spec.value as AcceptableValue)"
                        :disabled="!props.facets.includes(spec.value)"
                        :class="$style.listItem"
                    >
                        <SelectItemText>{{ spec.label }}</SelectItemText>
                    </SelectItem>
                </SelectViewport>
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
        display: block;
        width: 100%;
        padding: 0;
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;

        &:after {
            content: '';
            position: absolute;
            top: calc(50% - 0.4rem);
            right: 0.4rem;
            width: 0;
            height: 0;
            border: 0.4rem solid transparent;
            border-top-color: currentcolor;
            transform: translateY(-25%);
            transition:
                color 0.2s ease,
                transform 0.2s ease;
            pointer-events: none;
        }
    }

    .nativeInput {
        overflow: hidden;
        display: inline-block;
        width: 100%;
        padding-bottom: 1rem;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 1.4rem;
        font-weight: 500;
        line-height: 1;
        color: var(--bricks-base-900);
        transition:
            color var(--default-transition),
            opacity var(--default-transition),
            background var(--default-transition);
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
            pointer-events: none;
        }
    }

    &._opened .field {
        border-color: var(--bricks-base-900);

        &:after {
            color: var(--bricks-base-300);
            transform: translateY(-80%) rotate(180deg);
        }
    }

    &._empty .nativeInput {
        color: var(--bricks-base-300);
    }

    &:after {
        content: '';
        position: absolute;
        bottom: -0.2rem;
        left: 0;
        width: 100%;
        height: 1px;
        background-color: var(--bricks-base-300);
    }
}

.dropdown {
    z-index: 100;
    width: var(--reka-select-trigger-width);
    padding: 0.8rem 0;
    border-radius: 1.2rem;
    background: var(--bricks-base-0);
    color: var(--bricks-base-900);
    box-shadow: var(--shadow-md);
}

.optionsWrapper {
    max-height: 28.8rem;
}

.listItem {
    margin: 0 0.6rem 0.6rem 0.6rem;
    padding: 1rem 2.4rem;
    border-radius: var(--border-radius-sm);
    background-color: transparent;
    outline: none;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 1.2rem;
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;
    user-select: none;

    @media (width <= 1024px) {
        margin: 0;
    }

    &[data-highlighted],
    &[data-state='checked'] {
        border-radius: var(--border-radius-sm);
        background-color: var(--bricks-base-300);
    }

    &[data-disabled] {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }
}
</style>
