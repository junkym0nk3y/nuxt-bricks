<script setup lang="ts">
// #region Imports
// Types
import type { IDocumentationModalProps, IDocumentationModalEmits } from '../types/modal';

// Utils
import { decodeDocumentationAnchorId } from '../utils/documentationHeadingAnchors';
import {
    isDocumentationCrossLink,
    sanitizeDocumentationHtml,
} from '../utils/sanitizeDocumentationHtml';

// Vue
import { computed, ref, watch } from 'vue';
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
    hasArticles,
} = useDocumentationArticles();

const contentRef = ref<HTMLElement | null>(null);

/** The headings an anchor link of an article is allowed to lead to */
const HEADING_SELECTOR = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]';
// #endregion

// #region Computed
/**
 * The article ahead of `v-html`. The boundary is here, at the last point before the
 * markup reaches the DOM, rather than inside the renderer: the "article not found"
 * placeholder is assembled as HTML too and would otherwise walk past the sanitizer,
 * and the paths of the images are rewritten after the render — sanitizing earlier
 * would check a string that is not the one shown.
 */
const sanitizedArticleContent = computed<string>(() =>
    sanitizeDocumentationHtml(articleContent.value)
);
// #endregion

// #region Methods
/** Asks the host to close the modal */
function handleClose(): void {
    emit('close');
}

/**
 * Scrolls the article to the heading a fragment link points at.
 *
 * The heading is looked for INSIDE the content of the modal rather than through
 * `document.getElementById`: the slug of a heading is the plain text of it, so an id
 * of the builder underneath the modal is free to carry the same one, and the search
 * would then scroll to a node of another surface.
 *
 * The offset is computed by hand instead of `scrollIntoView`: that one is allowed to
 * scroll every scrollable ancestor, the page under the modal included.
 *
 * @param href - The `href` of the link, fragment sign included.
 */
function scrollToArticleHeading(href: string): void {
    const content = contentRef.value;
    const anchorId = decodeDocumentationAnchorId(href);

    if (!content || !anchorId) {
        return;
    }

    const heading = Array.from(content.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).find(
        (element) => element.id === anchorId
    );

    if (!heading) {
        return;
    }

    const top =
        content.scrollTop +
        heading.getBoundingClientRect().top -
        content.getBoundingClientRect().top;

    content.scrollTo({ top });
}

/**
 * Handles a click on a link inside an article.
 *
 * A cross-link between articles navigates inside the modal, a fragment link scrolls
 * the article to its heading; everything else is left to the browser. The cross-link
 * is decided by the same predicate the sanitizer uses, so the set of links kept and
 * the set of links intercepted cannot drift apart.
 *
 * A fragment is taken away from the browser even when no heading answers it: native
 * navigation would write the fragment into the address of the builder — an SPA whose
 * router would then be free to treat it as a navigation of its own.
 *
 * A modified click (Ctrl/Cmd/Shift) and a middle click are intercepted along with the
 * plain one, and that is deliberate rather than an omission: an article of the guide
 * has no address of its own — the whole guide lives inside this modal — so "open in a
 * new tab" has nothing to open. Left to the browser, a cross-link would resolve against
 * the builder route and land on `/bricks/02-interface.md`, which is the editor of a page
 * by that name and silently opens a NEW empty draft for one that does not exist.
 *
 * The middle button arrives as `auxclick`, hence the second binding; what stays out of
 * reach is "Open link in new tab" from the context menu, which starts no event at all.
 *
 * @param event - The click event.
 */
function handleContentClick(event: MouseEvent): void {
    // The back and forward buttons of a mouse arrive as `auxclick` too, and a
    // navigation of the history is not ours to cancel
    if (event.button > 1) {
        return;
    }

    const target = event.target as HTMLElement;
    const anchor = target.closest('a');

    if (!anchor) {
        return;
    }

    const href = anchor.getAttribute('href');
    if (!href) {
        return;
    }

    if (href.startsWith('#')) {
        event.preventDefault();
        scrollToArticleHeading(href);
        return;
    }

    if (isDocumentationCrossLink(href)) {
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

            <div v-if="!hasArticles" :class="$style.comingSoon">
                <h2 :class="$style.comingSoonTitle">{{ t('bricks.docs.comingSoonTitle') }}</h2>
                <p :class="$style.comingSoonText">{{ t('bricks.docs.comingSoonDescription') }}</p>
            </div>

            <div v-else :class="$style.body">
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
                    @auxclick="handleContentClick"
                >
                    <div v-if="isContentLoading" :class="$style.loading">
                        <div :class="$style.spinner" />
                        <p>{{ t('bricks.common.loading') }}</p>
                    </div>

                    <div v-else :class="$style.markdown" v-html="sanitizedArticleContent" />
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

.comingSoon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 4rem;
    text-align: center;
    flex-direction: column;
    gap: 0.8rem;
}

.comingSoonTitle {
    margin: 0;
    font-size: 2.4rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.comingSoonText {
    max-width: 48rem;
    margin: 0;
    font-size: 1.4rem;
    line-height: 1.6;
    color: var(--bricks-base-600);
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
        background-color: var(--bricks-primary-50);
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

    h1 {
        margin: 0 0 1.6rem;
        font-size: 2.4rem;
        font-weight: 700;
        color: var(--bricks-base-900);
    }

    h2 {
        margin: 2.4rem 0 1.2rem;
        font-size: 1.8rem;
        font-weight: 600;
        color: var(--bricks-base-900);
    }

    h3 {
        margin: 2rem 0 1rem;
        font-size: 1.6rem;
        font-weight: 600;
        color: var(--bricks-base-900);
    }

    p {
        margin: 0 0 1.2rem;
    }

    ul,
    ol {
        margin: 0 0 1.2rem;
        padding-left: 2.4rem;
        list-style-position: outside;
    }

    ul {
        list-style-type: disc;
    }

    ol {
        list-style-type: decimal;
    }

    li {
        margin-bottom: 0.4rem;
        list-style: inherit;
    }

    code {
        padding: 0.2rem 0.4rem;
        border-radius: 0.4rem;
        background-color: var(--bricks-base-100);
        font-family: monospace;
        font-size: 1.2rem;
        color: var(--bricks-base-800);
    }

    pre {
        overflow-x: auto;
        margin: 0 0 1.6rem;
        padding: 1.6rem;
        border-radius: 0.8rem;
        background-color: var(--bricks-base-100);

        code {
            padding: 0;
            background: none;
        }
    }

    a {
        text-decoration: none;
        color: var(--bricks-primary);
        transition: color var(--bricks-default-transition);

        &:hover {
            text-decoration: underline;
        }
    }

    img {
        max-width: 100%;
        border-radius: 0.8rem;
    }

    blockquote {
        margin: 0 0 1.6rem;
        padding: 1.2rem 1.6rem;
        border-left: 0.4rem solid var(--bricks-primary);
        background-color: var(--bricks-base-50, var(--bricks-base-100));
        color: var(--bricks-base-700);
    }

    table {
        width: 100%;
        margin: 0 0 1.6rem;
        border-collapse: collapse;
        font-size: 1.4rem;
        line-height: 1.6;
    }

    thead tr {
        border-bottom: 1px solid var(--bricks-base-300);
    }

    th {
        padding: 0.8rem 1.2rem;
        text-align: left;
        font-weight: 600;
        color: var(--bricks-base-900);
    }

    td {
        padding: 0.8rem 1.2rem;
        color: var(--bricks-base-700);
    }

    tbody tr {
        border-bottom: 1px solid var(--bricks-base-200);

        &:last-child {
            border-bottom: none;
        }
    }
}
</style>
