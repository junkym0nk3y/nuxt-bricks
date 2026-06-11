<script setup lang="ts">
// #region Imports
// Types
import type { IPublishedPage } from '../../common/types/bricks-api';
import type { BricksComponent } from '../../common/types/brick';
import type { IBrickDataSource } from '../types/bricks-data-source';

// Vue
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { createError, useNuxtData } from '#imports';

// Composables
import { useStoryImports } from '../../common/composables/useStoryImports';
import { useRendererStories } from '../composables/useRendererStories';
import { useBricksDataSources } from '../composables/useBricksDataSources';
import { useBricksConfig } from '../../common/composables/useBricksConfig';
import { normalizeStoryPath } from '../../common/utils/bricks/paths';

// Components
import TheRenderer from '../components/TheRenderer.vue';
import BricksCloseButton from '../../ui/base/modal/BricksCloseButton.vue';
// #endregion

// #region Data
const storyDataSourcesCache = new Map<string, IBrickDataSource[] | null>();
const route = useRoute();
const pagename = route.params.pagename as string;
const isPreview = route.query.preview === 'true';
const isClientDataSourceDebug = import.meta.dev && import.meta.client;

// Текущее разрешение и адаптив для превью-баннера
const windowWidth: Ref<number> = ref(0);
const windowHeight: Ref<number> = ref(0);

const pageDataKey = `bricks-page-${pagename}-${isPreview ? 'preview' : 'live'}`;
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

const { findImportModule } = useStoryImports();
const { prefetchStoryComponent } = useRendererStories({ findImportModule });
const { executeDataSource: executeDataSourceRequest } = useBricksDataSources();
const dataSourceKey = `bricks-datasources-${pagename}-${isPreview ? 'preview' : 'live'}`;

// Считаем и мержим все data sources из stories для текущей страницы
const dataSourceAsyncData = await useAsyncData<Record<string, Record<string, unknown>>>(
    dataSourceKey,
    async () => {
        if (!page.value) {
            return {};
        }

        const requests = await collectDataSourceRequests();
        const result: Record<string, Record<string, unknown>> = {};

        if (!requests?.length) {
            return {};
        }

        await Promise.all(
            requests.map(async ({ component, source }) => {
                const mapped = await executeDataSourceRequest(source, component, page.value);

                if (!mapped) {
                    return;
                }

                const target = (result[component.id] ||= {});

                // Применяем только запрошенные props, чтобы избежать лишнего шумового мерджа
                source.props.forEach((propName) => {
                    if (propName in mapped) {
                        target[propName] = (mapped as Record<string, unknown>)[propName];
                    }
                });
            })
        );

        // console.log('[Bricks DataSources] Resolved props for components:', Object.keys(result));

        return result;
    },
    {
        server: !isPreview,
        immediate: !isPreview,
    }
);
// Слепок смёрдженных пропсов для всех компонентов с учётом data sources
const resolvedProps = computed<Record<string, Record<string, unknown>>>(() => {
    return dataSourceAsyncData.data?.value ?? {};
});

if (isPreview && import.meta.client) {
    let resizeObserver: ResizeObserver | null = null;

    // При монтировании читаем актуальные данные из localStorage (имеют приоритет над данными БД из SSR payload)
    onMounted(() => {
        resizeObserver = new ResizeObserver(() => {
            windowWidth.value = window.innerWidth;
            windowHeight.value = window.innerHeight;
        });
        resizeObserver.observe(document.documentElement);

        try {
            const stored = window.localStorage.getItem('bricks-preview-page');
            if (stored) {
                const parsed = JSON.parse(stored) as IPublishedPage;
                if (parsed.pagename === pagename) {
                    livePreviewData.value = parsed;
                }
            }
        } catch {
            // ignore storage errors
        }
    });

    // Подписываемся на realtime-обновления схемы от builder-вкладки
    const previewChannel = new BroadcastChannel('bricks-preview-sync');

    previewChannel.onmessage = (event: MessageEvent) => {
        const { type, pagename: msgPagename, schema } = event.data ?? {};

        if (type === 'schema-update' && msgPagename === pagename) {
            // livePreviewData как fallback: актуально для временных страниц, которых нет в БД
            const base = middlewarePageData.value ?? livePreviewData.value;
            if (base) {
                livePreviewData.value = { ...base, schema };
            }
        }
    };

    onUnmounted(() => {
        previewChannel.close();
        resizeObserver?.disconnect();
        resizeObserver = null;
    });

    // Обновляем data sources при смене данных страницы (первичная загрузка или live-обновление)
    watch(
        () => page.value,
        (value) => {
            if (value) {
                dataSourceAsyncData.refresh();
            }
        },
        { immediate: true }
    );
}

// #endregion

// #region Computed
const pageTitle = computed(() => page.value?.title || 'Bricks Page');
const pageDescription = computed(() => page.value?.description || '');
const pageKeywords = computed(() => page.value?.keywords || '');
const pageSocialImage = computed(() => page.value?.socialImage || '');
const pageBackgroundColor = computed(() => page.value?.backgroundColor || 'var(--bricks-base-0)');

const DEVICE_ICONS: Record<string, string> = {
    desktop: 'ak:desktop-device',
    ultra: 'ak:desktop-device',
    laptop: 'ak:desktop-device',
    tablet: 'ak:credit-card-alt-1',
    mobile: 'ak:mobile-device',
};

const { breakpoints: deviceBreakpoints } = useBricksConfig();

const sortedDeviceBreakpoints = computed(() =>
    Object.entries(deviceBreakpoints)
        .map(([name, minWidth]) => ({
            name,
            minWidth,
            icon: DEVICE_ICONS[name] ?? 'ak:desktop-device',
        }))
        .sort((a, b) => b.minWidth - a.minWidth)
);

const currentDevice = computed(() => {
    const width = windowWidth.value;
    const bps = sortedDeviceBreakpoints.value;

    for (const bp of bps) {
        if (width >= bp.minWidth) {
            return bp;
        }
    }

    return bps[bps.length - 1];
});

const resolutionText = computed(() => `${windowWidth.value}×${windowHeight.value}`);
// #endregion

// #region Methods
const allComponents = computed<BricksComponent[]>(() => {
    const components = page.value?.schema?.components ?? [];
    // console.log('[Bricks Page] All components:', components);
    return components.filter((c) => !c.isHidden);
});

const rootComponents = computed<BricksComponent[]>(() => {
    const components = allComponents.value.filter(
        (component: BricksComponent) => !component.parent
    );
    // console.log('[Bricks Page] Root components:', components);
    return components;
});

/**
 * Предзагружает story-компоненты, чтобы избежать рассинхрона SSR/CSR при первом рендере.
 * Загружает только UI-компоненты (layout исключены), чтобы не тормозить и не тянуть лишнее.
 */
async function prefetchPageStories(): Promise<void> {
    const components = page.value?.schema?.components ?? [];
    const storyPaths = Array.from(
        new Set<string>(
            components
                .map((component: BricksComponent) => component.storyPath)
                .filter(
                    (storyPath): storyPath is string =>
                        Boolean(storyPath) && !storyPath.startsWith('layout')
                )
                .map((storyPath) => normalizeStoryPath(storyPath))
        )
    );

    await Promise.all(storyPaths.map((storyPath) => prefetchStoryComponent(storyPath)));
}

/**
 * Закрывает окно превью и очищает сохранённые данные превью.
 */
function closePreview(): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem('bricks-preview-page');
    window.close();
}

/**
 * Загружает dataSources из story-файла и кеширует результат.
 *
 * @param storyPath - путь до story-файла.
 * @returns Список dataSources для компонента или пустой массив.
 */
async function loadStoryDataSources(storyPath: string): Promise<IBrickDataSource[]> {
    if (!storyPath) {
        return [];
    }

    const cacheKey = normalizeStoryPath(storyPath);

    if (storyDataSourcesCache.has(cacheKey)) {
        return storyDataSourcesCache.get(cacheKey) ?? [];
    }

    const importModule = findImportModule(cacheKey) ?? findImportModule(storyPath);

    if (!importModule) {
        storyDataSourcesCache.set(cacheKey, null);
        return [];
    }

    try {
        const storyModule = await importModule();
        const dataSources = (storyModule?.story?.dataSources ?? []) as IBrickDataSource[];
        storyDataSourcesCache.set(cacheKey, dataSources);
        return dataSources;
    } catch (error) {
        console.error('[Bricks Page] Failed to load dataSources for story:', storyPath, error);
        storyDataSourcesCache.set(cacheKey, null);
        return [];
    }
}

/**
 * Собирает список всех dataSources для компонентов страницы.
 *
 * @returns Список запросов с компонентом и его источником данных.
 */
async function collectDataSourceRequests(): Promise<
    Array<{ component: BricksComponent; source: IBrickDataSource }>
> {
    if (!page.value?.schema?.components?.length) {
        return [];
    }

    const requests: Array<{ component: BricksComponent; source: IBrickDataSource }> = [];

    // Собираем все data sources, объявленные в story-файлах компонентов
    for (const component of page.value.schema.components) {
        if (!component.storyPath) {
            continue;
        }

        // Загружаем список источников для конкретного компонента
        const sources = await loadStoryDataSources(component.storyPath);

        // Добавляем каждый источник в очередь выполнения
        sources.forEach((source) => {
            requests.push({ component, source });
        });
    }

    return requests;
}

// Все вспомогательные функции для data sources перенесены в composable useBricksDataSources
if (isClientDataSourceDebug) {
    const debugLabel = `[Bricks DataSources][client:${pagename}]`;

    // Логируем смену статуса загрузки data sources (в превью дебаг-режиме)
    watch(
        () => dataSourceAsyncData.status.value,
        (status) => {
            console.info(debugLabel, 'статус изменён:', status);
        },
        { immediate: true }
    );

    // Выводим ошибку загрузки data sources, если она возникла
    watch(
        () => dataSourceAsyncData.error?.value,
        (error) => {
            if (error) {
                console.error(debugLabel, 'ошибка data source:', error);
            }
        },
        { immediate: true }
    );

    // Снимаем слепок смёрдженных пропсов компонентов после обработки data sources
    watch(
        () => resolvedProps.value,
        (value) => {
            console.info(debugLabel, 'снимок resolved props:', value);
        },
        { deep: true, immediate: true }
    );

    onMounted(() => {
        console.info(debugLabel, 'refreshing data sources on client for logging');
        dataSourceAsyncData.refresh();
    });
}
// #endregion

// #region Lifecycle
await prefetchPageStories();
// #endregion

// #region Meta
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
                    <BricksCloseButton size="sm" :class="$style.previewClose" @click="closePreview" />
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
    box-shadow: var(--shadow-md);
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
    border-color: rgb(var(--rgb-white) / 25%);
    background: rgb(var(--rgb-white) / 16%);
    color: white;
    transition: background-color var(--default-transition);

    &:hover {
        background: rgb(var(--rgb-white) / 30%);
    }
}
</style>
