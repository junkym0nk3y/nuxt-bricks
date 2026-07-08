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

/**
 * Длительность (ms) одного полного цикла волны лого: 4 куба × 0.6s (--lift-step
 * в BuilderLogo). Оверлей живёт ровно один цикл — на его границе все кубы в покое,
 * и прогресс синхронно доезжает до 100%.
 */
const LOGO_CYCLE_DURATION_MS = 2400;

/** Текущее значение прогресса (0–100). Используется для ширины полоски и текста процента. */
const progress = ref(props.isLoading ? MIN_VISIBLE_PROGRESS : 0);

/** Флаг видимости оверлея. Управляет v-if на корневом элементе. */
const isVisible = ref(props.isLoading);

/** ID текущего requestAnimationFrame. Нужен для отмены при повторном запуске / unmount. */
let animationRafId: number | null = null;
// #endregion

// #region Computed
/** Inline-стиль для прогресс-бара (ширина в %). */
const progressStyle = computed(() => ({
    width: `${progress.value}%`,
}));
// #endregion

// #region Methods
/**
 * Останавливает текущую rAF-анимацию прогресса.
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
}

/**
 * Показывает оверлей ровно на один цикл волны лого (LOGO_CYCLE_DURATION_MS)
 * и скрывает его по окончании — независимо от фактического состояния загрузки.
 *
 * Прогресс за цикл анимируется от MIN_VISIBLE_PROGRESS до 100% с квадратичным
 * ease-out (быстро в начале, замедляется к концу) через requestAnimationFrame.
 *
 * SSR-safe: на сервере window не существует, выходим сразу.
 */
function runLoaderCycle(): void {
    if (typeof window === 'undefined') {
        return;
    }

    stopProgress();
    isVisible.value = true;
    progress.value = MIN_VISIBLE_PROGRESS;

    let cycleStartTime: number | null = null;

    /** Кадр rAF: интерполирует прогресс до 100% и скрывает оверлей на границе цикла. */
    function tick(timestamp: number): void {
        if (cycleStartTime === null) {
            cycleStartTime = timestamp;
        }

        // Нормализованное время цикла [0..1]
        const ratio = Math.min((timestamp - cycleStartTime) / LOGO_CYCLE_DURATION_MS, 1);
        // Квадратичный ease-out: замедляется к концу
        const eased = 1 - (1 - ratio) * (1 - ratio);
        progress.value = MIN_VISIBLE_PROGRESS + (100 - MIN_VISIBLE_PROGRESS) * eased;

        if (ratio < 1) {
            animationRafId = window.requestAnimationFrame(tick);
            return;
        }

        animationRafId = null;
        isVisible.value = false;
    }

    animationRafId = window.requestAnimationFrame(tick);
}
// #endregion

// #region Watchers
watch(
    () => props.isLoading,
    (newValue) => {
        if (newValue) {
            runLoaderCycle();
        }
    },
    { immediate: true }
);
// #endregion

// #region Lifecycle
onUnmounted(() => {
    stopProgress();
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
    background-size: 4rem 4rem;
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
    border-radius: 0.2rem;
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
