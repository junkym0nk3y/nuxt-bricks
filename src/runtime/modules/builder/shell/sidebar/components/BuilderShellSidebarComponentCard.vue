<script setup lang="ts">
// #region Imports
// Types
import type { ISidebarComponentCardProps, IDragComposable } from './types';
import type { IBrickExportModule } from '../../../../common/types/index';

// Vue
import {
    defineAsyncComponent,
    shallowRef,
    inject,
    computed,
    ref,
    nextTick,
    watch,
    onMounted,
    onBeforeUnmount,
    type Component,
} from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Components
import BricksTooltip from '../../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/tooltip/BricksTooltipHint.vue';

// Composables
import { useBrickImports } from '../../../../common/composables/useBrickImports';

// Utils
import { convertRemToPx } from '../../../../common/utils/main';
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';

// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarComponentCardProps>(), {
    isLayout: false,
});
// #endregion

// #region Data
const { t, te } = useI18n();
const componentsStore = useComponentsStore();
const { findImportModule } = useBrickImports();
const ComponentPreview = shallowRef<Component | null>(null);
const previewWrapperRef = ref<HTMLElement | null>(null);
const previewContentRef = ref<HTMLElement | null>(null);
const componentWrapperRef = ref<HTMLElement | null>(null);
const previewScale = ref(1);
let resizeObserver: ResizeObserver | null = null;

const dragComposable = inject<IDragComposable | undefined>('dragComposable');

const importModule = findImportModule(props.component.brickPath);
if (importModule) {
    ComponentPreview.value = defineAsyncComponent<Component>({
        loader: async () => {
            const mod = await importModule();
            const exported = (mod as IBrickExportModule).default;
            if (!exported) {
                throw new Error(`Missing default export for component: ${props.component.name}`);
            }
            return exported as Component;
        },
        onError: (error) => {
            console.error(`Error loading component preview: ${props.component.name}`, error);
        },
    });
}
// #endregion

// #region Computed
/**
 * Описание компонента: ключи `bricks.*` переводятся, кастомные строки — как есть.
 */
const resolvedDescription = computed<string>(
    () => resolveBricksLabel(t, te, props.component.description) || ''
);

/**
 * Фильтрует slot-пропсы из defaultProps чтобы не передавать их как обычные пропсы
 * @returns Объект пропсов без slot-пропсов
 */
const componentProps = computed(() => {
    const propsObj = { ...(props.component.defaultProps || {}) };
    // Удаляем slot prop если он есть (он должен передаваться как slot, а не prop)
    delete propsObj.slot;
    return propsObj;
});

/**
 * Есть ли у компонента статичная превью-картинка
 */
const hasThumbnail = computed(() => props.isLayout && Boolean(props.component.thumbnail));

/**
 * Является ли компонент избранным
 */
const isFavorite = computed<boolean>(() =>
    componentsStore.favorites.includes(props.component.name)
);

/**
 * Максимальное увеличение для маленьких компонентов
 */
const MAX_SCALE_UP = 3;

/**
 * Фиксированная высота превью (из CSS)
 */
const PREVIEW_HEIGHT_REM = 18;
const LAYOUT_PREVIEW_HEIGHT_REM = 12;

/**
 * Обновляет масштаб предпросмотра компонента
 *
 * Измеряет РЕАЛЬНЫЙ размер компонента (не wrapper с фиксированной шириной).
 * Стратегия: contain - компонент полностью влезает в превью.
 * Маленькие компоненты увеличиваются (до MAX_SCALE_UP), большие уменьшаются.
 */
async function updatePreviewScale(): Promise<void> {
    await nextTick();

    // Даем время компоненту отрендериться
    setTimeout(() => {
        const wrapper = previewWrapperRef.value;
        const componentWrapper = componentWrapperRef.value;

        if (!wrapper || !componentWrapper) {
            previewScale.value = 1;
            return;
        }

        // Получаем реальный компонент (первый child внутри componentWrapper)
        const actualComponent = componentWrapper.firstElementChild as HTMLElement;
        if (!actualComponent) {
            previewScale.value = 1;
            return;
        }

        // Размеры области превью
        const previewWidth = wrapper.clientWidth || 200;
        const previewHeightRem = props.isLayout ? LAYOUT_PREVIEW_HEIGHT_REM : PREVIEW_HEIGHT_REM;
        const previewHeight = convertRemToPx(`${previewHeightRem}rem`);

        // Измеряем РЕАЛЬНЫЙ размер компонента
        // offsetWidth/offsetHeight дают размер без учёта transform родителя
        let contentWidth = actualComponent.offsetWidth;
        let contentHeight = actualComponent.offsetHeight;

        // Фолбек на scrollWidth/scrollHeight если offset вернул 0
        if (!contentWidth) {
            contentWidth = actualComponent.scrollWidth || 100;
        }
        if (!contentHeight) {
            contentHeight = actualComponent.scrollHeight || 100;
        }

        // Для полноширинных компонентов (занимают 100% wrapper) используем wrapper
        // Это компоненты типа секций которые растягиваются на всю ширину
        if (contentWidth >= componentWrapper.offsetWidth * 0.95) {
            contentWidth = componentWrapper.scrollWidth;
            contentHeight = componentWrapper.scrollHeight;
        }

        if (!contentWidth || !contentHeight) {
            previewScale.value = 1;
            return;
        }

        // Вычисляем масштаб для contain (весь компонент влезает)
        const widthScale = previewWidth / contentWidth;
        const heightScale = previewHeight / contentHeight;

        // Contain: берём меньший масштаб чтобы влезло по обоим осям
        // Но разрешаем увеличение для маленьких компонентов (до MAX_SCALE_UP)
        const containScale = Math.min(widthScale, heightScale);
        const scale = Math.min(containScale, MAX_SCALE_UP);

        previewScale.value = Math.max(scale, 0.1);
    }, 100);
}

/**
 * Настраивает ResizeObserver для отслеживания изменений размера wrapper
 * При изменении размера автоматически пересчитывает масштаб превью
 */
function setupResizeObserver(): void {
    if (resizeObserver || typeof ResizeObserver === 'undefined') {
        return;
    }
    resizeObserver = new ResizeObserver(() => updatePreviewScale());
    if (previewWrapperRef.value) {
        resizeObserver.observe(previewWrapperRef.value);
    }
}

onMounted(() => {
    setupResizeObserver();
    nextTick(() => updatePreviewScale());
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
});

// Watchers для автоматического пересчета масштаба при изменениях

// При изменении ref wrapper - переподписываем ResizeObserver
watch(
    previewWrapperRef,
    (el, prev) => {
        if (prev && resizeObserver) {
            resizeObserver.unobserve(prev);
        }
        if (el && resizeObserver) {
            resizeObserver.observe(el);
        }
    },
    { flush: 'post' }
);

// При загрузке асинхронного компонента - пересчитываем масштаб
watch(ComponentPreview, async () => {
    await nextTick();
    updatePreviewScale();
});

// При изменении пропсов компонента - пересчитываем масштаб
watch(
    () => props.component.defaultProps,
    async () => {
        await nextTick();
        updatePreviewScale();
    }
);

// При изменении isLayout - пересчитываем масштаб
watch(
    () => props.isLayout,
    async () => {
        await nextTick();
        updatePreviewScale();
    }
);
// #endregion

// #region Methods
/**
 * Обрабатывает начало перетаскивания карточки компонента
 * @param event - DragEvent от браузера
 */
function handleDragStart(event: DragEvent): void {
    console.log('[BuilderShellSidebarComponentCard] Drag start:', props.component.name);
    if (dragComposable) {
        dragComposable.startDrag(props.component, event);
    } else {
        console.error('[BuilderShellSidebarComponentCard] No drag composable found!');
    }
}

// #endregion
</script>

<template>
    <BricksTooltip v-if="resolvedDescription" bottom>
        <template #activator>
            <div
                :class="$style.BuilderShellSidebarComponentCard"
                draggable="true"
                @dragstart="handleDragStart"
            >
                <div :class="$style.cardInner">
                    <!-- Контейнер миниатюры -->
                    <div :class="[$style.thumbnail, { [$style.layoutThumbnail]: props.isLayout }]">
                        <!-- Статичная превью-картинка для layout-компонентов -->
                        <img
                            v-if="hasThumbnail"
                            :src="props.component.thumbnail"
                            :alt="props.component.name"
                            :class="$style.thumbnailImage"
                        />
                        <!-- Viewport с overflow: hidden -->
                        <div
                            v-else-if="ComponentPreview"
                            ref="previewWrapperRef"
                            :class="$style.previewViewport"
                        >
                            <!-- Обёртка с transform: scale() для масштабирования -->
                            <div
                                ref="previewContentRef"
                                :class="$style.previewInner"
                                :style="{ transform: `scale(${previewScale})` }"
                            >
                                <!-- Wrapper с desktop viewport -->
                                <div
                                    ref="componentWrapperRef"
                                    :class="$style.componentWrapper"
                                    data-bricks-viewport="desktop"
                                >
                                    <component :is="ComponentPreview" v-bind="componentProps" />
                                </div>
                            </div>
                        </div>
                        <BricksIcon v-else :class="$style.icon" icon="ui:component" />
                    </div>

                    <div :class="$style.info">
                        <h4 :class="$style.name">{{ props.component.name }}</h4>
                        <BricksIcon
                            v-if="isFavorite"
                            :class="$style.favoriteIndicator"
                            icon="ph:star-fill"
                        />
                    </div>
                </div>
            </div>
        </template>

        <template #default>
            <BricksTooltipHint :text="resolvedDescription" />
        </template>
    </BricksTooltip>

    <div
        v-else
        :class="$style.BuilderShellSidebarComponentCard"
        draggable="true"
        @dragstart="handleDragStart"
    >
        <div :class="$style.cardInner">
            <!-- Контейнер миниатюры -->
            <div :class="[$style.thumbnail, { [$style.layoutThumbnail]: props.isLayout }]">
                <!-- Статичная превью-картинка для layout-компонентов -->
                <img
                    v-if="hasThumbnail"
                    :src="props.component.thumbnail"
                    :alt="props.component.name"
                    :class="$style.thumbnailImage"
                />
                <!-- Viewport с overflow: hidden -->
                <div
                    v-else-if="ComponentPreview"
                    ref="previewWrapperRef"
                    :class="$style.previewViewport"
                >
                    <!-- Обёртка с transform: scale() для масштабирования -->
                    <div
                        ref="previewContentRef"
                        :class="$style.previewInner"
                        :style="{ transform: `scale(${previewScale})` }"
                    >
                        <!-- Wrapper с desktop viewport -->
                        <div
                            ref="componentWrapperRef"
                            :class="$style.componentWrapper"
                            data-bricks-viewport="desktop"
                        >
                            <component :is="ComponentPreview" v-bind="componentProps" />
                        </div>
                    </div>
                </div>
                <BricksIcon v-else :class="$style.icon" icon="ui:component" />
            </div>

            <div :class="$style.info">
                <h4 :class="$style.name">{{ props.component.name }}</h4>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarComponentCard {
    box-sizing: border-box;
    overflow: hidden;
    width: 100%;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: transparent;
    transition: all 150ms ease;
    cursor: grab;
    user-select: none;

    &:hover {
        border-color: var(--bricks-base-400);
        box-shadow: var(--shadow-md);
        transform: translateY(-0.2rem);
    }

    &:active {
        cursor: grabbing;
    }
}

.cardInner {
    display: flex;
    flex-direction: column;
    width: 100%;
}

.thumbnail {
    /* Фиксируем светлую тему для превью компонентов (полный reset — по образцу .bricks-canvas) */
    --bricks-base-0: #fff;
    --bricks-base-50: #f9fafb;
    --bricks-base-100: #f3f4f6;
    --bricks-base-200: #e5e7eb;
    --bricks-base-300: #d1d5db;
    --bricks-base-400: #9ca3af;
    --bricks-base-500: #6b7280;
    --bricks-base-600: #4b5563;
    --bricks-base-700: #374151;
    --bricks-base-800: #1f2937;
    --bricks-base-900: #111827;
    --bricks-primary-50: #eff6ff;
    --bricks-primary-100: #dbeafe;
    --bricks-primary-200: #bfdbfe;
    --bricks-primary-300: #93c5fd;
    --bricks-primary-400: #60a5fa;
    --bricks-primary-500: #3b82f6;
    --bricks-primary-600: #1d4ed8;
    --bricks-primary-700: #1e40af;
    --bricks-primary: #2563eb;
    --rgb-base-900: 17 24 39;
    --rgb-base-0: 255 255 255;
    --rgb-primary: 37 99 235;

    /* Reset playground variables (VTitle и другие playground-компоненты) */
    --body-color: #1b1d24;
    --base-0: #fff;
    --base-50: #f4f4f6;
    --base-100: #e1e2e5;
    --base-200: #c7c8ce;
    --base-300: #a1a4ad;
    --base-400: #7b808c;
    --base-500: #696d7b;
    --base-600: #43495a;
    --base-900: #1b1d24;
    --background-color: transparent;

    position: relative;
    overflow: hidden;
    width: 100%;
    height: 18rem;
    border-bottom: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    color: var(--body-color);
}

.layoutThumbnail {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 12rem;
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 0.8rem;
}

.previewViewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 144rem;
    height: 100%;
}

.previewInner {
    flex-shrink: 0;
    transform-origin: center left;
    pointer-events: none;
}

.componentWrapper {
    /**
         * Фиксированная ширина эмулирует desktop viewport для компонента.
         * Это не влияет на CSS media queries (они реагируют на viewport браузера),
         * но задаёт контекст для grid/flex layouts и CSS container queries.
         */
    width: 144rem;
    min-width: 144rem;
}

.icon {
    font-size: 4.8rem;
    color: var(--bricks-base-300);
}

.info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.8rem 1rem;
}

.name {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.favoriteIndicator {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    color: rgb(var(--rgb-primary));
}
</style>
