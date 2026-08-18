<script setup lang="ts">
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
 * Reka UI запрещает SelectItem с value === '' (пустая строка зарезервирована
 * под сброс выбора). Пустые значения опций ('По-умолчанию' и т.п.) подменяем
 * sentinel-значением внутри селекта и возвращаем '' наружу при выборе.
 */
const EMPTY_VALUE_SENTINEL = '__bricks-select-empty__';
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
 * Подменяет пустую строку sentinel-значением для Reka UI.
 *
 * @param value - Внешнее значение опции.
 */
function toInternalValue(value: unknown): AcceptableValue {
    return (value === '' ? EMPTY_VALUE_SENTINEL : value) as AcceptableValue;
}

/**
 * Обрабатывает выбор опции и пробрасывает значение наружу,
 * возвращая sentinel обратно в пустую строку.
 *
 * @param value - Значение выбранной опции.
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
            <!--
                Подпись приходит пропом, а не атрибутом: наследование атрибутов
                отключено (`inheritAttrs: false`), а корень компонента — не
                DOM-узел, так что упасть внешнему `aria-label` всё равно некуда.
                Пустое значение атрибут не создаёт: `aria-label=""` имени не даёт,
                зато мешает браузеру взять его из других источников.
            -->
            <SelectTrigger :class="$style.field" :aria-label="props.ariaLabel || undefined">
                <SelectValue :class="$style.nativeInput">{{ selectedLabel }}</SelectValue>
            </SelectTrigger>
        </div>

        <SelectPortal>
            <SelectContent :class="$style.dropdown" position="popper" :side-offset="4">
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
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>

<style lang="scss" module>
.BricksSelect {
    position: relative;
    user-select: none;

    /* Flex, а не block: подпись внутри — inline-элемент, и её line-box набирал
       высоту по strut'у родителя плюс подстрочный зазор baseline'а, из-за чего
       поле выходило 39 против 36 у `BricksInput` и текст сидел выше центра.
       С флексом высота считается по паддингам и строке, как у поля ввода. */
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

        // Видимая часть треугольника — верхняя половина бокса 0.8rem,
        // поэтому центровка через translateY(25%) вниз, а не по центру бокса
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
        color: var(--bricks-base-400);
    }
}

.dropdown {
    z-index: var(--bricks-z-popover);
    width: var(--reka-select-trigger-width);
    padding: 0.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    color: var(--bricks-base-900);
    box-shadow: var(--bricks-shadow-md);
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
