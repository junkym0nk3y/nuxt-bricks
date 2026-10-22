<script setup lang="ts">
/**
 * @description One row of the image resolver: a preview, where the picture comes from
 * in the schema, and the choice of what to do with it.
 *
 * The picker names the picture it belongs to: a row of selects each called "Action"
 * gives a screen reader nothing to tell them apart, and the rows differ only by which
 * image they hold. The name is the address and not the name of the component, though
 * the row shows the latter first: several pictures of one schema usually sit in blocks
 * of the same kind, so "Action for the image BlockMedia" repeats itself word for word
 * down the list, while the address is the key the row is built on and is unique by
 * construction. The name takes the WHOLE address while the row shows the shortened
 * one: the shortening keeps the ends and drops the middle, so two addresses that
 * differ only in the middle collapse into one and the same name.
 *
 * The width of the picker is set from here rather than left to the field: the kit's
 * select is `width: 100%`, and in this row that would eat the preview and the address.
 *
 * The name of the block is drawn under a guard for an empty value even though the
 * extractor never produces one (an imported schema is refused without a component
 * name): an empty line of that size would push the address down and make the row
 * taller than its neighbors.
 */

// #region Imports
// Types
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { TBrickDemoValues } from '../../../common/types/index';
import type { IMediaImageResolverItemProps, IMediaImageResolverItemEmits } from '../types/media';

// Utils
import { IMAGE_RESOLVE_ACTIONS, isImageResolveAction } from '../utils/imageResolveAction';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaImageResolverItemProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IMediaImageResolverItemEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const imgError = ref(false);
// #endregion

// #region Computed
const truncatedUrl = computed<string>(() => {
    const url = props.image.url;
    if (url.length <= 60) {
        return url;
    }
    return `${url.slice(0, 30)}...${url.slice(-25)}`;
});

/** Both options are always available, so the facets repeat the whole list */
const actionOptions = computed<IBrickUiCommonProp[]>(() => [
    { label: t('bricks.media.resolver.keep'), value: 'keep' },
    { label: t('bricks.media.resolver.placeholder'), value: 'placeholder' },
]);
const actionFacets = computed<TBrickDemoValues[]>(() => [...IMAGE_RESOLVE_ACTIONS]);
// #endregion

// #region Methods
/**
 * Handles a change of the action of an image. What the select reports is checked
 * rather than cast: the kit types its value widely, and an unknown action would have
 * reached the schema as an image quietly left alone.
 *
 * @param value - The value reported by the select.
 */
function handleActionChange(value: TBrickDemoValues | null): void {
    if (!isImageResolveAction(value)) {
        return;
    }

    emit('update:action', props.image.url, value);
}

/**
 * Handles a failure to load the preview.
 */
function handleImgError(): void {
    imgError.value = true;
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaImageResolverItem">
        <div :class="$style.preview">
            <img
                v-if="!imgError"
                :src="props.image.url"
                alt=""
                :class="$style.previewImg"
                loading="lazy"
                @error="handleImgError"
            />
            <div v-else :class="$style.previewFallback">
                <BricksIcon icon="ta:outline-photo" />
            </div>
        </div>

        <div :class="$style.info">
            <div v-if="props.image.componentName" :class="$style.componentName">
                {{ props.image.componentName }}
            </div>
            <div :class="$style.url" :title="props.image.url">{{ truncatedUrl }}</div>
        </div>

        <div :class="$style.actionWrapper">
            <BricksSelect
                :value="props.action"
                :specs="actionOptions"
                :facets="actionFacets"
                :disabled="props.disabled"
                :aria-label="t('bricks.media.resolver.itemAction', { name: props.image.url })"
                @update:value="handleActionChange"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaImageResolverItem {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition: border-color 150ms ease;

    &:hover {
        border-color: var(--bricks-base-300);
    }
}

.preview {
    overflow: hidden;
    flex-shrink: 0;
    width: 4.8rem;
    height: 4.8rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
}

.previewImg {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.previewFallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 2rem;
    color: var(--bricks-base-400);
}

.info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
}

.componentName {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-800);
}

.url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.actionWrapper {
    flex-shrink: 0;
    width: 14rem;
}
</style>
