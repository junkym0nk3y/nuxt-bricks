<script setup lang="ts">
/**
 * @description Card of one library component: the source of the drag, with a live
 * preview for a brick and a schematic icon for a layout block.
 *
 * The preview renders inside a wrapper of a fixed 144rem width. That width never
 * reaches the CSS media queries — they react to the browser viewport — but it does
 * set the context for grid and flex layouts and for CSS container queries, so the
 * block looks the way it will on the sheet. The hidden instance next to it is there
 * for measuring (`useComponentCardPreview`), and its default slot is deliberately
 * empty: that reproduces the render of an empty container on the canvas
 * (`isEmpty=false`), while otherwise Flex shows "Drop components here" and the
 * measured height comes out too large.
 *
 * The thumbnail is a `.bricks-canvas` as well, so `base-900` here is the light canvas
 * token in both themes: the text of the component stays dark on the white preview.
 * The (i) glyph is 1.6rem and its hit area is widened by padding to about 2.8rem — it
 * is a hard target to hit with the cursor otherwise.
 */

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
 * Description of the component, shown by the (i) glyph on hover: `bricks.*` keys are
 * translated, custom strings are kept as they are.
 */
const resolvedDescription = computed<string>(
    () => resolveBricksLabel(t, te, props.component.description) || ''
);

/**
 * Whether the component has a static preview icon — layout blocks do
 */
const hasThumbnail = computed(() => props.isLayout && Boolean(props.component.thumbnail));

/**
 * URL of the layout block icon: the definitions keep the asset path of the module
 * ('images/layouts/...'), and the URL is built with the module asset prefix and
 * `app.baseURL` taken into account.
 */
const thumbnailUrl = computed<string>(() =>
    props.component.thumbnail ? resolveAssetUrl(props.component.thumbnail) : ''
);

/**
 * Whether the component is a favorite
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

        <BricksIcon v-if="isFavorite" :class="$style.favoriteIndicator" icon="ta:filled-star" />

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

            <div
                v-if="measureComponent"
                ref="measureWrapperRef"
                :class="[$style.measureProbe, 'bricks-canvas']"
                data-bricks-viewport="desktop"
                aria-hidden="true"
            >
                <component :is="measureComponent" v-bind="measureBindProps">
                    <template #default><span v-if="false" /></template>
                </component>
            </div>
        </div>

        <div v-else :class="$style.cardInner">
            <div :class="[$style.thumbnail, 'bricks-canvas']">
                <div
                    v-if="ComponentPreview"
                    ref="previewWrapperRef"
                    :class="$style.previewViewport"
                >
                    <div
                        :class="$style.previewInner"
                        :style="{ transform: `scale(${previewScale})` }"
                    >
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

.measureProbe {
    position: absolute;
    top: 0;
    left: -99999px;
    visibility: hidden;
    width: 144rem;
    min-width: 144rem;
    pointer-events: none;
}

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
