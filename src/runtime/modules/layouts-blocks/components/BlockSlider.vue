<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { IBlockSliderProps, ISliderCaption } from '../types/blockProps';

// Vue
import {
    computed,
    defineComponent,
    h,
    inject,
    ref,
    useCssModule,
    type PropType,
    type VNodeChild,
} from 'vue';

// Constants
import { BRICKS_DEVICES_KEY, CANVAS_VIEWPORT_KEY } from '../../common/constants/injectionKeys';

// Utils
import { parseSliderCaptions } from '../utils/sliderCaptions';
import { normalizeSlidesPerView } from '../utils/slider';
import { deviceRanges } from '../../common/utils/bricks/devices';
import { DEFAULT_BRICKS_DEVICES } from '../../common/constants/devices';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';
import { useSliderDropTarget } from '../composables/useSliderDropTarget';

// Components
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Navigation, Pagination, Autoplay, A11y } from 'swiper/modules';
import BlockSliderCaptions from './BlockSliderCaptions.vue';

// Styles: css слайдера едет в чанк компонента, а не в глобальный css всех
// страниц потребителя (изоляция модуля)
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
// #endregion

// #region Components
const SlideRenderer = defineComponent({
    name: 'BlockSliderSlideRenderer',
    props: {
        component: {
            type: Object as PropType<IBricksComponent>,
            required: true,
        },

        renderFn: {
            type: Function as PropType<(component: IBricksComponent) => VNodeChild>,
            required: true,
        },
    },

    setup(slideProps) {
        return () => slideProps.renderFn(slideProps.component);
    },
});
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockSliderProps>(), {
    layoutId: undefined,
    slides: () => [],
    renderSlide: () => () => h('div'),
    isEditor: false,
});
// #endregion

// #region Data
const sliderRef = ref<HTMLElement | null>(null);
const injectedViewport = inject(CANVAS_VIEWPORT_KEY, null);

// Набор страницы для JS-брейкпоинтов Swiper. Провайдера может не быть (блок
// отрисован вне билдера и рендерера) — тогда берём константу проекта, а не
// runtimeConfig: лист-блоку незачем знать про конфигурацию приложения
const injectedDevices = inject(BRICKS_DEVICES_KEY, null);
const devices = computed(() => injectedDevices?.value ?? DEFAULT_BRICKS_DEVICES);
const activeSlideIndex = ref(0);
const styles = useCssModule();

const { dropInsertIndex, getDraggableSlides, updateDropTarget, clearDropTarget } =
    useSliderDropTarget(sliderRef);
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
 * slidesPerView для текущего листа канваса.
 *
 * На канвасе значение уже разрешено под активное устройство (`resolveBlockProps`
 * мержит `props.responsive[viewport]`), поэтому берётся напрямую из пропа.
 */
const currentSlidesPerView = computed<number>(() =>
    normalizeSlidesPerView(props.layoutProps.slidesPerView)
);

/**
 * Breakpoints для Swiper (только published mode).
 *
 * Считаются по набору устройств страницы, а не по зашитым 768/1024: с
 * собственным набором страницы прежние границы разошлись бы и с CSS-раскладкой,
 * и с SSR-fallback'ом — на ширине 1400 Swiper показывал бы десктопное число
 * слайдов, пока контейнер уже ноутбучный.
 */
const sliderBreakpoints = computed<Record<number, { slidesPerView: number }>>(() => {
    const responsive = (props.layoutProps.responsive ?? {}) as Record<
        string,
        Record<string, unknown> | undefined
    >;
    const base = normalizeSlidesPerView(props.layoutProps.slidesPerView);

    return Object.fromEntries(
        deviceRanges(devices.value).map((range) => {
            const override = responsive[range.key]?.slidesPerView;

            return [
                range.min,
                { slidesPerView: override === undefined ? base : normalizeSlidesPerView(override) },
            ];
        })
    );
});

/**
 * CSS-переменные статического SSR-fallback'а.
 *
 * Число слайдов сюда больше не входит: активную переменную
 * `--bricks-slider-spv` выбирает сгенерированное правило по набору страницы —
 * то же, что раскладывает остальные блоки. Здесь остаётся только зазор, который
 * от устройства не зависит.
 */
const ssrFallbackStyle = computed<Record<string, string>>(() => ({
    '--bricks-slider-gap': `${spaceBetween.value}px`,
}));

const sliderRootStyle = computed<Record<string, string>>(() => ({
    pointerEvents: 'auto',
}));

const parsedCaptions = computed<ISliderCaption[]>(() =>
    parseSliderCaptions(props.layoutProps.captions)
);

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
// #endregion

// #region Drop zone
const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useLayoutDropZone({
        containerRef: sliderRef,
        layoutId: () => props.layoutId,
        isEnabled: isEditor,
        useDragDepth: true,
        onDragMove: updateDropTarget,
        onReset: clearDropTarget,
        resolveDropIndex: () => dropInsertIndex.value,
        placeholderClass: `${styles.dropPlaceholder} swiper-slide`,
        resolvePlaceholderContainer: () =>
            sliderRef.value?.querySelector<HTMLElement>('.swiper-wrapper') ?? null,
        resolvePlaceholderChildren: getDraggableSlides,
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
        <BlockSliderCaptions
            v-if="hasCaptions && captionPosition === 'top'"
            :captions="parsedCaptions"
            :active-index="activeSlideIndex"
            @select="handleCaptionClick"
        />

        <ClientOnly>
            <Swiper
                v-if="hasSlides"
                :key="`slider-${currentSlidesPerView}`"
                :modules="sliderModules"
                :space-between="spaceBetween"
                :slides-per-view="currentSlidesPerView"
                :breakpoints="isEditor ? undefined : sliderBreakpoints"
                :loop="sliderLoop"
                :autoplay="autoplayOptions"
                :navigation="navigationEnabled"
                :pagination="paginationEnabled ? { clickable: true } : false"
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

            <!-- Статический SSR-fallback: контент слайдов в server-HTML (SEO),
                 после mount заменяется интерактивным Swiper -->
            <template #fallback>
                <div
                    v-if="!isEditor && hasSlides"
                    :class="$style.ssrSlides"
                    :style="ssrFallbackStyle"
                >
                    <div
                        v-for="slide in props.slides"
                        :key="slide.id"
                        :class="[$style.ssrSlide, $style.slideInner]"
                    >
                        <SlideRenderer :component="slide" :render-fn="renderSlide" />
                    </div>
                </div>
            </template>
        </ClientOnly>

        <!-- Caption navigation (bottom) -->
        <BlockSliderCaptions
            v-if="hasCaptions && captionPosition === 'bottom'"
            :captions="parsedCaptions"
            :active-index="activeSlideIndex"
            @select="handleCaptionClick"
        />
    </div>
</template>

<style module lang="scss">
.BlockSlider {
    position: relative;
    overflow: hidden;
    width: 100%;
    padding: 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);

    &._editor {
        border: 1px dashed var(--bricks-base-300);
        background: var(--bricks-base-50);

        &:hover {
            border-color: var(--bricks-primary);
            background: color-mix(in srgb, var(--bricks-primary) 6%, transparent);
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
        border-color: var(--bricks-primary);
        border-width: 0.2rem;
        background: color-mix(in srgb, var(--bricks-primary) 6%, transparent);
        box-shadow: 0 0 0 0.2rem var(--bricks-primary);
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

// Статическая SSR-раскладка слайдов до гидратации Swiper. Ширины считаются от
// `--bricks-slider-spv`, которую выбирает сгенерированное правило по набору
// устройств страницы — те же ступени, что у Swiper и у остальных блоков
.ssrSlides {
    overflow: hidden;
    display: flex;
    width: 100%;
    gap: var(--bricks-slider-gap);
}

.ssrSlide {
    --bricks-slider-gap-total: calc((var(--bricks-slider-spv) - 1) * var(--bricks-slider-gap));

    flex: 0 0 calc((100% - var(--bricks-slider-gap-total)) / var(--bricks-slider-spv));
    min-width: 0;
}

.dropPlaceholder {
    flex: 0 0 var(--bricks-drag-placeholder-flow-width);
    width: var(--bricks-drag-placeholder-flow-width);
    min-width: var(--bricks-drag-placeholder-flow-width);
    height: var(--bricks-drag-placeholder-height);
    border: 0.2rem dashed var(--bricks-primary);
    background: color-mix(in srgb, var(--bricks-primary) 7%, transparent);
    pointer-events: none;
}

:global(.swiper-button-next),
:global(.swiper-button-prev) {
    width: 3.2rem;
    height: 3.2rem;
    border-radius: var(--bricks-border-radius-pill);
    background-color: color-mix(in srgb, var(--bricks-base-900) 35%, transparent);
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
