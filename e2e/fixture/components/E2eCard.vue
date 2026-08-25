<script setup lang="ts">
withDefaults(
    defineProps<{
        headline?: string;
        gallery?: { id?: string; url?: string; title?: string }[];
    }>(),
    {
        headline: 'E2E card',
        gallery: () => [],
    }
);
</script>

<template>
    <article data-testid="e2e-card">
        {{ headline }}
        <ul v-if="gallery.length">
            <li v-for="(item, index) in gallery" :key="item.id || index">{{ item.title }}</li>
        </ul>
    </article>
</template>
