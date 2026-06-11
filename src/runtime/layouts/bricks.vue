<template>
    <div id="app" :class="$style.BricksLayout">
        <slot />
    </div>
</template>

<script setup lang="ts"></script>

<style module lang="scss">
.BricksLayout {
    display: flex;
    min-height: 100vh;
    background-color: var(--bricks-base-0);
    flex-direction: column;
}
</style>
