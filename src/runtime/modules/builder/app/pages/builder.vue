<script setup lang="ts">
// #region Imports
// Nuxt
import { definePageMeta, useHead } from '#imports';
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
});
// #endregion

useHead({
    htmlAttrs: {
        style: 'font-size: 10px',
    },
    bodyAttrs: {
        class: 'bricks-page',
        'data-bricks-builder': '',
    },
});
</script>

<template>
    <NuxtPage />
</template>
