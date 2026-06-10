<template>
    <div id="app" :class="$style.LandingLayout">
        <slot />
    </div>
</template>

<script setup lang="ts"></script>

<style module lang="scss">
.LandingLayout {
    display: flex;
    min-height: 100vh;
    background-color: var(--land-base-0);
    flex-direction: column;
}
</style>
