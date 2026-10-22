<script setup lang="ts">
/**
 * @description The shared block of SEO fields of a page: the title, the address, the
 * description and the keywords. The two hosts — the sidebar of the builder and the
 * details panel of the dashboard — own the form differently, so the values and the
 * errors arrive as props.
 *
 * Decisions held by the markup and the style section: the address slot exists because
 * the two hosts frame an address differently — in the sidebar the prefix, the
 * subdomain and the preview of the full URL sit right next to it, while in the details
 * panel the routing lives as a section of its own. That is not a reason to grow a
 * second fields component. `fieldLabel` repeats the label row of
 * BricksInput/BricksTextarea: the tags editor has no label of its own, being a shared
 * element of the kit that is labeled from the outside in the block properties. Its
 * 0.2rem bottom margin adds up with the 0.6rem gap of the column to the 0.8rem the kit
 * fields indent their label by.
 *
 * The page code lives here too, as a section of its own under the SEO fields: it is
 * edited next to them in both hosts, and a separate component would only repeat the
 * same props-and-emits plumbing twice.
 */

// #region Imports
// Types
import type { IPublishSeoFieldsProps, IPublishSeoFieldsEmits } from '../types/seoFields';

// Utils
import { parseKeywords, serializeKeywords } from '../utils/keywords';

// Constants
import {
    DESCRIPTION_MAX_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGE_CODE_MAX_LENGTH,
    PAGE_CODE_PLACEHOLDER,
    PAGENAME_MAX_LENGTH,
    TITLE_MAX_LENGTH,
} from '../../../common/constants/publish';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksTextarea from '../../../ui/inputs/BricksTextarea.vue';
import BricksTagsEditor from '../../../ui/inputs/BricksTagsEditor.vue';
import BricksCheckbox from '../../../ui/base/checkbox/BricksCheckbox.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishSeoFieldsProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishSeoFieldsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const keywordTags = computed<string[]>(() => parseKeywords(props.keywords));
// #endregion

// #region Methods
/**
 * Turns the tag list back into a `keywords` string: the field travels outwards in
 * the same shape it is stored in — the tags live inside the editor only.
 *
 * @param tags - The current tag list.
 */
function handleKeywordsChange(tags: string[]): void {
    emit('update:keywords', serializeKeywords(tags));
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishSeoFields">
        <span :class="$style.sectionLabel">{{ t('bricks.publish.seo.sectionLabel') }}</span>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.seo.titleLabel')"
                :value="props.title"
                type="text"
                :required="true"
                :max-length="TITLE_MAX_LENGTH"
                show-counter
                :placeholder="t('bricks.publish.titlePlaceholder')"
                :disabled="props.disabled"
                :error-message="props.errors.title"
                @update:value="(val: string) => emit('update:title', val)"
            />
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.publish.seo.pagenameLabel')"
                :value="props.pagename"
                type="slug"
                :required="true"
                :max-length="PAGENAME_MAX_LENGTH"
                show-counter
                placeholder="my-page"
                :disabled="props.disabled"
                :error-message="props.errors.pagename"
                @update:value="(val: string) => emit('update:pagename', val)"
            />
        </div>

        <slot name="address"></slot>

        <div :class="$style.field">
            <BricksTextarea
                :label="t('bricks.publish.seo.descriptionLabel')"
                :value="props.description"
                :max-length="DESCRIPTION_MAX_LENGTH"
                :rows="3"
                :placeholder="t('bricks.publish.seo.descriptionPlaceholder')"
                :disabled="props.disabled"
                :error-message="props.errors.description"
                @update:value="(val: string) => emit('update:description', val)"
            />
        </div>

        <div :class="$style.field">
            <div :class="$style.fieldLabel">
                <span>{{ t('bricks.publish.seo.keywordsLabel') }}</span>
                <span :class="$style.charCount">
                    {{ props.keywords.length }}/{{ KEYWORDS_MAX_LENGTH }}
                </span>
            </div>
            <BricksTagsEditor
                :model-value="keywordTags"
                :aria-label="t('bricks.publish.seo.keywordsLabel')"
                :placeholder="t('bricks.publish.seo.keywordsPlaceholder')"
                :max-length="KEYWORDS_MAX_LENGTH"
                :disabled="props.disabled"
                :error-message="props.errors.keywords"
                @update:model-value="handleKeywordsChange"
            />
        </div>

        <div :class="$style.field">
            <BricksCheckbox
                :value="props.noindex"
                :label="t('bricks.publish.seo.noindexLabel')"
                name="noindex"
                :disabled="props.disabled"
                @update:value="(val: boolean) => emit('update:noindex', val)"
            />
            <BricksFieldHint>{{ t('bricks.publish.seo.noindexHint') }}</BricksFieldHint>
        </div>

        <span :class="$style.sectionLabel">{{ t('bricks.publish.code.sectionLabel') }}</span>

        <BricksFieldHint>{{ t('bricks.publish.code.hint') }}</BricksFieldHint>

        <div :class="$style.field">
            <BricksTextarea
                :class="$style.code"
                spellcheck="false"
                :label="t('bricks.publish.code.headLabel')"
                :value="props.headCode"
                :max-length="PAGE_CODE_MAX_LENGTH"
                :rows="4"
                :placeholder="PAGE_CODE_PLACEHOLDER"
                :disabled="props.disabled"
                :error-message="props.errors.headCode"
                @update:value="(val: string) => emit('update:headCode', val)"
            />
        </div>

        <div :class="$style.field">
            <BricksTextarea
                :class="$style.code"
                spellcheck="false"
                :label="t('bricks.publish.code.bodyEndLabel')"
                :value="props.bodyEndCode"
                :max-length="PAGE_CODE_MAX_LENGTH"
                :rows="4"
                :placeholder="PAGE_CODE_PLACEHOLDER"
                :disabled="props.disabled"
                :error-message="props.errors.bodyEndCode"
                @update:value="(val: string) => emit('update:bodyEndCode', val)"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishSeoFields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.sectionLabel {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.06rem;
    color: var(--bricks-base-500);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.fieldLabel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.2rem;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-600);

    @media (width <= 768px) {
        font-size: 1.6rem;
    }
}

.charCount {
    flex-shrink: 0;
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-500);
}

.code {
    textarea {
        font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
        font-size: 1.2rem;
    }
}
</style>
