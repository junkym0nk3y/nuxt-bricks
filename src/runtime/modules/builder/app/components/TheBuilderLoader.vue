<script setup lang="ts">
// #region Imports
// Vue
import { computed, onUnmounted, ref, watch } from 'vue';

// Components
import BuilderLogo from '../../core/components/BuilderLogo.vue';
// #endregion

// #region Props
const props = defineProps<{
    isLoading: boolean;
}>();
// #endregion

// #region Data
/** Минимальное значение прогресса (%), чтобы полоска была видна сразу при старте. */
const MIN_VISIBLE_PROGRESS = 1;

/** Максимум (%), до которого доходит фейковый прогресс, пока загрузка не завершена. */
const MAX_FAKE_PROGRESS = 50;

/**
 * Временная константа (ms) экспоненциальной кривой.
 * Чем больше значение — тем медленнее прогресс приближается к MAX_FAKE_PROGRESS.
 */
const PROGRESS_TAU = 4000;

/** Длительность (ms) финальной анимации от текущего значения до 100%. */
const FINISH_PROGRESS_TRANSITION_MS = 1000;

/** Задержка (ms) перед скрытием оверлея после достижения 100%. */
const HIDE_DELAY_MS = 200;

/** Текущее значение прогресса (0–100). Используется для ширины полоски и текста процента. */
const progress = ref(props.isLoading ? MIN_VISIBLE_PROGRESS : 0);

/** Флаг видимости оверлея. Управляет v-if на корневом элементе. */
const isVisible = ref(props.isLoading);

/** ID текущего requestAnimationFrame. Нужен для отмены при stopProgress / unmount. */
let animationRafId: number | null = null;

/** Timestamp начала текущей rAF-анимации. Сбрасывается при каждом новом цикле. */
let animationStartTime: number | null = null;

/** ID setTimeout для отложенного скрытия оверлея после завершения анимации. */
let hideTimeout: number | null = null;
// #endregion

// #region Computed
/** Inline-стиль для прогресс-бара (ширина в %). */
const progressStyle = computed(() => ({
    width: `${progress.value}%`,
}));
// #endregion

// #region Methods
/**
 * Отменяет отложенное скрытие оверлея (clearTimeout).
 * SSR-safe: на сервере window не существует, выходим сразу.
 */
function stopHideTimeout(): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (hideTimeout !== null) {
        window.clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

/**
 * Останавливает текущую rAF-анимацию прогресса (как фейковую, так и финальную).
 * Отменяет requestAnimationFrame и сбрасывает timestamp начала.
 * SSR-safe: на сервере window не существует, выходим сразу.
 */
function stopProgress(): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (animationRafId !== null) {
        window.cancelAnimationFrame(animationRafId);
        animationRafId = null;
    }

    animationStartTime = null;
}

/**
 * Запускает фейковую анимацию прогресса через requestAnimationFrame.
 *
 * Использует экспоненциальную кривую ease-out:
 *   progress = MIN + (MAX - MIN) * (1 - e^(-elapsed / TAU))
 *
 * Прогресс быстро стартует и плавно замедляется, асимптотически
 * приближаясь к MAX_FAKE_PROGRESS (50%). Обновляется каждый кадр (~60fps).
 *
 * SSR-safe: на сервере window не существует, выходим сразу.
 */
function startProgress(): void {
    if (typeof window === 'undefined') {
        return;
    }

    stopProgress();
    stopHideTimeout();
    isVisible.value = true;
    progress.value = MIN_VISIBLE_PROGRESS;
    animationStartTime = null;

    /** Кадр rAF: вычисляет прогресс по экспоненциальной кривой на основе elapsed time. */
    function tick(timestamp: number): void {
        if (animationStartTime === null) {
            animationStartTime = timestamp;
        }

        const elapsed = timestamp - animationStartTime;
        // Экспоненциальный ease-out: быстро в начале, замедляется к концу
        const t = 1 - Math.exp(-elapsed / PROGRESS_TAU);
        progress.value = MIN_VISIBLE_PROGRESS + (MAX_FAKE_PROGRESS - MIN_VISIBLE_PROGRESS) * t;

        // Продолжаем анимацию, пока не подошли вплотную к максимуму
        if (progress.value < MAX_FAKE_PROGRESS - 0.1) {
            animationRafId = window.requestAnimationFrame(tick);
        }
    }

    animationRafId = window.requestAnimationFrame(tick);
}

/**
 * Завершает прогресс: плавно анимирует от текущего значения до 100%.
 *
 * Использует квадратичную ease-out кривую через requestAnimationFrame:
 *   eased = 1 - (1 - ratio)^2
 *
 * После достижения 100% ждёт HIDE_DELAY_MS и скрывает оверлей.
 * Если оверлей уже скрыт — просто сбрасывает прогресс в 0.
 *
 * SSR-safe: на сервере window не существует, выходим сразу.
 */
function finishProgress(): void {
    if (typeof window === 'undefined') {
        return;
    }

    stopProgress();
    stopHideTimeout();

    if (!isVisible.value) {
        progress.value = 0;
        return;
    }

    // Запоминаем стартовое значение для интерполяции
    const startValue = progress.value;
    const distance = 100 - startValue;
    let finishStartTime: number | null = null;

    /** Кадр rAF: интерполирует прогресс от startValue до 100% с ease-out quad. */
    function finishTick(timestamp: number): void {
        if (finishStartTime === null) {
            finishStartTime = timestamp;
        }

        const elapsed = timestamp - finishStartTime;
        // Нормализованное время [0..1]
        const ratio = Math.min(elapsed / FINISH_PROGRESS_TRANSITION_MS, 1);
        // Квадратичный ease-out: замедляется к концу
        const eased = 1 - (1 - ratio) * (1 - ratio);
        progress.value = startValue + distance * eased;

        if (ratio < 1) {
            animationRafId = window.requestAnimationFrame(finishTick);
        } else {
            progress.value = 100;
            animationRafId = null;

            // Даём пользователю увидеть заполненную полоску перед скрытием
            hideTimeout = window.setTimeout(() => {
                isVisible.value = false;
            }, HIDE_DELAY_MS);
        }
    }

    animationRafId = window.requestAnimationFrame(finishTick);
}
// #endregion

// #region Watchers
watch(
    () => props.isLoading,
    (newValue) => {
        if (newValue) {
            startProgress();
        } else {
            finishProgress();
        }
    },
    { immediate: true }
);
// #endregion

// #region Lifecycle
onUnmounted(() => {
    stopProgress();
    stopHideTimeout();
});
// #endregion
</script>

<template>
    <Transition name="fade">
        <div v-if="isVisible" :class="$style.TheBuilderLoader">
            <div :class="$style.grid"></div>

            <div :class="$style.content">
                <div :class="$style.logoWrapper">
                    <BuilderLogo :is-touch="true" :is-infinite-animation="true" />
                </div>
                <div :class="$style.barContainer">
                    <div :class="$style.barFill" :style="progressStyle"></div>
                    <div :class="$style.barGlow" :style="progressStyle"></div>
                </div>

                <div :class="$style.percentage">{{ Math.round(progress) }}%</div>
            </div>
        </div>
    </Transition>
</template>

<style module lang="scss">
.TheBuilderLoader {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 50; /* Lower z-index to sit nicely within content */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--bricks-base-0); /* Light semi-transparent background */
}

.grid {
    position: absolute;
    background-image:
        linear-gradient(var(--bricks-base-900) 1px, transparent 1px),
        linear-gradient(90deg, var(--bricks-base-900) 1px, transparent 1px);
    background-size: 40px 40px;
    opacity: 0.1;
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
    /* Реальный размер вместо transform: scale — scale растеризует SVG на мелком layout-размере и мылит анимацию */
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
    background: var(--bricks-base-300); /* Light gray track */
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
    border-radius: 2px;
    background: inherit;
    opacity: 0.4;
}

.percentage {
    margin-top: 0.8rem;
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
