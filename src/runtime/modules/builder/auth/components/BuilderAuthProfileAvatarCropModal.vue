<script setup lang="ts">
/**
 * @description Кадрирование фото профиля: снимок под круглой рамкой, масштаб
 * ползунком, перетаскивание мышью.
 *
 * Кадрирование — отдельный шаг, а не кроп по центру: центр фотографии почти
 * никогда не совпадает с лицом, и «загрузили и обрезали по центру» срезало бы
 * половину аватаров. Круг рисует интерфейс, а хранится квадрат — иначе аватар
 * нельзя было бы показать в другой форме.
 *
 * Загрузку выполняет эта модалка, а не форма профиля: кнопка обязана уйти в
 * состояние отправки и держать модалку открытой до ответа — закройся она
 * раньше, человек увидел бы прежний аватар и решил, что «на самом деле файл уже
 * новый». Состояние отправки и текст отказа принадлежат тому, кто ждёт ответа.
 *
 * Отказы приходят с сервера: клиент проверяет только очевидное (файл выбран,
 * браузер его декодировал, снимок не мельче минимальной рамки). Тип содержимого
 * подтверждает сигнатура на сервере — заявить `image/png` может кто угодно, а
 * `accept` у поля выбора фильтрует диалог, но не перетаскивание.
 */

// #region Imports
// Types
import type { IAuthAvatarCropModalProps, IAuthAvatarCropModalEmits } from '../types/auth';

// Utils
import { AUTH_AVATAR_CROP_CIRCLE_PX, AUTH_AVATAR_MIN_CROP_SIDE_PX } from '../utils/avatarCropFrame';
import { resolveAvatarErrorKey } from '../utils/profileErrors';

// Constants
import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../../common/constants/auth';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useAuthAvatarCrop } from '../composables/useAuthAvatarCrop';
import { useAuthProfile } from '../composables/useAuthProfile';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';

import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksSlider from '../../../ui/inputs/BricksSlider.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthAvatarCropModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IAuthAvatarCropModalEmits>();
// #endregion

// #region Data
/** Шаг ползунка масштаба: достаточно мелкий, чтобы кадр двигался плавно. */
const ZOOM_STEP = 0.01;

/** Шаг сдвига кадра стрелками (px экрана) и его ускоренный вариант с Shift. */
const KEYBOARD_STEP_PX = 4;
const KEYBOARD_STEP_LARGE_PX = 24;

/** Направления сдвига: тянут снимок, поэтому знак обратен стрелке. */
const KEYBOARD_SHIFTS: Record<string, { x: number; y: number } | undefined> = {
    ArrowLeft: { x: 1, y: 0 },
    ArrowRight: { x: -1, y: 0 },
    ArrowUp: { x: 0, y: 1 },
    ArrowDown: { x: 0, y: -1 },
};

const { t } = useI18n();
const { uploadAvatar } = useAuthProfile();
const { imageUrl, zoom, maxZoom, imageStyle, frame, isReady, openFile, dragBy, release } =
    useAuthAvatarCrop();

const isSubmitting = ref(false);
const errorMessage = ref('');
/** Идёт перетаскивание: id указателя, чтобы не путать пальцы на тач-экране. */
const draggingPointerId = ref<number | null>(null);
let lastPointerX = 0;
let lastPointerY = 0;
// #endregion

// #region Computed
const canSubmit = computed<boolean>(
    () => isReady.value && frame.value !== null && !isSubmitting.value
);

/**
 * Геометрия круга для разметки. Число одно и то же для CSS и для арифметики
 * показа: разъехавшись, они кадрировали бы не ту область, которую человек видит.
 */
const stageStyle = computed<Record<string, string>>(() => ({
    '--bricks-crop-circle': `${AUTH_AVATAR_CROP_CIRCLE_PX}px`,
}));
// #endregion

// #region Methods
/**
 * Закрывает модалку.
 *
 * Пока идёт отправка, закрытие не проходит: ответ ещё не получен, и закрытая
 * модалка показала бы прежний аватар при уже применённой правке.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}

/**
 * Начинает перетаскивание снимка.
 *
 * Захват указателя обязателен: без него курсор, ушедший за край кадра, теряет
 * события, и снимок «залипает» на полпути.
 *
 * @param event - Событие указателя.
 */
function handlePointerDown(event: PointerEvent): void {
    if (!isReady.value || isSubmitting.value) {
        return;
    }

    draggingPointerId.value = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

/**
 * Двигает снимок под рамкой.
 *
 * @param event - Событие указателя.
 */
function handlePointerMove(event: PointerEvent): void {
    if (draggingPointerId.value !== event.pointerId) {
        return;
    }

    dragBy(event.clientX - lastPointerX, event.clientY - lastPointerY);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
}

/**
 * Завершает перетаскивание.
 *
 * @param event - Событие указателя.
 */
function handlePointerUp(event: PointerEvent): void {
    if (draggingPointerId.value !== event.pointerId) {
        return;
    }

    draggingPointerId.value = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
}

/**
 * Меняет масштаб.
 *
 * @param value - Новое значение масштаба.
 */
function handleZoom(value: number): void {
    zoom.value = value;
}

/**
 * Двигает кадр стрелками.
 *
 * Без этого положение области выбиралось бы только указателем: масштаб —
 * доступная дорожка, а сдвиг остался бы недостижим с клавиатуры, то есть человек
 * мог бы загрузить фото, но не выбрать в нём область.
 *
 * @param event - Событие клавиатуры.
 */
function handleKeyDown(event: KeyboardEvent): void {
    if (!isReady.value || isSubmitting.value) {
        return;
    }

    const step = event.shiftKey ? KEYBOARD_STEP_LARGE_PX : KEYBOARD_STEP_PX;
    const shift = KEYBOARD_SHIFTS[event.key];

    if (!shift) {
        return;
    }

    event.preventDefault();
    dragBy(shift.x * step, shift.y * step);
}

/**
 * Загружает кадрированное фото.
 */
async function handleSubmit(): Promise<void> {
    const currentFrame = frame.value;

    if (!props.file || !currentFrame || isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    errorMessage.value = '';

    try {
        await uploadAvatar(props.file, currentFrame);
        emit('uploaded');
    } catch (error: unknown) {
        // Потолок размера передаётся всем отказам: ключ выбирается по статусу, и
        // проверять здесь, какой именно из них его печатает, значило бы дублировать
        // разбор ошибки
        errorMessage.value = t(resolveAvatarErrorKey(error), {
            max: BRICKS_AVATAR_MAX_UPLOAD_MB,
        });
        console.error('[Builder] Failed to upload the profile photo:', error);
    } finally {
        isSubmitting.value = false;
    }
}
// #endregion

// #region Lifecycle
// Файл открывается по появлению, а не по монтированию: модалка живёт вместе с
// модалкой профиля и переиспользуется на каждое новое фото
watch(
    () => props.file,
    async (file) => {
        errorMessage.value = '';

        if (!file) {
            release();
            return;
        }

        try {
            await openFile(file);
        } catch (error: unknown) {
            errorMessage.value =
                error instanceof RangeError
                    ? t('bricks.auth.profile.errors.photoTooSmall', {
                          min: AUTH_AVATAR_MIN_CROP_SIDE_PX,
                      })
                    : t('bricks.auth.profile.errors.photoUnreadable');
            console.error('[Builder] Failed to open the selected photo:', error);
        }
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.auth.profile.crop.title')"
        layer="nested"
        variant="gradient"
        padded
        @close="handleClose"
        @after-leave="emit('afterLeave')"
    >
        <div :class="$style.BuilderAuthProfileAvatarCropModal">
            <BricksModalHeader :close-disabled="isSubmitting" @close="handleClose" />

            <div :class="$style.body">
                <!--
                    Кадр — интерактивная область: фокусируемый и с клавиатурой,
                    иначе положение выбранной области недостижимо без мыши
                -->
                <div
                    :class="$style.stage"
                    :style="stageStyle"
                    tabindex="0"
                    role="application"
                    :aria-label="t('bricks.auth.profile.crop.frameLabel')"
                    @keydown="handleKeyDown"
                    @pointerdown="handlePointerDown"
                    @pointermove="handlePointerMove"
                    @pointerup="handlePointerUp"
                    @pointercancel="handlePointerUp"
                >
                    <img
                        v-if="imageUrl"
                        :src="imageUrl"
                        alt=""
                        :class="$style.photo"
                        :style="imageStyle"
                        draggable="false"
                    />

                    <span :class="$style.mask" aria-hidden="true" />
                </div>

                <div :class="$style.zoom">
                    <span :class="$style.zoomLabel">{{ t('bricks.auth.profile.crop.zoom') }}</span>
                    <BricksSlider
                        :value="zoom"
                        :min="1"
                        :max="maxZoom"
                        :step="ZOOM_STEP"
                        :disabled="!isReady || isSubmitting"
                        :label="t('bricks.auth.profile.crop.zoom')"
                        @update:value="handleZoom"
                    />
                </div>

                <BricksFieldHint>{{ t('bricks.auth.profile.crop.hint') }}</BricksFieldHint>
                <p v-if="errorMessage" :class="$style.error">{{ errorMessage }}</p>
            </div>

            <BricksModalFooter>
                <BricksButton
                    size="md"
                    variant="ghost"
                    type="button"
                    :disabled="isSubmitting"
                    @click="handleClose"
                >
                    {{ t('bricks.common.cancel') }}
                </BricksButton>

                <BricksButton
                    size="md"
                    variant="primary"
                    type="button"
                    :disabled="!canSubmit"
                    @click="handleSubmit"
                >
                    {{ t('bricks.auth.profile.crop.submit') }}
                </BricksButton>
            </BricksModalFooter>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.BuilderAuthProfileAvatarCropModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    flex-direction: column;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.body {
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.2rem;
}

/* Кадр: снимок двигается внутри, круг рисуется поверх затемнения.
   Квадрат по размеру круга — при минимальном масштабе меньшая сторона снимка
   ровно накрывает кадр, поэтому фотография заполняет его целиком. */
.stage {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--bricks-crop-circle);
    height: var(--bricks-crop-circle);
    margin: 0 auto;
    border-radius: var(--bricks-border-radius-sm);
    background: var(--bricks-base-900);
    touch-action: none;
    user-select: none;
    cursor: grab;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:active {
        cursor: grabbing;
    }
}

/* Размеры и сдвиг задаёт композабл (`imageStyle`) в пикселях экрана; здесь —
   только точка отсчёта: левый верхний угол круга. Круг стоит в центре кадра,
   поэтому от центра снимок сдвигается на половину диаметра. */
.photo {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    max-width: none;
    margin: calc(var(--bricks-crop-circle) / -2) 0 0 calc(var(--bricks-crop-circle) / -2);
}

/* Затемнение вокруг круга: круг «прорезается» тенью, а не отдельным слоем —
   иначе поверх снимка лежал бы второй элемент, перехватывающий перетаскивание. */
.mask {
    position: absolute;
    top: 50%;
    left: 50%;
    width: var(--bricks-crop-circle);
    height: var(--bricks-crop-circle);
    border-radius: var(--bricks-border-radius-pill);
    border: 1px solid rgb(from var(--bricks-static-white) r g b / 60%);
    transform: translate(-50%, -50%);

    /* Растяжка тени заведомо больше кадра — она и есть затемнение вокруг круга */
    box-shadow: 0 0 0 100rem var(--bricks-overlay-dark);
    pointer-events: none;
}

.zoom {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.zoomLabel {
    flex-shrink: 0;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
}

.error {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}
</style>
