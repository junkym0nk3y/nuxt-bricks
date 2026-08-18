<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarProps, IToolbarEmits } from './types';
import type { IBrickUiCommonProp } from '../../../../ui/types/common';
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksRoutePaths } from '../../../../common/composables/useBricksRoutePaths';
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
import BricksActionButton from '../../../../ui/base/action-button/BricksActionButton.vue';
import BricksTooltip from '../../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/tooltip/BricksTooltipHint.vue';
import BuilderAuthProfileMenu from '../../../auth/components/BuilderAuthProfileMenu.vue';
import BuilderLogo from '../../../core/components/BuilderLogo.vue';
import BuilderShellToolbarPageSelector from './BuilderShellToolbarPageSelector.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IToolbarProps>(), {
    pages: () => [],
    currentPageId: null,
    isPagesLoaded: false,
    isPagesLoading: false,
    isSubmittingPage: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IToolbarEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit } = useBuilderPermissions();

// href дашборда: BuilderLogo рендерит обычный <a>, base роутер не подставит
const { builderRootPath, withBase } = useBricksRoutePaths();
const dashboardHref = withBase(builderRootPath);
// #endregion

// #region Computed
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
    options: IBrickUiCommonProp[];
}>(() => {
    const baseOptions: IBrickUiCommonProp[] = [
        {
            label: t('bricks.toolbar.saveDraft'),
            value: 'draft',
        },
        {
            label: t('bricks.toolbar.saveCopy'),
            value: 'copy',
        },
    ];

    return {
        label: t('bricks.toolbar.save'),
        options: baseOptions,
    };
});
// #endregion

// #region Methods
/**
 * Открывает менеджер страниц (дашборд `/bricks`)
 * Позволяет просматривать, редактировать и удалять сохранённые страницы
 */
function handleOpenPagesManager(): void {
    emit('openPagesManager');
}

/**
 * Сообщает об открытии селектора: список страниц догружается и освежается
 * ровно в этот момент, а не при загрузке билдера.
 */
function handleOpenPageSelector(): void {
    emit('openPageSelector');
}

/**
 * Передаёт выбранную в селекторе страницу наверх — переход выполняет
 * composition root.
 *
 * @param page - Выбранная страница.
 */
function handleSelectPage(page: TPublishedPageSummary): void {
    emit('selectPage', page);
}

/**
 * Запрашивает создание новой страницы.
 */
function handleCreatePage(): void {
    emit('createPage');
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
 * Пробрасывает запрос модалки профиля наверх: монтирует её composition root.
 */
function handleOpenProfile(): void {
    emit('openProfile');
}

/**
 * Пробрасывает выход наверх: сессией и переходом на login владеет composition root.
 */
function handleLogout(): void {
    emit('logout');
}
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderShellToolbar">
        <div :class="$style.center">
            <h1 :class="$style.title">
                <span :class="$style.titlePrimary">
                    <BuilderLogo :class="$style.logo" :to="dashboardHref" />
                </span>
                <!--
                    Заголовок появляется только с готовым названием: до открытия
                    сессии форма пуста, и на сервере разметка та же — иначе
                    вернулся бы hydration mismatch
                -->
                <template v-if="currentPageTitle">
                    <span :class="$style.titleDivider" aria-hidden="true">|</span>
                    <BuilderShellToolbarPageSelector
                        :page-title="currentPageTitle"
                        :pages="props.pages"
                        :current-page-id="props.currentPageId"
                        :is-loaded="props.isPagesLoaded"
                        :is-loading="props.isPagesLoading"
                        :disabled="!props.isSessionReady"
                        :is-create-disabled="props.isSubmittingPage"
                        @open="handleOpenPageSelector"
                        @select="handleSelectPage"
                        @all-pages="handleOpenPagesManager"
                        @create-page="handleCreatePage"
                    />
                </template>
            </h1>
        </div>

        <div :class="$style.right">
            <!--
                Медиатека — вход в загрузку и правку файлов: наблюдателю она
                открылась бы галереей без единого доступного действия, потому что
                выбирать картинку ему некуда (панели свойств у него нет)
            -->
            <BricksTooltip v-if="canEdit" bottom>
                <template #activator>
                    <BricksButton
                        size="md"
                        variant="outline"
                        equal
                        :disabled="!props.isSessionReady"
                        :aria-label="t('bricks.toolbar.media')"
                        @click="handleOpenMediaGallery"
                    >
                        <BricksIcon :class="$style.icon" icon="ta:outline-photo-video" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint :text="t('bricks.toolbar.media')" />
                </template>
            </BricksTooltip>

            <BricksTooltip bottom>
                <template #activator>
                    <BricksButton
                        size="md"
                        variant="outline"
                        equal
                        :disabled="!props.isSessionReady"
                        :aria-label="t('bricks.toolbar.preview')"
                        @click="handlePreview"
                    >
                        <BricksIcon :class="$style.icon" icon="ta:outline-browser-share" />
                    </BricksButton>
                </template>

                <template #default>
                    <BricksTooltipHint :text="t('bricks.toolbar.preview')" />
                </template>
            </BricksTooltip>

            <!-- Сохранение и публикация — записи: у наблюдателя их нет вовсе -->
            <BricksActionButton
                v-if="canEdit"
                :label="publishButtonConfig.label"
                :options="publishButtonConfig.options"
                :is-submitting="props.isSubmittingPublish"
                :disabled="!props.isSessionReady"
                @save-as-copy="handleSaveAsCopy"
                @save-draft="handleSaveDraft"
            >
                <BricksIcon :class="$style.icon" icon="ta:outline-device-floppy" />
            </BricksActionButton>

            <!--
                Аватар за вертикальной чертой: он не действие панели, а «кем
                вошёл», и без разделителя читался бы как ещё одна кнопка рядом с
                «Сохранить». Черту рисует сам компонент — он же решает, рисоваться
                ли вообще (вне database-режима профиля нет), иначе в basic-режиме
                в панели висела бы линия без аватара. До него выхода в билдере не
                было вовсе — logout жил только в рейле дашборда
            -->
            <BuilderAuthProfileMenu
                separated
                @open-profile="handleOpenProfile"
                @logout="handleLogout"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.TheBuilderShellToolbar {
    position: relative;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 6rem;
    padding: 0 2rem 0 1.2rem;
    border-bottom: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-sm);
}

.right {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.center {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: margin var(--bricks-default-transition);
    gap: 1.6rem;
}

.title {
    display: inline-flex;
    align-items: center;
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--bricks-base-900);
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
    color: var(--bricks-base-300);
}

.icon {
    font-size: 1.8rem;
}
</style>
