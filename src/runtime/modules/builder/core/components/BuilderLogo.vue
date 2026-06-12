<script setup lang="ts">
// #region Imports
// Vue
import { computed, ref, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        text?: string;
        isTouch?: boolean;
        to?: string | null;
        external?: boolean;
        target?: '_blank' | '_self';
        isInfiniteAnimation?: boolean;
    }>(),
    {
        text: '',
        isTouch: false,
        to: '/',
        external: false,
        target: '_blank',
        isInfiniteAnimation: false,
    }
);

// #endregion

// #region Data
const $style = useCssModule();
const isAnimating = ref(false);

// Изо-куб: полуширина 79.67, полувысота верхней грани 46, вертикальное ребро 92.
// Три залитые грани (верх/лево/право) одним path относительно верхней вершины (0,0) —
// заливка перекрывает рёбра кубов, нарисованных раньше (painter's algorithm).
const CUBE_FACES_PATH = [
    'M0 0 L79.67 46 L0 92 L-79.67 46 Z',
    'M-79.67 46 L0 92 L0 184 L-79.67 138 Z',
    'M0 92 L79.67 46 L79.67 138 L0 184 Z',
].join(' ');

// Порядок в массиве = порядок отрисовки (back→front): задний куб первым.
// liftOrder — очерёдность подъёма в волне: передний ряд слева направо, затем задний.
const LOGO_CUBES = [
    { x: 241.11, y: 2.43, liftOrder: 3 },
    { x: 81.67, y: 2, liftOrder: 0 },
    { x: 161.27, y: 48.05, liftOrder: 1 },
    { x: 240.86, y: 94, liftOrder: 2 },
];

// Полный проход hover-волны: 4 куба × 0.6s сегмент
const HOVER_ANIMATION_DURATION_MS = 2400;
// #endregion

// #region Computed
const classList = computed(() => [
    {
        [$style.animating]: isAnimating.value || props.isInfiniteAnimation,
        [$style.infinite]: props.isInfiniteAnimation,
        [$style.clickable]: Boolean(props.to),
    },
]);

const componentBind = computed(() => ({
    target: props.target,
    href: props.to || undefined,
}));

const isLink = computed<boolean>(() => Boolean(props.to));
// #endregion

// #region Methods
/**
 * Запускает один проход волны подъёма кубов и сбрасывает флаг по её окончании.
 */
function onMouseenter(): void {
    if (isAnimating.value || props.isTouch) {
        return;
    }

    isAnimating.value = true;

    setTimeout(() => {
        isAnimating.value = false;
    }, HOVER_ANIMATION_DURATION_MS);
}
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
                    viewBox="-4 -30 331 314"
                    :class="$style.logoIcon"
                    fill="none"
                    shape-rendering="geometricPrecision"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <g
                        v-for="cube in LOGO_CUBES"
                        :key="cube.liftOrder"
                        :transform="`translate(${cube.x}, ${cube.y})`"
                    >
                        <g :class="$style.cube" :style="{ '--lift-order': cube.liftOrder }">
                            <path :d="CUBE_FACES_PATH" />
                        </g>
                    </g>
                </svg>
            </div>

            <div v-if="props.text" :class="$style.text" v-html="props.text"></div>
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
    width: var(--builder-logo-width, 3.2rem);
    height: var(--builder-logo-height, 3rem);
}

.logoIcon {
    width: 100%;
    height: 100%;
    color: var(--bricks-base-900, currentColor);

    path {
        fill: var(--bricks-base-0);
        stroke: currentcolor;
        stroke-width: 10;
        stroke-linejoin: round;
        stroke-linecap: round;
    }
}

// Анимируем зарегистрированное custom property вместо transform: transform-анимацию
// браузер уносит на компоситор и растеризует кубы по экранному размеру — на DPR 1 это мыло.
// Анимация переменной идёт на main thread, и SVG перерисовывается вектором каждый кадр.
@property --cube-lift {
    syntax: '<length>';
    inherits: false;
    initial-value: 0;
}

.cube {
    --lift-step: 0.6s;

    // px внутри transform SVG-элемента = user units viewBox, rem здесь некорректен
    transform: translateY(var(--cube-lift));
}

// Hover: один проход, каждый куб занимает ровно свой сегмент волны
.animating:not(.infinite) .cube {
    animation: cube-lift-pass var(--lift-step) ease-in-out both;
    animation-delay: calc(var(--lift-order) * var(--lift-step));
}

// Loop: lift в первых 25% цикла, положительный delay фазово сдвигает итерации — волна сохраняется
.infinite .cube {
    animation: cube-lift-loop calc(var(--lift-step) * 4) ease-in-out infinite;
    animation-delay: calc(var(--lift-order) * var(--lift-step));
}

@keyframes cube-lift-pass {
    0%,
    100% {
        --cube-lift: 0px;
    }

    50% {
        --cube-lift: -26px;
    }
}

@keyframes cube-lift-loop {
    0%,
    25%,
    100% {
        --cube-lift: 0px;
    }

    12.5% {
        --cube-lift: -26px;
    }
}

.text {
    flex-shrink: 0;
    margin-left: 2.4rem;
    font-size: var(--font-size-sm);
    font-weight: 500;
    line-height: 1.6rem;
}
</style>
