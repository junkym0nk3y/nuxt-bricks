<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarGroup } from './textEditorToolbar.d.ts';

// Vue
import { useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksTooltip from '../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';
import BricksToolbarEditableSelect from './BricksToolbarEditableSelect.vue';
import BricksToolbarColorPicker from './BricksToolbarColorPicker.vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        groups: IToolbarGroup[];
        useTooltips?: boolean;
        compact?: boolean;
        showImageInsert?: boolean;
    }>(),
    {
        useTooltips: false,
        compact: false,
        showImageInsert: false,
    }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    requestImage: [];
}>();
// #endregion

// #region Data
const $style = useCssModule();
const { t } = useI18n();

const TOOLBAR_TOOLTIP_KEYS: Record<string, string> = {
    Bold: 'bricks.textEditor.toolbar.bold',
    Italic: 'bricks.textEditor.toolbar.italic',
    Underline: 'bricks.textEditor.toolbar.underline',
    'Font Family': 'bricks.textEditor.toolbar.fontFamily',
    'Font Size': 'bricks.textEditor.toolbar.fontSize',
    'Font Weight': 'bricks.textEditor.toolbar.fontWeight',
    'Line Height': 'bricks.textEditor.toolbar.lineHeight',
    'Letter Spacing': 'bricks.textEditor.toolbar.letterSpacing',
    'Text Color': 'bricks.textEditor.toolbar.textColor',
    'Align Left': 'bricks.textEditor.toolbar.alignLeft',
    'Align Center': 'bricks.textEditor.toolbar.alignCenter',
    'Align Right': 'bricks.textEditor.toolbar.alignRight',
    'Align Justify': 'bricks.textEditor.toolbar.alignJustify',
    'Bullet List': 'bricks.textEditor.toolbar.bulletList',
    'Numbered List': 'bricks.textEditor.toolbar.numberedList',
    'Insert Image': 'bricks.textEditor.toolbar.insertImage',
    Divider: 'bricks.textEditor.toolbar.divider',
};
// #endregion

// #region Methods
/**
 * Возвращает локализованный текст тултипа по английскому title элемента.
 */
function getTooltipText(title: string): string {
    const key = TOOLBAR_TOOLTIP_KEYS[title];
    return key ? t(key) : title;
}
// #endregion
</script>

<template>
    <div :class="[$style.BricksTextEditorToolbar, { [$style._compact]: props.compact }]">
        <div
            v-for="group in props.groups"
            :key="group.name"
            :class="[
                $style.toolbarGroup,
                {
                    [$style._expandable]: group.items.some(
                        (item) => 'type' in item && item.type === 'select'
                    ),
                },
            ]"
        >
            <template v-for="item in group.items" :key="item.title">
                <!-- Button -->
                <template v-if="!('type' in item)">
                    <BricksTooltip v-if="props.useTooltips" bottom>
                        <template #activator>
                            <button
                                type="button"
                                :class="[
                                    $style.toolbarButton,
                                    { [$style._active]: item.isActive() },
                                ]"
                                @mousedown.prevent
                                @click.prevent="item.run()"
                            >
                                <template v-if="item.icon">
                                    <transition name="library-fade-fast">
                                        <span :key="`icon_${item.icon}`">
                                            <BricksIcon :icon="item.icon" />
                                        </span>
                                    </transition>
                                </template>
                                <strong v-else-if="item.label === 'B'">B</strong>
                                <em v-else-if="item.label === 'I'">I</em>
                                <u v-else-if="item.label === 'U'">U</u>
                                <span v-else>{{ item.label }}</span>
                            </button>
                        </template>
                        <BricksTooltipHint :text="getTooltipText(item.title)" />
                    </BricksTooltip>
                    <button
                        v-else
                        type="button"
                        :title="getTooltipText(item.title)"
                        :class="[$style.toolbarButton, { [$style._active]: item.isActive() }]"
                        @mousedown.prevent
                        @click.prevent="item.run()"
                    >
                        <BricksIcon v-if="item.icon" :icon="item.icon" />
                        <strong v-else-if="item.label === 'B'">B</strong>
                        <em v-else-if="item.label === 'I'">I</em>
                        <u v-else-if="item.label === 'U'">U</u>
                        <span v-else>{{ item.label }}</span>
                    </button>
                </template>

                <!-- Select -->
                <template v-else-if="'type' in item && item.type === 'select'">
                    <BricksTooltip
                        v-if="props.useTooltips"
                        bottom
                        :class="$style.toolbarSelectWrapper"
                    >
                        <template #activator>
                            <div :class="$style.toolbarSelectInner">
                                <span v-if="item.icon" :class="$style.toolbarSelectIcon">
                                    <BricksIcon :icon="item.icon" />
                                </span>
                                <span v-else-if="item.label" :class="$style.toolbarSelectLabel">
                                    {{ item.label }}
                                </span>
                                <select
                                    :class="$style.toolbarSelect"
                                    :value="item.value"
                                    @mousedown.stop
                                    @change="
                                        item.onChange(($event.target as HTMLSelectElement).value)
                                    "
                                >
                                    <option
                                        v-for="option in item.options"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.label }}
                                    </option>
                                </select>
                            </div>
                        </template>
                        <BricksTooltipHint :text="getTooltipText(item.title)" />
                    </BricksTooltip>
                    <div v-else :class="$style.toolbarSelectWrapper">
                        <span v-if="item.icon" :class="$style.toolbarSelectIcon">
                            <BricksIcon :icon="item.icon" />
                        </span>
                        <span v-else-if="item.label" :class="$style.toolbarSelectLabel">
                            {{ item.label }}
                        </span>
                        <select
                            :class="$style.toolbarSelect"
                            :value="item.value"
                            @mousedown.stop
                            @change="item.onChange(($event.target as HTMLSelectElement).value)"
                        >
                            <option
                                v-for="option in item.options"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                    </div>
                </template>

                <!-- Editable Select (with custom input) -->
                <template v-else-if="'type' in item && item.type === 'editable-select'">
                    <BricksTooltip v-if="props.useTooltips" bottom>
                        <template #activator>
                            <BricksToolbarEditableSelect :item="item" />
                        </template>
                        <BricksTooltipHint :text="getTooltipText(item.title)" />
                    </BricksTooltip>
                    <BricksToolbarEditableSelect v-else :item="item" />
                </template>

                <!-- Color Picker -->
                <template v-else-if="'type' in item && item.type === 'color'">
                    <BricksTooltip v-if="props.useTooltips" bottom>
                        <template #activator>
                            <BricksToolbarColorPicker :item="item" />
                        </template>
                        <BricksTooltipHint :text="getTooltipText(item.title)" />
                    </BricksTooltip>
                    <BricksToolbarColorPicker v-else :item="item" />
                </template>
            </template>
        </div>

        <!-- Image Insert -->
        <div v-if="props.showImageInsert" :class="$style.imageInsertGroup">
            <BricksTooltip v-if="props.useTooltips" bottom>
                <template #activator>
                    <button
                        type="button"
                        :class="$style.toolbarButton"
                        @mousedown.prevent
                        @click="emit('requestImage')"
                    >
                        <BricksIcon icon="ta:outline-photo" />
                    </button>
                </template>
                <BricksTooltipHint :text="getTooltipText('Insert Image')" />
            </BricksTooltip>
            <button
                v-else
                type="button"
                :title="getTooltipText('Insert Image')"
                :class="$style.toolbarButton"
                @mousedown.prevent
                @click="emit('requestImage')"
            >
                <BricksIcon icon="ta:outline-photo" />
            </button>
        </div>
    </div>
</template>

<style module lang="scss">
.BricksTextEditorToolbar {
    --toolbar-btn-size: 2.6rem;
    --toolbar-gap: 0.8rem;
    --toolbar-font-size: 1.2rem;
    --toolbar-select-flex: 1 1 auto;
    --toolbar-select-min-width: 0;
    --toolbar-select-max-width: none;

    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--toolbar-gap);

    &._compact {
        --toolbar-btn-size: 2.4rem;
        --toolbar-gap: 0.6rem;
        --toolbar-select-flex: 0 0 auto;
        --toolbar-select-min-width: auto;
        --toolbar-select-max-width: 12rem;

        align-self: flex-start;
        max-width: 100%;

        .toolbarGroup._expandable {
            flex: initial;
            min-width: 0;
        }
    }
}

.toolbarGroup {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding-right: var(--toolbar-gap);
    border-right: 1px solid var(--bricks-base-200);

    &:last-child {
        padding-right: 0;
        border-right: none;
    }

    &._expandable {
        /* min-width = ширина группы font-family в макете: в узком сайдбаре
           выталкивает font-size на следующий ряд, в широкой модалке ряд один */
        flex: 1 1 auto;
        min-width: 17rem;
    }
}

.toolbarButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--toolbar-btn-size);
    height: var(--toolbar-btn-size);
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: transparent;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-600);
    transition: all var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }

    &._active {
        border-color: var(--bricks-primary);
        background: var(--bricks-primary);
        color: var(--bricks-static-white);
    }
}

.toolbarSelectWrapper {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: var(--toolbar-select-flex);
    min-width: var(--toolbar-select-min-width);
}

.toolbarSelectInner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
}

.toolbarSelectLabel {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: var(--toolbar-font-size);
    color: var(--bricks-base-500);
}

.toolbarSelectIcon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--bricks-base-600);

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }
}

.toolbarSelect {
    flex: var(--toolbar-select-flex);
    min-width: var(--toolbar-select-min-width);
    max-width: var(--toolbar-select-max-width);
    height: var(--toolbar-btn-size);
    padding: 0 0.6rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-size: var(--toolbar-font-size);
    color: var(--bricks-base-800);
    transition: border-color var(--default-transition);
    cursor: pointer;
    appearance: none;

    option {
        background: var(--bricks-base-0);
        color: var(--bricks-base-800);
    }

    &:hover,
    &:focus {
        border-color: var(--bricks-primary);
        outline: none;
    }
}

.imageInsertGroup {
    display: flex;
    align-items: center;
}
</style>
