<script setup lang="ts">
/**
 * @description Приёмник файлов: разворачивается над сеткой, пока файлы тащат
 * над модалкой.
 *
 * Накрывает только сетку, а не всё содержимое: строка фильтров обязана
 * оставаться видимой — по ней понятно, в какую категорию попадут файлы.
 * Заливка полупрозрачная по той же причине — под приёмником должно читаться,
 * куда именно он их положит.
 *
 * Параметры оптимизации печатаются прямо здесь: иначе проверить, с каким
 * качеством уйдут файлы, можно только открыв поповер, а во время перетаскивания
 * это уже невозможно.
 */

// #region Imports
// Types
import type { IMediaGalleryDropOverlayProps } from '../types/media';

// Utils
import { formatOptimizationSummary } from '../utils/optimizationSummary';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryDropOverlayProps>(), {});
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const title = computed<string>(() => t('bricks.media.upload.dropNow', { count: props.fileCount }));
const hint = computed<string>(
    () =>
        `${t('bricks.media.sizeHint', {
            image: props.maxImageSizeMb,
            video: props.maxVideoSizeMb,
        })} · ${formatOptimizationSummary(props.optimization, t)}`
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryDropOverlay">
        <div :class="$style.message">
            <BricksIcon :class="$style.icon" icon="ta:outline-cloud-upload" />
            <span :class="$style.title">{{ title }}</span>
            <BricksFieldHint>{{ hint }}</BricksFieldHint>
        </div>
    </div>
</template>

<style module lang="scss">
/* Слой поверх сетки внутри содержимого модалки: собственного места в потоке
   приёмник не занимает — он существует только на время перетаскивания. */
.BuilderMediaGalleryDropOverlay {
    position: absolute;
    inset: 0;

    /* Локальный слой внутри содержимого модалки, а не уровень общей шкалы
       --bricks-z-*: приёмник перекрывает только сетку под собой. */
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--bricks-border-radius-md);
    border: 0.2rem dashed var(--bricks-primary);

    /* Заливка не сплошная: под ней обязана читаться сетка, иначе приёмник
       выглядит как пустая плита на пол-модалки. */
    background: color-mix(in srgb, var(--bricks-primary-50) 80%, transparent);
    pointer-events: none;
}

/* Плашка под сообщением: на просвечивающей сетке текст без своей подложки
   читается через раз — особенно в тёмной теме, где плитки светлее фона. */
.message {
    display: flex;
    align-items: center;
    padding: 1.6rem 2.4rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-primary-100);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    text-align: center;
    flex-direction: column;
    gap: 0.6rem;
}

.icon {
    font-size: 3.2rem;
    color: var(--bricks-primary);
}

.title {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-primary);
}
</style>
