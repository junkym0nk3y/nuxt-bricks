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

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksTooltip from '../../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/base/tooltip/BricksTooltipHint.vue';
import BuilderMediaGalleryUploadOptionsPopover from './BuilderMediaGalleryUploadOptionsPopover.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadControlsProps>(), {
    showOptions: true,
    dropHint: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadControlsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const fileInputRef = ref<HTMLInputElement | null>(null);
// #endregion

// #region Computed
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
/**
 * Подсказка кнопки: куда можно бросить файл плюс лимиты размеров. Область
 * приёмника задаёт вызывающий — в модалке это окно, в разделе дашборда только
 * тело раздела, и общий текст обещал бы приём там, где его нет.
 */
const tooltipText = computed<string>(() => {
    const dropHint = props.dropHint || t('bricks.media.dropAnywhereHint');
    const sizeHint = t('bricks.media.sizeHint', {
        image: props.maxImageSizeMb,
        video: props.maxVideoSizeMb,
    });

    return `${dropHint} · ${sizeHint}`;
});
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
                <!--
                    На время загрузки кнопка не гаснет, только меняет подпись на
                    счётчик: очередь рассчитана на добавление наборов по ходу
                    (один worker на все наборы), и плитка-приёмник с перетаскиванием
                    их всё это время принимали — гасла одна кнопка, то есть три
                    входа в одну и ту же загрузку жили по разным правилам.
                -->
                <BricksButton
                    :class="$style.uploadButton"
                    size="md"
                    variant="primary"
                    @click="handleOpenFilePicker"
                >
                    {{ buttonLabel }}
                </BricksButton>
            </template>

            <template #default>
                <BricksTooltipHint :text="tooltipText" />
            </template>
        </BricksTooltip>

        <!--
            Шестерёнка параметров — необязательная: в разделе дашборда она стоит
            в строке фильтров, рядом с дорожкой категорий, и в шапке была бы
            второй точкой правды о параметрах загрузки
        -->
        <BuilderMediaGalleryUploadOptionsPopover
            v-if="props.showOptions"
            :optimization="props.optimization"
            :configured-max-width="props.configuredMaxWidth"
            tooltip-side="bottom"
            @update:optimization="handleOptimizationChange"
        />
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
</style>
