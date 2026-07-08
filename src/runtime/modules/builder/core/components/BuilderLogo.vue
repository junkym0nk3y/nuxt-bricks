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
// Три отдельные грани (верх/лево/право) относительно верхней вершины (0,0) —
// каждая грань получает свой оттенок --cube-color; заливка + stroke того же цвета
// перекрывают рёбра кубов, нарисованных раньше (painter's algorithm).
const CUBE_FACE_PATHS = {
    top: 'M0 0 L79.67 46 L0 92 L-79.67 46 Z',
    left: 'M-79.67 46 L0 92 L0 184 L-79.67 138 Z',
    right: 'M0 92 L79.67 46 L79.67 138 L0 184 Z',
} as const;

// Порядок в массиве = порядок отрисовки (back→front): задний куб первым.
// liftOrder — очерёдность подъёма в волне: передний ряд слева направо, затем задний.
// activeColor — цвет, в который куб плавно перекрашивается на пике подъёма.
const LOGO_CUBES = [
    { x: 241.11, y: 2.43, liftOrder: 3, activeColor: 'var(--bricks-yellow)' },
    { x: 81.67, y: 2, liftOrder: 0, activeColor: 'var(--bricks-primary)' },
    { x: 161.27, y: 48.05, liftOrder: 1, activeColor: 'var(--bricks-purple)' },
    { x: 240.86, y: 94, liftOrder: 2, activeColor: 'var(--bricks-danger-500)' },
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
                        <g
                            :class="$style.cube"
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
    width: var(--builder-logo-width, 3rem);
    height: var(--builder-logo-height, 3rem);
}

.logoIcon {
    // Подъём кубов выходит за верх viewBox — не клипуем
    overflow: visible;
    width: 100%;
    height: 100%;

    path {
        // Контур: тёмный оттенок цвета куба; round join даёт лёгкое скругление углов
        stroke: color-mix(in srgb, var(--cube-color), black 25%);
        stroke-width: 4;
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

// Цвет куба — тоже зарегистрированное property: браузер интерполирует его в keyframes
// вместе с подъёмом; inherits: true — грани-дети читают его через color-mix.
@property --cube-color {
    syntax: '<color>';
    inherits: true;
    initial-value: #d1d5db;
}

.cube {
    --lift-step: 0.6s;

    // Приглушённый тон вместо base-900: лого не спорит с фоном хедера (base-0)
    --cube-base-color: var(--bricks-base-300);
    --cube-color: var(--cube-base-color);

    // px внутри transform SVG-элемента = user units viewBox, rem здесь некорректен
    transform: translateY(var(--cube-lift));
}

// Оттенки граней из одного --cube-color: верх светлее, лево темнее, право — почти базовый
.faceTop {
    fill: color-mix(in srgb, var(--cube-color), white 18%);
}

.faceLeft {
    fill: color-mix(in srgb, var(--cube-color), black 26%);
}

.faceRight {
    fill: color-mix(in srgb, var(--cube-color), black 8%);
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
        --cube-lift: 0rem;
        --cube-color: var(--cube-base-color);
    }

    50% {
        --cube-lift: -3.4rem;
        --cube-color: var(--cube-active-color);
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

.text {
    flex-shrink: 0;
    margin-left: 2.4rem;
    font-size: var(--font-size-sm);
    font-weight: 500;
    line-height: 1.6rem;
}
</style>
