<script setup lang="ts">
// #region Imports
// Nuxt
import { definePageMeta } from '#imports';
// #endregion

// #region Data
// Home page of the playground app — sends the visitor straight to the builder
definePageMeta({
    redirect: '/bricks',
});
// #endregion
</script>

<template>
    <div />
</template>
