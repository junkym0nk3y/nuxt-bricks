<script setup lang="ts">
/**
 * @description Дорожка категорий: табы слева, действия над категориями справа.
 *
 * Поиска здесь нет — он уехал в шапку модалки. Поле с рамкой, стоящее на той же
 * линии, что и подчёркивание активного таба, читалось как подчёркивание самого
 * поля; вдобавок поиск относится ко всей медиатеке, а не к дорожке категорий.
 *
 * Создание категории живёт здесь же: кнопка «+» превращается в поле ввода на
 * месте таба. Кнопка отдельная, а не элемент дорожки: любой item `ToggleGroup`
 * выбирается и менял бы фильтр (см. BuilderMediaGalleryCategoryTabs).
 *
 * Рядом с ней — переключатель режима управления: в нём у пользовательских
 * категорий появляются крестики. Режим локальный, наверх не сообщается: удаление
 * приезжает готовым событием, а состояние ряда за пределами ряда никому не
 * нужно. Гасится сам, когда управлять больше нечем — иначе после удаления
 * последней своей категории режим остался бы включённым без единого крестика.
 */

// #region Imports
// Types
import type { IMediaGalleryFiltersProps, IMediaGalleryFiltersEmits } from '../types/media';

// Utils
// Vue
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
import BuilderMediaGalleryCategoryTabs from './BuilderMediaGalleryCategoryTabs.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryFiltersProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryFiltersEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const isCreateOpen = ref(false);
const isManaging = ref(false);
const newCategoryLabel = ref('');
const createInputRef = ref<InstanceType<typeof BricksInput> | null>(null);
// #endregion

// #region Computed
/**
 * Есть ли что удалять: неудаляемых категорий не осталось, поэтому режим
 * управления показывается ровно тогда, когда хоть одна категория заведена.
 */
const hasDeletableCategories = computed<boolean>(() => props.categories.length > 0);
/**
 * Дубликат ищется по подписи, а не по slug'у: slug считает сервер, и до отправки
 * его у клиента нет. Сравнение регистронезависимое — «Промо» и «промо» для
 * пользователя одна категория.
 */
const duplicateError = computed<string | null>(() => {
    const normalized = newCategoryLabel.value.trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    const isDuplicate = props.categories.some(
        (category) => category.label.toLowerCase() === normalized
    );

    return isDuplicate
        ? t('bricks.media.categoryDuplicate', { name: newCategoryLabel.value })
        : null;
});

const canSubmitCategory = computed<boolean>(
    () => Boolean(newCategoryLabel.value.trim()) && !duplicateError.value
);
// #endregion

// #region Methods
/** Обрабатывает выбор категории-чипа. */
function handleFilterChange(value: string): void {
    emit('update:categoryFilter', value);
}

/**
 * Открывает поле ввода новой категории на месте кнопки «+».
 *
 * Фокус ставится после `nextTick` и ищется в DOM компонента: своего метода
 * `focus()` у `BricksInput` в контракте нет, а нативный `<input>` лежит внутри.
 */
async function handleOpenCreate(): Promise<void> {
    isCreateOpen.value = true;
    newCategoryLabel.value = '';

    await nextTick();
    createInputRef.value?.$el?.querySelector('input')?.focus();
}

/** Переключает режим управления категориями. */
function handleToggleManaging(): void {
    isManaging.value = !isManaging.value;
}

/** Закрывает поле ввода, сбрасывая введённое. */
function handleCancelCreate(): void {
    isCreateOpen.value = false;
    newCategoryLabel.value = '';
}

/**
 * Отдаёт создание наверх. Поле закрывается сразу, не дожидаясь ответа: отказ
 * приезжает тостом, а держать поле открытым на время запроса значило бы
 * подвесить ряд фильтров — при успехе чип и так появляется сам.
 */
function handleSubmitCategory(): void {
    if (!canSubmitCategory.value || props.isCreatingCategory) {
        return;
    }

    emit('create-category', newCategoryLabel.value.trim());
    handleCancelCreate();
}

/** Эмитит удаление категории. */
function handleDeleteCategory(slug: string): void {
    emit('delete-category', slug);
}
// #endregion

// #region Lifecycle
// Режим гаснет, когда управлять нечем: удалив последнюю свою категорию,
// пользователь остался бы в режиме, который ничем себя не проявляет, а кнопка
// выхода из него при этом пропадает вместе с ним
watch(hasDeletableCategories, (hasDeletable) => {
    if (!hasDeletable) {
        isManaging.value = false;
    }
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryFilters">
        <BuilderMediaGalleryCategoryTabs
            :model-value="props.categoryFilter"
            :categories="props.categories"
            :category-counts="props.categoryCounts"
            :total-count="props.totalCount"
            :is-managing="isManaging"
            @update:model-value="handleFilterChange"
            @delete-category="handleDeleteCategory"
        />

        <!--
            Поле создания и кнопка «+» — одно место ряда, поэтому подмена идёт
            через `out-in`: одновременно на экране они выглядели бы двумя
            разными способами создать категорию
        -->
        <Transition mode="out-in" name="bricks-fade-fast">
            <div v-if="isCreateOpen" :class="$style.createRow">
                <BricksInput
                    ref="createInputRef"
                    :class="$style.createInput"
                    :value="newCategoryLabel"
                    type="text"
                    :placeholder="t('bricks.media.categoryNamePlaceholder')"
                    :disabled="props.isCreatingCategory"
                    :error-message="duplicateError"
                    @update:value="newCategoryLabel = $event"
                    @keydown.enter.prevent="handleSubmitCategory"
                    @keydown.esc.prevent="handleCancelCreate"
                />

                <BricksButton
                    size="sm"
                    variant="primary"
                    equal
                    :disabled="!canSubmitCategory || props.isCreatingCategory"
                    :aria-label="t('bricks.media.categoryCreateConfirm')"
                    @click="handleSubmitCategory"
                >
                    <BricksIcon icon="ta:outline-plus" />
                </BricksButton>

                <BricksButton
                    size="sm"
                    variant="secondary"
                    equal
                    :aria-label="t('bricks.common.cancel')"
                    @click="handleCancelCreate"
                >
                    <BricksIcon icon="ta:outline-x" />
                </BricksButton>
            </div>

            <!--
                Обёртка обязательна: `BricksTooltip` рендерит фрагмент
                (активатор + портал подсказки), а `Transition` умеет работать
                только с одним корневым элементом ветки. Без span'а режим
                `out-in` встаёт в клин — уходящая ветка не сообщает о конце, и
                входящая не монтируется вовсе. Тот же приём у `BricksTabBar`.
            -->
            <span v-else :class="$style.rowActions">
                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :aria-label="t('bricks.media.categoryCreate')"
                            @click="handleOpenCreate"
                        >
                            <BricksIcon icon="ta:outline-plus" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.media.categoryCreate')" />
                    </template>
                </BricksTooltip>

                <BricksTooltip v-if="hasDeletableCategories" top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :active="isManaging"
                            :aria-label="
                                isManaging
                                    ? t('bricks.media.categoryManageDone')
                                    : t('bricks.media.categoryManage')
                            "
                            :aria-pressed="isManaging"
                            @click="handleToggleManaging"
                        >
                            <BricksIcon
                                :icon="isManaging ? 'ta:outline-check' : 'ta:outline-pencil'"
                            />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint
                            :text="
                                isManaging
                                    ? t('bricks.media.categoryManageDone')
                                    : t('bricks.media.categoryManage')
                            "
                        />
                    </template>
                </BricksTooltip>
            </span>
        </Transition>
    </div>
</template>
<style module lang="scss">
/* Выравнивание по нижнему краю: подчёркивание выбранного таба обязано лежать
   ровно на линии дорожки. Линия идёт на всю ширину — оборвавшись за последним
   табом, она читалась бы как недорисованная.

   Действия над категориями прижаты к правому краю строки, а не идут сразу за
   последним табом: вплотную к дорожке они читались как ещё два таба, а место
   их в ряду зависело бы от того, сколько категорий заведено. */
.BuilderMediaGalleryFilters {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.6rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.createRow {
    display: inline-flex;
    align-items: center;
    padding-bottom: 0.2rem;
    gap: 0.4rem;
}

.rowActions {
    display: inline-flex;
    align-items: center;
    padding-bottom: 0.2rem;
    gap: 0.2rem;
}

/* Ширина поля — по подписи категории; вид, фокус, ошибку и крестик очистки
   рисует `BricksInput`. Ошибка дубликата приезжает его же пропом `errorMessage`,
   поэтому своего сообщения под рядом здесь больше нет. */
.createInput {
    width: 18rem;
}
</style>
