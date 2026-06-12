<script setup lang="ts">
// #region Imports
// Types
import type { IMediaUpdateMetaRequest } from '../../../common/types/media';
import type { IMediaGalleryMetaPanelProps, IMediaGalleryMetaPanelEmits } from '../types/media';

// Utils
import { MEDIA_CATEGORY_OPTIONS, DEFAULT_MEDIA_CATEGORY } from '../constants/mediaCategories';

// Vue
import { ref, computed, watch } from 'vue';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryMetaPanelProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryMetaPanelEmits>();
// #endregion

// #region Data
const editableFilename = ref('');
const editableAlt = ref('');
// #endregion

// #region Computed
const categoryOptions = computed(() =>
    MEDIA_CATEGORY_OPTIONS.filter((option) => option.value !== 'all')
);
const selectedCategory = computed(
    () => props.selectedItem?.category || DEFAULT_MEDIA_CATEGORY
);
// #endregion

// #region Methods
/**
 * Сохраняет изменённые метаданные (filename, alt) при потере фокуса.
 */
function handleMetaBlur(): void {
    if (!props.selectedItem) {
        return;
    }

    const meta: IMediaUpdateMetaRequest = {};
    const trimmedFilename = editableFilename.value.trim();
    const trimmedAlt = editableAlt.value.trim();

    if (trimmedFilename && trimmedFilename !== props.selectedItem.filename) {
        meta.filename = trimmedFilename;
    }

    if (trimmedAlt !== props.selectedItem.alt) {
        meta.alt = trimmedAlt;
    }

    if (Object.keys(meta).length === 0) {
        return;
    }

    emit('update-meta', meta);
}

/** Эмитит смену категории выбранного элемента. */
function handleSelectedCategoryChange(event: Event): void {
    emit('update-category', (event.target as HTMLSelectElement).value);
}

/** Эмитит запрос на удаление выбранного элемента. */
function handleRemove(): void {
    emit('remove');
}
// #endregion

// #region Lifecycle
watch(
    () => props.selectedItem,
    (item) => {
        editableFilename.value = item?.filename ?? '';
        editableAlt.value = item?.alt ?? '';
    }
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryMetaPanel">
        <template v-if="props.selectedItem">
            <div :class="$style.metaField">
                <label :class="$style.selectorLabel" for="media-filename"> Название: </label>
                <input
                    id="media-filename"
                    v-model="editableFilename"
                    :class="$style.metaInput"
                    type="text"
                    placeholder="Имя файла"
                    @blur="handleMetaBlur"
                />
            </div>
            <div :class="$style.metaField">
                <label :class="$style.selectorLabel" for="media-alt"> Alt: </label>
                <input
                    id="media-alt"
                    v-model="editableAlt"
                    :class="$style.metaInput"
                    type="text"
                    placeholder="Описание изображения"
                    @blur="handleMetaBlur"
                />
            </div>
            <div :class="$style.categorySelector">
                <label :class="$style.selectorLabel" for="media-category"> Категория: </label>
                <select
                    id="media-category"
                    :value="selectedCategory"
                    :class="$style.categorySelect"
                    @change="handleSelectedCategoryChange"
                >
                    <option
                        v-for="option in categoryOptions"
                        :key="option.value"
                        :value="option.value"
                    >
                        {{ option.label }}
                    </option>
                </select>
            </div>
            <BricksButton size="sm" variant="danger" @click="handleRemove">
                <BricksIcon icon="md:delete" />
            </BricksButton>
        </template>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryMetaPanel {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.selectorLabel {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-700);
}

.metaField,
.categorySelector {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.metaInput,
.categorySelect {
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    font-size: 1.4rem;
    color: var(--bricks-base-800);
}

.metaInput {
    min-width: 18rem;

    &:focus {
        border-color: var(--bricks-primary-400);
        outline: none;
    }
}

.categorySelect {
    min-width: 16rem;
}
</style>
