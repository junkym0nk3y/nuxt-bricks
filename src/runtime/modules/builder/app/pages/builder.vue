<script setup lang="ts">
// #region Imports
// Nuxt
import { definePageMeta, useHead } from '#imports';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
});
// #endregion

// #region Data
const { locale } = useI18n();
// #endregion

// The language of the document is set here, on the wrapper of every builder route:
// without it a screen reader reads the interface in whatever language the browser
// guessed, and the whole builder answers for one `<html>`. It follows the chosen
// locale rather than a constant — the switcher of the interface changes it live
useHead({
    htmlAttrs: {
        lang: computed(() => locale.value),
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
