<script setup lang="ts">
/**
 * @description Шестерёнка параметров оптимизации с поповером.
 *
 * Отдельным компонентом, потому что мест у неё два: контролы загрузки в шапке
 * модалки и строка фильтров раздела дашборда, где параметры стоят рядом с
 * действиями над категориями. Вторая копия этой связки разъехалась бы с первой:
 * привязка поповера здесь неочевидная и уже стоила отладки (см. `PopoverAnchor`
 * ниже).
 */

// #region Imports
// Types
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type {
    IMediaGalleryUploadOptionsPopoverProps,
    IMediaGalleryUploadOptionsPopoverEmits,
} from '../types/media';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';

// Components
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
import BuilderMediaGalleryUploadOptions from './BuilderMediaGalleryUploadOptions.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadOptionsPopoverProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadOptionsPopoverEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const isOpen = ref(false);
// #endregion

// #region Methods
/**
 * Пробрасывает изменённые параметры наверх.
 *
 * @param value - Новые параметры оптимизации.
 */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    emit('update:optimization', value);
}
// #endregion
</script>

<template>
    <PopoverRoot v-model:open="isOpen">
        <!--
            Явный `PopoverAnchor` обязателен: `as-child` триггера отдаёт свои
            обработчики ОБЁРТКЕ тултипа внутри кит-кнопки, и без якоря поповеру
            нечего взять за точку привязки — контент открывался за верхним краем
            окна. Клик при этом работал, поэтому поломка выглядела как «поповер
            не открывается».

            `aria-expanded` при этом остаётся на самой кнопке — его ставит проп
            `expanded`, а не триггер: обёртка не фокусируется, и объявление
            раскрытия на ней скринридер бы не прочитал.
        -->
        <PopoverAnchor>
            <PopoverTrigger as-child>
                <BricksIconButton
                    icon="ta:outline-settings"
                    :label="t('bricks.media.upload.optionsTitle')"
                    variant="ghost"
                    size="lg"
                    :active="isOpen"
                    :expanded="isOpen"
                    :tooltip-side="props.tooltipSide"
                />
            </PopoverTrigger>
        </PopoverAnchor>

        <PopoverPortal>
            <!--
                `as-child`: поверхность и узел reka — один и тот же, иначе
                позиционирование с `data-state` осталось бы на внешней обёртке,
                а рамка с тенью — на внутренней.
            -->
            <PopoverContent as-child align="end" :side-offset="8">
                <BricksPopoverSurface density="flush" elevation="lg" :class="$style.popover">
                    <BuilderMediaGalleryUploadOptions
                        :optimization="props.optimization"
                        :configured-max-width="props.configuredMaxWidth"
                        @update:optimization="handleOptimizationChange"
                    />
                </BricksPopoverSurface>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>

<style module lang="scss">
/* Анимация по `data-state`, а не Vue-транзишеном: присутствием контента управляет
   reka, и она сама ждёт окончания CSS-анимации перед размонтированием. Тот же
   приём у `BricksActionButton` и контекстного меню канваса. Вид, слой и рамка
   приезжают из `BricksPopoverSurface`; ширина и паддинг — из самой панели
   параметров (`1.6rem` в шкале плотности поверхности нет). */
.popover {
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
