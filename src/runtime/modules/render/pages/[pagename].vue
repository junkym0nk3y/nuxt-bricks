<script setup lang="ts">
// #region Imports
// Types
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { IPublishedPage } from '../../common/types/bricks-api';
import type { IBricksComponent } from '../../common/types/brick';

// Vue
import { computed, provide, ref } from 'vue';
import { createError, definePageMeta, useHead, useNuxtData, useRoute } from '#imports';

// Composables
import { useBrickImports } from '../../common/composables/useBrickImports';
import { useBricksDevices } from '../../common/composables/useBricksDevices';
import { useBricksStyles } from '../../common/composables/useBricksStyles';
import { useResponsiveVisibilityStyles } from '../../layouts-blocks/composables/useResponsiveVisibilityStyles';
import { useResponsiveLayoutStyles } from '../../layouts-blocks/composables/useResponsiveLayoutStyles';
import { useRendererBricks } from '../composables/useRendererBricks';
import { useRendererDataSources } from '../composables/useRendererDataSources';
import { useRendererPreviewSync } from '../composables/useRendererPreviewSync';
import { normalizeBrickPath } from '../../common/utils/bricks/paths';
import { isRenderableSchemaComponent } from '../../common/utils/bricks/schemaContract';
import {
    PREVIEW_VERSION_QUERY_PARAM,
    getBricksPageDataKey,
    getRenderPageKey,
    parsePreviewVersionId,
} from '../../common/utils/bricks/previewRoute';
import { resolvePageAddressFromRoute } from '../../common/utils/bricks/pageAddress';
import { BRICKS_PREVIEW_ROUTE_NAMES } from '../../common/constants/routes';
import { BRICKS_DEVICES_KEY } from '../../common/constants/injectionKeys';

// Components
import TheRenderer from '../components/TheRenderer.vue';
import RendererCloseButton from '../components/RendererCloseButton.vue';
// #endregion

// #region Meta
// The key includes the normalized version id on the preview route: without it a
// move between versions would leave the tab on the previous one (see
// getRenderPageKey). The rest of the query — the consumer's filters, the data
// source parameters — still has no effect on mounting.
definePageMeta({
    key: (route: RouteLocationNormalizedLoaded) => getRenderPageKey(route),
});
// #endregion

// #region Data
const route = useRoute();
// The address, not the name alone: both the preview and the live render serve a
// pair of routes (with a prefix and without one), and it is the full address that
// identifies the page
const address = resolvePageAddressFromRoute(route.params);
// Preview mode is decided purely by the route <previewPrefix>/<address> (the query
// is not used); on dynamic pretty-URL routes the component works in live mode
const isPreview = typeof route.name === 'string' && BRICKS_PREVIEW_ROUTE_NAMES.includes(route.name);

// Preview of a saved version: the id comes from the query. Such a tab shows a
// state taken from the history, so it has no use for the live sync with the
// builder (see useRendererPreviewSync)
const previewVersionId = isPreview
    ? parsePreviewVersionId(route.query[PREVIEW_VERSION_QUERY_PARAM])
    : null;

const pageDataKey = getBricksPageDataKey(address, isPreview, previewVersionId);
const { data: middlewarePageData } = useNuxtData<IPublishedPage>(pageDataKey);

// Data of the preview live sync: updated through BroadcastChannel without a page
// reload
const livePreviewData = ref<IPublishedPage | null>(null);

const page = computed(() => livePreviewData.value || middlewarePageData.value || null);

// Error handling based on middleware: if middlewarePageData is null, an error was
// thrown in the middleware
if (!page.value && !isPreview) {
    throw createError({
        statusCode: 404,
        statusMessage: 'Page not found',
    });
}

const { findImportModule } = useBrickImports();
const { prefetchBrickComponent } = useRendererBricks({ findImportModule });

const {
    resolvedProps,
    refreshDataSources,
    ready: dataSourcesReady,
} = useRendererDataSources({
    page,
    address,
    isPreview,
});

// Block SSR until the first data sources run (the composable's hooks are already
// registered)
await dataSourcesReady;

// The page's device set replaces the plugin's project CSS by head tag key (the
// mechanism is in useBricksStyles).
// A getter rather than a value: a live preview changes the set without remounting
// the page, and a one-off call would have left the layout as it was
const { resolvePageDevices } = useBricksDevices();
const pageDevices = computed(() => resolvePageDevices(page.value?.viewportConfig ?? null));
const getPageDevices = () => pageDevices.value;

provide(BRICKS_DEVICES_KEY, pageDevices);

useBricksStyles(getPageDevices);
useResponsiveVisibilityStyles(getPageDevices);
useResponsiveLayoutStyles(getPageDevices);

const { currentDevice, resolutionText, closePreview } = useRendererPreviewSync({
    address,
    isPreview,
    previewVersionId,
    middlewarePageData,
    livePreviewData,
    page,
    refreshDataSources,
});
// #endregion

// #region Computed
const pageTitle = computed(() => page.value?.title || 'Bricks Page');
const pageDescription = computed(() => page.value?.description || '');
const pageKeywords = computed(() => page.value?.keywords || '');
const pageSocialImage = computed(() => page.value?.socialImage || '');
const pageBackgroundColor = computed(() => page.value?.backgroundColor || 'var(--bricks-base-0)');

const allComponents = computed<IBricksComponent[]>(() => {
    const components = page.value?.schema?.components ?? [];
    // The stored page could have been corrupted or written around the schema
    // contract: garbage elements are filtered out rather than taking SSR down
    return components.filter(
        (component): component is IBricksComponent =>
            isRenderableSchemaComponent(component) && !component.isHidden
    );
});

// Only the root level goes into the template: the children of a layout are
// rendered by the layout block itself, through renderChild
const rootComponents = computed<IBricksComponent[]>(() =>
    allComponents.value.filter((component: IBricksComponent) => !component.parent)
);
// #endregion

// #region Methods
/**
 * Prefetches the brick components to avoid an SSR/CSR mismatch on the first render.
 * Loads UI components only (layouts are excluded), so as not to slow things down or
 * pull in more than is needed.
 */
async function prefetchPageBricks(): Promise<void> {
    const components = allComponents.value;
    const brickPaths = Array.from(
        new Set<string>(
            components
                .map((component: IBricksComponent) => component.brickPath)
                .filter(
                    (brickPath): brickPath is string =>
                        Boolean(brickPath) && !brickPath.startsWith('layout')
                )
                .map((brickPath) => normalizeBrickPath(brickPath))
        )
    );

    await Promise.all(brickPaths.map((brickPath) => prefetchBrickComponent(brickPath)));
}
// #endregion

// #region Lifecycle
await prefetchPageBricks();
// #endregion

// #region Meta
// `bricks-render` on the body turns on the content zone of the reset — `@layer
// bricks-reset` in default.scss, that is normalize plus strip-reset, and the
// project styles always win over it. The preview route renders this same
// component, so it is covered too.
//
// The inline style below carries what used to be global: the rem base and the
// html part of normalize (`html { font-size: 10px }` from default.scss,
// `html { line-height; text-size-adjust }` from normalize.css) plus
// `body { margin: 0 }`. All of it is wrapped in `:where()`, so it has zero
// specificity: a rule of the same name in the consuming project wins without
// effort (see remBase in the breakpoints config), while the UA defaults — a 16px
// base and an 8px body margin — lose to it.
useHead({
    bodyAttrs: { class: 'bricks-render' },
    style: [
        {
            innerHTML:
                ':where(html){font-size:10px;line-height:1.15;-webkit-text-size-adjust:100%}:where(body){margin:0}',
        },
    ],
});

useHead(() => {
    const meta = [
        { name: 'description', content: pageDescription?.value || '' },
        { name: 'keywords', content: pageKeywords?.value || '' },
        { property: 'og:title', content: pageTitle?.value || '' },
        { property: 'og:description', content: pageDescription?.value || '' },
        { name: 'twitter:title', content: pageTitle?.value || '' },
        { name: 'twitter:description', content: pageDescription?.value || '' },
    ];

    if (pageSocialImage?.value) {
        meta.push(
            { name: 'twitter:card', content: 'summary_large_image' },
            { property: 'og:image', content: pageSocialImage.value },
            { name: 'twitter:image', content: pageSocialImage.value }
        );
    }

    return {
        title: pageTitle?.value || '',
        meta,
    };
});
// #endregion
</script>

<template>
    <div :class="[$style.bricksPage, 'bricks-text', 'page']">
        <div
            v-if="page"
            :class="[$style.pageContent, { [$style.pageContentPreview]: isPreview }]"
            :style="{ backgroundColor: pageBackgroundColor }"
        >
            <div v-if="isPreview" :class="$style.previewBanner">
                <div :class="$style.previewContent">
                    <span :class="$style.previewText">Режим превью</span>
                    <BricksIcon :icon="currentDevice.icon" :class="$style.previewDeviceIcon" />
                    <span :class="$style.previewResolution">{{ resolutionText }}</span>
                    <RendererCloseButton
                        :class="$style.previewClose"
                        aria-label="Закрыть превью"
                        @click="closePreview"
                    />
                </div>
            </div>

            <TheRenderer
                v-for="component in rootComponents"
                :key="component.id"
                :component="component"
                :all-components="allComponents"
                :resolved-props="resolvedProps"
            />
        </div>

        <div v-else :class="$style.loading">Загружаем страницу...</div>
    </div>
</template>

<style module lang="scss">
.bricksPage {
    width: 100%;
}

.pageContent {
    width: 100%;
    min-height: 100vh;
}

.pageContentPreview {
    padding-top: 6rem;
}

.previewBanner {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    padding: 1rem 0;
    border-radius: 2rem;
    background: var(--bricks-primary-500);
    color: white;
    box-shadow: var(--bricks-shadow-md);
    opacity: 0.9;
    user-select: none;
}

.previewContent {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0 2rem;
}

.previewDeviceIcon {
    flex-shrink: 0;
    font-size: 1.6rem;
}

.previewText {
    font-size: 1.4rem;
    font-weight: 500;
}

.previewResolution {
    font-size: 1.2rem;
    opacity: 0.7;
}

.previewClose {
    margin-left: auto;
    border-color: rgb(var(--bricks-rgb-white) / 25%);
    background: rgb(var(--bricks-rgb-white) / 16%);
    color: white;
    transition: background-color var(--bricks-default-transition);

    &:hover {
        background: rgb(var(--bricks-rgb-white) / 30%);
    }
}
</style>
