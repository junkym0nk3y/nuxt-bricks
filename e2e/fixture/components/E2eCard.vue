<script setup lang="ts">
withDefaults(
    defineProps<{
        headline?: string;
        gallery?: { id?: string; url?: string; title?: string }[];
        meta?: Record<string, unknown>;
    }>(),
    {
        headline: 'E2E card',
        gallery: () => [],
        meta: () => ({}),
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
