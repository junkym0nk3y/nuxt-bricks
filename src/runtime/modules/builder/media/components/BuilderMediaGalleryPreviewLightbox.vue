<script setup lang="ts">
/**
 * @description Полноэкранный предпросмотр файла поверх галереи.
 *
 * Это диалог, а не просто оверлей: он перекрывает всю модалку, поэтому обязан
 * забрать фокус и не пускать Tab за свои пределы — иначе фокус остаётся на
 * плитке под затемнением и продолжает ходить по невидимой галерее. Реализовано
 * своими руками, а не `BricksModal`: тот телепортируется в body и создал бы
 * собственный слой поверх галереи, тогда как лайтбокс обязан жить ВНУТРИ её
 * контекста наложения.
 *
 * Escape обрабатывается здесь же: на дашборде лайтбокс открывается сам по себе
 * (снимок страницы, снимок шаблона, файл медиатеки), и Reka Dialog над ним нет —
 * наследовать закрытие не от кого. Внутри галереи это не двоится: её обработчик
 * гасит событие у модалки и закрывает тот же лайтбокс.
 */

// #region Imports
// Types
import type {
    IMediaGalleryPreviewLightboxProps,
    IMediaGalleryPreviewLightboxEmits,
} from '../types/media';

// Vue
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryPreviewLightboxProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryPreviewLightboxEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const rootRef = ref<HTMLElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
/** Что было в фокусе до открытия — туда фокус и возвращается. */
let previouslyFocused: HTMLElement | null = null;
// #endregion

// #region Methods
/** Закрывает полноэкранный предпросмотр. */
function handleClose(): void {
    emit('close');
}

/**
 * Закрывает просмотр по Escape и запирает Tab внутри диалога, замыкая его в цикл
 * по своим фокусируемым элементам.
 *
 * Escape обрабатывается здесь, а не наследуется от родительской модалки: на
 * дашборде лайтбокс живёт сам по себе (снимок страницы, снимок шаблона, файл
 * медиатеки), и Reka-диалога над ним нет вовсе. Внутри галереи это не двоится:
 * её обработчик гасит событие у модалки и закрывает тот же просмотр.
 *
 *
 * Не «всегда возвращать фокус на закрытие»: у видео есть `controls`, и сам
 * `<video>` фокусируем — сведение цикла к одной кнопке делало бы его контролы
 * недостижимыми с клавиатуры. Перехватывается только выход за края, внутри
 * диалога Tab работает нативно.
 *
 * @param event - Событие клавиатуры.
 */
function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
    }

    if (event.key !== 'Tab') {
        return;
    }

    const focusable = Array.from(
        rootRef.value?.querySelectorAll<HTMLElement>('button, video[controls]') ?? []
    );

    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const boundary = event.shiftKey ? first : last;

    if (document.activeElement !== boundary) {
        return;
    }

    event.preventDefault();
    (event.shiftKey ? last : first).focus();
}
// #endregion

// #region Lifecycle
watch(
    () => props.item,
    async (item) => {
        if (!item) {
            previouslyFocused?.focus();
            previouslyFocused = null;
            return;
        }

        previouslyFocused = document.activeElement as HTMLElement | null;

        await nextTick();
        closeRef.value?.focus();
    }
);
// #endregion
</script>

<template>
    <Transition name="bricks-modal-fade">
        <div
            v-if="props.item"
            ref="rootRef"
            role="dialog"
            aria-modal="true"
            :aria-label="props.item.alt || props.item.filename"
            :class="$style.BuilderMediaGalleryPreviewLightbox"
            @click.self="handleClose"
            @keydown="handleKeydown"
        >
            <button
                ref="closeRef"
                type="button"
                :class="$style.previewClose"
                :aria-label="t('bricks.common.close')"
                @click="handleClose"
            >
                <BricksIcon icon="ta:outline-x" />
            </button>
            <video
                v-if="props.item.mimeType.startsWith('video/')"
                :src="props.item.url"
                :class="$style.previewImage"
                controls
                playsinline
            />
            <img
                v-else
                :src="props.item.url"
                :alt="props.item.alt || props.item.filename"
                :class="$style.previewImage"
                decoding="async"
            />
        </div>
    </Transition>
</template>

<style module lang="scss">
.BuilderMediaGalleryPreviewLightbox {
    position: fixed;
    inset: 0;

    /* Локальное значение, не из шкалы `--bricks-z-*`: лайтбокс рендерится внутри
       модалки галереи, а её корень с z-index создаёт свой контекст наложения —
       соперничать здесь можно только с соседями внутри модалки, у которых
       z-index нет вовсе. */
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    background: rgb(0 0 0 / 85%);
}

.previewClose {
    position: absolute;
    top: 2rem;
    right: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    padding: 0;
    border-radius: 0.8rem;
    border: none;
    background: rgb(255 255 255 / 15%);
    font-size: 2rem;
    color: var(--bricks-static-white);
    transition: background 150ms ease;
    cursor: pointer;

    &:hover {
        background: rgb(255 255 255 / 25%);
    }
}

.previewImage {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0.4rem;
    object-fit: contain;
}
</style>
