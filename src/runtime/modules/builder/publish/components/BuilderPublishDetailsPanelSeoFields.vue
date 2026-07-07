<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDetailsPanelSeoFieldsProps,
    IPublishDetailsPanelSeoFieldsEmits,
} from '../types/dashboard';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksTextarea from '../../../ui/inputs/BricksTextarea.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelSeoFieldsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelSeoFieldsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanelSeoFields">
        <span :class="$style.sectionLabel">
            {{ t('bricks.publish.dashboard.details.seoMeta') }}
        </span>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.dashboard.details.titleLabel')"
                :value="props.title"
                type="text"
                :max-length="120"
                :placeholder="t('bricks.publish.titlePlaceholder')"
                :disabled="props.isSaving"
                :error-message="props.errors.title"
                @update:value="(val: string) => emit('update:title', val)"
            />
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.dashboard.details.pagenameLabel')"
                :value="props.pagename"
                type="slug"
                :max-length="80"
                placeholder="my-page"
                :disabled="props.isSaving"
                :error-message="props.errors.pagename"
                @update:value="(val: string) => emit('update:pagename', val)"
            />
        </div>

        <div :class="$style.field">
            <BricksTextarea
                :label="t('bricks.publish.dashboard.details.descriptionLabel')"
                :value="props.description"
                :max-length="500"
                :rows="3"
                placeholder="SEO Description"
                :disabled="props.isSaving"
                :error-message="props.errors.description"
                @update:value="(val: string) => emit('update:description', val)"
            />
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.dashboard.details.keywordsLabel')"
                :value="props.keywords"
                type="text"
                :max-length="255"
                placeholder="promo, page, marketing"
                :disabled="props.isSaving"
                :error-message="props.errors.keywords"
                @update:value="(val: string) => emit('update:keywords', val)"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanelSeoFields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.sectionLabel {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.06rem;
    color: var(--bricks-base-400);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}
</style>
