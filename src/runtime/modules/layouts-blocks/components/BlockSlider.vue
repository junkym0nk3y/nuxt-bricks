<script setup lang="ts">
// #region Imports
// Types
import type { BricksComponent } from '../../common/types/brick';
import type { SliderLayoutProps } from '../types/blockProps';

// Vue
import { computed, defineComponent, h, inject, ref, type PropType, type VNodeChild } from 'vue';

// Constants
import { CANVAS_VIEWPORT_KEY } from '../../common/constants/injectionKeys';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';

// Components
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Navigation, Pagination, Autoplay, A11y } from 'swiper/modules';

// #endregion

// #region Components
const SlideRenderer = defineComponent({
    name: 'BlockSliderSlideRenderer',
    props: {
        component: {
            type: Object as PropType<BricksComponent>,
            required: true,
        },

        renderFn: {
            type: Function as PropType<(component: BricksComponent) => VNodeChild>,
            required: true,
        },
    },

    setup(slideProps) {
        return () => slideProps.renderFn(slideProps.component);
    },
});
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        layoutProps: SliderLayoutProps;
        layoutId?: string;
        slides?: BricksComponent[];
        renderSlide?: (component: BricksComponent) => VNodeChild;
        isEditor?: boolean;
    }>(),
    {
        layoutId: undefined,
        slides: () => [],
        renderSlide: () => () => h('div'),
        isEditor: false,
    }
);
// #endregion

// #region Data
const sliderRef = ref<HTMLElement | null>(null);
const dropIndicatorRef = ref<HTMLElement | null>(null);
const dropIndicator = ref<{ index: number; offset: number } | null>(null);
const dropInsertIndex = ref<number | null>(null);
const injectedViewport = inject(CANVAS_VIEWPORT_KEY, null);
const activeSlideIndex = ref(0);
// #endregion

// #region Computed
const isEditor = computed<boolean>(() => props.isEditor === true);
const hasSlides = computed<boolean>(() => props.slides.length > 0);
const sliderModules = computed(() => {
    const modules = [Navigation, Pagination, A11y];
    if (!isEditor.value && props.layoutProps.autoplay && props.slides.length > 1) {
        modules.push(Autoplay);
    }
    return modules;
});
const navigationEnabled = computed<boolean>(
    () => props.layoutProps.showNavigation && props.slides.length > 1
);
const paginationEnabled = computed<boolean>(
    () => props.layoutProps.showPagination && props.slides.length > 1
);
const autoplayOptions = computed(() => {
    if (isEditor.value || !props.layoutProps.autoplay || props.slides.length <= 1) {
        return false;
    }
    const delay = Number(props.layoutProps.autoplayDelay) || 3000;
    return {
        delay: Math.max(1000, delay),
        disableOnInteraction: false,
    };
});
const sliderLoop = computed<boolean>(() => {
    if (isEditor.value) {
        return false;
    }
    return props.layoutProps.loop && props.slides.length > 1;
});
const spaceBetween = computed<number>(() => Number(props.layoutProps.spaceBetween) || 16);

/**
 * slidesPerView для текущего viewport канваса (из injected CANVAS_VIEWPORT_KEY).
 * На published провайдера нет — fallback 'desktop' (Swiper работает через breakpoints).
 */
const currentSlidesPerView = computed<number>(() => {
    const viewport = injectedViewport?.value ?? 'desktop';

    if (viewport === 'mobile') {
        return Math.max(1, Number(props.layoutProps.slidesPerViewMobile) || 1);
    }
    if (viewport === 'tablet') {
        return Math.max(1, Number(props.layoutProps.slidesPerViewTablet) || 1);
    }
    return Math.max(1, Number(props.layoutProps.slidesPerViewDesktop) || 1);
});

/**
 * Breakpoints для Swiper (только published mode).
 */
const sliderBreakpoints = computed(() => ({
    0: {
        slidesPerView: Math.max(1, Number(props.layoutProps.slidesPerViewMobile) || 1),
    },
    768: {
        slidesPerView: Math.max(1, Number(props.layoutProps.slidesPerViewTablet) || 1),
    },
    1024: {
        slidesPerView: Math.max(1, Number(props.layoutProps.slidesPerViewDesktop) || 1),
    },
}));

const dropIndicatorStyle = computed<Record<string, string>>(() => {
    if (!dropIndicator.value) {
        return {
            opacity: '0',
            left: '0',
        };
    }
    return {
        opacity: '1',
        left: `${dropIndicator.value.offset}px`,
    };
});

const sliderRootStyle = computed<Record<string, string>>(() => ({
    pointerEvents: 'auto',
}));

const parsedCaptions = computed<Array<{ text: string; subtitle?: string }>>(() => {
    const raw = props.layoutProps.captions;
    if (!raw) {
        return [];
    }

    if (Array.isArray(raw)) {
        return raw.filter(
            (item): item is { text: string; subtitle?: string } =>
                typeof item === 'object' && item !== null && typeof item.text === 'string'
        );
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (item: unknown): item is { text: string; subtitle?: string } =>
                        typeof item === 'object' &&
                        item !== null &&
                        typeof (item as Record<string, unknown>).text === 'string'
                );
            }
        } catch {
            return [];
        }
    }

    return [];
});

const hasCaptions = computed<boolean>(() => parsedCaptions.value.length > 0);

const captionPosition = computed<'top' | 'bottom'>(
    () => props.layoutProps.captionPosition || 'top'
);

const isCaptionClickable = computed<boolean>(
    () => props.layoutProps.showCaptionNavigation !== false
);
// #endregion

// #region Methods
/**
 * Handles Swiper slideChange event to sync active caption.
 */
function handleSlideChange(swiper: { realIndex: number }): void {
    activeSlideIndex.value = swiper.realIndex;
}

/**
 * Navigates to a specific slide when a caption tab is clicked.
 */
function handleCaptionClick(index: number): void {
    if (!isCaptionClickable.value) {
        return;
    }

    const swiperEl = sliderRef.value?.querySelector('.swiper') as HTMLElement & {
        swiper?: { slideTo: (index: number) => void };
    };

    if (swiperEl?.swiper) {
        swiperEl.swiper.slideTo(index);
    }

    activeSlideIndex.value = index;
}

/**
 * Возвращает список элементов слайдов, доступных для drag&drop (исключая дубликаты Swiper).
 *
 * @returns Коллекция HTMLElement, которые можно использовать как drop-мишени.
 */
function getDraggableSlides(): HTMLElement[] {
    if (!sliderRef.value) {
        return [];
    }
    const candidates = Array.from(
        sliderRef.value.querySelectorAll<HTMLElement>('[data-layout-drop-item="true"]')
    );

    return candidates.filter((el) => {
        const slideEl = el.closest('.swiper-slide');
        return !(slideEl && slideEl.classList.contains('swiper-slide-duplicate'));
    });
}

/**
 * Сбрасывает состояние drop-индикатора.
 */
function clearDropIndicator(): void {
    dropIndicator.value = null;
    dropInsertIndex.value = null;
}

/**
 * Пересчитывает позицию индикатора вставки на основании текущей позиции курсора.
 *
 * @param event - Dragover событие.
 */
function updateDropIndicator(event: DragEvent): void {
    if (!sliderRef.value) {
        return;
    }
    const slides = getDraggableSlides();
    const rect = sliderRef.value.getBoundingClientRect();
    const pointerX = event.clientX;
    const containerWidth = sliderRef.value.clientWidth;

    if (slides.length === 0) {
        const offset = Math.max(0, Math.min(pointerX - rect.left, containerWidth));
        dropIndicator.value = {
            index: 0,
            offset,
        };
        dropInsertIndex.value = 0;
        return;
    }

    let targetIndex = slides.length;
    let offset = containerWidth;

    for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        const slideRect = slide.getBoundingClientRect();
        const midpoint = slideRect.left + slideRect.width / 2;

        if (pointerX < midpoint) {
            targetIndex = index;
            offset = slideRect.left - rect.left;
            break;
        }
    }

    if (targetIndex === slides.length) {
        const lastRect = slides[slides.length - 1].getBoundingClientRect();
        offset = lastRect.right - rect.left;
    }

    offset = Math.max(0, Math.min(offset, containerWidth));

    dropIndicator.value = {
        index: targetIndex,
        offset,
    };
    dropInsertIndex.value = targetIndex;
}
// #endregion

// #region Drop zone
const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useLayoutDropZone({
        containerRef: sliderRef,
        layoutId: () => props.layoutId,
        isEnabled: isEditor,
        useDragDepth: true,
        onDragMove: updateDropIndicator,
        onReset: clearDropIndicator,
        resolveDropIndex: () =>
            typeof dropInsertIndex.value === 'number'
                ? dropInsertIndex.value
                : (dropIndicator.value?.index ?? null),
    });
// #endregion
</script>

<template>
    <div
        ref="sliderRef"
        :class="[
            $style.BlockSlider,
            {
                [$style._editor]: isEditor,
                [$style._empty]: !hasSlides,
                [$style._dragOver]: isEditor && isDragOver,
            },
        ]"
        :style="sliderRootStyle"
        :data-layout-drop-zone="isEditor ? 'true' : null"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <!-- Caption navigation (top) -->
        <div v-if="hasCaptions && captionPosition === 'top'" :class="$style.captions">
            <button
                v-for="(caption, index) in parsedCaptions"
                :key="index"
                :class="[
                    $style.captionTab,
                    { [$style.captionTabActive]: activeSlideIndex === index },
                ]"
                type="button"
                @mousedown.prevent
                @click="handleCaptionClick(index)"
            >
                <span :class="$style.captionText">{{ caption.text }}</span>
                <span v-if="caption.subtitle" :class="$style.captionSubtitle">
                    {{ caption.subtitle }}
                </span>
            </button>
        </div>

        <ClientOnly>
            <Swiper
                v-if="hasSlides"
                :key="`slider-${currentSlidesPerView}`"
                :modules="sliderModules"
                :space-between="spaceBetween"
                :slides-per-view="
                    isEditor
                        ? currentSlidesPerView
                        : Math.max(1, Number(props.layoutProps.slidesPerViewDesktop) || 1)
                "
                :breakpoints="isEditor ? undefined : sliderBreakpoints"
                :loop="sliderLoop"
                :autoplay="autoplayOptions as any"
                :navigation="navigationEnabled as any"
                :pagination="(paginationEnabled ? { clickable: true } : false) as any"
                :simulate-touch="!isEditor"
                :allow-touch-move="!isEditor"
                :class="$style.swiper"
                @slide-change="handleSlideChange"
            >
                <SwiperSlide v-for="slide in props.slides" :key="slide.id" :class="$style.slide">
                    <div :class="$style.slideInner" data-layout-drop-item="true">
                        <SlideRenderer :component="slide" :render-fn="renderSlide" />
                    </div>
                </SwiperSlide>
            </Swiper>
        </ClientOnly>

        <!-- Caption navigation (bottom) -->
        <div v-if="hasCaptions && captionPosition === 'bottom'" :class="$style.captions">
            <button
                v-for="(caption, index) in parsedCaptions"
                :key="index"
                :class="[
                    $style.captionTab,
                    { [$style.captionTabActive]: activeSlideIndex === index },
                ]"
                type="button"
                @mousedown.prevent
                @click="handleCaptionClick(index)"
            >
                <span :class="$style.captionText">{{ caption.text }}</span>
                <span v-if="caption.subtitle" :class="$style.captionSubtitle">
                    {{ caption.subtitle }}
                </span>
            </button>
        </div>

        <div
            v-if="isEditor"
            ref="dropIndicatorRef"
            :class="$style.dropIndicator"
            :style="dropIndicatorStyle"
            data-layout-drop-indicator="true"
        />
    </div>
</template>

<style module lang="scss">
.BlockSlider {
    position: relative;
    overflow: hidden;
    width: 100%;
    padding: 1.6rem;
    border-radius: 1.2rem;
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);

    &._editor {
        border-radius: 0.4rem;
        border: 1px dashed rgb(var(--rgb-layout-slider) / 30%);
        background: rgb(var(--rgb-layout-slider) / 5%);

        &:hover {
            border-color: rgb(var(--rgb-layout-slider) / 50%);
            background: rgb(var(--rgb-layout-slider) / 8%);
        }

        // pointer-events: auto для дочерних элементов внутри Swiper,
        // чтобы преодолеть наследование pointer-events: none от BuilderCanvasItem > * *
        .slideInner {
            pointer-events: auto;
        }
    }

    &._empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 24rem;
        border-style: dashed;
    }

    &._dragOver {
        border-color: rgb(var(--rgb-layout-slider) / 80%);
        border-width: 0.2rem;
        background: rgb(var(--rgb-layout-slider) / 15%);
        box-shadow: 0 0 0 0.4rem rgb(var(--rgb-layout-slider) / 20%);
    }
}

.swiper {
    width: 100%;

    :global(.swiper-wrapper) {
        align-items: stretch;
    }
}

.slide {
    height: auto;
}

.slideInner {
    display: flex;
    flex-direction: column;
    height: 100%;

    > * {
        flex: 1;
    }
}

.captions {
    overflow-x: auto;
    display: flex;
    padding: 0 0.4rem;
    gap: 0.8rem;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.captionTab {
    display: flex;
    padding: 0.8rem 1.6rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    white-space: nowrap;
    transition: all 200ms ease;
    cursor: pointer;
    flex-direction: column;
    gap: 0.2rem;

    &:hover {
        border-color: var(--bricks-base-300);
        background: var(--bricks-base-50);
    }
}

.captionTabActive {
    border-color: var(--bricks-primary-500);
    background: var(--bricks-primary-50);
}

.captionText {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-600);

    .captionTabActive & {
        color: var(--bricks-primary-500);
    }
}

.captionSubtitle {
    font-size: 1.1rem;
    font-weight: 400;
    color: var(--bricks-base-500);
}

.dropIndicator {
    position: absolute;
    top: 1.2rem;
    width: 0.3rem;
    height: calc(100% - 2.4rem);
    border-radius: 0.3rem;
    background-color: var(--bricks-primary-400);
    opacity: 0;
    transition: opacity 120ms ease;
    pointer-events: none;
}

:global(.swiper-button-next),
:global(.swiper-button-prev) {
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 999rem;
    background-color: rgb(0 0 0 / 35%);
    color: var(--bricks-base-0);

    &:after {
        font-size: 1.2rem;
    }
}

:global(.swiper-pagination-bullet) {
    background-color: var(--bricks-base-500);
    opacity: 0.4;
}

:global(.swiper-pagination-bullet-active) {
    background-color: var(--bricks-primary-500);
    opacity: 1;
}
</style>
