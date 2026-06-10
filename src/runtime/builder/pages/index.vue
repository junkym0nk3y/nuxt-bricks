<script setup lang="ts">
// #region Imports
// Vue
import { ref } from 'vue';

// Nuxt
import { useRouter } from '#imports';

// Pinia
import { usePublishStore } from '../stores/publish';

// Components
import ThePublishedPagesModal from '../components/modal/ThePublishedPagesModal.vue';
import BricksButton from '../../ui/base/button/BricksButton.vue';
// #endregion

// #region Data
const router = useRouter();
const publishStore = usePublishStore();
const isPublishedPagesModalOpen = ref(false);
// #endregion

// #region Methods
/**
 * Открывает список сохранённых страниц.
 */
function handleOpenPages(): void {
    isPublishedPagesModalOpen.value = true;
}

/**
 * Закрывает список страниц.
 */
function handleClosePages(): void {
    isPublishedPagesModalOpen.value = false;
}

/**
 * Создаёт новый черновик и переходит в билдер.
 */
async function handleCreateNew(): Promise<void> {
    const draftPagename = `draft-${Date.now()}`;
    await router.push(`/builder/${draftPagename}`);
}

/**
 * Открывает сохранённую страницу в билдере по `pagename`.
 *
 * @param pageId - Идентификатор страницы.
 */
async function handleEdit(pageId: string): Promise<void> {
    const page = publishStore.getPageById(pageId);
    if (!page) {
        return;
    }

    handleClosePages();
    await router.push(`/builder/${page.pagename}`);
}
// #endregion
</script>

<template>
    <div :class="[$style.BuilderIndex, 'bricks-text']">
        <div :class="$style.content">
            <h1 :class="$style.title">Билдер</h1>
            <p :class="$style.subtitle">Выберите страницу для редактирования или создайте новую.</p>

            <div :class="$style.actions">
                <BricksButton size="md" variant="primary" @click="handleCreateNew">
                    Создать новую страницу
                </BricksButton>
                <BricksButton size="md" variant="secondary" @click="handleOpenPages">
                    Открыть список страниц
                </BricksButton>
            </div>
        </div>

        <ThePublishedPagesModal
            :is-open="isPublishedPagesModalOpen"
            @close="handleClosePages"
            @edit="handleEdit"
        />
    </div>
</template>

<style module lang="scss">
.BuilderIndex {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    background-color: var(--land-base-100);
}

.content {
    width: 100%;
    max-width: 52rem;
    padding: 2.4rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--land-base-300);
    background: var(--land-base-0);
    box-shadow: var(--shadow-md);
}

.title {
    margin: 0;
    font-size: 2.4rem;
    font-weight: 700;
    color: var(--land-base-900);
}

.subtitle {
    margin: 0.8rem 0 0;
    font-size: 1.4rem;
    color: var(--land-base-600);
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 2rem;

    button {
        flex: 1;
    }
}
</style>
