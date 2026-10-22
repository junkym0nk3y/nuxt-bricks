<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../common/types/brick';
import type { IBlockSliderProps, ISliderBreakpoint, ISliderCaption } from '../types/blockProps';

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
import { DEFAULT_SLIDER_SPACE_BETWEEN } from '../constants/blockSlider';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';
import { useSliderDropTarget } from '../composables/useSliderDropTarget';

// Components
import { Swiper, SwiperSlide } from 'swiper/vue';
import { Navigation, Pagination, Autoplay, A11y } from 'swiper/modules';
import BlockSliderCaptions from './BlockSliderCaptions.vue';

// Styles: the slider css travels in the chunk of the component rather than in the
// global css of every page of the consumer (module isolation)
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

// The page device set for the JS breakpoints of Swiper. The provider may be absent (the
// block is rendered outside the builder and the renderer) — then the project constant is
// taken rather than runtimeConfig: a leaf block has no business knowing about the
// application configuration
const injectedDevices = inject(BRICKS_DEVICES_KEY, null);
const devices = computed(() => injectedDevices?.value ?? DEFAULT_BRICKS_DEVICES);
const activeSlideIndex = ref(0);
const styles = useCssModule();

const { getDraggableSlides, resolveSliderDropIndex } = useSliderDropTarget(sliderRef);
// #endregion

// #region Methods
/**
 * Folds a gap the way the published render does: zero is kept, anything unusable falls
 * back to the default.
 *
 * @param value - Value of the property.
 * @returns The gap in pixels.
 */
function normalizeSpaceBetween(value: unknown): number {
    const gap = Number(value);

    return Number.isFinite(gap) && gap >= 0 ? gap : DEFAULT_SLIDER_SPACE_BETWEEN;
}
// #endregion

// #region Computed
/**
 * Editor mode. BuilderCanvasItem switches pointer events off for the deep descendants
 * of a canvas item, and the slide contents inherit that from the Swiper wrappers even
 * though the slide itself is a drop item — which is why the editor styles put
 * `pointer-events: auto` back on `.slideInner`.
 */
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
/**
 * The gap between slides.
 *
 * Zero is a legal value — the property declares no lower bound — so a falsy check would
 * turn it into the default here while the CSS table of the published render kept it at
 * zero: the static markup would show a gap the hydrated slider then removed.
 */
const spaceBetween = computed<number>(() => normalizeSpaceBetween(props.layoutProps.spaceBetween));

/**
 * slidesPerView for the current canvas sheet.
 *
 * On the canvas the value has already been resolved for the active device
 * (`resolveBlockProps` merges `props.responsive[viewport]`), so it is taken straight
 * from the prop.
 */
const currentSlidesPerView = computed<number>(() =>
    normalizeSlidesPerView(props.layoutProps.slidesPerView)
);

/**
 * Breakpoints for Swiper (published mode only).
 *
 * Computed from the device set of the page rather than from a hardwired 768/1024: with
 * a set of the page's own, the former boundaries would disagree both with the CSS
 * layout and with the SSR fallback — at a width of 1400 Swiper would show the desktop
 * number of slides while the container is already a laptop one.
 */
const sliderBreakpoints = computed<Record<number, ISliderBreakpoint>>(() => {
    const responsive = (props.layoutProps.responsive ?? {}) as Record<
        string,
        Record<string, unknown> | undefined
    >;
    const baseSlidesPerView = normalizeSlidesPerView(props.layoutProps.slidesPerView);
    const baseSpaceBetween = spaceBetween.value;

    return Object.fromEntries(
        deviceRanges(devices.value).map((range) => {
            const overrides = responsive[range.key];
            const slides = overrides?.slidesPerView;
            const gap = overrides?.spaceBetween;

            return [
                range.min,
                {
                    slidesPerView:
                        slides === undefined ? baseSlidesPerView : normalizeSlidesPerView(slides),
                    // The gap goes through the breakpoints as well: after hydration the
                    // geometry of the slides belongs to Swiper, and the CSS variable of
                    // the static fallback stops being read at all
                    spaceBetween: gap === undefined ? baseSpaceBetween : normalizeSpaceBetween(gap),
                },
            ];
        })
    );
});

/**
 * CSS variables of the static SSR fallback — the one that puts the slide contents into
 * the server HTML for SEO and is replaced by the interactive Swiper after mount.
 *
 * Neither the number of slides nor the gap is chosen here any more: both are picked per
 * device by the generated rule, the same one that lays out the rest of the blocks. What
 * is left is the fallback of the base device.
 *
 * It lands under a name of its own rather than on `--bricks-slider-gap` itself: the
 * variable the block root carries is the one the generated rule picks per device, and a
 * declaration of the same name on a descendant would shadow it on every step. The
 * styles read this one only when the per-device table is absent — the block is mounted
 * outside the generated CSS in the card of the library and in the tests.
 */
const ssrFallbackStyle = computed<Record<string, string>>(() => ({
    '--bricks-slider-gap-fallback': `${spaceBetween.value}px`,
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
        resolveDropIndex: resolveSliderDropIndex,
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
        style="pointer-events: auto"
        :data-layout-drop-zone="isEditor ? 'true' : null"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
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

.ssrSlides {
    overflow: hidden;
    display: flex;
    width: 100%;
    gap: var(--bricks-slider-gap, var(--bricks-slider-gap-fallback, 16px));
}

.ssrSlide {
    --slide-gap: var(--bricks-slider-gap, var(--bricks-slider-gap-fallback, 16px));
    --bricks-slider-gap-total: calc((var(--bricks-slider-spv) - 1) * var(--slide-gap));

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
