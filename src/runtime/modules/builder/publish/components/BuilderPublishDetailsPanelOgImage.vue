<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDetailsPanelOgImageProps,
    IPublishDetailsPanelOgImageEmits,
} from '../types/dashboard';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelOgImageProps>(), {
    error: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelOgImageEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Запрашивает выбор OG-изображения из медиа-галереи.
 */
function handleOpenMediaGallery(): void {
    emit('open-media');
}

/**
 * Сбрасывает выбранное OG-изображение.
 */
function handleClear(): void {
    emit('clear');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanelOgImage">
        <label :class="$style.fieldLabel">
            {{ t('bricks.publish.dashboard.details.ogImage') }}
        </label>
        <div :class="$style.ogRow">
            <span :class="$style.ogThumb">
                <img
                    v-if="props.socialImage"
                    :src="String(props.socialImage)"
                    alt=""
                    :class="$style.ogImage"
                    loading="lazy"
                    decoding="async"
                />
                <BricksIcon v-else icon="ta:outline-photo" :class="$style.ogPlaceholder" />
            </span>
            <BricksButton
                size="sm"
                variant="secondary"
                :disabled="props.isDisabled"
                @click="handleOpenMediaGallery"
            >
                {{ t('bricks.publish.dashboard.details.selectFromMedia') }}
            </BricksButton>
            <BricksButton
                v-if="props.socialImage"
                size="sm"
                variant="ghost"
                :disabled="props.isDisabled"
                @click="handleClear"
            >
                {{ t('bricks.publish.socialImageClear') }}
            </BricksButton>
        </div>
        <BricksFieldError :message="props.error" />
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanelOgImage {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.fieldLabel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.ogRow {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.ogThumb {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 4.4rem;
    height: 4.4rem;
    border-radius: var(--bricks-border-radius-xs);
    background: var(--bricks-base-100);
}

.ogImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.ogPlaceholder {
    width: 1.8rem;
    height: 1.8rem;
    color: var(--bricks-base-400);
}
</style>
