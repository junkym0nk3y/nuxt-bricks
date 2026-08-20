<script setup lang="ts">
/**
 * @description Пустое состояние: глиф, заголовок, пояснение и место под
 * действие.
 *
 * Внешние отступы задаёт вызывающий своим классом — раздел дашборда отводит
 * состоянию `8rem` по вертикали, панель сайдбара всю свою высоту, а сетка
 * шаблонов растягивает его флексом. Собственный `padding` пришлось бы
 * перекрывать в каждом втором месте, и перекрытие класса классом решалось бы
 * порядком в стилях, а не намерением.
 *
 * Пустое состояние канваса сюда НЕ переезжает: там своя иллюстрация и
 * подсказка про перетаскивание, то есть это приглашение к действию, а не отчёт
 * «список пуст». По той же причине здесь нет кликабельного варианта, каким
 * сделаны заглушки «добавить первый пункт» в редакторах свойств.
 */

// #region Imports
// Types
import type { IBricksEmptyStateProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksEmptyStateProps>(), {
    icon: '',
    description: '',
    size: 'md',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [$style.BricksEmptyState, $style[`_${props.size}`]]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <div v-if="props.icon" :class="$style.iconBox">
            <BricksIcon :icon="props.icon" :class="$style.icon" />
        </div>

        <h2 :class="$style.title">{{ props.title }}</h2>

        <p v-if="props.description" :class="$style.description">{{ props.description }}</p>

        <div v-if="$slots.default" :class="$style.action">
            <slot />
        </div>
    </div>
</template>

<style module lang="scss">
.BricksEmptyState {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 0.8rem;
    text-align: center;
}

/* Круг под глифом — только у крупного размера: в панели сайдбара он занимает
   треть свободной высоты и превращает сообщение в баннер. */
.iconBox {
    display: flex;
    align-items: center;
    justify-content: center;

    ._md & {
        width: 6.4rem;
        height: 6.4rem;
        margin-bottom: 0.4rem;
        border-radius: 50%;
        background: var(--bricks-base-100);
    }
}

.icon {
    ._md & {
        width: 2.8rem;
        height: 2.8rem;
        font-size: 2.8rem;
        color: var(--bricks-base-400);
    }

    ._sm & {
        width: 4.8rem;
        height: 4.8rem;
        font-size: 4.8rem;
        color: var(--bricks-base-300);
    }
}

.title {
    margin: 0;

    ._md & {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--bricks-base-900);
    }

    ._sm & {
        font-size: 1.4rem;
        font-weight: 500;
        color: var(--bricks-base-900);
    }
}

.description {
    // Потолок ширины: без него описание растягивается на всю ширину раздела и
    // читается строкой в 120 знаков
    max-width: 36rem;
    margin: 0;

    ._md & {
        font-size: 1.4rem;
        color: var(--bricks-base-500);
    }

    ._sm & {
        font-size: 1.2rem;
        color: var(--bricks-base-500);
    }
}

.action {
    margin-top: 0.8rem;
}
</style>
