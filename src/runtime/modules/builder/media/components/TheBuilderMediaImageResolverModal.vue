<script setup lang="ts">
/**
 * @description The modal of the image resolver, shown when an imported schema carries
 * pictures the media library does not hold: one action for all of them at the top, a
 * row per picture below.
 *
 * The caption of the overall picker is a `span` and not a `label`: it never named the
 * control — there was neither a `for` nor a control nested inside it — and after the
 * move to the kit select there is nothing for a `for` to point at, because the trigger
 * carries no `id` of its own. The name of the control comes from the same phrase
 * through `aria-label`, so a screen reader hears it once rather than twice.
 */

// #region Imports
// Types
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { TBrickDemoValues } from '../../../common/types/index';
import type { TImageResolveAction } from '../types/schemaImageResolver';
import type { IMediaImageResolverModalProps, IMediaImageResolverModalEmits } from '../types/media';

// Utils
import { IMAGE_RESOLVE_ACTIONS, isImageResolveAction } from '../utils/imageResolveAction';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
import BuilderMediaImageResolverItem from './BuilderMediaImageResolverItem.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaImageResolverModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaImageResolverModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const imageCount = computed<number>(() => props.state.newImages.length);

/** Both options are always available, so the facets repeat the whole list */
const actionOptions = computed<IBrickUiCommonProp[]>(() => [
    { label: t('bricks.media.resolver.keep'), value: 'keep' },
    { label: t('bricks.media.resolver.placeholder'), value: 'placeholder' },
]);
const actionFacets = computed<TBrickDemoValues[]>(() => [...IMAGE_RESOLVE_ACTIONS]);
// #endregion

// #region Methods
/**
 * Closes the modal (a cancel).
 */
function handleClose(): void {
    emit('cancel');
}

/**
 * Confirms the actions that were picked.
 */
function handleConfirm(): void {
    emit('confirm');
}

/**
 * Skips the handling of the images — loads them as they are.
 */
function handleSkip(): void {
    emit('skip');
}

/**
 * Updates the action of one particular image.
 *
 * @param url - URL of the image.
 * @param action - The action that was picked.
 */
function handleImageAction(url: string, action: TImageResolveAction): void {
    emit('setImageAction', url, action);
}

/**
 * Updates the action that goes for every image. What the select reports is checked
 * rather than cast: the kit types its value widely, and an unknown action would have
 * reached the schema as an image quietly left alone.
 *
 * @param value - The value reported by the select.
 */
function handleGlobalActionChange(value: TBrickDemoValues | null): void {
    if (!isImageResolveAction(value)) {
        return;
    }

    emit('setGlobalAction', value);
}
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.media.resolver.title')"
        variant="gradient"
        padded
        layer="raised"
        :duration="200"
        @close="handleClose"
    >
        <div :class="$style.modal">
            <BricksModalHeader @close="handleClose">
                <template #titleExtra>
                    <span :class="$style.count">{{ imageCount }}</span>
                </template>
            </BricksModalHeader>

            <div :class="$style.globalAction">
                <span :class="$style.globalLabel">{{
                    t('bricks.media.resolver.globalAction')
                }}</span>
                <div :class="$style.globalControl">
                    <BricksSelect
                        :value="props.state.globalAction"
                        :specs="actionOptions"
                        :facets="actionFacets"
                        :aria-label="t('bricks.media.resolver.globalAction')"
                        @update:value="handleGlobalActionChange"
                    />
                </div>
            </div>

            <div :class="[$style.content, 'bricks-scrollbox']">
                <BuilderMediaImageResolverItem
                    v-for="image in props.state.newImages"
                    :key="image.url"
                    :image="image"
                    :action="props.state.actions.get(image.url) ?? 'keep'"
                    @update:action="handleImageAction"
                />
            </div>

            <BricksModalFooter>
                <template #leading>
                    <BricksButton size="sm" variant="ghost" @click="handleSkip">
                        {{ t('bricks.media.resolver.skip') }}
                    </BricksButton>
                </template>

                <BricksButton size="sm" variant="secondary" @click="handleClose">
                    {{ t('bricks.common.cancel') }}
                </BricksButton>

                <BricksButton size="sm" variant="primary" @click="handleConfirm">
                    {{ t('bricks.media.resolver.apply') }}
                </BricksButton>
            </BricksModalFooter>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.modal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 64rem;
    max-height: 80vh;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-xl);
    flex-direction: column;
}

.count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.4rem;
    height: 2.4rem;
    padding: 0 0.6rem;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-primary-100);
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-primary-600);
}

.globalAction {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
    padding: 1.2rem 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    gap: 1.2rem;
}

.globalLabel {
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-700);
}

.globalControl {
    width: 18rem;
}

.content {
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.6rem 2rem;
}
</style>
