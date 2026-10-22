<script setup lang="ts">
/**
 * @description The loading overlay of the editor: the animated logo, the progress
 * bar and the rotating phrase under it.
 *
 * Decisions held by the style section: the isometric grid of the background is laid
 * at ±30°, the angle of the faces of the cubes of the logo (tan 30° = 46 / 79.67,
 * the half-height of the top face over the half-width — the geometry is in
 * `BuilderLogo`), and the aurora glow under the logo and the row "phrase on the
 * left, percentage on the right" repeat the ⏳ Loader screen of the design file. The
 * logo is enlarged by real size (`--builder-logo-width`/`--builder-logo-height`)
 * rather than by `transform: scale`: scale rasterizes the SVG at the small layout
 * size and smears the animation.
 */

// #region Imports
// Types
import type { IBuilderLoaderEmits, IBuilderLoaderProps } from '../types/builder';

// Vue
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BuilderLogo from '../../core/components/BuilderLogo.vue';
// #endregion

// #region Props
const props = defineProps<IBuilderLoaderProps>();
// #endregion

// #region Emits
const emit = defineEmits<IBuilderLoaderEmits>();
// #endregion

// #region Data
/** The lowest value of the progress (%) that makes the bar visible right at the start. */
const MIN_VISIBLE_PROGRESS = 1;

/**
 * The least duration of the showing (ms) on the first opening of the editor — one
 * full cycle of the wave of the logo: 4 cubes × 0.6 s (`--lift-step` in
 * BuilderLogo). On its boundary every cube is at rest, which is why the overlay is
 * not taken down any earlier. The threshold is barely felt here: a cold entry waits
 * for the markup, the chunks and the schema anyway.
 *
 * There is no maximum: the overlay leaves on the actual end of the load.
 */
const INITIAL_MIN_VISIBLE_DURATION_MS = 2400;

/**
 * The least duration of the showing (ms) when pages are switched inside the
 * application — half a wave (2 cubes) and exactly one phrase under the bar. The
 * threshold is needed against a flicker, but a full cycle turned into an artificial
 * pause here: on the client only the schema arrives, and the canvas is ready in tens
 * of milliseconds.
 */
const SWITCH_MIN_VISIBLE_DURATION_MS = 1200;

/**
 * The ceiling of the progress (%) while the load is going on. A bar that has
 * reached 100% over an unfinished session promises a readiness that is not there:
 * work is still impossible.
 */
const LOADING_PROGRESS_CEILING = 99;

/**
 * The interval (ms) of the change of the phrase under the bar — two segments of the
 * wave of the logo (2 × --lift-step in BuilderLogo): two cubes manage to rise per
 * phrase.
 */
const PHRASE_INTERVAL_MS = 1200;

const { t, tm, rt } = useI18n();

/** The current value of the progress (0–100): the width of the bar and the percentage text. */
const progress = ref(props.isLoading ? MIN_VISIBLE_PROGRESS : 0);

/** Locale key of the rotating phrases (an array behind it, hence `tm`). */
const LOADER_PHRASES_KEY = 'bricks.common.loaderPhrases';

/** Whether the overlay is visible. It drives the v-if on the root element. */
const isVisible = ref(props.isLoading);

/** The default caption — the same on SSR and on the client (no randomness). */
const defaultPhrase = computed<string>(() => t('bricks.common.loading'));

/** The current phrase under the bar: the default from the first frame, then the rotation. */
const currentPhrase = ref(defaultPhrase.value);

/** The id of the current requestAnimationFrame: what a restart or an unmount cancels. */
let animationRafId: number | null = null;

/** The id of the setInterval rotating the phrases. */
let phraseIntervalId: number | null = null;

/**
 * The threshold of the showing is served out while the load is still going on: the
 * bar stands at the ceiling and no more frames are asked for — there is nothing to
 * move. The watcher sees the cycle through once the load ends.
 */
let isCycleParked = false;
// #endregion

// #region Computed
/** The inline style of the progress bar (the width in %). */
const progressStyle = computed(() => ({
    width: `${progress.value}%`,
}));

/**
 * The phrases of the loader for the active locale. `tm` rather than `t`: the value
 * behind the key is an array, and every element still has to go through `rt` — what
 * `tm` hands back are compiled messages, not strings. Add, edit and remove lines
 * straight in `locales/{ru,en}.json`; nothing else has to change.
 */
const phrases = computed<string[]>(() => {
    const messages: unknown = tm(LOADER_PHRASES_KEY);

    if (!Array.isArray(messages)) {
        return [];
    }

    return messages.map((message) => rt(message));
});
// #endregion

// #region Methods
/**
 * Stops the current rAF animation of the progress. SSR-safe: on the server there is
 * no window, so it leaves at once.
 */
function stopProgress(): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (animationRafId !== null) {
        window.cancelAnimationFrame(animationRafId);
        animationRafId = null;
    }
}

/**
 * Returns a random phrase, one other than the current one where possible.
 */
function pickRandomPhrase(): string {
    const pool = phrases.value.filter((phrase) => phrase !== currentPhrase.value);
    const source = pool.length ? pool : phrases.value;

    return source[Math.floor(Math.random() * source.length)] ?? '';
}

/**
 * Stops the rotation of the phrases (clearInterval). SSR-safe: on the server there
 * is no window, so it leaves at once.
 */
function stopPhrases(): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (phraseIntervalId !== null) {
        window.clearInterval(phraseIntervalId);
        phraseIntervalId = null;
    }
}

/**
 * Starts the rotation of the random phrases at an interval of PHRASE_INTERVAL_MS.
 * Called after mounted — by that moment the default caption out of the initial
 * value has served its frame of the hydration, so the rotation begins at once.
 */
function startPhrases(): void {
    stopPhrases();
    currentPhrase.value = pickRandomPhrase();

    phraseIntervalId = window.setInterval(() => {
        // The load has ended — the phrase is not touched: the overlay serves its
        // threshold out and leaves, and a swap of the caption at that moment would
        // merely flash. The interval of the rotation equals the short threshold of
        // the showing, so the case is not a rare one
        if (!props.isLoading) {
            return;
        }

        currentPhrase.value = pickRandomPhrase();
    }, PHRASE_INTERVAL_MS);
}

/**
 * Shows the overlay for at least `minVisibleDurationMs` and takes it down once both
 * have ended: the threshold of the showing and the load itself.
 *
 * Over a cycle the progress is animated from MIN_VISIBLE_PROGRESS to 100% with a
 * quadratic ease-out (quick at the start, slowing down toward the end) through
 * requestAnimationFrame; over an unfinished session it runs into
 * LOADING_PROGRESS_CEILING and waits there.
 *
 * SSR-safe: on the server there is no window, so it leaves at once.
 *
 * @param minVisibleDurationMs - The threshold of the showing: a full cycle on the
 * first opening of the editor, half of one when pages are switched inside the
 * application.
 */
function runLoaderCycle(minVisibleDurationMs: number): void {
    if (typeof window === 'undefined') {
        return;
    }

    stopProgress();
    isCycleParked = false;
    isVisible.value = true;
    progress.value = MIN_VISIBLE_PROGRESS;
    startPhrases();

    let cycleStartTime: number | null = null;

    /**
     * An rAF frame: it drives the progress and takes the overlay down once both the
     * cycle and the load have ended.
     */
    function tick(timestamp: number): void {
        if (cycleStartTime === null) {
            cycleStartTime = timestamp;
        }

        // The normalized time of the cycle [0..1]
        const ratio = Math.min((timestamp - cycleStartTime) / minVisibleDurationMs, 1);
        // A quadratic ease-out: it slows down toward the end
        const eased = 1 - (1 - ratio) * (1 - ratio);
        const target = MIN_VISIBLE_PROGRESS + (100 - MIN_VISIBLE_PROGRESS) * eased;

        progress.value = props.isLoading ? Math.min(target, LOADING_PROGRESS_CEILING) : target;

        if (ratio < 1) {
            animationRafId = window.requestAnimationFrame(tick);
            return;
        }

        // The threshold is served out but the load goes on: the bar has run into
        // the ceiling and is motionless from this moment. No more frames are asked
        // for — they would draw one and the same value for the whole wait, and the
        // wait may last until the ceiling of the bootstrap
        if (props.isLoading) {
            animationRafId = null;
            isCycleParked = true;
            return;
        }

        finishLoaderCycle();
    }

    animationRafId = window.requestAnimationFrame(tick);
}

/**
 * Sees the cycle through: the bar reaches 100% and the overlay leaves.
 *
 * Called either by the last frame of the animation or — when the frames have been
 * stopped at the ceiling already — by the end of the load.
 */
function finishLoaderCycle(): void {
    stopProgress();
    isCycleParked = false;
    progress.value = 100;
    isVisible.value = false;
    stopPhrases();
}
// #endregion

// #region Watchers
// A repeated showing is a switch of pages or a retry after a refusal: the shell and
// the chunks are in place already, only the data arrives anew. The first opening of
// the editor does not come here: there the loader is raised before the mounting
// (see onMounted)
watch(
    () => props.isLoading,
    (isLoading) => {
        if (isLoading) {
            runLoaderCycle(SWITCH_MIN_VISIBLE_DURATION_MS);
            return;
        }

        // The load ended while the bar already stood at the ceiling: there are no
        // frames, and there is nobody left to take the overlay down
        if (isCycleParked) {
            finishLoaderCycle();
        }
    }
);
// #endregion

// #region Lifecycle
// The first run is in onMounted rather than in an immediate watch: a random phrase
// set synchronously in setup on the client would not match the SSR markup (a
// hydration mismatch)
onMounted(() => {
    if (props.isLoading) {
        runLoaderCycle(INITIAL_MIN_VISIBLE_DURATION_MS);
    }
});

onUnmounted(() => {
    stopProgress();
    stopPhrases();
    isCycleParked = false;
});
// #endregion
</script>

<template>
    <Transition name="bricks-loader-fade" @after-leave="emit('hidden')">
        <div v-if="isVisible" :class="$style.TheBuilderLoader">
            <div :class="$style.aurora"></div>
            <div :class="$style.grid"></div>

            <div :class="$style.content">
                <div :class="$style.logoWrapper">
                    <BuilderLogo :is-touch="true" :is-infinite-animation="true" />
                </div>
                <div :class="$style.barContainer">
                    <div :class="$style.barFill" :style="progressStyle"></div>
                    <div :class="$style.barGlow" :style="progressStyle"></div>
                </div>

                <div :class="$style.meta">
                    <div :class="$style.phrase">
                        <Transition name="bricks-loader-phrase-fade" mode="out-in">
                            <span :key="currentPhrase">{{ currentPhrase }}</span>
                        </Transition>
                    </div>

                    <div :class="$style.percentage">{{ Math.round(progress) }}%</div>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style module lang="scss">
.TheBuilderLoader {
    position: absolute;
    top: 0;
    left: 0;
    z-index: var(--bricks-z-loader);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--bricks-base-0);
}

.aurora {
    position: absolute;
    background-image: radial-gradient(
        50rem 32rem at 50% 43%,
        color-mix(in srgb, var(--bricks-primary) 14%, transparent),
        transparent 70%
    );
    inset: 0;
    pointer-events: none;
}

.grid {
    position: absolute;
    background-image:
        repeating-linear-gradient(30deg, var(--bricks-base-900) 0 1px, transparent 1px 5.6rem),
        repeating-linear-gradient(150deg, var(--bricks-base-900) 0 1px, transparent 1px 5.6rem);
    opacity: 0.06;
    inset: 0;
    mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
    pointer-events: none;
}

.content {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 34rem;
}

.logoWrapper {
    --builder-logo-width: 10rem;
    --builder-logo-height: 9.4rem;

    margin-bottom: 2.4rem;
    color: var(--bricks-base-900);
}

.barContainer {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 1.4rem;
    border-radius: 0.4rem;
    background: var(--bricks-base-300);
}

.barFill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 0.4rem;
    background: var(--bricks-base-900);
}

.barGlow {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 0.2rem;
    background: inherit;
    opacity: 0.4;
}

.meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.6rem;
    width: 100%;
    margin-top: 1.2rem;
}

.phrase {
    min-height: 1.6rem;
    font-size: var(--bricks-font-size-sm);
    font-weight: 500;
    line-height: 1.6rem;
    color: var(--bricks-base-500);
}

.percentage {
    flex-shrink: 0;
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-900);
}
</style>
