<script setup lang="ts">
/**
 * @description Progressive image loading: a mock around 32px → a preview around
 * 480px → the full file. The variants are prepared by the media library when the
 * file is uploaded; the mode is chosen by the place in the page (a prop of the
 * Media block), not by the file itself.
 *
 * Two layers rather than one changing `src`: the full file fades in by `opacity`
 * over the placeholder, so a stage change gives neither a flash nor a layout
 * jump. Inside the placeholder layer the src is upgraded mock → preview with no
 * transition — by that point the preview is already in cache, and the swap is
 * instant.
 *
 * How the two layers hold the layout. The placeholder is the layer in the flow:
 * it holds the height of the wrapper when no ratio is set on the root, having the
 * same proportions as the full file, so `height: auto` behaves as on a plain
 * `<img>`. Once the full file is shown it does not unmount but fades out —
 * otherwise a block with automatic height would collapse to zero at the moment of
 * the swap. The full file is the layer above the flow: it covers the one in the
 * flow exactly and fades in by opacity, has no height of its own and therefore
 * moves nothing.
 *
 * The root itself is `height: 100%`, which CSS resolves to `auto` against a
 * container of indefinite height — so the component works the same inside a block
 * with a set height and inside a block with `height: auto`, where the image sets
 * the height. The inline `aspect-ratio` combines with that same rule: with a
 * definite container height `height` wins, with an indefinite one the ratio gives
 * the height. That is how one and the same layout holds the space both under the
 * transparent 1×1 and under the real image.
 *
 * **Before the viewport, the markup carries a transparent 1×1, not the preview.**
 * Otherwise a page with a hundred blocks would download a hundred previews at
 * once while two are visible: the full file would be deferred and most of the
 * saving lost. The space for the image is held at that moment by an
 * `aspect-ratio` computed from the file's pixel dimensions; if there are no
 * dimensions (schemas saved before they started being stored), the component
 * falls back to the preview in the markup — a jumping layout is worse than a
 * extra request.
 *
 * In `three-step` what goes into the markup first is not the 1×1 but the mock
 * itself (around 1 KB): that is the whole point of the third stage — something
 * meaningful in place of the image before the preview arrives. It has no reason
 * to wait for the viewport, being cheaper than the overhead of deferring it.
 *
 * The full file only starts loading once the frame approaches the viewport
 * (`IntersectionObserver`, with the margin of `OBSERVER_ROOT_MARGIN` ahead of the
 * edge). The exception is `eager`: above the fold the full file must not be
 * deferred, it is the LCP.
 *
 * If there are no variants (SVG, video, a file uploaded before they existed) or
 * the mode is off, the component honestly loads the full file at once and is no
 * different from a plain `<img>` — showing emptiness instead of an image is not
 * its job.
 *
 * The accessible name lives on the root rather than on the layers: the layers
 * mount and unmount as loading proceeds, and while the full file is not in the
 * markup its `alt` would be unreachable — an image below the fold would simply be
 * absent from the accessibility tree. Without a caption the image is decorative,
 * and then the root is removed from the accessibility tree altogether instead of
 * staying a nameless `role="img"`.
 */

// #region Imports
// Types
import type { IBricksImageProps, IBricksImageEmits } from './types.d.ts';

// Vue
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksImageProps>(), {
    alt: '',
    previewSrc: null,
    mockSrc: null,
    mode: 'off',
    eager: false,
    fit: 'cover',
    naturalWidth: null,
    naturalHeight: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksImageEmits>();
// #endregion

// #region Data
/**
 * Margin beyond the edge of the viewport: the full file starts loading before the
 * frame has reached the screen, otherwise the swap happens in plain sight.
 */
const OBSERVER_ROOT_MARGIN = '200px';
/**
 * A transparent 1×1 GIF as a data URI: it holds a place in the markup without
 * costing a single request. The trick is taken from the library `VImage` — there
 * it also sits in `src` while the real first stage waits to enter the viewport.
 */
const EMPTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const rootRef = ref<HTMLElement | null>(null);
/** Whether the full file is on screen (loaded successfully) */
const isFullVisible = ref(false);

/**
 * Whether the space for the image can be held without the image itself. Only when
 * the pixel dimensions are known: `aspect-ratio` is computed from them, and
 * without it a transparent 1×1 would give zero height to a block with
 * `height: auto`.
 *
 * Both values are checked for being finite and strictly positive rather than
 * merely truthy: a negative number is truthy too, and `-1 / 900` would give an
 * invalid ratio with the transparent 1×1 on — that is, zero height, exactly what
 * the check guards against. The dimensions come from the schema or from an
 * external backend, and there are no guarantees on them.
 */
function hasKnownBox(): boolean {
    const width = Number(props.naturalWidth);
    const height = Number(props.naturalHeight);

    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
}

/**
 * What stands in the placeholder layer before the frame enters the viewport.
 * `null` means there is no placeholder at all and the full file goes in right
 * away (the mode is off, `eager`, or the file has no preview — SVG, video, an
 * upload predating the variants).
 *
 * A plain function rather than a computed: its result is needed for the INITIAL
 * values of the refs below. Starting from an empty state and filling it in
 * `onMounted` makes the server render an empty `<span>` without a single `<img>`
 * — that is, `eager` gets its `fetchpriority="high"` only after mount, when it is
 * useless.
 */
function resolveInitialPlaceholder(): string | null {
    if (props.mode === 'off' || props.eager) {
        return null;
    }

    // The mock is the only stage worth keeping in the markup right away: it
    // exists precisely so that the space is not empty before the preview. The
    // check comes BEFORE the missing-preview one: for a file that got a mock but
    // no preview (the variants are generated independently) there would otherwise
    // be no stage left at all, and progressive loading would silently switch off
    if (props.mode === 'three-step' && props.mockSrc) {
        return props.mockSrc;
    }

    if (!props.previewSrc) {
        return null;
    }

    return hasKnownBox() ? EMPTY_GIF : props.previewSrc;
}

const placeholderSrc = ref<string | null>(resolveInitialPlaceholder());
/**
 * Whether the full file has to be loaded (the frame is in the viewport, or the
 * mode does not defer).
 *
 * On the server the full file is turned on right away only when there are no
 * stages: with `off` and `eager` it is exactly what has to end up in the markup.
 * For progressive loading it is the placeholder that goes out in SSR — otherwise
 * the browser would start the full load before `IntersectionObserver` even had a
 * chance to appear, and nothing would be left of the optimization.
 */
const shouldLoadFull = ref(placeholderSrc.value === null);
let observer: IntersectionObserver | null = null;
let previewLoader: HTMLImageElement | null = null;
/**
 * Number of the current state: the preview preload checks it before writing.
 * Without it an `onload` started for the previous file would slip that file's
 * preview under the new full one — the component is reused when a block's media
 * changes, on undo/redo and on fast switching.
 */
let loadGeneration = 0;
// #endregion

// #region Computed
/**
 * The mock around 32px is the one on screen. It is the only stage that gets
 * blurred: stretched to the frame size it would otherwise read as a broken image
 * rather than as "still loading", while the preview around 480px needs no blur.
 */
const isShowingMock = computed<boolean>(
    () => Boolean(props.mockSrc) && placeholderSrc.value === props.mockSrc
);
/**
 * The full file may be shown: it has loaded, or there is no placeholder at all and
 * there is nothing to hide it behind opacity for.
 */
const isFullReady = computed<boolean>(() => isFullVisible.value || !placeholderSrc.value);
/**
 * Ratio for the root. Set whenever the dimensions are known, not only under the
 * 1×1: the space for the image is then held from the first frame and does not
 * change on any stage swap.
 */
const boxStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};

    if (hasKnownBox()) {
        style.aspectRatio = `${props.naturalWidth} / ${props.naturalHeight}`;
    }

    return style;
});
// #endregion

// #region Methods
/** Stops watching the viewport */
function stopObserving(): void {
    observer?.disconnect();
    observer = null;
}

/**
 * Cancels the preview preload.
 *
 * Kept apart from `stopObserving` rather than merged into one function: the
 * observer is removed at exactly the moment the preload starts, and a shared
 * "stop everything" would kill it right after the start.
 */
function cancelPreviewPreload(): void {
    if (!previewLoader) {
        return;
    }

    previewLoader.onload = null;
    previewLoader.onerror = null;
    previewLoader = null;
}

/**
 * Fetches the preview into the placeholder layer: the mock is on screen and the
 * next stage is the preview. The swap happens only after the real load, otherwise
 * an empty frame would flash in the mock's place.
 */
function upgradePlaceholderToPreview(): void {
    const previewSrc = props.previewSrc;

    if (!previewSrc || placeholderSrc.value === previewSrc) {
        return;
    }

    cancelPreviewPreload();

    const generation = loadGeneration;
    const loader = new Image();

    loader.onload = (): void => {
        // The props may have changed while it was loading: someone else's preview
        // under the new full file is worse than a missing stage
        if (generation !== loadGeneration) {
            return;
        }

        placeholderSrc.value = previewSrc;
        previewLoader = null;
    };
    loader.onerror = (): void => {
        previewLoader = null;
    };
    loader.src = previewSrc;
    previewLoader = loader;
}

/**
 * The placeholder failed. It is removed and the full file moves into the flow: the
 * variant address may have gone stale (the file was re-uploaded, the object
 * deleted), and without this a block with automatic height would stay at zero
 * height — that is, there would be no image at all. The full file no longer waits
 * for the viewport either: there is nothing to wait for and nothing to show.
 */
function handlePlaceholderError(): void {
    placeholderSrc.value = null;
    shouldLoadFull.value = true;
}

/** Marks the full file as shown */
function handleFullLoad(): void {
    isFullVisible.value = true;
    emit('load');
}

/**
 * The full file failed. The placeholder stays on screen: an empty frame instead of
 * the image is worse than a low resolution of it.
 */
function handleFullError(): void {
    emit('error');
}

/** Starts watching for the frame to enter the viewport */
function startObserving(): void {
    const element = rootRef.value;

    // Without IntersectionObserver (an old browser, SSR hydration before mount)
    // we load right away: progressive loading is an optimization, not a condition
    // for showing the image
    if (!element || typeof IntersectionObserver === 'undefined') {
        shouldLoadFull.value = true;
        return;
    }

    observer = new IntersectionObserver(
        (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) {
                return;
            }

            shouldLoadFull.value = true;
            // The observer is removed BEFORE the preload starts: the reverse order
            // would cancel that very preload right afterwards
            stopObserving();
            upgradePlaceholderToPreview();
        },
        { rootMargin: OBSERVER_ROOT_MARGIN }
    );
    observer.observe(element);
}

/**
 * Brings the state in line with the current props: clears what is shown and
 * decides anew whether to wait for the viewport or load right away.
 */
function resetLoading(): void {
    stopObserving();
    cancelPreviewPreload();
    loadGeneration += 1;
    isFullVisible.value = false;

    const initial = resolveInitialPlaceholder();

    placeholderSrc.value = initial;
    shouldLoadFull.value = initial === null;

    if (initial !== null) {
        startObserving();
    }
}
// #endregion

// #region Lifecycle
/**
 * The initial state has already been computed synchronously (see
 * `placeholderSrc`), so all that is left here is to hook up the observation — the
 * markup must not be re-established, it has to match the server's.
 */
onMounted(() => {
    if (!shouldLoadFull.value) {
        startObserving();
    }
});

// The dimensions are in the list on a par with the addresses: the choice of the
// first layer depends on them (transparent 1×1 against preview), and a change of
// dimensions alone at the same address — undo, data refreshed from the outside —
// would otherwise leave the 1×1 without a ratio, that is a 1:1 square in place of
// the image until it enters the viewport
watch(
    () => [
        props.src,
        props.previewSrc,
        props.mockSrc,
        props.mode,
        props.eager,
        props.naturalWidth,
        props.naturalHeight,
    ],
    () => {
        resetLoading();
    }
);

onBeforeUnmount(() => {
    stopObserving();
    cancelPreviewPreload();
    // A preload that survived until unmount would otherwise touch a ref of a dead
    // component
    loadGeneration += 1;
});
// #endregion
</script>

<template>
    <span
        ref="rootRef"
        :class="$style.BricksImage"
        :style="boxStyle"
        :role="props.alt ? 'img' : undefined"
        :aria-label="props.alt || undefined"
        :aria-hidden="props.alt ? undefined : 'true'"
    >
        <img
            v-if="placeholderSrc"
            :src="placeholderSrc"
            alt=""
            :class="[
                $style.layer,
                $style._flow,
                { [$style._blurred]: isShowingMock, [$style._hidden]: isFullVisible },
            ]"
            :style="{ objectFit: props.fit }"
            aria-hidden="true"
            decoding="async"
            @error="handlePlaceholderError"
        />

        <img
            v-if="shouldLoadFull"
            :src="props.src"
            alt=""
            :class="[
                $style.layer,
                placeholderSrc ? $style._overlay : $style._flow,
                { [$style._visible]: isFullReady },
            ]"
            :style="{ objectFit: props.fit }"
            :loading="props.eager ? 'eager' : 'lazy'"
            :fetchpriority="props.eager ? 'high' : undefined"
            aria-hidden="true"
            decoding="async"
            @load="handleFullLoad"
            @error="handleFullError"
        />
    </span>
</template>

<style module lang="scss">
.BricksImage {
    position: relative;
    overflow: hidden;
    display: block;
    width: 100%;
    height: 100%;
}

.layer {
    display: block;
    width: 100%;
    height: 100%;
}

._flow {
    position: relative;
}

._overlay {
    position: absolute;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);
    inset: 0;

    &._visible {
        opacity: 1;
    }
}

._hidden {
    opacity: 0;
}

._blurred {
    filter: blur(0.8rem);
    transform: scale(1.05);
}
</style>
