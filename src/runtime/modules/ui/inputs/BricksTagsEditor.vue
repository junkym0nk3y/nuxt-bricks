<script setup lang="ts">
// #region Imports
// Vue
import { computed, ref, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../base/button/BricksButton.vue';
// #endregion

// #region Interfaces
interface ITagsEditorProps {
    modelValue?: string[];
    placeholder?: string;
    disabled?: boolean;
}

interface ITagsEditorEmits {
    'update:modelValue': [value: string[]];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ITagsEditorProps>(), {
    modelValue: () => [],
    placeholder: '',
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ITagsEditorEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const $style = useCssModule();
const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
// #endregion

// #region Computed
const displayPlaceholder = computed<string>(
    () => props.placeholder || t('bricks.properties.gallery.tagPlaceholder')
);
// #endregion

// #region Methods
/**
 * Добавляет новый тег в список.
 */
function addTag(): void {
    const trimmed = inputValue.value.trim();
    if (!trimmed) {
        return;
    }

    // Не добавляем дубликаты
    if (props.modelValue.includes(trimmed)) {
        inputValue.value = '';
        return;
    }

    emit('update:modelValue', [...props.modelValue, trimmed]);
    inputValue.value = '';
}

/**
 * Удаляет тег по индексу.
 *
 * @param index - Индекс тега для удаления.
 */
function removeTag(index: number): void {
    const next = [...props.modelValue];
    next.splice(index, 1);
    emit('update:modelValue', next);
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
</script>

<template>
    <div
        :class="[$style.BricksTagsEditor, { [$style._disabled]: props.disabled }]"
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
                    <BricksIcon icon="md:close" />
                </button>
            </span>

            <input
                ref="inputRef"
                v-model="inputValue"
                type="text"
                :class="$style.input"
                :placeholder="props.modelValue.length === 0 ? displayPlaceholder : ''"
                :disabled="props.disabled"
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
            <BricksIcon icon="ph:plus" />
        </BricksButton>
    </div>
</template>

<style module lang="scss">
.BricksTagsEditor {
    display: flex;
    align-items: center;
    min-height: 3.6rem;
    padding: 0.4rem 0.8rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-0);
    transition:
        border-color var(--default-transition),
        box-shadow var(--default-transition);
    cursor: text;
    gap: 0.4rem;

    &:hover {
        border-color: var(--bricks-base-400);
    }

    &:focus-within {
        border-color: var(--bricks-primary);
        box-shadow: var(--shadow-focus);
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
</style>
