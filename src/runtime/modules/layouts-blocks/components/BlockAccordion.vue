<script setup lang="ts">
// #region Imports
// Types
import type { IAccordionLayoutProps, IAccordionItem } from '../types/blockProps';

// Vue
import { computed, ref } from 'vue';

// Reka UI
import {
    AccordionRoot,
    AccordionItem,
    AccordionHeader,
    AccordionTrigger,
    AccordionContent,
} from 'reka-ui';
// #endregion

// #region Props
const props = defineProps<{
    layoutProps: IAccordionLayoutProps;
}>();
// #endregion

// #region Data
/** Открытые элементы (значения = строковые индексы). Режим всегда multiple, single эмулируется. */
const openValues = ref<string[]>(
    props.layoutProps.initialOpenIndex >= 0 ? [String(props.layoutProps.initialOpenIndex)] : []
);
// #endregion

// #region Computed
const normalizedItems = computed<IAccordionItem[]>(() => {
    if (!Array.isArray(props.layoutProps.items)) {
        return [];
    }
    return props.layoutProps.items;
});

/** Карточный режим (gap > 0) */
const isCardMode = computed<boolean>(() => (props.layoutProps.gap ?? 0) > 0);

/** CSS-переменные для динамических стилей */
const accordionCssVars = computed<Record<string, string>>(() => {
    const lp = props.layoutProps;
    const duration = `${lp.animationDuration ?? 250}ms`;
    const radius = `${lp.borderRadius ?? 0.8}rem`;
    const vars: Record<string, string> = {
        '--accordion-duration': duration,
        '--accordion-radius': radius,
    };

    if (lp.accentColor) {
        vars['--accordion-accent'] = lp.accentColor;
    }

    if (isCardMode.value) {
        vars['--accordion-gap'] = `${lp.gap}rem`;
    }

    return vars;
});
// #endregion

// #region Methods
/**
 * Обновляет открытые элементы. В режиме single оставляет только последний открытый.
 *
 * @param values - Новый список открытых значений от Reka.
 */
function handleUpdateValues(values: string | string[] | undefined): void {
    const next = Array.isArray(values) ? values : values ? [values] : [];

    if (!props.layoutProps.allowMultiple && next.length > 1) {
        const added = next.find((value) => !openValues.value.includes(value));
        openValues.value = added ? [added] : next.slice(-1);
        return;
    }

    openValues.value = next;
}
// #endregion
</script>

<template>
    <AccordionRoot
        type="multiple"
        :model-value="openValues"
        :class="[
            $style.BlockAccordion,
            {
                [$style.accordionCard]: isCardMode,
                [$style.accented]: !!props.layoutProps.accentColor,
            },
        ]"
        :style="accordionCssVars"
        @update:model-value="handleUpdateValues"
    >
        <AccordionItem
            v-for="(item, index) in normalizedItems"
            :key="index"
            :value="String(index)"
            :class="$style.item"
        >
            <AccordionHeader as-child>
                <AccordionTrigger type="button" :class="$style.header" data-accordion-toggle>
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <span :class="$style.headerTitle" v-html="item.title" />
                    <span :class="$style.icon">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M4 6L8 10L12 6"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </span>
                </AccordionTrigger>
            </AccordionHeader>

            <AccordionContent :class="$style.body">
                <div :class="$style.content">
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div v-html="item.content" />
                </div>
            </AccordionContent>
        </AccordionItem>

        <div v-if="normalizedItems.length === 0" :class="$style.empty">
            Добавьте элементы через панель свойств
        </div>
    </AccordionRoot>
</template>

<style module lang="scss">
/* Единый блок (gap = 0) */
.BlockAccordion {
    overflow: hidden;
    width: 100%;
    border-radius: var(--accordion-radius, 0.8rem);
    border: 1px solid var(--bricks-base-200);
}

/* Карточный режим (gap > 0) */
.accordionCard {
    overflow: visible;
    display: flex;
    border-radius: 0;
    border: none;
    flex-direction: column;
    gap: var(--accordion-gap, 0);

    .item {
        overflow: hidden;
        border-radius: var(--accordion-radius, 0.8rem);
        border: 1px solid var(--bricks-base-200);
        border-bottom: 1px solid var(--bricks-base-200);

        &:last-child {
            border-bottom: 1px solid var(--bricks-base-200);
        }
    }
}

/* Акцентный цвет */
.accented {
    &:not(.accordionCard) {
        border-color: var(--accordion-accent);
    }

    .item {
        border-color: var(--accordion-accent);
    }

    .header:hover {
        background: var(--accordion-accent);
    }

    .item[data-state='open'] > .header {
        background: var(--accordion-accent);
    }

    .body[data-state='open'] {
        background: var(--accordion-accent);
    }

    .icon {
        color: var(--accordion-accent);
    }
}

.item {
    border-bottom: 1px solid var(--bricks-base-200);

    &:last-child {
        border-bottom: none;
    }
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 1.6rem 2.4rem;
    border: none;
    background: var(--bricks-base-0);
    text-align: left;
    transition: background-color var(--accordion-duration, 250ms) ease;
    cursor: pointer;

    &:hover {
        background: var(--bricks-base-50);
    }

    &[data-state='open'] .icon {
        transform: rotate(180deg);
    }
}

.headerTitle {
    flex: 1;
    font-size: 1.6rem;
    font-weight: 500;
    line-height: 1.5;
    color: var(--bricks-base-900);
}

.icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    margin-left: 1.6rem;
    color: var(--bricks-base-500);
    transition: transform var(--accordion-duration, 250ms) ease;
}

.body {
    overflow: hidden;
    background: var(--bricks-base-0);

    &[data-state='open'] {
        animation: accordion-slide-down var(--accordion-duration, 250ms) ease;
    }

    &[data-state='closed'] {
        animation: accordion-slide-up var(--accordion-duration, 250ms) ease;
    }
}

.content {
    padding: 0 2.4rem 1.6rem;
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--bricks-base-600);
}

.empty {
    padding: 2.4rem;
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-400);
}

@keyframes accordion-slide-down {
    from {
        height: 0;
    }

    to {
        height: var(--reka-accordion-content-height);
    }
}

@keyframes accordion-slide-up {
    from {
        height: var(--reka-accordion-content-height);
    }

    to {
        height: 0;
    }
}
</style>
