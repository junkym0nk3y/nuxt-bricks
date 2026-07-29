<script setup lang="ts">
withDefaults(
    defineProps<{
        headline?: string;
    }>(),
    {
        headline: 'E2E card',
    }
);
</script>

<template>
    <article data-testid="e2e-card">{{ headline }}</article>
</template>
