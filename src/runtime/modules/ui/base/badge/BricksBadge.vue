<script setup lang="ts">
/**
 * @description Плашка: короткое значение рядом с именем. Роль была написана пять
 * раз — метка «вы» в строке учётки, «текущая» у версии страницы, пилюля роли,
 * чип ключевого слова и сама эта плашка, — и разъехалась по радиусу, кеглю и
 * паддингу.
 *
 * Геометрию задаёт форма и кегль, а не вызывающий классом: перекрытие класса
 * классом решалось бы порядком в стилях. Место, где своей геометрии не избежать
 * (круглая плашка выбранного файла в медиатеке), перекрывает её осознанно и
 * помечено комментарием на своей стороне.
 */

// #region Imports
// Types
import type { IBricksBadgeProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksBadgeProps>(), {
    tone: 'primary',
    shape: 'rounded',
    dot: '',
    as: 'span',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [
    $style.BricksBadge,
    $style[`_${props.tone}`],
    $style[`_${props.shape}`],
]);
// #endregion
</script>

<template>
    <component
        :is="props.as"
        :class="rootClasses"
        :type="props.as === 'button' ? 'button' : undefined"
    >
        <span v-if="props.dot" :class="[$style.dot, $style[`_dot-${props.dot}`]]" />

        <slot />
    </component>
</template>

<style module lang="scss">
/* Кегль один на все плашки: ступени `1.2rem` и `1.1rem` различались на глаз
   только весом, а `1.1rem` вне шкалы кратности `0.2rem`. */
.BricksBadge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    border: 1px solid transparent;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    gap: 0.4rem;
    line-height: 1.4;
}

/* Форма */
._rounded {
    padding: 0.2rem 0.6rem;

    // Значения вне шкалы радиусов — см. комментарий у типа формы
    border-radius: 0.4rem;
}

._pill {
    padding: 0.2rem 0.8rem;
    border-radius: var(--bricks-border-radius-pill);
}

/* Тон */
._primary {
    background: var(--bricks-primary);
    color: var(--bricks-static-white);
}

._neutral {
    background: var(--bricks-base-200);
    color: var(--bricks-base-600);
}

/* Подпись `base-600`, а не `base-500`: на `base-100` последняя даёт 4.4:1 —
   ниже порога AA для обычного текста. */
._muted {
    background: var(--bricks-base-100);
    color: var(--bricks-base-600);
}

._accent {
    background: var(--bricks-primary-50);
    color: var(--bricks-primary-600);
}

._quiet {
    border-color: var(--bricks-base-200);
    background: var(--bricks-base-50);
    color: var(--bricks-base-500);
}

/* Без заливки: значение несут точка и подпись, а не плашка. Рамка снимается по
   ширине, а не цветом: прозрачная рамка базового правила добавляла бы точке
   статуса 0.2rem габарита, и круг переставал бы совпадать с прежним. */
._plain {
    border-width: 0;
    background: transparent;
    color: var(--bricks-base-500);
}

/* Паддинг снимается парой классов, а не одиночным `._plain`: с одиночным исход
   зависел бы от порядка правил в файле, а не от намерения. Без фона паддинг
   только отодвигал бы подпись от соседа. */
._plain._rounded,
._plain._pill {
    padding: 0;
}

.dot {
    flex-shrink: 0;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
}

._dot-neutral {
    background: var(--bricks-base-300);
}

._dot-positive {
    background: var(--bricks-green);
}
</style>
