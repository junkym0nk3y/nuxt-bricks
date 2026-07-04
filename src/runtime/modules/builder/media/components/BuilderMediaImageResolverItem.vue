<script setup lang="ts">
// #region Imports
// Types
import type { IExtractedImageUrl, TImageResolveAction } from '../types/schemaImageResolver';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Interfaces
interface IImageResolverItemProps {
    image: IExtractedImageUrl;
    action: TImageResolveAction;
    disabled?: boolean;
}

interface IImageResolverItemEmits {
    'update:action': [url: string, action: TImageResolveAction];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IImageResolverItemProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IImageResolverItemEmits>();
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

const componentName = computed<string>(() => {
    const loc = props.image.locations[0];
    return loc ? loc.componentName : '';
});
// #endregion

// #region Methods
/**
 * Обрабатывает смену действия для изображения.
 *
 * @param event - Событие select.
 */
function handleActionChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    emit('update:action', props.image.url, target.value as TImageResolveAction);
}

/**
 * Обрабатывает ошибку загрузки превью.
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
                <BricksIcon icon="md:outlined-image" />
            </div>
        </div>

        <div :class="$style.info">
            <div v-if="componentName" :class="$style.componentName">{{ componentName }}</div>
            <div :class="$style.url" :title="props.image.url">{{ truncatedUrl }}</div>
        </div>

        <div :class="$style.actionWrapper">
            <select
                :value="props.action"
                :class="$style.actionSelect"
                :disabled="props.disabled"
                @change="handleActionChange"
            >
                <option value="keep">{{ t('bricks.media.resolver.keep') }}</option>
                <option value="placeholder">{{ t('bricks.media.resolver.placeholder') }}</option>
            </select>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderMediaImageResolverItem {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1rem 1.2rem;
    border-radius: var(--border-radius-sm);
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
    border-radius: var(--border-radius-sm);
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
    font-size: 1.3rem;
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
}

.actionSelect {
    /* Фиксируем светлую тему для select */
    --bricks-base-0: #fff;
    --bricks-base-200: #e5e7eb;
    --bricks-base-900: #111827;

    padding: 0.4rem 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 1.2rem;
    color: var(--bricks-base-900);
    cursor: pointer;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}
</style>
