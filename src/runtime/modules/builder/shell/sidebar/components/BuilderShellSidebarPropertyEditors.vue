<script setup lang="ts">
// #region Imports
// Types
import type {
    ISidebarPropertyEditorsProps,
    TInlineGalleryPayload,
} from '../types/sidebarProperties';
import type {
    IPropertyDefinition,
    TBrickPropValue,
    TBricksDeviceKey,
} from '../../../../common/types/brick';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';

// Constants/Components
import {
    PROPERTY_EDITOR_ORDER,
    SPACING_PROPERTY_NAMES,
    type TPropertyEditorType,
} from './property-editors/types';
import BuilderShellSidebarPropertyEditorRow from './BuilderShellSidebarPropertyEditorRow.vue';
import BuilderShellSidebarPropertySpacingEditor from './property-editors/BuilderShellSidebarPropertySpacingEditor.vue';
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarPropertyEditorsProps>(), {
    propertyOrder: () => PROPERTY_EDITOR_ORDER,
});
// #endregion

// #region Data
const { t, te } = useI18n();
const openGroups = ref<Set<string>>(new Set());
// #endregion

// #region Computed
const editorGroups = computed(() =>
    props.propertyOrder.map((type) => ({
        type,
        items: props.componentVariants[type] || [],
    }))
);

const orderedEditorItems = computed(() => {
    const orderedNames = props.orderedPropertyNames || [];
    if (!orderedNames.length) {
        return [];
    }

    const itemsByProperty = new Map<
        string,
        {
            type: TPropertyEditorType;
            componentData: (typeof editorGroups.value)[number]['items'][number];
        }
    >();

    editorGroups.value.forEach((group) => {
        group.items.forEach((componentData) => {
            itemsByProperty.set(componentData.property.name, {
                type: group.type,
                componentData,
            });
        });
    });

    const ordered = orderedNames
        .map((propertyName) => itemsByProperty.get(propertyName))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (!ordered.length) {
        return [];
    }

    const used = new Set(ordered.map((item) => item.componentData.property.name));
    const rest = editorGroups.value.flatMap((group) =>
        group.items
            .filter((item) => !used.has(item.property.name))
            .map((componentData) => ({ type: group.type, componentData }))
    );

    return [...ordered, ...rest];
});

type TEditorItem = {
    type: TPropertyEditorType;
    componentData: (typeof editorGroups.value)[number]['items'][number];
};

/**
 * Разделяет свойства на негруппированные и сгруппированные по полю property.group
 */
const groupedEditorItems = computed(() => {
    const items: TEditorItem[] = orderedEditorItems.value.length
        ? orderedEditorItems.value
        : editorGroups.value.flatMap((group) =>
              group.items.map((componentData) => ({ type: group.type, componentData }))
          );

    const ungrouped: TEditorItem[] = [];
    const groups = new Map<string, TEditorItem[]>();

    for (const item of items) {
        const groupName = item.componentData.property.group;
        if (!groupName) {
            ungrouped.push(item);
        } else {
            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }
            groups.get(groupName)!.push(item);
        }
    }

    return { ungrouped, groups };
});

const hasGroups = computed(() => groupedEditorItems.value.groups.size > 0);
// #endregion

// #region Methods
/**
 * Переключает открытость группы аккордеона.
 */
function toggleGroup(groupName: string): void {
    const next = new Set(openGroups.value);
    if (next.has(groupName)) {
        next.delete(groupName);
    } else {
        next.add(groupName);
    }
    openGroups.value = next;
}

/**
 * Проверяет, открыта ли группа.
 */
function isGroupOpen(groupName: string): boolean {
    return openGroups.value.has(groupName);
}

/**
 * Резолвит отображаемое имя группы: ключи `bricks.*` переводятся,
 * кастомные строки потребителя — как есть.
 */
function resolveGroupLabel(groupName: string): string {
    return resolveBricksLabel(t, te, groupName) || groupName;
}

/**
 * Проверяет, состоит ли группа целиком из числовых spacing-свойств —
 * такая группа рендерится композитным box-model редактором.
 */
function isSpacingGroup(items: TEditorItem[]): boolean {
    return (
        items.length > 0 &&
        items.every(
            (item) =>
                item.componentData.property.type === 'number' &&
                SPACING_PROPERTY_NAMES.has(item.componentData.property.name)
        )
    );
}

/**
 * Обрабатывает переключение режима full width.
 *
 * @param value - Новое значение.
 */
function handleFullWidthToggle(value: boolean): void {
    props.handleToggleFullWidth(Boolean(value));
}

/**
 * Обрабатывает переключение видимости компонента (глобальный флаг isHidden).
 *
 * @param value - Новое значение "показывать компонент".
 */
function handleVisibilityToggle(value: boolean): void {
    props.handleToggleHidden(!value);
}

/**
 * Обрабатывает переключение видимости компонента на конкретном устройстве.
 *
 * @param device - Ключ устройства.
 * @param value - Новый флаг видимости.
 */
function handleDeviceVisibilityToggle(device: TBricksDeviceKey, value: boolean): void {
    props.handleToggleDeviceVisibility(device, Boolean(value));
}

/**
 * Пробрасывает изменение значения пропса компонента.
 *
 * @param property - Определение редактируемого свойства.
 * @param value - Новое значение.
 */
function emitChange(property: IPropertyDefinition, value: TBrickPropValue): void {
    props.handleChangeValues(property, value);
}

/**
 * Открывает медиагалерею для выбора изображения/видео
 */
function openMedia(property: IPropertyDefinition, payload?: TInlineGalleryPayload): void {
    props.handleOpenMediaGallery(property, payload);
}

/**
 * Обновляет HTML id компонента.
 *
 * @param value - Новое значение slug-идентификатора.
 */
function handleHtmlIdChange(value: unknown): void {
    props.handleSetHtmlId(value as string);
}
// #endregion

// #region Watchers
watch(
    () => groupedEditorItems.value.groups,
    (groups) => {
        const next = new Set(openGroups.value);
        for (const key of groups.keys()) {
            next.add(key);
        }
        openGroups.value = next;
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyEditors">
        <div :class="$style.section">
            <div :class="$style.sectionHeader">
                <div :class="$style.sectionTitle">{{ t('bricks.properties.display') }}</div>
                <div :class="$style.sectionDivider" />
            </div>

            <div :class="$style.optWrapper">
                <component
                    :is="props.componentEditors.boolean"
                    :label="t('bricks.properties.showComponent')"
                    :value="!props.isHiddenValue"
                    :disabled="false"
                    @update:value="handleVisibilityToggle($event as boolean)"
                />
            </div>

            <div :class="$style.optWrapper">
                <div :class="$style.optTitle">{{ t('bricks.properties.showOn') }}</div>

                <component
                    :is="props.componentEditors.boolean"
                    label="Mobile"
                    :value="props.deviceVisibilityValue.mobile"
                    :disabled="props.isHiddenValue"
                    @update:value="handleDeviceVisibilityToggle('mobile', $event as boolean)"
                />

                <component
                    :is="props.componentEditors.boolean"
                    label="Tablet"
                    :value="props.deviceVisibilityValue.tablet"
                    :disabled="props.isHiddenValue"
                    @update:value="handleDeviceVisibilityToggle('tablet', $event as boolean)"
                />

                <component
                    :is="props.componentEditors.boolean"
                    label="Desktop"
                    :value="props.deviceVisibilityValue.desktop"
                    :disabled="props.isHiddenValue"
                    @update:value="handleDeviceVisibilityToggle('desktop', $event as boolean)"
                />
            </div>

            <div v-if="props.showFullWidthControl" :class="$style.optWrapper">
                <component
                    :is="props.componentEditors.boolean"
                    :label="t('bricks.properties.fullWidth')"
                    :value="props.fullWidthValue"
                    :disabled="false"
                    @update:value="handleFullWidthToggle($event as boolean)"
                />
            </div>

            <div :class="$style.optWrapper">
                <div :class="$style.optTitle">HTML ID</div>
                <BricksInput
                    :value="props.htmlIdValue"
                    placeholder="my-section"
                    label=""
                    type="slug"
                    @update:value="handleHtmlIdChange($event)"
                />
            </div>
        </div>

        <div :class="$style.section">
            <div :class="$style.sectionHeader">
                <div :class="$style.sectionTitle">{{ t('bricks.properties.title') }}</div>
                <div :class="$style.sectionDivider" />
            </div>

            <div :class="$style.propsWrapper">
                <!-- Негруппированные свойства (плоский список) -->
                <template
                    v-for="(item, index) in groupedEditorItems.ungrouped"
                    :key="`ungrouped_${item.type}_${item.componentData.property.name}_${index}`"
                >
                    <BuilderShellSidebarPropertyEditorRow
                        :type="item.type"
                        :variant="item.componentData"
                        :component-editors="props.componentEditors"
                        :show-group-label="false"
                        :handle-normalize-props="props.handleNormalizeProps"
                        :handle-change-values="emitChange"
                        :handle-open-media-gallery="openMedia"
                    />
                </template>

                <!-- Сгруппированные свойства (аккордеоны) -->
                <div
                    v-for="[groupName, groupItems] in groupedEditorItems.groups"
                    :key="`group_${groupName}`"
                    :class="$style.propertyGroup"
                >
                    <button
                        type="button"
                        :class="$style.groupToggle"
                        @click="toggleGroup(groupName)"
                    >
                        <svg
                            :class="[
                                $style.groupChevron,
                                isGroupOpen(groupName) && $style.groupChevronOpen,
                            ]"
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                        >
                            <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                        <span>{{ resolveGroupLabel(groupName) }}</span>
                    </button>

                    <div v-show="isGroupOpen(groupName)" :class="$style.groupBody">
                        <BuilderShellSidebarPropertySpacingEditor
                            v-if="isSpacingGroup(groupItems)"
                            :items="groupItems.map((item) => item.componentData)"
                            :handle-change-values="emitChange"
                        />
                        <template v-else>
                            <template
                                v-for="(item, index) in groupItems"
                                :key="`${groupName}_${item.type}_${item.componentData.property.name}_${index}`"
                            >
                                <BuilderShellSidebarPropertyEditorRow
                                    :type="item.type"
                                    :variant="item.componentData"
                                    :component-editors="props.componentEditors"
                                    :show-group-label="false"
                                    :handle-normalize-props="props.handleNormalizeProps"
                                    :handle-change-values="emitChange"
                                    :handle-open-media-gallery="openMedia"
                                />
                            </template>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyEditors {
    display: flex;
    flex-direction: column;
    gap: 2rem;
}

.section {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.sectionHeader {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.sectionTitle {
    text-transform: uppercase;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--bricks-base-500);
}

.sectionDivider {
    flex: 1;
    height: 1px;
    background-color: var(--bricks-base-300);
}

.propsWrapper {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.optWrapper {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

._bool {
    :global(label) {
        font-weight: 500;
    }
}

.optTitle {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-700);
}

.propertyGroup {
    display: flex;
    flex-direction: column;
}

.groupToggle {
    display: flex;
    align-items: center;
    padding: 0.4rem 0;
    border: none;
    background: none;
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--bricks-base-500);
    transition: color var(--default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-700);
    }
}

.groupChevron {
    width: 1.2rem;
    height: 1.2rem;
    transform: rotate(-90deg);
    transition: transform var(--default-transition);
}

.groupChevronOpen {
    transform: rotate(0deg);
}

.groupBody {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    padding-top: 1.2rem;
}
</style>
