<script setup lang="ts">
// #region Imports
// Types
import type {
    ISidebarPublishSocialImageProps,
    ISidebarPublishSocialImageEmits,
} from '../types/components';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPublishSocialImageProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ISidebarPublishSocialImageEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Asks for the media gallery so a social image can be picked.
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

/**
 * Clears the picked social image.
 */
function handleClear(): void {
    emit('clear');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPublishSocialImage">
        <Transition mode="out-in" name="bricks-fade-fast">
            <div v-if="props.socialImage" :class="$style.mediaPreview">
                <img
                    :src="props.socialImage"
                    alt=""
                    :class="$style.mediaImage"
                    loading="lazy"
                    decoding="async"
                />
            </div>
        </Transition>
        <div :class="$style.mediaActions">
            <BricksButton
                size="md"
                variant="secondary"
                :disabled="props.isSubmitting"
                @click="handleOpenMediaGallery"
            >
                <BricksIcon icon="ta:outline-photo" />
                {{ t('bricks.publish.socialImageSelect') }}
            </BricksButton>

            <Transition mode="out-in" name="bricks-fade-fast">
                <div v-if="props.socialImage" :class="$style.mediaFooter">
                    <span :class="$style.mediaUrl">{{ props.socialImage }}</span>
                    <BricksButton
                        size="sm"
                        variant="ghost"
                        :disabled="props.isSubmitting"
                        @click="handleClear"
                    >
                        {{ t('bricks.publish.socialImageClear') }}
                    </BricksButton>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPublishSocialImage {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 1.2rem;
}

.mediaPreview {
    overflow: hidden;
    flex-shrink: 0;
    width: 8rem;
    height: 8rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-50);
}

.mediaImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.mediaActions {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.8rem;
    max-width: 100%;
}

.mediaFooter {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.mediaUrl {
    overflow: hidden;
    display: inline-block;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
