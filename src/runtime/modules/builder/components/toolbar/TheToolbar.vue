<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarProps, IToolbarEmits } from './types';
import type { ILandUiCommonProp } from '../../../ui/inputs/types.d.ts';

// Vue
import { computed } from 'vue';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksActionButton from '../../../ui/base/action-button/BricksActionButton.vue';
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
import BuilderLogo from '../BuilderLogo.vue';
// #endregion

// #region Props
const props = defineProps<IToolbarProps>();
// #endregion

// #region Emits
const emit = defineEmits<IToolbarEmits>();
// #endregion

// #region Computed
/**
 * Проверяет, доступна ли операция отмены (Undo)
 * @returns true если есть история для отката (historyIndex > 0)
 */
const canUndo = computed(() => props.historyIndex > 0);

/**
 * Проверяет, доступна ли операция повтора (Redo)
 * @returns true если есть история для повтора (historyIndex < historyLength - 1)
 */
const canRedo = computed(() => props.historyIndex < props.historyLength - 1);

/**
 * Нормализует значение отступа сайдбара для toolbar
 * Если offset пустой или '0', возвращает '0px'
 * @returns Нормализованное значение отступа в формате CSS
 */
// const normalizedSidebarOffset = computed(() => {
//     const offset = props.sidebarOffset?.trim();
//     return offset && offset !== '0' ? offset : '0px';
// });

// /**
//  * Вычисляет стили для toolbar с учетом отступа сайдбара
//  * Применяет margin-left для сдвига центрального блока при открытом левом сайдбаре
//  * @returns Объект стилей с marginLeft
//  */
// const toolbarStyle = computed(() => {
//     const offset = normalizedSidebarOffset.value;
//     return {
//         marginLeft: offset,
//     };
// });

/**
 * Возвращает заголовок текущей страницы для отображения в toolbar
 * Если заголовок пустой, возвращает null (не отображается)
 * @returns Заголовок страницы или null
 */
const currentPageTitle = computed(() => {
    const title = props.pageTitle?.trim();
    if (!title) {
        return null;
    }
    return title;
});

/**
 * Формирует конфигурацию кнопки публикации с учетом режима редактирования
 *
 * Базовые опции:
 * - 'draft' - Сохранить как черновик
 * - 'publish' - Опубликовать
 *
 * Если редактируется существующая страница (isEditingExistingPage = true),
 * добавляется опция 'copy' (Сохранить как копию) между draft и publish
 *
 * @returns Объект с label кнопки и массивом опций для dropdown
 */
const publishButtonConfig = computed<{
    label: string;
    options: ILandUiCommonProp[];
}>(() => {
    const baseOptions: ILandUiCommonProp[] = [
        {
            label: 'Сохранить изменения',
            value: 'draft',
        },
        {
            label: 'Сохранить как копию',
            value: 'copy',
        },
    ];

    return {
        label: 'Сохранить',
        options: baseOptions,
    };
});
// #endregion

// #region Methods
/**
 * Выполняет операцию отмены последнего действия (Undo)
 * Проверяет доступность истории через canUndo перед выполнением
 */
function handleUndo(): void {
    if (canUndo.value) {
        emit('undo');
    }
}

/**
 * Выполняет операцию повтора отмененного действия (Redo)
 * Проверяет доступность истории через canRedo перед выполнением
 */
function handleRedo(): void {
    if (canRedo.value) {
        emit('redo');
    }
}

/**
 * Открывает модальное окно с редактором опубликованных страниц
 * Позволяет просматривать, редактировать и удалять сохраненные страницы
 */
function handleOpenPublishedPages(): void {
    emit('openPublishedPages');
}

/**
 * Открывает модальное окно галереи медиафайлов
 * Позволяет загружать и управлять изображениями/видео для лендингов
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

/**
 * Открывает модальное окно публикации текущего лендинга
 * Сохраняет текущую редактируемую страницу как новую копию
 * Создает дубликат страницы с возможностью задать новое имя
 */
function handleSaveAsCopy(): void {
    emit('saveAsCopy');
}

/**
 * Сохраняет текущий лендинг как черновик
 * Черновик не публикуется, но сохраняется в базе для последующего редактирования
 */
function handleSaveDraft(): void {
    emit('saveDraft');
}

/**
 * Открывает превью текущего лендинга в новой вкладке
 * Позволяет просмотреть, как будет выглядеть опубликованная страница
 */
function handlePreview(): void {
    emit('preview');
}

/**
 * Переключает видимость визуальной сетки layout-компонентов.
 */
function handleToggleGrid(): void {
    emit('toggleGrid');
}

// #endregion
</script>

<template>
    <div :class="$style.TheToolbar">
        <div :class="$style.center">
            <h1 :class="$style.title">
                <span :class="$style.titlePrimary">
                    <BuilderLogo :class="$style.logo" text="" :to="null" />
                </span>
                <span v-if="currentPageTitle" :class="$style.titleDivider">/</span>
                <span v-if="currentPageTitle" :class="$style.titleSecondary">
                    {{ currentPageTitle }}
                </span>
            </h1>
        </div>

        <div :class="$style.right">
            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton
                        size="md"
                        variant="outline"
                        equal
                        :active="props.showGrid"
                        @click="handleToggleGrid"
                    >
                        <BricksLandIcon :class="$style.icon" icon="md:outlined-grid-3x3" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint text="Сетка" />
                </template>
            </BricksTooltip>

            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton
                        size="md"
                        variant="outline"
                        equal
                        :disabled="!canUndo"
                        @click="handleUndo"
                    >
                        <BricksLandIcon :class="$style.icon" icon="cl:arrow-undo-down-left" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint text="Шаг назад (Ctrl+Z)" />
                </template>
            </BricksTooltip>

            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton
                        size="md"
                        variant="outline"
                        equal
                        :disabled="!canRedo"
                        @click="handleRedo"
                    >
                        <BricksLandIcon :class="$style.icon" icon="cl:arrow-undo-down-right" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint text="Шаг вперёд (Ctrl+Shift+Z)" />
                </template>
            </BricksTooltip>

            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton size="md" variant="outline" equal @click="handleOpenPublishedPages">
                        <BricksLandIcon :class="$style.icon" icon="ca:document-multiple-02" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint text="Редактор страниц" />
                </template>
            </BricksTooltip>

            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton size="md" variant="outline" equal @click="handleOpenMediaGallery">
                        <BricksLandIcon :class="$style.icon" icon="cd:file-media" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint text="Загружаемый контент" />
                </template>
            </BricksTooltip>

            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton size="md" variant="outline" equal @click="handlePreview">
                        <BricksLandIcon :class="$style.icon" icon="md:outlined-preview" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint text="Посмотреть превью" />
                </template>
            </BricksTooltip>

            <BricksActionButton
                :label="publishButtonConfig.label"
                :options="publishButtonConfig.options"
                :is-submitting="props.isSubmittingPublish"
                @save-as-copy="handleSaveAsCopy"
                @save-draft="handleSaveDraft"
            >
                <BricksLandIcon icon="th:save" />
            </BricksActionButton>
        </div>
    </div>
</template>

<style module lang="scss">
.TheToolbar {
    position: relative;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 6rem;
    padding: 0 2rem;
    border-bottom: 1px solid var(--land-base-300);
    background-color: var(--land-base-0);
    box-shadow: var(--shadow-sm);
}

.right {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 30rem;
}

.center {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: margin var(--default-transition);
    gap: 1.6rem;
}

.title {
    display: inline-flex;
    align-items: center;
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--land-base-900);
    gap: 0.8rem;
}

.titlePrimary {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
}

.logo {
    display: inline-flex;
    transform-origin: left center;
}

.titleDivider {
    color: var(--land-base-300);
}

.titleSecondary {
    font-weight: 500;
    color: var(--land-base-600);
}

.icon {
    //
}
</style>
