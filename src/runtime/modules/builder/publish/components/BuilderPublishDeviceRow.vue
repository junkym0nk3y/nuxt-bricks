<script setup lang="ts">
// #region Imports
// Types
import type { IPublishDeviceRow } from '../types/devices';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BuilderPublishDeviceIconPopover from './BuilderPublishDeviceIconPopover.vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        row: IPublishDeviceRow;
        disabled?: boolean;
    }>(),
    { disabled: false }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    update: [key: string, patch: Partial<IPublishDeviceRow>];
    remove: [key: string];
}>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/**
 * Отдаёт наверх правку подписи устройства.
 *
 * Ключ при этом не меняется: он построен при создании строки, и пересчёт
 * осиротил бы переопределения блоков, привязанные к прежнему ключу.
 *
 * @param value - Новая подпись.
 */
function handleLabel(value: string): void {
    emit('update', props.row.key, { label: value });
}

/**
 * Отдаёт наверх правку ширины устройства.
 *
 * @param value - Новое значение поля.
 */
function handleWidth(value: string): void {
    emit('update', props.row.key, { width: Number.parseInt(value, 10) });
}

/**
 * Отдаёт наверх правку rem-поля.
 *
 * Пустое поле у `maxWidth`/`minWidth` — законное «не задано»: в CSS такие
 * свойства просто не пишутся, поэтому значение снимается, а не обнуляется.
 *
 * @param field - Имя поля.
 * @param value - Новое значение поля.
 */
function handleRem(field: 'aside' | 'maxWidth' | 'minWidth', value: string): void {
    const trimmed = value.trim();

    if (!trimmed && field !== 'aside') {
        emit('update', props.row.key, { [field]: undefined });
        return;
    }

    emit('update', props.row.key, { [field]: Number.parseFloat(trimmed) || 0 });
}

/**
 * Запрашивает удаление устройства.
 */
function handleRemove(): void {
    emit('remove', props.row.key);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDeviceRow">
        <div :class="$style.device">
            <BuilderPublishDeviceIconPopover
                :icon="props.row.icon"
                :disabled="props.disabled"
                @update:icon="(icon: string) => emit('update', props.row.key, { icon })"
            />
            <BricksInput
                :value="props.row.label"
                :disabled="props.disabled"
                :error-message="props.row.labelError"
                :aria-label="t('bricks.devices.columns.device')"
                @update:value="handleLabel"
            />
        </div>

        <BricksInput
            :value="props.row.width"
            type="number"
            :step="1"
            :disabled="props.disabled"
            :error-message="props.row.widthError"
            :aria-label="t('bricks.devices.columns.width')"
            @update:value="handleWidth"
        />

        <BricksInput
            :value="props.row.aside"
            type="number"
            :step="0.2"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.columns.aside')"
            @update:value="(value: string) => handleRem('aside', value)"
        />

        <BricksInput
            :value="props.row.maxWidth ?? ''"
            type="number"
            :step="0.2"
            placeholder="—"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.columns.maxWidth')"
            @update:value="(value: string) => handleRem('maxWidth', value)"
        />

        <BricksInput
            :value="props.row.minWidth ?? ''"
            type="number"
            :step="0.2"
            placeholder="—"
            :disabled="props.disabled"
            :aria-label="t('bricks.devices.columns.minWidth')"
            @update:value="(value: string) => handleRem('minWidth', value)"
        />

        <span v-if="props.row.isLocked" :class="$style.lock" :title="t('bricks.devices.locked')">
            <BricksIcon icon="ta:outline-lock" />
        </span>
        <BricksIconButton
            v-else
            variant="ghost"
            size="lg"
            icon="ta:outline-x"
            :label="t('bricks.devices.remove', { label: props.row.label })"
            danger
            :disabled="props.disabled"
            @click="handleRemove"
        />
    </div>
</template>

<style module lang="scss">
.BuilderPublishDeviceRow {
    display: grid;
    grid-template-columns: 23.6rem 9.6rem 9.6rem 9.6rem 9.6rem 3.2rem;

    // По центру, а не по верху: у ячеек одна высота (поле 3.6rem, icon-кнопка
    // 3.6rem, замок 3.2rem), и при выравнивании по верху замок с крестиком
    // всплывали выше строки значений
    align-items: center;
    gap: 1.2rem;
    padding: 0.8rem 0;

    // Крестик проявляется при наведении на строку и доходит до опасного цвета
    // только при наведении на сам крестик: удаление — разрушающее действие
    &:hover .remove {
        color: var(--bricks-base-500);
    }
}

.device {
    display: flex;
    align-items: center;
    height: 3.6rem;
    gap: 0.8rem;
}

.lock {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;

    // Глиф 1.6rem по макету: без явного размера иконка наследовала кегль
    // окружающего текста и болталась в центре 3.2rem-бокса мелкой точкой
    font-size: 1.6rem;
    color: var(--bricks-base-300);
}
</style>
