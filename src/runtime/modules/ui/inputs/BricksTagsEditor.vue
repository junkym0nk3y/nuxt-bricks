<script setup lang="ts">
/**
 * @description Tag editor: chips plus an input field in one box.
 *
 * The chip shell is `BricksBadge` — the same look as the status badges. An earlier
 * pair of two palette steps of one hue (a light fill under a dark text of the same
 * scale) gave a contrast of about 2:1 in the dark theme, where both ends of the
 * scale are dark, and the tag did not read. For the same reason the remove button
 * highlights in white rather than in `danger-500`: red on a blue fill fails
 * contrast just as the tag itself did.
 */

// #region Imports
// Types
import type { IBricksTagsEditorProps, IBricksTagsEditorEmits } from './types.d.ts';

// Utils
import { TAGS_SEPARATOR, getTagsSerializedLength } from './utils/tags';

// Vue
import { computed, ref, useCssModule, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksBadge from '../base/badge/BricksBadge.vue';
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
/** Limit refusal: lives until the next successful change of the tag set */
const limitMessage = ref('');
/**
 * The last set sent outwards. It is what tells an incoming `modelValue` apart
 * from an external substitution (a form reset, a page switch): our own echo
 * leaves the unfinished tail in the field, someone else's clears it along with
 * the limit refusal, which would otherwise travel into a foreign context.
 */
let lastEmittedTags: string[] | null = null;
// #endregion

// #region Computed
const displayPlaceholder = computed<string>(
    () => props.placeholder || t('bricks.properties.gallery.tagPlaceholder')
);

/** An external error takes precedence over the editor's own limit refusal */
const displayedError = computed<string>(() => props.errorMessage || limitMessage.value);
// #endregion

// #region Methods
/**
 * Sends the new tag set outwards, remembering it as our own echo.
 *
 * @param tags - New tag set.
 */
function emitTags(tags: string[]): void {
    lastEmittedTags = tags;
    emit('update:modelValue', tags);
}

/**
 * Compares tag sets element by element.
 *
 * @param first - First set.
 * @param second - Second set.
 * @returns Whether the sets match.
 */
function isSameTags(first: string[], second: string[]): boolean {
    return first.length === second.length && first.every((tag, index) => tag === second[index]);
}

/**
 * Checks whether a tag set fits within the limit of the joined value.
 *
 * @param tags - Tag set to check.
 * @returns Whether the set fits (always true without maxLength).
 */
function fitsLimit(tags: string[]): boolean {
    if (!props.maxLength) {
        return true;
    }

    return getTagsSerializedLength(tags) <= props.maxLength;
}

/**
 * Adds tags from the entered text: trimming, dropping empties and duplicates. It
 * stops at the first tag that does not fit the limit — that tag and everything
 * after it is returned to the caller to stay in the input field: input swallowed
 * silently would look like lost text.
 *
 * @param parts - Parts of the entered text, split by comma.
 * @returns The unaccepted remainder (an empty string means everything was taken).
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
 * Commits the entered text as a whole (Enter, blur, the plus button).
 */
function addTag(): void {
    if (!inputValue.value.trim()) {
        return;
    }

    inputValue.value = commitTags(inputValue.value.split(','));
}

/**
 * Handles input: a comma is the separator, so everything before the last comma
 * turns into chips right away (pasting `a, b, c` included), while the tail after
 * it stays in the field — the person is still typing it.
 *
 * @param event - Input event.
 */
function handleInput(event: Event): void {
    // A space after a comma is part of the separator, not the start of the next
    // tag: when typing character by character it arrives as a separate event and
    // would otherwise stay in the field as an indent before every next word
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
 * Removes a tag by index.
 *
 * @param index - Index of the tag to remove.
 */
function removeTag(index: number): void {
    const next = [...props.modelValue];
    next.splice(index, 1);
    limitMessage.value = '';
    emitTags(next);
}

/**
 * Handles an Enter press in the input field.
 *
 * @param event - Keyboard event.
 */
function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        addTag();
    }

    // Backspace on an empty input removes the last tag
    if (event.key === 'Backspace' && !inputValue.value && props.modelValue.length > 0) {
        removeTag(props.modelValue.length - 1);
    }
}

/**
 * Focuses the input field when the container is clicked.
 */
function focusInput(): void {
    inputRef.value?.focus();
}
// #endregion

// #region Lifecycle
// The set was substituted from the outside (edits undone, a move to another
// page) — the unfinished tail and the limit refusal belong to the previous value
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
                <BricksBadge v-for="(tag, index) in props.modelValue" :key="`tag-${index}`">
                    <span :class="$style.tagText">{{ tag }}</span>
                    <button
                        type="button"
                        :class="$style.tagRemove"
                        :disabled="props.disabled"
                        :aria-label="t('bricks.common.removeTag', { tag })"
                        @click.stop="removeTag(index)"
                    >
                        <BricksIcon icon="ta:outline-x" />
                    </button>
                </BricksBadge>

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
    border-radius: var(--bricks-border-radius-pill);
    border: none;
    background: transparent;
    color: var(--bricks-static-white);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background-color: rgb(from var(--bricks-static-white) r g b / 24%);
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
        color: var(--bricks-text-muted);
    }
}

.addButton {
    flex-shrink: 0;
}

.errorMessage {
    margin-top: 0.8rem;
}
</style>
