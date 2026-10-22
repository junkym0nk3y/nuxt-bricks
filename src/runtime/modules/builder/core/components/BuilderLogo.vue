<script setup lang="ts">
/**
 * @description Builder wordmark: four isometric cubes lifting in a wave.
 *
 * The lift and the color of a cube are animated through registered custom properties
 * (`--cube-lift`, `--cube-color`) instead of through `transform`: the browser takes a
 * transform animation to the compositor and rasterizes the cubes at their on-screen
 * size, which at DPR 1 comes out blurred. Animating a variable stays on the main
 * thread, and the SVG is repainted as vector geometry every frame. `--cube-color` is
 * registered for a second reason too — only a registered property interpolates inside
 * keyframes — and it inherits, so the three faces read it through `color-mix` and
 * derive their own shades from one value. Its base is a muted `base-300` rather than
 * `base-900`: the mark must not fight the `base-0` background of the header. The lift
 * rises above the top of the viewBox, so the icon is deliberately left unclipped.
 *
 * `:transform.attr` on the cube group is mandatory: during hydration a Fragment (the
 * `v-for`) inside an `svg` loses the SVG namespace, and Vue then tries to set
 * `transform` as a DOM property, which on an SVG element is read-only.
 */

// #region Imports
// Types
import type { IBuilderLogoProps } from '../types/components';

// Vue
import { computed, onMounted, ref, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBuilderLogoProps>(), {
    isTouch: false,
    to: null,
    label: '',
    target: '_blank',
    isInfiniteAnimation: false,
});
// #endregion

// #region Data
const $style = useCssModule();
const isAnimating = ref(false);

// The looping wave only starts after mount: SSR markup carrying the .animating class
// would start the CSS animation as the styles load — earlier than the consumer (the
// loader), which starts its own timers after hydration, and the phases would drift
// apart.
const isMounted = ref(false);

// The color relay: the liftOrder of the cube that stays painted after a pass (null
// means every cube is gray), and of the cube the current pass fades back to the base
// color. While a cube animates, its `animation-fill-mode: both` makes the keyframes
// win over the cascade — which is what keeps a freshly marked cube gray until its own
// segment of the wave arrives, because its 0% frame paints it in the base color.
const paintedOrder = ref<number | null>(null);
const unpaintingOrder = ref<number | null>(null);

// Isometric cube: half-width 79.67, half-height of the top face 46, vertical edge 92.
// Three separate faces (top / left / right) laid out from the top vertex (0,0) — each
// face takes its own shade of --cube-color; a fill plus a stroke of the same color
// cover the edges of the cubes drawn before it (painter's algorithm).
const CUBE_FACE_PATHS = {
    top: 'M0 0 L79.67 46 L0 92 L-79.67 46 Z',
    left: 'M-79.67 46 L0 92 L0 184 L-79.67 138 Z',
    right: 'M0 92 L79.67 46 L79.67 138 L0 184 Z',
} as const;

// Order in the array = paint order (back to front): the rear cube comes first.
// liftOrder — the order of the lift within the wave: the front row left to right,
// then the rear one.
// activeColor — the color a cube fades into at the peak of its lift.
const LOGO_CUBES = [
    { x: 241.11, y: 2.43, liftOrder: 3, activeColor: 'var(--bricks-yellow)' },
    { x: 81.67, y: 2, liftOrder: 0, activeColor: 'var(--bricks-primary)' },
    { x: 161.27, y: 48.05, liftOrder: 1, activeColor: 'var(--bricks-purple)' },
    { x: 240.86, y: 94, liftOrder: 2, activeColor: 'var(--bricks-danger-500)' },
];

// A full pass of the hover wave: 4 cubes × a 0.6s segment
const HOVER_ANIMATION_DURATION_MS = 2400;
// #endregion

// #region Computed
// A positive animation delay keeps its phase offset across iterations, so the loop
// holds the shape of the wave: every cube lifts inside the first quarter of the cycle
// and waits out the rest of it.
const isInfiniteActive = computed<boolean>(() => props.isInfiniteAnimation && isMounted.value);

const classList = computed(() => [
    {
        [$style.animating]: isAnimating.value || isInfiniteActive.value,
        [$style.infinite]: isInfiniteActive.value,
        [$style.clickable]: Boolean(props.to),
    },
]);

const componentBind = computed(() => ({
    target: props.target,
    href: props.to || undefined,
    'aria-label': props.label || undefined,
}));

/**
 * Whether the mark renders as a link.
 *
 * No address means no link, and that is the default: the blocking loader mounts the mark
 * without one, and a default of the site root turned it into an anchor there — pointer
 * cursor and a click that opened the root in a new tab from a screen that blocks input.
 * There is no place where a link to the root would be the sensible default: the two link
 * consumers pass the address they need.
 */
const isLink = computed<boolean>(() => Boolean(props.to));
// #endregion

// #region Methods
/**
 * Builds the class list of a cube: its role in the color relay (stays painted, or
 * fades back).
 */
function getCubeClassList(liftOrder: number): (string | Record<string, boolean>)[] {
    return [
        $style.cube,
        {
            [$style.painted]: liftOrder === paintedOrder.value,
            [$style.unpainting]: liftOrder === unpaintingOrder.value,
        },
    ];
}

/**
 * Returns the next state of the relay: it starts at cube 0, steps to the next cube
 * along the wave, and after the last one makes a reset pass to a fully gray logo
 * (null), closing the circle.
 */
function getNextPaintedOrder(current: number | null): number | null {
    if (current === null) {
        return 0;
    }

    return current === LOGO_CUBES.length - 1 ? null : current + 1;
}

/**
 * Runs one pass of the cube lift wave and steps the color relay on: the cube painted
 * before fades back, the next one along the wave stays painted.
 */
function onMouseenter(): void {
    if (isAnimating.value || props.isTouch || props.isInfiniteAnimation) {
        return;
    }

    unpaintingOrder.value = paintedOrder.value;
    paintedOrder.value = getNextPaintedOrder(paintedOrder.value);
    isAnimating.value = true;

    setTimeout(() => {
        isAnimating.value = false;
        unpaintingOrder.value = null;
    }, HOVER_ANIMATION_DURATION_MS);
}
// #endregion

// #region Lifecycle
onMounted(() => {
    isMounted.value = true;
});
// #endregion
</script>

<template>
    <div :class="[$style.BuilderLogo, classList]">
        <component
            :is="isLink ? 'a' : 'div'"
            v-bind="isLink ? componentBind : {}"
            :class="$style.wrapper"
            @mouseenter="onMouseenter"
        >
            <div :class="$style.inner">
                <svg
                    aria-hidden="true"
                    viewBox="-4 -30 331 314"
                    :class="$style.logoIcon"
                    fill="none"
                    shape-rendering="geometricPrecision"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <g
                        v-for="cube in LOGO_CUBES"
                        :key="cube.liftOrder"
                        :transform.attr="`translate(${cube.x}, ${cube.y})`"
                    >
                        <g
                            :class="getCubeClassList(cube.liftOrder)"
                            :style="{
                                '--lift-order': cube.liftOrder,
                                '--cube-active-color': cube.activeColor,
                            }"
                        >
                            <path :class="$style.faceTop" :d="CUBE_FACE_PATHS.top" />
                            <path :class="$style.faceLeft" :d="CUBE_FACE_PATHS.left" />
                            <path :class="$style.faceRight" :d="CUBE_FACE_PATHS.right" />
                        </g>
                    </g>
                </svg>
            </div>
        </component>
    </div>
</template>

<style lang="scss" module>
.BuilderLogo {
    user-select: none;
}

.clickable {
    cursor: pointer;
}

.wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.inner {
    flex-shrink: 0;
    width: var(--builder-logo-width, 3.4rem);
    height: var(--builder-logo-height, 3.4rem);
}

.logoIcon {
    overflow: visible;
    width: 100%;
    height: 100%;

    path {
        stroke: color-mix(in srgb, var(--cube-color), black 2%);
        stroke-width: 4;
        stroke-linejoin: round;
        stroke-linecap: round;
    }
}

@property --cube-lift {
    syntax: '<length>';
    inherits: false;
    initial-value: 0;
}

@property --cube-color {
    syntax: '<color>';
    inherits: true;
    initial-value: #d1d5db;
}

.cube {
    --lift-step: 0.6s;
    --cube-base-color: var(--bricks-base-300);
    --cube-color: var(--cube-base-color);

    transform: translateY(var(--cube-lift));
}

.faceTop {
    fill: color-mix(in srgb, var(--cube-color), white 20%);
}

.faceLeft {
    fill: color-mix(in srgb, var(--cube-color), black 22%);
}

.faceRight {
    fill: color-mix(in srgb, var(--cube-color), black 4%);
}

.painted {
    --cube-color: var(--cube-active-color);
}

.animating:not(.infinite) .cube {
    animation: cube-lift-pass var(--lift-step) ease-in-out both;
    animation-delay: calc(var(--lift-order) * var(--lift-step));
}

.animating:not(.infinite) .painted {
    animation-name: cube-lift-paint;
}

.animating:not(.infinite) .unpainting {
    animation-name: cube-lift-unpaint;
}

.infinite .cube {
    animation: cube-lift-loop calc(var(--lift-step) * 4) ease-in-out infinite;
    animation-delay: calc(var(--lift-order) * var(--lift-step));
}

@keyframes cube-lift-pass {
    0%,
    100% {
        --cube-lift: 0rem;
        --cube-color: var(--cube-base-color);
    }

    50% {
        --cube-lift: -3.4rem;
        --cube-color: var(--cube-active-color);
    }
}

@keyframes cube-lift-paint {
    0% {
        --cube-lift: 0rem;
        --cube-color: var(--cube-base-color);
    }

    50% {
        --cube-lift: -3.4rem;
        --cube-color: var(--cube-active-color);
    }

    100% {
        --cube-lift: 0rem;
        --cube-color: var(--cube-active-color);
    }
}

@keyframes cube-lift-unpaint {
    0% {
        --cube-lift: 0rem;
        --cube-color: var(--cube-active-color);
    }

    50% {
        --cube-lift: -3.4rem;
        --cube-color: var(--cube-base-color);
    }

    100% {
        --cube-lift: 0rem;
        --cube-color: var(--cube-base-color);
    }
}

@keyframes cube-lift-loop {
    0%,
    25%,
    100% {
        --cube-lift: 0rem;
        --cube-color: var(--cube-base-color);
    }

    12.5% {
        --cube-lift: -3.4rem;
        --cube-color: var(--cube-active-color);
    }
}
</style>
