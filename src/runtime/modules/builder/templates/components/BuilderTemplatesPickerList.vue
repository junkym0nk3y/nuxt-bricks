<script setup lang="ts">
/**
 * @description Список выбора шаблона для новой страницы: строка со снимком,
 * именем и объёмом.
 *
 * Показывается по клику на карточке «Из шаблона» в форме создания — как диалог
 * выбора файла у карточки «Из JSON-файла»: вариант «из шаблона» без шаблона
 * ничего не значит. Поиск появляется от порога
 * (`TEMPLATE_PICKER_SEARCH_THRESHOLD`): над четырьмя строками поле было бы
 * лишним элементом.
 */

// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesPickerListProps, ITemplatesPickerListEmits } from '../types/templates';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import { TEMPLATE_PICKER_SEARCH_THRESHOLD } from '../../../common/constants/templates';

// Components
import BricksSearchInput from '../../../ui/inputs/BricksSearchInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesPickerListProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesPickerListEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/**
 * Поиск внутри списка — свой, не общий с шапкой дашборда: форма создания
 * открывается поверх раздела страниц, и запрос из шапки фильтровал бы там
 * страницы.
 */
const searchQuery = ref('');
// #endregion

// #region Computed
const isSearchVisible = computed<boolean>(
    () => props.templates.length >= TEMPLATE_PICKER_SEARCH_THRESHOLD
);

const visibleTemplates = computed<TBricksTemplateSummary[]>(() => {
    const query = searchQuery.value.trim().toLowerCase();

    if (!query) {
        return props.templates;
    }

    return props.templates.filter((template) =>
        [template.name, template.description]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query)
    );
});
// #endregion

// #region Methods
/**
 * Формирует мета-строку шаблона: объём и дата сохранения.
 *
 * @param template - Шаблон.
 * @returns Строка вида «12 блоков · 14.08.2026».
 */
function buildMetaLine(template: TBricksTemplateSummary): string {
    return [
        t('bricks.templates.card.blocks', { count: template.blocksCount }),
        formatPageDate(template.createdAt),
    ].join(' · ');
}

/**
 * Сообщает о выборе шаблона.
 *
 * @param template - Шаблон.
 */
function handleSelect(template: TBricksTemplateSummary): void {
    emit('select', template);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderTemplatesPickerList">
        <BricksSearchInput
            v-if="isSearchVisible"
            :class="$style.search"
            :value="searchQuery"
            :placeholder="t('bricks.publish.dashboard.search.templates')"
            @update:value="(value: string) => (searchQuery = value)"
        />

        <p v-if="props.isLoading" :class="$style.state">{{ t('bricks.common.loading') }}</p>

        <p v-else-if="props.templates.length === 0" :class="$style.state">
            {{ t('bricks.templates.picker.empty') }}
        </p>

        <p v-else-if="visibleTemplates.length === 0" :class="$style.state">
            {{ t('bricks.common.notFound') }}
        </p>

        <ul v-else :class="$style.list">
            <li v-for="template in visibleTemplates" :key="template.id">
                <button
                    :class="[
                        $style.row,
                        props.selectedTemplateId === template.id && $style._selected,
                    ]"
                    type="button"
                    :aria-pressed="props.selectedTemplateId === template.id"
                    @click="handleSelect(template)"
                >
                    <span :class="$style.thumbnail">
                        <img
                            v-if="template.thumbnailUrl"
                            :class="$style.thumbnailImage"
                            :src="template.thumbnailUrl"
                            :alt="template.name"
                            loading="lazy"
                        />
                        <BricksIcon
                            v-else
                            icon="ta:outline-photo"
                            :class="$style.thumbnailPlaceholder"
                        />
                    </span>
                    <span :class="$style.text">
                        <span :class="$style.name">{{ template.name }}</span>
                        <span :class="$style.meta">{{ buildMetaLine(template) }}</span>
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>

<style module lang="scss">
.BuilderTemplatesPickerList {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.search {
    width: 100%;
}

.list {
    overflow-y: auto;

    // Потолок высоты — четыре строки со скроллом: список живёт внутри модалки
    // создания, и вырасти он должен не за её счёт
    max-height: 28rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.row {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    width: 100%;
    padding: 0.8rem 1rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-base-50);
    }
}

._selected {
    background: var(--bricks-primary-50);
}

.thumbnail {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 5.6rem;
    height: 3.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.thumbnailPlaceholder {
    font-size: 1.4rem;
    color: var(--bricks-base-400);
}

.text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
}

.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.meta {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.state {
    margin: 0;
    padding: 1.2rem 1rem;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
