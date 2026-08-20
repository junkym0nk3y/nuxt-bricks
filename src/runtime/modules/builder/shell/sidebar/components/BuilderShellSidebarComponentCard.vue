<script setup lang="ts">
// #region Imports
// Types
import type { ISidebarComponentCardProps } from './types';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Components
import BricksTooltip from '../../../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/base/tooltip/BricksTooltipHint.vue';

// Composables
import { useBricksAssetUrl } from '../../../../common/composables/useBricksAssetUrl';
import { useComponentCardPreview } from '../composables/useComponentCardPreview';
import { useComponentCardDrag } from '../composables/useComponentCardDrag';

// Utils
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';

// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarComponentCardProps>(), {
    isLayout: false,
});
// #endregion

// #region Data
const { t, te } = useI18n();
const componentsStore = useComponentsStore();
const {
    ComponentPreview,
    previewWrapperRef,
    componentWrapperRef,
    measureWrapperRef,
    previewScale,
    componentProps,
    measureComponent,
    measureBindProps,
    getDragPreviewSize,
} = useComponentCardPreview(props);
const { handleDragStart, handleDragEnd } = useComponentCardDrag(props, getDragPreviewSize);
const { resolveAssetUrl } = useBricksAssetUrl();
// #endregion

// #region Computed
/**
 * Описание компонента: ключи `bricks.*` переводятся, кастомные строки — как есть.
 */
const resolvedDescription = computed<string>(
    () => resolveBricksLabel(t, te, props.component.description) || ''
);

/**
 * Есть ли у компонента статичная превью-иконка (layout-блоки)
 */
const hasThumbnail = computed(() => props.isLayout && Boolean(props.component.thumbnail));

/**
 * URL иконки layout-блока: definitions хранят asset-путь модуля
 * ('images/layouts/...'), URL строится с учётом /_bricks/ и app.baseURL.
 */
const thumbnailUrl = computed<string>(() =>
    props.component.thumbnail ? resolveAssetUrl(props.component.thumbnail) : ''
);

/**
 * Является ли компонент избранным
 */
const isFavorite = computed<boolean>(() =>
    componentsStore.favorites.includes(props.component.name)
);
// #endregion
</script>

<template>
    <div
        :class="$style.BuilderShellSidebarComponentCard"
        draggable="true"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <!-- Значок (i): описание блока показывается по наведению именно на него -->
        <BricksTooltip v-if="resolvedDescription" bottom :class="$style.infoTooltip">
            <template #activator>
                <span :class="$style.infoIcon">
                    <BricksIcon icon="ta:outline-info-circle" />
                </span>
            </template>

            <template #default>
                <BricksTooltipHint :text="resolvedDescription" />
            </template>
        </BricksTooltip>

        <!-- Индикатор избранного -->
        <BricksIcon v-if="isFavorite" :class="$style.favoriteIndicator" icon="ta:filled-star" />

        <!-- Компактный layout-блок: схематичная иконка + название -->
        <div v-if="props.isLayout" :class="$style.layoutBody">
            <img
                v-if="hasThumbnail"
                :src="thumbnailUrl"
                :alt="props.component.name"
                :class="$style.layoutIcon"
                loading="lazy"
                decoding="async"
            />
            <BricksIcon v-else :class="$style.layoutIconFallback" icon="ta:outline-puzzle" />
            <span :class="$style.layoutName">{{ props.component.name }}</span>

            <!-- Скрытый инстанс на desktop-ширине для точного замера реального размера блока -->
            <div
                v-if="measureComponent"
                ref="measureWrapperRef"
                :class="[$style.measureProbe, 'bricks-canvas']"
                data-bricks-viewport="desktop"
                aria-hidden="true"
            >
                <component :is="measureComponent" v-bind="measureBindProps">
                    <!-- Пустой default-слот воспроизводит рендер пустого контейнера на канвасе
                         (isEmpty=false), иначе Flex показывает «Drop components here» и завышает высоту. -->
                    <template #default><span v-if="false" /></template>
                </component>
            </div>
        </div>

        <!-- Прочие компоненты: живое превью + название -->
        <div v-else :class="$style.cardInner">
            <div :class="[$style.thumbnail, 'bricks-canvas']">
                <!-- Viewport с overflow: hidden -->
                <div
                    v-if="ComponentPreview"
                    ref="previewWrapperRef"
                    :class="$style.previewViewport"
                >
                    <!-- Обёртка с transform: scale() для масштабирования -->
                    <div
                        :class="$style.previewInner"
                        :style="{ transform: `scale(${previewScale})` }"
                    >
                        <!-- Wrapper с desktop viewport -->
                        <div
                            ref="componentWrapperRef"
                            :class="$style.componentWrapper"
                            data-bricks-viewport="desktop"
                        >
                            <component :is="ComponentPreview" v-bind="componentProps" />
                        </div>
                    </div>
                </div>
                <BricksIcon v-else :class="$style.icon" icon="ta:outline-puzzle" />
            </div>

            <div :class="$style.info">
                <h4 :class="$style.name">{{ props.component.name }}</h4>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarComponentCard {
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
    width: 100%;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: transparent;
    transition: all var(--bricks-default-transition);
    cursor: grab;
    user-select: none;

    &:hover {
        border-color: var(--bricks-base-400);
        box-shadow: var(--bricks-shadow-md);
        transform: translateY(-0.2rem);
    }

    &:active {
        cursor: grabbing;
    }
}

/* ---- Значок (i) и избранное (углы карточки) ---- */
.infoTooltip {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    line-height: 0;
}

.infoIcon {
    display: flex;
    align-items: center;
    justify-content: center;

    /* Иконка 1.6rem, но hit-область расширена паддингом (~2.8rem) — легче попасть курсором */
    padding: 0.6rem;
    color: var(--bricks-base-400);
    transition: color var(--bricks-default-transition);
    cursor: help;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }

    &:hover {
        color: var(--bricks-base-600);
    }
}

.favoriteIndicator {
    position: absolute;
    top: 0.6rem;
    left: 0.6rem;
    z-index: 2;
    width: 1.4rem;
    height: 1.4rem;
    color: var(--bricks-primary);
}

/* Скрытый measure-инстанс: desktop-ширина, вне потока, без визуального следа */
.measureProbe {
    position: absolute;
    top: 0;
    left: -99999px;
    visibility: hidden;
    width: 144rem;
    min-width: 144rem;
    pointer-events: none;
}

/* ---- Компактный layout-блок ---- */
.layoutBody {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    padding: 1.8rem 0.8rem 1.4rem;
}

.layoutIcon {
    width: 2.8rem;
    height: 2.8rem;
    object-fit: contain;
}

.layoutIconFallback {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.layoutName {
    overflow: hidden;
    max-width: 100%;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

/* ---- Прочие компоненты: живое превью ---- */
.cardInner {
    display: flex;
    flex-direction: column;
    width: 100%;
}

.thumbnail {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 18rem;
    border-bottom: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);

    /* Превью — тоже .bricks-canvas, поэтому base-900 здесь светлый токен канваса
       в обеих темах: текст компонента остаётся тёмным на белой миниатюре. */
    color: var(--bricks-base-900);
}

.previewViewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 144rem;
    height: 100%;
}

.previewInner {
    flex-shrink: 0;
    transform-origin: center left;
    pointer-events: none;
}

.componentWrapper {
    /**
         * Фиксированная ширина эмулирует desktop viewport для компонента.
         * Это не влияет на CSS media queries (они реагируют на viewport браузера),
         * но задаёт контекст для grid/flex layouts и CSS container queries.
         */
    width: 144rem;
    min-width: 144rem;
}

.icon {
    font-size: 4.8rem;
    color: var(--bricks-base-300);
}

.info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.8rem 1rem;
}

.name {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}
</style>
