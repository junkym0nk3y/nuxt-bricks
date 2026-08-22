<script setup lang="ts">
// #region Imports
// Types
import type { IDocumentationModalProps, IDocumentationModalEmits } from '../types/modal';

// Vue
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useDocumentationArticles } from '../composables/useDocumentationArticles';

// Components
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
// #endregion

// #region Props
const props = defineProps<IDocumentationModalProps>();
// #endregion

// #region Emits
const emit = defineEmits<IDocumentationModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const {
    articles,
    activeArticlePath,
    articleContent,
    isContentLoading,
    navigateTo,
    initFirstArticle,
} = useDocumentationArticles();

const contentRef = ref<HTMLElement | null>(null);
// #endregion

// #region Methods
/** Asks the host to close the modal */
function handleClose(): void {
    emit('close');
}

/**
 * Handles a click on a link inside an article.
 *
 * A link to a .md file navigates inside the modal; everything else is left to the
 * browser.
 *
 * @param event - The click event.
 */
function handleContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');

    if (!anchor) {
        return;
    }

    const href = anchor.getAttribute('href');
    if (!href) {
        return;
    }

    if (href.endsWith('.md')) {
        event.preventDefault();
        navigateTo(href);
    }
}
// #endregion

// #region Lifecycle
watch(activeArticlePath, () => {
    contentRef.value?.scrollTo({ top: 0 });
});

watch(
    () => props.isOpen,
    (newIsOpen) => {
        if (newIsOpen) {
            initFirstArticle();
        }
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal :is-open="props.isOpen" :title="t('bricks.docs.title')" @close="handleClose">
        <div :class="$style.TheBuilderDocumentationModal">
            <BricksModalHeader size="lg" @close="handleClose" />

            <div :class="$style.body">
                <nav :class="$style.sidebar">
                    <ul :class="$style.navList">
                        <li v-for="article in articles" :key="article.path">
                            <button
                                :class="[
                                    $style.navItem,
                                    {
                                        [$style._active]: article.path === activeArticlePath,
                                    },
                                ]"
                                @click="navigateTo(article.path)"
                            >
                                {{ article.title }}
                            </button>
                        </li>
                    </ul>
                </nav>

                <div
                    ref="contentRef"
                    :class="[$style.content, 'bricks-scrollbox']"
                    @click="handleContentClick"
                >
                    <div v-if="isContentLoading" :class="$style.loading">
                        <div :class="$style.spinner" />
                        <p>{{ t('bricks.common.loading') }}</p>
                    </div>

                    <div v-else :class="[$style.markdown, 'bricks-docs']" v-html="articleContent" />
                </div>
            </div>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderDocumentationModal {
    overflow: hidden;
    display: flex;
    width: 102rem;
    max-width: 90vw;
    height: 80vh;
    border-radius: 1.2rem;
    background-color: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-md);
    flex-direction: column;
}

.body {
    overflow: hidden;
    display: flex;
    flex: 1;
    min-height: 0;
}

.sidebar {
    overflow-y: auto;
    width: 24rem;
    min-width: 24rem;
    padding: 1.6rem;
    border-right: 1px solid var(--bricks-base-300);
}

.navList {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
    flex-direction: column;
    gap: 0.2rem;
}

.navItem {
    display: block;
    width: 100%;
    padding: 0.8rem 1.2rem;
    border-radius: 0.6rem;
    border: none;
    background: transparent;
    text-align: left;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition:
        color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &._active {
        background-color: var(--bricks-primary-50, rgb(37 99 235 / 8%));
        color: var(--bricks-primary);
    }
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 2.4rem;
    transform: translate3d(0, 0, 0);
}

.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: var(--bricks-base-600);
}

.spinner {
    width: 4rem;
    height: 4rem;
    margin-bottom: 1.6rem;
    border-radius: 50%;
    border: 0.8rem solid var(--bricks-base-300);
    border-top: 0.8rem solid var(--bricks-primary);
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.markdown {
    font-size: 1.4rem;
    line-height: 1.8;
    color: var(--bricks-base-800);
}
</style>
