<script setup lang="ts">
/**
 * @description Футер галереи: два ряда вместо прежней одной строки. Верхний —
 * правки (миниатюра, имя, alt, категория), нижний — техническая сводка и
 * действия. Разделены потому, что набор действий зависит от типа файла (у видео
 * и вектора нет вариантов), и в одну строку с полями он не укладывается ни при
 * каком порядке.
 *
 * Без выбранного файла футер схлопывается в один ряд с подсказкой: прежде
 * компонент в этом состоянии не рисовал ничего, и полоса 76 висела пустой без
 * объяснений. Сводка по медиатеке живёт в шапке — там же, где кнопка загрузки,
 * то есть рядом с тем, что её меняет.
 *
 * Кнопки «Отменить» / «Выбрать» живут только в контексте выбора картинки: в
 * менеджере выбирать нечего, файл правится на месте.
 */

// #region Imports
// Types
import type { IMediaUpdateMetaRequest } from '../../../common/types/media';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { TBrickDemoValues } from '../../../common/types/index';
import type { IMediaGalleryMetaPanelProps, IMediaGalleryMetaPanelEmits } from '../types/media';

// Utils
import { formatMediaTechnicalSummary, isVideoMedia } from '../utils/mediaSummary';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
import BricksImage from '../../../ui/base/image/BricksImage.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryMetaPanelProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryMetaPanelEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const editableFilename = ref('');
const editableAlt = ref('');
/**
 * Последние принятые серверные значения — по ним отличается «поле не тронуто» от
 * «в поле несохранённый ввод». Отдельного флага dirty нет намеренно: он завёл бы
 * второй источник того же факта и разъехался бы с самим значением.
 */
const syncedItemId = ref<number | null>(null);
const syncedFilename = ref('');
const syncedAlt = ref('');
// #endregion

// #region Computed
/**
 * Первым вариантом — «Без категории»: категория необязательна, и снять её файлу
 * можно только отсюда. Пустая строка — контракт `BricksSelect` для пустого
 * значения (внутри reka она подменяется sentinel'ом, потому что item с value=''
 * ломает попап).
 */
const categoryOptions = computed<IBrickUiCommonProp[]>(() => [
    { label: t('bricks.media.noCategory'), value: '' },
    ...props.categories.map((category) => ({
        label: category.label,
        value: category.slug,
    })),
]);
const categoryFacets = computed<TBrickDemoValues[]>(() =>
    categoryOptions.value.map((option) => option.value)
);
const selectedCategory = computed<string>(() => props.selectedItem?.category ?? '');
/** У видео alt не используется: рендерер отдаёт `<video>`, а не `<img>`. */
const isAltDisabled = computed<boolean>(() =>
    props.selectedItem ? isVideoMedia(props.selectedItem) : true
);
const technicalSummary = computed<string>(() =>
    props.selectedItem ? formatMediaTechnicalSummary(props.selectedItem, t) : ''
);
// #endregion

// #region Methods
/**
 * Сохраняет изменённые метаданные (filename, alt) при уходе фокуса из ряда полей.
 *
 * Слушается `focusout` обёртки, а не `blur` самого поля: у `BricksInput` события
 * blur в контракте нет, а `focusout` всплывает. Переход между двумя полями ряда
 * тоже его вызывает, но это безвредно — правка отправляется только при реальном
 * отличии от сохранённого.
 */
function handleMetaCommit(): void {
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

/**
 * Эмитит смену категории выбранного элемента.
 *
 * Возвращать значение назад, как делал нативный `<select>`, не нужно:
 * `BricksSelect` контролируемый и показывает то, что пришло пропом, — при отказе
 * сервера источник не меняется, и селект остаётся на прежней категории сам.
 */
function handleCategoryChange(value: TBrickDemoValues | null): void {
    if (typeof value !== 'string' || value === selectedCategory.value) {
        return;
    }

    // Пустая строка от селекта — это «без категории», а не пустой slug
    emit('update-category', value || null);
}

/** Эмитит запрос на удаление выбранного элемента. */
function handleRemove(): void {
    emit('remove');
}
// #endregion

// #region Lifecycle
/**
 * Синхронизирует черновики полей с серверным состоянием — по полю, а не оптом.
 *
 * Два крайних варианта не работают оба. Сторож по объекту срабатывал на
 * СОБСТВЕННОМ ответе PATCH (стор подменяет элемент списка новым объектом) и
 * перетирал оба поля: правишь имя, уходишь Tab'ом в alt — это и отправляет
 * PATCH, — печатаешь, и набранное исчезает, когда приходит ответ. Сторож только
 * по `id` терял обратную задачу: файл заменился с тем же id (перечитывание
 * списка после обрыва, правка с другой поверхности), поле осталось с прежним
 * значением, и следующий `focusout` отправлял его назад — то есть откатывал
 * чужое изменение.
 *
 * Поэтому решение по полю: поле, которого пользователь не касался, принимает
 * серверное значение; поле с несохранённым вводом его переживает. «Не касался» —
 * это «черновик совпадает с последним принятым серверным значением», для чего и
 * нужны теневые ref'ы.
 */
watch(
    () => [props.selectedItem?.id ?? null, props.selectedItem?.filename, props.selectedItem?.alt],
    () => {
        const id = props.selectedItem?.id ?? null;
        const filename = props.selectedItem?.filename ?? '';
        const alt = props.selectedItem?.alt ?? '';

        // Смена файла сбрасывает всё: черновик прошлого файла к новому отношения
        // не имеет, даже если пользователь его не сохранил
        if (id !== syncedItemId.value) {
            syncedItemId.value = id;
            syncedFilename.value = filename;
            syncedAlt.value = alt;
            editableFilename.value = filename;
            editableAlt.value = alt;
            return;
        }

        if (editableFilename.value === syncedFilename.value) {
            editableFilename.value = filename;
        }

        if (editableAlt.value === syncedAlt.value) {
            editableAlt.value = alt;
        }

        syncedFilename.value = filename;
        syncedAlt.value = alt;
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryMetaPanel">
        <!--
            Футер меняет и содержимое, и высоту (76 без выбора против 120 с ним):
            мгновенная подмена читается как подскок панели под курсором
        -->
        <Transition mode="out-in" name="bricks-fade-fast">
            <div v-if="props.selectedItem" :class="$style.selectedState">
                <div :class="$style.fieldsRow" @focusout="handleMetaCommit">
                    <div :class="$style.selectedThumb">
                        <BricksImage
                            v-if="!isVideoMedia(props.selectedItem)"
                            :src="props.selectedItem.previewUrl ?? props.selectedItem.url"
                            :alt="props.selectedItem.alt || props.selectedItem.filename"
                            fit="cover"
                        />
                        <BricksIcon v-else icon="ta:outline-video" />
                    </div>

                    <div :class="$style.field">
                        <span :class="$style.fieldLabel">{{ t('bricks.media.nameLabel') }}</span>
                        <div :class="[$style.control, $style._name]">
                            <BricksInput
                                :value="editableFilename"
                                :placeholder="t('bricks.media.filenamePlaceholder')"
                                @update:value="editableFilename = $event"
                            />
                        </div>
                    </div>

                    <div :class="$style.field">
                        <span :class="$style.fieldLabel">Alt</span>
                        <div :class="[$style.control, $style._alt]">
                            <BricksInput
                                :value="editableAlt"
                                :disabled="isAltDisabled"
                                :placeholder="
                                    isAltDisabled
                                        ? t('bricks.media.altUnusedForVideo')
                                        : t('bricks.media.altPlaceholder')
                                "
                                @update:value="editableAlt = $event"
                            />
                        </div>
                    </div>

                    <div :class="$style.field">
                        <span :class="$style.fieldLabel">{{
                            t('bricks.media.categoryLabel')
                        }}</span>
                        <div :class="[$style.control, $style._category]">
                            <BricksSelect
                                :value="selectedCategory"
                                :specs="categoryOptions"
                                :facets="categoryFacets"
                                @update:value="handleCategoryChange"
                            />
                        </div>
                    </div>

                    <!--
                        Удаление стоит у полей файла, а не в правом углу: угол
                        оставлен подтверждающему действию, а разрушающее рядом с
                        ним было единственным цветовым акцентом футера. Тон
                        появляется по наведению — до него это ещё не «красная
                        кнопка».
                    -->
                    <BricksTooltip top>
                        <template #activator>
                            <BricksButton
                                :class="$style.removeButton"
                                size="sm"
                                variant="ghost"
                                equal
                                :aria-label="t('bricks.common.delete')"
                                @click="handleRemove"
                            >
                                <BricksIcon icon="ta:outline-trash" />
                            </BricksButton>
                        </template>

                        <template #default>
                            <BricksTooltipHint :text="t('bricks.common.delete')" />
                        </template>
                    </BricksTooltip>
                </div>

                <div :class="$style.divider" />

                <div :class="$style.technicalRow">
                    <p :class="$style.summary">{{ technicalSummary }}</p>

                    <div v-if="props.showPickerActions" :class="$style.actions">
                        <BricksButton size="md" variant="secondary" @click="emit('close')">
                            {{ t('bricks.media.cancel') }}
                        </BricksButton>
                        <BricksButton size="md" variant="primary" @click="emit('insert')">
                            {{ t('bricks.media.select') }}
                        </BricksButton>
                    </div>
                </div>
            </div>

            <div v-else :class="$style.emptyRow">
                <p :class="$style.summary">{{ t('bricks.media.selectFileHint') }}</p>

                <div v-if="props.showPickerActions" :class="$style.actions">
                    <BricksButton size="md" variant="secondary" @click="emit('close')">
                        {{ t('bricks.media.cancel') }}
                    </BricksButton>
                    <BricksButton size="md" variant="primary" disabled @click="emit('insert')">
                        {{ t('bricks.media.select') }}
                    </BricksButton>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryMetaPanel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
}

/* Два ряда правок и техники; появилась обёрткой, потому что переключение
   состояний футера обёрнуто в transition — у него должен быть один корень. */
.selectedState {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.fieldsRow {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.selectedThumb {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: var(--bricks-border-radius-xs);
    background: var(--bricks-base-100);
    font-size: 1.6rem;
    color: var(--bricks-base-500);
}

.field {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
}

.fieldLabel {
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
}

/* Кнопка удаления в тоне текста, danger — только по наведению: в ряду правок
   она не должна перетягивать внимание на себя. */
.removeButton {
    margin-left: auto;
    color: var(--bricks-base-500);

    &:hover {
        background: var(--bricks-danger-50);
        color: var(--bricks-danger-500);
    }
}

/* Ширины из макета; поля не тянутся, потому что ряд обязан оставаться одной
   строкой — при растяжении «Категория» уезжала бы за край на узком окне. */
.control {
    &._name {
        width: 26rem;
    }

    &._alt {
        width: 30rem;
    }

    &._category {
        width: 17rem;
    }
}

.divider {
    height: 1px;
    background: var(--bricks-base-200);
}

.technicalRow,
.emptyRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
}

/* Ряд-подсказка держит высоту, а не сжимается по строке текста: иначе футер
   прыгал бы с 47 до 120 при первом же выборе файла и сдвигал сетку под курсором. */
.emptyRow {
    min-height: 4.4rem;
}

.summary {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.actions {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex-shrink: 0;
}
</style>
