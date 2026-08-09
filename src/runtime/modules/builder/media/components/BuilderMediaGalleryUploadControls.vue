<script setup lang="ts">
/**
 * @description Точка входа загрузки в шапке галереи: кнопка «Загрузить»,
 * скрытый file-input и поповер параметров оптимизации.
 *
 * Постоянной зоны загрузки в модалке нет. Полоса во всю ширину занимала верх
 * содержимого, а держать свою высоту не могла: flex сжимал её под заполненной
 * сеткой, и `overflow: hidden` срезал подсказку молча. Приёмник вместо неё
 * показывается ровно тогда, когда файлы уже над окном (оверлей), плюс первой
 * ячейкой сетки стоит плитка-приёмник.
 *
 * Прогресс — на месте подписи кнопки: отдельной полосы больше нет, а считается
 * он по файлам набора, потому что отдача идёт одним запросом на файл и
 * байтового прогресса у неё нет.
 */

// #region Imports
// Types
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type {
    IMediaGalleryUploadControlsProps,
    IMediaGalleryUploadControlsEmits,
} from '../types/media';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
import BuilderMediaGalleryUploadOptions from './BuilderMediaGalleryUploadOptions.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadControlsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadControlsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isOptionsOpen = ref(false);
// #endregion

// #region Computed
const isUploading = computed<boolean>(() => props.uploadProgress !== null);
const buttonLabel = computed<string>(() => {
    const progress = props.uploadProgress;

    if (!progress) {
        return t('bricks.media.uploadFiles');
    }

    return t('bricks.media.upload.progressShort', {
        current: progress.current,
        total: progress.total,
    });
});
const tooltipText = computed<string>(
    () =>
        `${t('bricks.media.dropAnywhereHint')} · ${t('bricks.media.sizeHint', {
            image: props.maxImageSizeMb,
            video: props.maxVideoSizeMb,
        })}`
);
// #endregion

// #region Methods
/** Открывает системный выбор файлов. */
function handleOpenFilePicker(): void {
    fileInputRef.value?.click();
}

/**
 * Отдаёт выбранные файлы наверх.
 *
 * Значение input'а сбрасывается сразу: без этого повторный выбор того же файла
 * не поднимал бы `change`, и вторая попытка загрузки выглядела бы как отказ.
 *
 * @param event - Событие change нативного input'а.
 */
function handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
        return;
    }

    emit('upload', Array.from(files));
    input.value = '';
}

/**
 * Пробрасывает изменённые параметры наверх.
 *
 * @param value - Новые параметры оптимизации.
 */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    emit('update:optimization', value);
}

// Плитка-приёмник в сетке открывает тот же выбор файлов: второй `input` рядом с
// ней означал бы две точки правды о принимаемых типах
defineExpose({ openFilePicker: handleOpenFilePicker });
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryUploadControls">
        <input
            ref="fileInputRef"
            type="file"
            accept="image/*,video/*"
            multiple
            :class="$style.fileInput"
            @change="handleFileChange"
        />

        <BricksTooltip bottom>
            <template #activator>
                <BricksButton
                    :class="$style.uploadButton"
                    size="md"
                    variant="primary"
                    :disabled="isUploading"
                    @click="handleOpenFilePicker"
                >
                    {{ buttonLabel }}
                </BricksButton>
            </template>

            <template #default>
                <BricksTooltipHint :text="tooltipText" />
            </template>
        </BricksTooltip>

        <PopoverRoot v-model:open="isOptionsOpen">
            <!--
                Явный `PopoverAnchor` вокруг кнопки обязателен: обёртка тултипа
                разрывает связь `PopoverTrigger` с кнопкой, и поповеру нечего
                взять за точку привязки — контент открывался за верхним краем
                окна. Клик при этом работал, поэтому поломка выглядела как
                «поповер не открывается».
            -->
            <PopoverAnchor>
                <BricksTooltip bottom>
                    <template #activator>
                        <PopoverTrigger as-child>
                            <BricksButton
                                size="sm"
                                variant="ghost"
                                equal
                                :active="isOptionsOpen"
                                :aria-label="t('bricks.media.upload.optionsTitle')"
                            >
                                <BricksIcon icon="ta:outline-settings" />
                            </BricksButton>
                        </PopoverTrigger>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.media.upload.optionsTitle')" />
                    </template>
                </BricksTooltip>
            </PopoverAnchor>

            <PopoverPortal>
                <PopoverContent align="end" :side-offset="8" :class="$style.popover">
                    <BuilderMediaGalleryUploadOptions
                        :optimization="props.optimization"
                        @update:optimization="handleOptimizationChange"
                    />
                </PopoverContent>
            </PopoverPortal>
        </PopoverRoot>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryUploadControls {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

/* Ровно высота поля поиска: `md` кнопки кита набирают 39 (паддинг 1rem + строка
   1.2 × 1.4rem + рамка), а `BricksInput` — 36, и в одном ряду разница читалась
   как съехавшая кнопка. Задаётся `height`, а не паддинги: у кита они объявлены
   на `.button._md` (два класса), то есть специфичнее одиночного класса
   вызывающего, — а `height` не объявлен вовсе, и перебивать нечего. */
.uploadButton {
    height: 3.6rem;
}

.fileInput {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}

/* Анимация по `data-state`, а не Vue-транзишеном: присутствием контента управляет
   reka, и она сама ждёт окончания CSS-анимации перед размонтированием. Тот же
   приём у `BricksActionButton` и контекстного меню канваса. */
.popover {
    z-index: var(--bricks-z-popover);

    &[data-state='open'] {
        animation: options-popover-in var(--bricks-default-transition);
    }

    &[data-state='closed'] {
        animation: options-popover-out 150ms ease;
    }
}

@keyframes options-popover-in {
    from {
        opacity: 0;
        transform: translateY(-0.4rem);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes options-popover-out {
    from {
        opacity: 1;
    }

    to {
        opacity: 0;
    }
}
</style>
