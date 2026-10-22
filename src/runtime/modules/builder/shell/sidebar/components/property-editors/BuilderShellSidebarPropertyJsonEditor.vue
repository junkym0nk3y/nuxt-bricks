<script setup lang="ts">
/**
 * @description JSON editor of an object or array property: a transparent textarea
 * over a highlighted layer.
 *
 * Written by hand instead of wrapping an editor library. `vanilla-jsoneditor` cost
 * 309 KB gzip in a lazy vendor chunk — more than half of everything the builder
 * loads beyond the entry — and dragged `ajv`, `jmespath`, `json-source-map` and
 * `natural-compare-lite` into the production dependency tree for one property
 * editor. What is given up with it: bracket matching, auto-indent and the editor's
 * own undo (the browser undo of a textarea stays). The Format button covers
 * indentation more reliably than auto-indent did, and a plain textarea is better
 * for a screen reader than a virtualized editor.
 *
 * The highlight is painted from tokens rendered as text nodes rather than from an
 * HTML string: a string of markup would have to pass the sanitizer before `v-html`,
 * and a property value holding `<script>` would then depend on someone else's
 * escaping. A text node cannot become an element.
 *
 * The two layers are only allowed to differ in COLOR. A weight, a slant or a
 * spacing of its own changes the advance width of the glyphs, and the painted text
 * would creep away from the text the caret walks along — the further into the line,
 * the further apart.
 *
 * The highlight is built out of TONES of one neutral rather than out of colors, and
 * that is a measurement rather than a taste. The same 12px text is read on
 * `--bricks-base-0` in both themes, so it owes 4.5:1 in both — and no single value
 * can: the light theme demands a luminance below 0.18, the dark one above 0.27 on
 * the surface of the sidebar. Of the accents of the kit `--bricks-primary` comes
 * closest and still measures 4.08:1 against that surface in the dark theme (measured
 * in the browser, not computed from the palette); green and yellow fail the light
 * theme twice over. A colored accent therefore needs a pair of AA-safe variables of
 * its own in the shared palette — a decision about the palette, not about this
 * editor. Until then: keys are the strongest tone, values step back one, structure
 * steps back two.
 */

// #region Imports
// Types
import type { IPropertyJsonEditorEmits, IPropertyJsonEditorProps } from './types';

// Utils
import { tokenizeJson } from '../../utils/jsonHighlight';

// Vue
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksFieldError from '../../../../../ui/inputs/BricksFieldError.vue';
// #endregion

// #region Props
// The caption defaults to empty rather than to a word: `withDefaults` is compiled
// into the props options, where the translator does not exist yet — so the fallback
// is resolved by a computed below
const props = withDefaults(defineProps<IPropertyJsonEditorProps>(), {
    modelValue: () => ({}),
    label: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyJsonEditorEmits>();
// #endregion

// #region Data
/** Indentation of the Format button and of the text the field is filled with */
const JSON_INDENT = 2;

const { t } = useI18n();
const fieldId = useId();
const errorId = useId();
const highlightRef = ref<HTMLElement | null>(null);
const draftText = ref<string>(formatValue(props.modelValue));
const parseError = ref<string | null>(null);
/**
 * The canonical form of the value this editor emitted last. The watcher compares
 * the incoming value against it to tell a foreign change from the echo of our own
 * emit: the parent hands the value straight back, and reformatting the field on
 * that would move the caret out from under the fingers on every keystroke.
 */
const lastEmittedValue = ref<string>(toCanonical(props.modelValue));
// #endregion

// #region Computed
/** Caption of the field: the one passed in, or the generic name of the editor */
const resolvedLabel = computed(() => props.label || t('bricks.properties.json.label'));

const highlightTokens = computed(() => tokenizeJson(draftText.value));
// #endregion

// #region Methods
/**
 * Serializes a value into the text of the field.
 *
 * @param value - The value of the property.
 * @returns Indented JSON; an empty string for a value that has no JSON form.
 */
function formatValue(value: unknown): string {
    return JSON.stringify(value ?? {}, null, JSON_INDENT) ?? '';
}

/**
 * The comparable form of a value: the same JSON with no indentation.
 *
 * @param value - The value of the property.
 */
function toCanonical(value: unknown): string {
    return JSON.stringify(value ?? {}) ?? '';
}

/**
 * Parses the text of the field.
 *
 * A top-level primitive is a refusal rather than a value: the editor is opened for
 * a property of type `object` or a non-primitive `array`, and emitting a number in
 * its place would put into the schema something the block cannot render.
 *
 * @param text - The text of the field.
 * @returns The parsed value, or the message of the refusal.
 */
function parseDraft(text: string): { value: unknown } | { error: string } {
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch (error: unknown) {
        // The message of the parser carries the position of the error, which the
        // localized sentence cannot: it goes after it rather than instead of it
        const detail = error instanceof Error ? error.message : '';

        return {
            error: detail
                ? `${t('bricks.properties.json.invalid')}: ${detail}`
                : t('bricks.properties.json.invalid'),
        };
    }

    if (parsed === null || typeof parsed !== 'object') {
        return { error: t('bricks.properties.json.notObject') };
    }

    return { value: parsed };
}

/**
 * Reads the input: the text is kept as it was typed, and the value leaves the
 * editor only when the text parses.
 *
 * @param event - The native input event of the textarea.
 */
function handleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;

    if (!target) {
        return;
    }

    draftText.value = target.value;
    syncHighlightScroll(target);

    const outcome = parseDraft(target.value);

    if ('error' in outcome) {
        parseError.value = outcome.error;

        return;
    }

    parseError.value = null;

    const canonical = toCanonical(outcome.value);

    // Whitespace-only edits change the text without changing the value: emitting
    // them would fill the undo history of the builder with entries that undo
    // nothing visible
    if (canonical === lastEmittedValue.value) {
        return;
    }

    lastEmittedValue.value = canonical;
    emit('update:modelValue', outcome.value);
}

/**
 * Reformats the text of the field with indentation. A field that does not parse is
 * left alone — there is nothing to indent, and the message stays visible.
 */
function handleFormat(): void {
    const outcome = parseDraft(draftText.value);

    if ('error' in outcome) {
        parseError.value = outcome.error;

        return;
    }

    parseError.value = null;
    draftText.value = formatValue(outcome.value);
}

/**
 * Repeats the scroll of the field on the highlight layer. Both layers hold the same
 * text in the same metrics, so one offset is enough for both axes.
 *
 * @param target - The textarea the scroll is read from.
 */
function syncHighlightScroll(target: HTMLTextAreaElement): void {
    if (!highlightRef.value) {
        return;
    }

    highlightRef.value.scrollTop = target.scrollTop;
    highlightRef.value.scrollLeft = target.scrollLeft;
}

/**
 * Passes the scroll of the field to the highlight layer.
 *
 * @param event - The native scroll event of the textarea.
 */
function handleScroll(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;

    if (target) {
        syncHighlightScroll(target);
    }
}
// #endregion

// #region Watchers
watch(
    () => props.modelValue,
    (newValue) => {
        const canonical = toCanonical(newValue);

        if (canonical === lastEmittedValue.value) {
            return;
        }

        lastEmittedValue.value = canonical;
        draftText.value = formatValue(newValue);
        parseError.value = null;
    }
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyJsonEditor">
        <label :for="fieldId" :class="$style.label">{{ resolvedLabel }}</label>

        <div :class="[$style.field, { [$style._invalid]: Boolean(parseError) }]">
            <pre ref="highlightRef" aria-hidden="true" :class="$style.highlight"><span
                v-for="(token, index) in highlightTokens"
                :key="index"
                :class="$style[token.kind]"
            >{{ token.text }}</span>{{ '\n' }}</pre>
            <textarea
                :id="fieldId"
                :class="$style.input"
                :value="draftText"
                :aria-invalid="Boolean(parseError)"
                :aria-describedby="parseError ? errorId : undefined"
                wrap="off"
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                @input="handleInput"
                @scroll="handleScroll"
            ></textarea>
        </div>

        <div :class="$style.actions">
            <button type="button" :class="$style.formatButton" @click="handleFormat">
                {{ t('bricks.properties.json.format') }}
            </button>
        </div>

        <BricksFieldError :id="errorId" :message="parseError" />
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyJsonEditor {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.label {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
    user-select: none;
}

.field {
    position: relative;
    overflow: hidden;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);

    &:focus-within {
        border-color: var(--bricks-primary);
        box-shadow: var(--bricks-shadow-focus);
    }

    &._invalid {
        border-color: var(--bricks-danger-600);
    }
}

.highlight,
.input {
    padding: 0.8rem 1.2rem;
    white-space: pre;
    font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
    font-size: 1.2rem;
    font-weight: 400;
    line-height: 1.8rem;
    letter-spacing: normal;
    tab-size: 4;
    font-variant-ligatures: none;
}

.highlight {
    position: absolute;
    inset: 0;
    overflow: hidden;
    margin: 0;
    color: var(--bricks-base-600);
    pointer-events: none;
}

.input {
    position: relative;
    overflow: auto;
    display: block;
    width: 100%;
    min-height: 20rem;
    border: none;
    background-color: transparent;
    outline: none;
    color: transparent;
    resize: vertical;
    caret-color: var(--bricks-base-900);
    -webkit-text-fill-color: transparent;
}

.key {
    color: var(--bricks-base-900);
}

.punctuation {
    color: var(--bricks-base-500);
}

.actions {
    display: flex;
    justify-content: flex-end;
}

.formatButton {
    padding: 0.4rem 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background-color: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition:
        border-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-base-400);
        color: var(--bricks-base-900);
    }
}
</style>
