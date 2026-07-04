<script setup lang="ts">
// #region Imports
// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useRouter } from '#imports';

// Pinia
import { usePublishStore } from '../stores/publish';

// Components
import TheBuilderPublishPagesModal from '../components/TheBuilderPublishPagesModal.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Data
const { t, locale, setLocale } = useI18n();
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
 * Переключает локаль интерфейса (ru ⇄ en); cookie `bricks-locale` пишет сам i18n.
 */
async function handleToggleLocale(): Promise<void> {
    await setLocale(locale.value === 'ru' ? 'en' : 'ru');
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
        <button
            :class="$style.localeToggle"
            :title="t('bricks.nav.language')"
            @click="handleToggleLocale"
        >
            {{ locale.toUpperCase() }}
        </button>

        <div :class="$style.content">
            <h1 :class="$style.title">{{ t('bricks.publish.dashboard.title') }}</h1>
            <p :class="$style.subtitle">{{ t('bricks.publish.dashboard.subtitle') }}</p>

            <div :class="$style.actions">
                <BricksButton size="md" variant="primary" @click="handleCreateNew">
                    {{ t('bricks.publish.dashboard.createPage') }}
                </BricksButton>
                <BricksButton size="md" variant="secondary" @click="handleOpenPages">
                    {{ t('bricks.publish.dashboard.openPagesList') }}
                </BricksButton>
            </div>
        </div>

        <TheBuilderPublishPagesModal
            :is-open="isPublishedPagesModalOpen"
            @close="handleClosePages"
            @edit="handleEdit"
        />
    </div>
</template>

<style module lang="scss">
.BuilderIndex {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    background-color: var(--bricks-base-100);
}

.localeToggle {
    position: absolute;
    top: 1.6rem;
    right: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--bricks-base-500);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-base-50);
        color: var(--bricks-base-900);
    }
}

.content {
    width: 100%;
    max-width: 52rem;
    padding: 2.4rem;
    border-radius: var(--border-radius-md);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-md);
}

.title {
    margin: 0;
    font-size: 2.4rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.subtitle {
    margin: 0.8rem 0 0;
    font-size: 1.4rem;
    color: var(--bricks-base-600);
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
