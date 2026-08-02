<script setup lang="ts">
/**
 * @description Сегментированный переключатель: один компонент вместо самописных
 * рядов кнопок и чипов. Четыре стиля (`segmented`, `outline`, `underline`,
 * `ghost`), клавиатура и семантика группы — общие для всех потребителей.
 *
 * Группа кнопок, а не вкладки. Роли `tablist`/`tab` обещают скринридеру панель
 * на каждую вкладку, но панелей здесь нет ни у одного потребителя: выбор
 * переключает режим канваса или фильтрует уже видимый список. Поэтому под
 * капотом `ToggleGroupRoot` (`role="group"`, у кнопок `aria-pressed`), а не
 * `TabsRoot`. Побочно это убрало и ловушку вкладок: `Tabs` активирует таб при
 * получении фокуса, поэтому переход табом внутрь группы менял значение сам по
 * себе; `ToggleGroup` меняет его только по клику или Enter/Space.
 *
 * Поведение (roving tabindex, стрелки по кругу, Home/End, пропуск выключенных,
 * RTL) даёт reka-ui — на ней в проекте уже собраны чекбокс, селект и модалка.
 * Наша часть — только пропы, разметка кнопки и стили.
 *
 * Тултипу нужен `role="presentation"` на обёртке: без него лишний элемент
 * встаёт между группой и кнопкой и мешает читать их как одно целое.
 */

// #region Imports
// Types
import type {
    IBricksTabBarProps,
    IBricksTabBarEmits,
    IBricksTabBarItemProps,
    IBricksTabItem,
} from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { ToggleGroupRoot } from 'reka-ui';

// Components
import BricksTabBarItem from './BricksTabBarItem.vue';
import BricksTooltip from '../../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTabBarProps>(), {
    variant: 'segmented',
    size: 'sm',
    tone: 'neutral',
    radius: undefined,
    iconOnly: false,
    block: false,
    wrap: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksTabBarEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const classList = computed(() => ({
    [$style[`_${props.variant}`]]: true,
    [$style._radiusSm]: props.radius === 'sm',
    [$style._block]: props.block,
    [$style._wrap]: props.wrap,
}));
// #endregion

// #region Methods
/**
 * Собирает пропсы элемента: разметка таба одинакова для обеих веток шаблона
 * (с тултипом и без), поэтому пропсы считаются в одном месте.
 *
 * @param item - Описание таба.
 */
function getItemProps(item: IBricksTabItem): IBricksTabBarItemProps {
    return {
        item,
        variant: props.variant,
        size: props.size,
        tone: props.tone,
        radius: props.radius,
        iconOnly: props.iconOnly,
        block: props.block,
    };
}

/**
 * Отдаёт выбор наверх. Отсекаются два случая, в которых группа сообщает о
 * событии, но выбор не меняется:
 *
 * 1. `undefined` — повторное нажатие на выбранную кнопку. `ToggleGroup` считает
 *    это снятием выбора, а группа режимов не может остаться пустой: канвас без
 *    вьюпорта и список без фильтра не имеют смысла.
 * 2. То же значение — потребители отвечают на обновление запросом или
 *    перерисовкой, и лишний повтор стоил бы им лишней работы.
 *
 * Параметр объявлен как `unknown`: `ToggleGroup` типизирует событие под оба
 * режима сразу (в `multiple` приходит массив), поэтому сузить его до строки
 * можно только проверкой на месте.
 *
 * @param value - Значение нажатой кнопки; при снятии выбора приходит пустое.
 */
function handleValueChange(value: unknown): void {
    if (typeof value !== 'string' || value === props.modelValue) {
        return;
    }

    emit('update:modelValue', value);
}
// #endregion
</script>

<template>
    <ToggleGroupRoot
        type="single"
        :class="[$style.BricksTabBar, classList]"
        :model-value="props.modelValue"
        :aria-label="props.groupLabel"
        @update:model-value="handleValueChange"
    >
        <template v-for="item in props.items" :key="item.value">
            <BricksTooltip
                v-if="item.tooltip"
                top
                role="presentation"
                :class="[$style.tooltip, props.block && $style._block]"
            >
                <template #activator>
                    <BricksTabBarItem v-bind="getItemProps(item)" />
                </template>

                <template #default>
                    <BricksTooltipHint :text="item.tooltip" />
                </template>
            </BricksTooltip>

            <BricksTabBarItem v-else v-bind="getItemProps(item)" />
        </template>
    </ToggleGroupRoot>
</template>

<style module lang="scss">
.BricksTabBar {
    display: inline-flex;
    align-items: center;

    &._block {
        display: flex;
        width: 100%;
    }

    /* Перенос строк вместо вылезания за край контейнера: у дорожки нет своей
       ширины, а табы не переносятся по словам (`white-space: nowrap`). */
    &._wrap {
        flex-wrap: wrap;
    }

    &._segmented {
        gap: 0.2rem;
        padding: 0.2rem;
        border-radius: var(--bricks-border-radius-xs);
        background: var(--bricks-base-100);

        /* Скругление дорожки = скругление таба + её паддинг: при radius="sm" таб
           берёт 1rem, значит дорожке нужно 1.2rem, иначе углы разъезжаются. */
        &._radiusSm {
            border-radius: calc(var(--bricks-border-radius-sm) + 0.2rem);
        }
    }

    /* Дорожки нет вовсе: ряд стоит прямо на фоне соседей (нижний бар канваса —
       общая панель с кнопками зума и истории), подложку получает только активный
       таб. С дорожкой segmented такой ряд распадался бы на два блока. */
    &._ghost {
        gap: 0.2rem;
    }

    &._outline {
        gap: 0.8rem;
    }

    &._underline {
        gap: 0.8rem;
        border-bottom: 1px solid var(--bricks-base-200);
    }
}

.tooltip {
    display: inline-flex;

    &._block {
        flex: 1;
    }
}
</style>
