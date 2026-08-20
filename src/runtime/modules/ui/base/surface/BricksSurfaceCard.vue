<script setup lang="ts">
/**
 * @description Поверхность карточки: радиус, рамка, фон и поведение
 * наведения/фокуса. Раскладку содержимого НЕ берёт: у строки страницы, строки
 * учётки, карточки шаблона и плитки медиатеки она разная, и общий компонент,
 * который знал бы про все четыре, был бы конфигуратором, а не поверхностью.
 *
 * Класс вызывающего приезжает на этот же узел, поэтому его правила вида
 * `.Row:hover .actions` продолжают работать, а раскладка (`padding`, `gap`,
 * `display`) остаётся там, где ей место.
 *
 * Чего здесь нет: карточка компонента в сайдбаре библиотеки. Она источник
 * перетаскивания на прозрачном фоне панели, с рамкой `base-300` и подъёмом на
 * наведении — другой язык, а не отставшая копия этого.
 */

// #region Imports
// Types
import type { IBricksSurfaceCardProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSurfaceCardProps>(), {
    as: 'div',
    radius: 'sm',
    interactive: true,
    clickable: false,
    elevation: 'sm',
    selected: false,
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [
    $style.BricksSurfaceCard,
    $style[`_radius-${props.radius}`],
    $style[`_elevation-${props.elevation}`],
    {
        [$style._interactive]: props.interactive,
        [$style._clickable]: props.clickable,
        [$style._selected]: props.selected,
    },
]);
// #endregion
</script>

<template>
    <component :is="props.as" :class="rootClasses">
        <slot />
    </component>
</template>

<style module lang="scss">
.BricksSurfaceCard {
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
}

._radius-sm {
    border-radius: var(--bricks-border-radius-sm);
}

._radius-md {
    border-radius: var(--bricks-border-radius-md);
}

/* Наведение и фокус внутри — одно состояние: у строк действия проявляются на
   наведении, и без `focus-within` они оставались бы невидимыми при обходе с
   клавиатуры. */
._interactive {
    &:hover,
    &:focus-within {
        border-color: var(--bricks-primary-300);
    }

    &._elevation-sm:hover,
    &._elevation-sm:focus-within {
        box-shadow: var(--bricks-shadow-sm);
    }

    &._elevation-md:hover,
    &._elevation-md:focus-within {
        box-shadow: var(--bricks-shadow-md);
    }
}

/* Курсор — отдельно от отклика: строка учётки подсвечивается, чтобы проявить
   свои кнопки, но клик по ней ничего не делает, и `pointer` обещал бы переход. */
._clickable {
    cursor: pointer;
}

/* Выбранная карточка держит вид наведения постоянно: иначе, уведя курсор, о
   выборе напоминает только содержимое панели рядом. */
._selected {
    border-color: var(--bricks-primary-300);

    &._elevation-sm {
        box-shadow: var(--bricks-shadow-sm);
    }

    &._elevation-md {
        box-shadow: var(--bricks-shadow-md);
    }
}
</style>
