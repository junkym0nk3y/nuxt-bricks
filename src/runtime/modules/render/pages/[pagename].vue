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
// Ключ включает нормализованный id версии на превью-роуте: без него переход
// между версиями оставил бы вкладку на прежней (см. getRenderPageKey). Прочий
// query — фильтры потребителя, параметры data sources — на монтирование
// по-прежнему не влияет.
definePageMeta({
    key: (route: RouteLocationNormalizedLoaded) => getRenderPageKey(route),
});
// #endregion

// #region Data
const route = useRoute();
// Адрес, а не одно имя: и превью, и live-рендер обслуживают пару маршрутов
// (с префиксом и без), а страницу опознаёт полный адрес
const address = resolvePageAddressFromRoute(route.params);
// Превью-режим — чисто по роуту <previewPrefix>/<адрес> (query не используется);
// на динамических ЧПУ маршрутах компонент работает в live-режиме
const isPreview = typeof route.name === 'string' && BRICKS_PREVIEW_ROUTE_NAMES.includes(route.name);

// Превью сохранённой версии: id из query. Такая вкладка показывает состояние из
// истории, поэтому live-синк с билдером ей не нужен (см. useRendererPreviewSync)
const previewVersionId = isPreview
    ? parsePreviewVersionId(route.query[PREVIEW_VERSION_QUERY_PARAM])
    : null;

const pageDataKey = getBricksPageDataKey(address, isPreview, previewVersionId);
const { data: middlewarePageData } = useNuxtData<IPublishedPage>(pageDataKey);

// Данные live-синхронизации превью: обновляются через BroadcastChannel без перезагрузки страницы
const livePreviewData = ref<IPublishedPage | null>(null);

const page = computed(() => livePreviewData.value || middlewarePageData.value || null);

// Error handling based on middleware, if middlewarePageData is null, an error was thrown in middleware
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

// Блокируем SSR до первичного выполнения data sources (хуки композабла уже зарегистрированы)
await dataSourcesReady;

// Набор устройств страницы вытесняет проектный CSS плагина по ключу тега.
// Геттер, а не значение: live-preview меняет набор без перемонтирования
// страницы, и одноразовый вызов оставил бы раскладку прежней
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
    // Строка БД могла быть повреждена или записана в обход контракта схемы
    //: мусорные элементы отфильтровываются, а не роняют SSR
    return components.filter(
        (component): component is IBricksComponent =>
            isRenderableSchemaComponent(component) && !component.isHidden
    );
});

const rootComponents = computed<IBricksComponent[]>(() =>
    allComponents.value.filter((component: IBricksComponent) => !component.parent)
);
// #endregion

// #region Methods
/**
 * Предзагружает brick-компоненты, чтобы избежать рассинхрона SSR/CSR при первом рендере.
 * Загружает только UI-компоненты (layout исключены), чтобы не тормозить и не тянуть лишнее.
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
// bricks-render на body включает зону контента reset'а (@layer bricks-reset в
// default.scss: normalize + strip-reset, проектные стили всегда побеждают) —
// preview-роут использует этот же компонент и покрывается автоматически.
// Rem-база и html-часть normalize (бывшие глобальные html { font-size: 10px } из
// default.scss и html { line-height; text-size-adjust } из normalize.css) +
// body { margin: 0 }: fallback'и нулевой специфичности — одноимённые правила
// проекта-потребителя всегда побеждают (см. remBase в конфиге breakpoints),
// а UA-дефолты (база 16px, margin 8px) перебиваются.
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
                    <!-- Имя кнопке нужно своё: внутри неё только иконка, а
                         рядом нет текста, из которого читалка взяла бы смысл -->
                    <RendererCloseButton
                        :class="$style.previewClose"
                        aria-label="Закрыть превью"
                        @click="closePreview"
                    />
                </div>
            </div>

            <!-- Render only root-level components (not children of layouts) -->
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
