<script setup lang="ts">
// #region Imports
// Constants
import {
    LOADER_DEFAULT_PHRASE,
    LOADER_PHRASES,
    type TLoaderPhraseLocale,
} from '../constants/loaderPhrases';

// Vue
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

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

/**
 * Интервал (ms) смены фразы под баром — два сегмента волны лого
 * (2 × --lift-step в BuilderLogo): за фразу успевают подняться два куба.
 */
const PHRASE_INTERVAL_MS = 1200;

const { locale } = useI18n();

/** Текущее значение прогресса (0–100). Используется для ширины полоски и текста процента. */
const progress = ref(props.isLoading ? MIN_VISIBLE_PROGRESS : 0);

/** Флаг видимости оверлея. Управляет v-if на корневом элементе. */
const isVisible = ref(props.isLoading);

/** Дефолтная подпись активной локали — одинакова на SSR и клиенте (без рандома). */
const defaultPhrase = computed<string>(
    () => LOADER_DEFAULT_PHRASE[locale.value as TLoaderPhraseLocale] ?? LOADER_DEFAULT_PHRASE.ru
);

/** Текущая фраза под прогресс-баром: дефолт с первого кадра, дальше — ротация рандома. */
const currentPhrase = ref(defaultPhrase.value);

/** ID текущего requestAnimationFrame. Нужен для отмены при повторном запуске / unmount. */
let animationRafId: number | null = null;

/** ID setInterval ротации фраз. */
let phraseIntervalId: number | null = null;
// #endregion

// #region Computed
/** Inline-стиль для прогресс-бара (ширина в %). */
const progressStyle = computed(() => ({
    width: `${progress.value}%`,
}));

/** Фразы лоадера для активной локали (fallback — ru). */
const phrases = computed<string[]>(
    () => LOADER_PHRASES[locale.value as TLoaderPhraseLocale] ?? LOADER_PHRASES.ru
);
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
 * Возвращает случайную фразу, по возможности отличную от текущей.
 */
function pickRandomPhrase(): string {
    const pool = phrases.value.filter((phrase) => phrase !== currentPhrase.value);
    const source = pool.length ? pool : phrases.value;

    return source[Math.floor(Math.random() * source.length)] ?? '';
}

/**
 * Останавливает ротацию фраз (clearInterval).
 * SSR-safe: на сервере window не существует, выходим сразу.
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
 * Запускает ротацию случайных фраз с интервалом PHRASE_INTERVAL_MS.
 * Вызывается после mounted — дефолтная подпись из initial value к этому моменту
 * уже отработала свой кадр гидрации, сразу переходим на рандом.
 */
function startPhrases(): void {
    stopPhrases();
    currentPhrase.value = pickRandomPhrase();

    phraseIntervalId = window.setInterval(() => {
        currentPhrase.value = pickRandomPhrase();
    }, PHRASE_INTERVAL_MS);
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
    startPhrases();

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
        stopPhrases();
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
    }
);
// #endregion

// #region Lifecycle
// Первый запуск — в onMounted, не в immediate-watch: случайная фраза, выставленная
// синхронно в setup на клиенте, не совпала бы с SSR-разметкой (hydration mismatch)
onMounted(() => {
    if (props.isLoading) {
        runLoaderCycle();
    }
});

onUnmounted(() => {
    stopProgress();
    stopPhrases();
});
// #endregion
</script>

<template>
    <Transition name="loader-fade">
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
                        <Transition name="loader-phrase-fade" mode="out-in">
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

    /* Выше всех модалок (BricksConfirmModal — 999999): пока идёт загрузка, лоадер ничем не перекрывается */
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--bricks-base-0); /* Light semi-transparent background */
}

/* Мягкое «aurora»-свечение под лого в primary-цвете (см. Figma-концепт Loader) */
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

/* Изометрическая сетка ±30° — угол граней кубов лого (tan 30° = 46/79.67) */
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

/* Строка под баром (как в Figma-концепте): фраза слева, процент справа */
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
