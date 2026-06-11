<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarGroup } from '../../editor/types/text-editor-toolbar.d.ts';

// Vue
import { useCssModule } from 'vue';

// Components
import BricksTooltip from '../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';
import BricksTableGridPicker from './BricksTableGridPicker.vue';
import BricksToolbarEditableSelect from './BricksToolbarEditableSelect.vue';
import BricksToolbarColorPicker from './BricksToolbarColorPicker.vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        groups: IToolbarGroup[];
        useTooltips?: boolean;
        compact?: boolean;
        showBackgroundToggle?: boolean;
        isDarkBackground?: boolean;
        disabledBackgroundToggle?: boolean;
        showImageInsert?: boolean;
    }>(),
    {
        useTooltips: false,
        compact: false,
        showBackgroundToggle: false,
        isDarkBackground: false,
        disabledBackgroundToggle: false,
        showImageInsert: false,
    }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    toggleBackground: [];
    requestImage: [];
}>();
// #endregion

// #region Data
const $style = useCssModule();

const TOOLBAR_TOOLTIP_TEXT: Record<string, string> = {
    Bold: 'Жирный',
    Italic: 'Курсив',
    Underline: 'Подчёркивание',
    'Font Family': 'Семейство шрифта',
    'Font Size': 'Размер шрифта',
    'Font Weight': 'Толщина шрифта',
    'Line Height': 'Межстрочный интервал',
    'Letter Spacing': 'Межбуквенный интервал',
    'Text Color': 'Цвет текста',
    'Align Left': 'По левому краю',
    'Align Center': 'По центру',
    'Align Right': 'По правому краю',
    'Align Justify': 'По ширине',
    'Bullet List': 'Маркированный список',
    'Numbered List': 'Нумерованный список',
    Table: 'Таблица',
    'Insert Image': 'Вставить изображение',
    'Dark Background': 'Тёмный фон',
};
// #endregion

// #region Methods
/**
 * Возвращает локализованный текст тултипа по английскому title элемента.
 */
function getTooltipText(title: string): string {
    return TOOLBAR_TOOLTIP_TEXT[title] ?? title;
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
                    <BricksTooltip
                        v-if="props.useTooltips"
                        bottom
                        :class="$style.toolbarSelectWrapper"
                    >
                        <template #activator>
                            <BricksToolbarEditableSelect :item="item" />
                        </template>
                        <BricksTooltipHint :text="getTooltipText(item.title)" />
                    </BricksTooltip>
                    <BricksToolbarEditableSelect v-else :item="item" />
                </template>

                <!-- Table Picker -->
                <template v-else-if="'type' in item && item.type === 'table-picker'">
                    <BricksTooltip v-if="props.useTooltips" bottom>
                        <template #activator>
                            <BricksTableGridPicker :item="item" />
                        </template>
                        <BricksTooltipHint :text="getTooltipText(item.title)" />
                    </BricksTooltip>
                    <BricksTableGridPicker v-else :item="item" />
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
                        <BricksIcon icon="ph:image" />
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
                <BricksIcon icon="ph:image" />
            </button>
        </div>

        <!-- Background Toggle -->
        <div v-if="props.showBackgroundToggle" :class="$style.bgToggleGroup">
            <BricksTooltip v-if="props.useTooltips" bottom>
                <template #activator>
                    <button
                        type="button"
                        :class="[
                            $style.toolbarButton,
                            { [$style._active]: props.isDarkBackground },
                        ]"
                        :disabled="props.disabledBackgroundToggle"
                        @mousedown.prevent
                        @click="emit('toggleBackground')"
                    >
                        <BricksIcon icon="ph:circle-half-tilt" />
                    </button>
                </template>
                <BricksTooltipHint :text="getTooltipText('Dark Background')" />
            </BricksTooltip>
            <button
                v-else
                type="button"
                :title="getTooltipText('Dark Background')"
                :class="[$style.toolbarButton, { [$style._active]: props.isDarkBackground }]"
                :disabled="props.disabledBackgroundToggle"
                @mousedown.prevent
                @click="emit('toggleBackground')"
            >
                <BricksIcon icon="ph:circle-half-tilt" />
            </button>
        </div>
    </div>
</template>

<style module lang="scss">
.BricksTextEditorToolbar {
    --toolbar-btn-size: 2.6rem;
    --toolbar-gap: 0.8rem;
    --toolbar-font-size: 1.4rem;
    --toolbar-select-flex: 1 1 auto;
    --toolbar-select-min-width: 0;
    --toolbar-select-max-width: none;

    display: flex;
    flex-wrap: wrap;
    gap: var(--toolbar-gap);

    &._compact {
        --toolbar-btn-size: 2.4rem;
        --toolbar-gap: 0.6rem;
        --toolbar-font-size: 1.2rem;
        --toolbar-select-flex: 0 0 auto;
        --toolbar-select-min-width: auto;
        --toolbar-select-max-width: 12rem;

        align-self: flex-start;
        max-width: 100%;

        .toolbarGroup._expandable {
            flex: initial;
        }
    }
}

.toolbarGroup {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding-right: 0.6rem;
    border-right: 1px solid var(--bricks-base-200);

    &:last-child {
        padding-right: 0;
        border-right: none;
    }

    &._expandable {
        flex: 1 1 auto;
        min-width: 0;
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
    font-size: 1.3rem;
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
        color: #fff;
    }
}

.toolbarSelectWrapper {
    display: flex;
    align-items: center;
    gap: 0.3rem;
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
    color: var(--bricks-base-500);

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
    padding-right: 0.6rem;
    border-right: 1px solid var(--bricks-base-200);
}

.bgToggleGroup {
    display: flex;
    align-items: center;
}
</style>
