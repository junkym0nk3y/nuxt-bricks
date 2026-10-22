<script setup lang="ts">
/**
 * @description Card surface: radius, border, background and hover/focus
 * behavior. It does NOT take on the layout of the content: a page row, an
 * account row, a template card and a media library tile all lay out differently,
 * and a shared component that knew about all four would be a configurator rather
 * than a surface.
 *
 * The caller's class lands on this very node, so its rules of the
 * `.Row:hover .actions` kind keep working, while the layout (`padding`, `gap`,
 * `display`) stays where it belongs.
 *
 * What is not here: the component card in the library sidebar. That one is a
 * drag source on the transparent background of the panel, with a `base-300`
 * border and a lift on hover — a different language, not a copy of this one that
 * fell behind.
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

._clickable {
    cursor: pointer;
}

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
