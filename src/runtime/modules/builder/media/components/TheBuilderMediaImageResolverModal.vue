<script setup lang="ts">
/**
 * @description The modal of the image resolver, shown when an imported schema carries
 * pictures the media library does not hold: one action for all of them at the top, a
 * row per picture below.
 *
 * The action picker here is the same native `<select>` with the same light-palette
 * override as in `BuilderMediaImageResolverItem`, and with as little of a recorded
 * reason.
 */

// #region Imports
// Types
import type { IImageResolverState, TImageResolveAction } from '../types/schemaImageResolver';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BuilderMediaImageResolverItem from './BuilderMediaImageResolverItem.vue';
// #endregion

// #region Interfaces
interface ITheImageResolverModalProps {
    isOpen: boolean;
    state: IImageResolverState;
}

interface ITheImageResolverModalEmits {
    confirm: [];
    cancel: [];
    skip: [];
    setImageAction: [url: string, action: TImageResolveAction];
    setGlobalAction: [action: TImageResolveAction];
}
// #endregion

// #region Props
const props = defineProps<ITheImageResolverModalProps>();
// #endregion

// #region Emits
const emit = defineEmits<ITheImageResolverModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const imageCount = computed<number>(() => props.state.newImages.length);
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
 * Updates the action that goes for every image.
 *
 * @param event - The select event.
 */
function handleGlobalActionChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    emit('setGlobalAction', target.value as TImageResolveAction);
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
                <label :class="$style.globalLabel">{{
                    t('bricks.media.resolver.globalAction')
                }}</label>
                <select
                    :value="props.state.globalAction"
                    :class="$style.globalSelect"
                    @change="handleGlobalActionChange"
                >
                    <option value="keep">{{ t('bricks.media.resolver.keep') }}</option>
                    <option value="placeholder">
                        {{ t('bricks.media.resolver.placeholder') }}
                    </option>
                </select>
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
    border-radius: 1.2rem;
    background: var(--bricks-primary-100);
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-primary-600);
}

.globalAction {
    display: flex;
    align-items: center;
    flex-shrink: 0;
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

.globalSelect {
    --bricks-base-0: #fff;
    --bricks-base-200: #e5e7eb;
    --bricks-base-900: #111827;

    padding: 0.6rem 1rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    cursor: pointer;
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
