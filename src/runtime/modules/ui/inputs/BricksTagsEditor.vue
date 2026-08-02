<script setup lang="ts">
// #region Imports
// Types
import type { IBricksTagsEditorProps, IBricksTagsEditorEmits } from './types.d.ts';

// Utils
import { TAGS_SEPARATOR, getTagsSerializedLength } from './utils/tags';

// Vue
import { computed, ref, useCssModule, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../base/button/BricksButton.vue';
import BricksFieldError from './BricksFieldError.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTagsEditorProps>(), {
    modelValue: () => [],
    placeholder: '',
    disabled: false,
    errorMessage: null,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksTagsEditorEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const $style = useCssModule();
const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
/** Отказ по лимиту: живёт до следующего успешного изменения набора тегов. */
const limitMessage = ref('');
/**
 * Последний набор, отданный наружу. По нему приход нового `modelValue`
 * отличается от внешней подмены (сброс формы, переключение страницы): своё
 * эхо оставляет недописанный хвост в поле, чужое — очищает его вместе с
 * отказом по лимиту, иначе они переехали бы в чужой контекст.
 */
let lastEmittedTags: string[] | null = null;
// #endregion

// #region Computed
const displayPlaceholder = computed<string>(
    () => props.placeholder || t('bricks.properties.gallery.tagPlaceholder')
);

/** Внешняя ошибка приоритетнее собственного отказа по лимиту. */
const displayedError = computed<string>(() => props.errorMessage || limitMessage.value);
// #endregion

// #region Methods
/**
 * Отдаёт новый набор тегов наружу, запоминая его как своё эхо.
 *
 * @param tags - Новый набор тегов.
 */
function emitTags(tags: string[]): void {
    lastEmittedTags = tags;
    emit('update:modelValue', tags);
}

/**
 * Сравнивает наборы тегов поэлементно.
 *
 * @param first - Первый набор.
 * @param second - Второй набор.
 * @returns Совпадают ли наборы.
 */
function isSameTags(first: string[], second: string[]): boolean {
    return first.length === second.length && first.every((tag, index) => tag === second[index]);
}

/**
 * Проверяет, помещается ли набор тегов в предел склеенного значения.
 *
 * @param tags - Проверяемый набор тегов.
 * @returns Помещается ли набор (без maxLength — всегда true).
 */
function fitsLimit(tags: string[]): boolean {
    if (!props.maxLength) {
        return true;
    }

    return getTagsSerializedLength(tags) <= props.maxLength;
}

/**
 * Добавляет теги из введённого текста: trim, отбрасывание пустых и дублей.
 * На первом теге, который не влезает в лимит, останавливается — он и всё,
 * что за ним, возвращается вызывающему, чтобы остаться в поле ввода: молча
 * съеденный ввод выглядел бы как потеря текста.
 *
 * @param parts - Части введённого текста, разделённые запятой.
 * @returns Непринятый остаток (пустая строка — принято всё).
 */
function commitTags(parts: string[]): string {
    const next = [...props.modelValue];
    let added = 0;

    for (let index = 0; index < parts.length; index += 1) {
        const tag = parts[index].trim();
        if (!tag || next.includes(tag)) {
            continue;
        }

        if (!fitsLimit([...next, tag])) {
            limitMessage.value = t('bricks.common.tagsLimit', { max: props.maxLength });
            if (added > 0) {
                emitTags(next);
            }

            return parts
                .slice(index)
                .map((part) => part.trim())
                .filter(Boolean)
                .join(TAGS_SEPARATOR);
        }

        next.push(tag);
        added += 1;
    }

    if (added > 0) {
        limitMessage.value = '';
        emitTags(next);
    }

    return '';
}

/**
 * Фиксирует введённый текст целиком (Enter, blur, кнопка «плюс»).
 */
function addTag(): void {
    if (!inputValue.value.trim()) {
        return;
    }

    inputValue.value = commitTags(inputValue.value.split(','));
}

/**
 * Обрабатывает ввод: запятая — разделитель, поэтому всё до последней запятой
 * превращается в чипы сразу (в том числе при вставке `a, b, c`), а хвост после
 * неё остаётся в поле — его пользователь ещё дописывает.
 *
 * @param event - Событие ввода.
 */
function handleInput(event: Event): void {
    // Пробел после запятой — часть разделителя, а не начало следующего тега:
    // при вводе по символу он приходит отдельным событием и иначе оставался бы
    // в поле отступом перед каждым следующим словом
    const value = (event.target as HTMLInputElement).value.trimStart();
    if (!value.includes(',')) {
        inputValue.value = value;
        return;
    }

    const parts = value.split(',');
    const tail = (parts.pop() ?? '').trimStart();
    const rest = commitTags(parts);

    if (!rest) {
        inputValue.value = tail;
        return;
    }

    inputValue.value = tail ? `${rest}${TAGS_SEPARATOR}${tail}` : rest;
}

/**
 * Удаляет тег по индексу.
 *
 * @param index - Индекс тега для удаления.
 */
function removeTag(index: number): void {
    const next = [...props.modelValue];
    next.splice(index, 1);
    limitMessage.value = '';
    emitTags(next);
}

/**
 * Обрабатывает нажатие Enter в поле ввода.
 *
 * @param event - Событие клавиатуры.
 */
function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTag();
    }

    // Backspace на пустом инпуте — удаляем последний тег
    if (event.key === 'Backspace' && !inputValue.value && props.modelValue.length > 0) {
        removeTag(props.modelValue.length - 1);
    }
}

/**
 * Фокусирует поле ввода при клике на контейнер.
 */
function focusInput(): void {
    inputRef.value?.focus();
}
// #endregion

// #region Lifecycle
// Набор подменили снаружи (отмена правок, переход на другую страницу) —
// недописанный хвост и отказ по лимиту относятся к прежнему значению
watch(
    () => props.modelValue,
    (next) => {
        if (lastEmittedTags && isSameTags(lastEmittedTags, next)) {
            return;
        }

        lastEmittedTags = null;
        inputValue.value = '';
        limitMessage.value = '';
    }
);
// #endregion
</script>

<template>
    <div :class="$style.BricksTagsEditor">
        <div
            :class="[
                $style.box,
                {
                    [$style._disabled]: props.disabled,
                    [$style._invalid]: Boolean(displayedError),
                },
            ]"
            @click="focusInput"
        >
            <div :class="$style.tags">
                <span
                    v-for="(tag, index) in props.modelValue"
                    :key="`tag-${index}`"
                    :class="$style.tag"
                >
                    <span :class="$style.tagText">{{ tag }}</span>
                    <button
                        type="button"
                        :class="$style.tagRemove"
                        :disabled="props.disabled"
                        @click.stop="removeTag(index)"
                    >
                        <BricksIcon icon="ta:outline-x" />
                    </button>
                </span>

                <input
                    ref="inputRef"
                    type="text"
                    :class="$style.input"
                    :value="inputValue"
                    :placeholder="props.modelValue.length === 0 ? displayPlaceholder : ''"
                    :disabled="props.disabled"
                    :aria-label="props.ariaLabel || undefined"
                    :aria-invalid="Boolean(displayedError)"
                    @input="handleInput"
                    @keydown="handleKeydown"
                    @blur="addTag"
                />
            </div>

            <BricksButton
                v-if="inputValue.trim()"
                size="sm"
                variant="ghost"
                :class="$style.addButton"
                :disabled="props.disabled"
                @click.stop="addTag"
            >
                <BricksIcon icon="ta:outline-plus" />
            </BricksButton>
        </div>

        <BricksFieldError :class="$style.errorMessage" :message="displayedError" />
    </div>
</template>

<style module lang="scss">
.BricksTagsEditor {
    display: flex;
    width: 100%;
    flex-direction: column;
}

.box {
    display: flex;
    align-items: center;
    min-height: 3.6rem;
    padding: 0.4rem 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    cursor: text;
    gap: 0.4rem;

    &:hover {
        border-color: var(--bricks-base-400);
    }

    &:focus-within {
        border-color: var(--bricks-primary);
        box-shadow: var(--bricks-shadow-focus);
    }

    &._invalid {
        border-color: var(--bricks-danger-600);
    }

    &._disabled {
        opacity: 0.5;
        pointer-events: none;
    }
}

.tags {
    display: flex;
    align-items: center;
    flex: 1;
    flex-wrap: wrap;
    min-width: 0;
    gap: 0.4rem;
}

.tag {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    border-radius: 0.4rem;
    background: var(--bricks-primary-100);
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-primary-700);
    gap: 0.2rem;
}

.tagText {
    overflow: hidden;
    max-width: 12rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tagRemove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--bricks-primary-500);
    transition: color 0.2s;
    cursor: pointer;

    &:hover {
        color: var(--bricks-danger-500);
    }

    svg {
        width: 1rem;
        height: 1rem;
    }
}

.input {
    flex: 1;
    min-width: 6rem;
    padding: 0;
    border: none;
    background: transparent;
    outline: none;
    font-size: 1.2rem;
    color: var(--bricks-base-900);

    &::placeholder {
        color: var(--bricks-base-400);
    }
}

.addButton {
    flex-shrink: 0;
}

.errorMessage {
    margin-top: 0.8rem;
}
</style>
