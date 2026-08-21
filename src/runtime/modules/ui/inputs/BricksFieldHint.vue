<script setup lang="ts">
/**
 * @description A note under a field or a group of fields — the twin of
 * `BricksFieldError`: the same paragraph without outer spacing, only in a calm
 * tone.
 *
 * The text arrives through a slot rather than a prop: half the hints in the
 * project are interpolations and ternaries (file size limit, minimum password
 * length, two text variants for one slot), and a `message` prop would force the
 * caller to assemble the string in advance where the template does it by
 * itself. The component also has nothing to hide an empty hint with, and no
 * reason to — visibility is owned by the caller through `v-if`, as before.
 *
 * Spacing comes from the outside: the hint sits sometimes in the `gap` of a
 * field column, sometimes flush under the input, and a `margin` of its own
 * would have to be overridden in every other place.
 *
 * The color is `base-500`: it was the one in most of the copies, and on the
 * dark theme it has more contrast than the `base-400` that had drifted in.
 */
</script>

<template>
    <p :class="$style.BricksFieldHint">
        <slot />
    </p>
</template>

<style lang="scss" module>
.BricksFieldHint {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-500);
}
</style>
