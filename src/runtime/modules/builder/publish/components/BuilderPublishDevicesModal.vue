<script setup lang="ts">
// #region Imports
// Types
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { IPublishDeviceRow } from '../types/devices';
import type { IPublishDevicesModalEmits, IPublishDevicesModalProps } from '../types/dashboard';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishDeviceSet } from '../composables/usePublishDeviceSet';

// Constants
import { DEVICE_SET_MAX } from '../../../common/constants/devices';

// Utils
import { countDeviceOverrides, describeAbsorbedRange } from '../utils/deviceImpact';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BuilderPublishDeviceAddMenu from './BuilderPublishDeviceAddMenu.vue';
import BuilderPublishDeviceRanges from './BuilderPublishDeviceRanges.vue';
import BuilderPublishDeviceRow from './BuilderPublishDeviceRow.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDevicesModalProps>(), {
    layer: 'modal',
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDevicesModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const {
    isCustom,
    rows,
    ranges,
    availableChoices,
    canAdd,
    canSave,
    addDevice,
    removeDevice,
    updateDevice,
    setCustom,
    toFormValue,
} = usePublishDeviceSet({
    isOpen: () => props.isOpen,
    initial: () => props.viewportConfig,
    projectDevices: () => props.projectDevices,
    activeDeviceKey: () => props.activeDeviceKey,
});

/** Ключ устройства, для которого открыто подтверждение удаления. */
const pendingRemovalKey = ref<string | null>(null);

/** Открыто подтверждение возврата к набору проекта. */
const isRevertConfirmOpen = ref(false);

// Подтверждения не должны пережить закрытие модалки: открытая заново, она
// показала бы диалог удаления устройства, которого пользователь уже не выбирал
watch(
    () => props.isOpen,
    (isOpen) => {
        if (isOpen) {
            pendingRemovalKey.value = null;
            isRevertConfirmOpen.value = false;
        }
    }
);
// #endregion

// #region Computed
// Счётчик считает строки, а не возможность добавить: при выключенном тумблере
// добавлять нельзя, но «4 из 4 — максимум» на наборе из трёх — просто ложь
const addLabel = computed(() =>
    rows.value.length >= DEVICE_SET_MAX
        ? t('bricks.devices.addMaxReached', { max: DEVICE_SET_MAX })
        : t('bricks.devices.addCounter', { current: rows.value.length, max: DEVICE_SET_MAX })
);

/**
 * Текст подтверждения удаления: сколько переопределений исчезнет и какому
 * устройству достанется освободившийся диапазон.
 */
const removalDescription = computed<string>(() => {
    const key = pendingRemovalKey.value;

    if (!key) {
        return '';
    }

    const absorbed = describeAbsorbedRange(
        rows.value.map(({ key: deviceKey, label, width }) => ({ key: deviceKey, label, width })),
        key
    );

    return t('bricks.devices.removeConfirm.description', {
        count: countDeviceOverrides(props.schemaComponents, key),
        range: absorbed.range,
        label: absorbed.label,
    });
});

const pendingRemovalLabel = computed<string>(
    () => rows.value.find((row) => row.key === pendingRemovalKey.value)?.label ?? ''
);
// #endregion

// #region Methods
/**
 * Переключает собственный набор страницы.
 *
 * Выключение — разрушающее действие (часть переопределений пропадёт), поэтому
 * идёт через подтверждение; включение просто копирует набор проекта.
 *
 * @param value - Новое положение тумблера.
 */
function handleToggleCustom(value: boolean | string): void {
    if (value === false && isCustom.value) {
        isRevertConfirmOpen.value = true;
        return;
    }

    setCustom(Boolean(value));
}

/**
 * Запрашивает удаление устройства.
 *
 * @param key - Ключ устройства.
 */
function handleRequestRemove(key: string): void {
    pendingRemovalKey.value = key;
}

/**
 * Подтверждает удаление устройства.
 */
function handleConfirmRemove(): void {
    if (pendingRemovalKey.value) {
        removeDevice(pendingRemovalKey.value);
    }

    pendingRemovalKey.value = null;
}

/**
 * Подтверждает возврат к набору проекта.
 */
function handleConfirmRevert(): void {
    setCustom(false);
    isRevertConfirmOpen.value = false;
}

/**
 * Правит поле устройства.
 *
 * @param key - Ключ устройства.
 * @param patch - Изменяемые поля.
 */
function handleUpdate(key: string, patch: Partial<IPublishDeviceRow>): void {
    updateDevice(key, patch);
}

/**
 * Отдаёт набор наверх и закрывает модалку.
 *
 * Сохранение коммитит набор в состояние редактора, а не пишет на сервер:
 * схема и набор уезжают вместе общим сохранением страницы — иначе точечный
 * PATCH прошёл бы мимо снапшота версии.
 */
function handleSave(): void {
    if (!canSave.value) {
        return;
    }

    const value: TBricksPageDeviceSet | null = toFormValue();

    emit('save', value);
    emit('close');
}
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :layer="props.layer"
        :title="t('bricks.devices.title')"
        padded
        @close="emit('close')"
    >
        <div :class="$style.BuilderPublishDevicesModal">
            <header :class="$style.header">
                <h2 :class="$style.heading">{{ t('bricks.devices.title') }}</h2>
                <BricksCloseButton @click="emit('close')" />
            </header>

            <div :class="$style.body">
                <div :class="$style.inherit">
                    <div :class="$style.inheritText">
                        <span :class="$style.inheritTitle">{{ t('bricks.devices.ownTitle') }}</span>
                        <span :class="$style.inheritHint">
                            {{
                                isCustom
                                    ? t('bricks.devices.ownHintOn', { count: rows.length })
                                    : t('bricks.devices.ownHintOff', { count: rows.length })
                            }}
                        </span>
                    </div>
                    <!--
                        true-value/false-value обязательны: по умолчанию у свитча
                        оба равны `false`, и тумблер работает инвертированно
                    -->
                    <BricksSwitch
                        :value="isCustom"
                        :true-value="true"
                        :false-value="false"
                        true-label=""
                        false-label=""
                        @update:value="handleToggleCustom"
                    />
                </div>

                <div :class="$style.table">
                    <div :class="$style.columns">
                        <span>{{ t('bricks.devices.columns.device') }}</span>
                        <span>{{ t('bricks.devices.columns.width') }}</span>
                        <span>{{ t('bricks.devices.columns.aside') }}</span>
                        <span>{{ t('bricks.devices.columns.maxWidth') }}</span>
                        <span>{{ t('bricks.devices.columns.minWidth') }}</span>
                        <span />
                    </div>

                    <BuilderPublishDeviceRow
                        v-for="row in rows"
                        :key="row.key"
                        :row="row"
                        :disabled="!isCustom"
                        @update="handleUpdate"
                        @remove="handleRequestRemove"
                    />

                    <BuilderPublishDeviceAddMenu
                        :choices="availableChoices"
                        :counter="addLabel"
                        :disabled="!canAdd"
                        @select="addDevice"
                    />
                </div>

                <BuilderPublishDeviceRanges :ranges="ranges" />
            </div>

            <footer :class="$style.footer">
                <BricksButton variant="ghost" @click="emit('close')">
                    {{ t('bricks.common.cancel') }}
                </BricksButton>
                <BricksButton variant="primary" :disabled="!canSave" @click="handleSave">
                    {{ t('bricks.common.save') }}
                </BricksButton>
            </footer>
        </div>
    </BricksModal>

    <BricksConfirmModal
        :is-open="pendingRemovalKey !== null"
        :title="t('bricks.devices.removeConfirm.title', { label: pendingRemovalLabel })"
        :description="removalDescription"
        :confirm-text="t('bricks.common.delete')"
        confirm-variant="danger"
        @close="pendingRemovalKey = null"
        @confirm="handleConfirmRemove"
    />

    <BricksConfirmModal
        :is-open="isRevertConfirmOpen"
        :title="t('bricks.devices.revertConfirm.title')"
        :description="t('bricks.devices.revertConfirm.description')"
        :confirm-text="t('bricks.common.delete')"
        confirm-variant="danger"
        @close="isRevertConfirmOpen = false"
        @confirm="handleConfirmRevert"
    />
</template>

<style module lang="scss">
.BuilderPublishDevicesModal {
    display: flex;
    flex-direction: column;
    width: 76rem;
    max-width: 100%;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2rem 2.4rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.heading {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.body {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 2rem 2.4rem;
}

.inherit {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-surface-raised);
    gap: 1.6rem;
}

.inheritText {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.inheritTitle {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.inheritHint {
    font-size: 1.1rem;
    color: var(--bricks-base-500);
}

.table {
    display: flex;
    flex-direction: column;

    // Зазор 0.8rem между шапкой, строками и кнопкой добавления — по макету:
    // вплотную строки читались как один блок
    gap: 0.8rem;
}

// Подписи колонок вынесены в шапку: значения читаются сверху вниз по колонке,
// а не выискиваются в каждой строке заново
.columns {
    display: grid;
    text-transform: uppercase;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-500);
    grid-template-columns: 23.6rem 9.6rem 9.6rem 9.6rem 9.6rem 3.2rem;
    gap: 1.2rem;
}

.footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
    padding: 1.6rem 2.4rem;
    border-top: 1px solid var(--bricks-base-200);
}
</style>
