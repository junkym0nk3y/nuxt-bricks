<script setup lang="ts">
/**
 * @description Плавающая поверхность: радиус, рамка, фон, тень и слой. Всё, что
 * было написано тринадцать раз — от дропдауна селекта до контекстного меню
 * канваса, — и уже разъехалось: одна и та же роль встречалась с тенью `sm`, `md`
 * и `lg`.
 *
 * **Позиционирование не берёт на себя намеренно.** Часть поверхностей ставит
 * reka (`SelectContent`, `DropdownMenuContent`, `PopoverContent`), часть —
 * собственный `position: absolute` от родителя, часть — `position: fixed` из
 * `Teleport` по координатам выделения. Навязать один способ значило бы
 * переписать работающую логику в десяти местах ради общего вида; поэтому
 * геометрию (ширину, координаты, анимацию появления) вызывающий по-прежнему
 * задаёт своим классом — он приезжает на этот же узел.
 *
 * С поверхностями reka компонент составляется через `as-child`: тогда узел
 * остаётся один, и `data-state`, на который вызывающий вешает анимацию, стоит
 * там же, где его класс.
 */

// #region Imports
// Types
import type { IBricksPopoverSurfaceProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksPopoverSurfaceProps>(), {
    density: 'default',
    elevation: 'md',
    layer: 'popover',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
/**
 * `layer: 'none'` не печатает класса слоя вовсе, а не печатает пустой: слоем в
 * этом случае распоряжается вызывающий (или reka, если поверхность стоит в её
 * контенте), и лишний класс в списке спорил бы с его значением за одинаковую
 * специфичность.
 */
const rootClasses = computed(() => [
    $style.BricksPopoverSurface,
    $style[`_${props.density}`],
    $style[`_${props.elevation}`],
    props.layer === 'none' ? null : $style[`_layer-${props.layer}`],
]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <slot />
    </div>
</template>

<style module lang="scss">
.BricksPopoverSurface {
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

._compact {
    padding: 0.4rem;
}

._default {
    padding: 0.6rem;
}

._roomy {
    padding: 0.8rem;
}

._flush {
    padding: 0;
}

._sm {
    box-shadow: var(--bricks-shadow-sm);
}

._md {
    box-shadow: var(--bricks-shadow-md);
}

._lg {
    box-shadow: var(--bricks-shadow-lg);
}

/* Слой поповеров: выше оболочки билдера и выше любой модалки — поповер всегда
   открывают из чего-то, что уже наверху. */
._layer-popover {
    z-index: var(--bricks-z-popover);
}

._layer-local {
    z-index: 1;
}
</style>
