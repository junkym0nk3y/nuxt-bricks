<script setup lang="ts">
// #region Imports
// Types
import type { IPublishSeoFieldsProps, IPublishSeoFieldsEmits } from '../types/seoFields';

// Utils
import { parseKeywords, serializeKeywords } from '../utils/keywords';

// Constants
import {
    DESCRIPTION_MAX_LENGTH,
    KEYWORDS_MAX_LENGTH,
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
 * Переводит список тегов обратно в строку `keywords`: наружу поле уходит в том
 * же виде, в котором хранится, — теги живут только внутри редактора.
 *
 * @param tags - Актуальный список тегов.
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

        <!--
            Слот адреса: у сайдбара к адресу примыкают префикс, поддомен и превью
            полного URL, у панели деталей маршрутизация живёт отдельной секцией.
            Разводить из-за этого два компонента полей незачем
        -->
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
    color: var(--bricks-base-400);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

// Повторяет строку лейбла BricksInput/BricksTextarea: у редактора тегов своего
// лейбла нет — он общий элемент кита и в свойствах блоков подписывается снаружи
.fieldLabel {
    display: flex;
    align-items: center;
    justify-content: space-between;

    // 0.6rem gap колонки + 0.2rem = 0.8rem, как отступ лейбла внутри полей кита
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
    color: var(--bricks-base-400);
}
</style>
