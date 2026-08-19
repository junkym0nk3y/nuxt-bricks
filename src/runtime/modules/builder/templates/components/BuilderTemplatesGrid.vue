<script setup lang="ts">
/**
 * @description Сетка шаблонов и её края: загрузка, пустой раздел, пустой поиск.
 *
 * Пустое состояние раздела ведёт к списку страниц, а не показывает выключенную
 * кнопку: шаблон рождается только из готовой страницы, и человеку нужно туда,
 * где его можно создать.
 */

// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesGridProps, ITemplatesGridEmits } from '../types/templates';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BuilderTemplatesCard from './BuilderTemplatesCard.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesGridProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesGridEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/**
 * Число карточек-заглушек на время загрузки: ровно один ряд сетки при типичной
 * ширине дашборда. Скелет повторяет карточку, а не показывает спиннер по центру —
 * так не прыгает раскладка в момент появления настоящих карточек.
 */
const SKELETON_CARDS = 4;
// #endregion

// #region Methods
/**
 * Пробрасывает создание страницы из шаблона.
 *
 * @param template - Шаблон.
 */
function handleCreatePage(template: TBricksTemplateSummary): void {
    emit('create-page', template);
}

/**
 * Пробрасывает просмотр снимка шаблона.
 *
 * @param template - Шаблон.
 */
function handlePreviewThumbnail(template: TBricksTemplateSummary): void {
    emit('preview-thumbnail', template);
}

/**
 * Пробрасывает правку подписи.
 *
 * @param template - Шаблон.
 */
function handleRename(template: TBricksTemplateSummary): void {
    emit('rename', template);
}

/**
 * Пробрасывает удаление шаблона.
 *
 * @param template - Шаблон.
 */
function handleDelete(template: TBricksTemplateSummary): void {
    emit('delete', template);
}

/**
 * Просит открыть раздел страниц (CTA пустого состояния).
 */
function handleGoToPages(): void {
    emit('go-to-pages');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderTemplatesGrid">
        <div v-if="props.isLoading && !props.hasAnyTemplates" :class="$style.grid">
            <div
                v-for="index in SKELETON_CARDS"
                :key="`skeleton-${index}`"
                :class="$style.skeletonCard"
            >
                <div :class="$style.skeletonThumbnail" />
                <div :class="$style.skeletonMeta">
                    <span :class="[$style.skeletonLine, $style.skeletonLineWide]" />
                    <span :class="$style.skeletonLine" />
                </div>
            </div>
        </div>

        <div v-else-if="props.isSearchEmpty" :class="$style.state">
            <div :class="$style.stateIconCircle">
                <BricksIcon icon="ta:outline-search" :class="$style.stateIcon" />
            </div>
            <h2 :class="$style.stateTitle">{{ t('bricks.templates.notFound.title') }}</h2>
            <p :class="$style.stateDescription">
                {{ t('bricks.templates.notFound.description') }}
            </p>
        </div>

        <div v-else-if="!props.hasAnyTemplates" :class="$style.state">
            <div :class="$style.stateIconCircle">
                <BricksIcon icon="ta:outline-package" :class="$style.stateIcon" />
            </div>
            <h2 :class="$style.stateTitle">{{ t('bricks.templates.empty.title') }}</h2>
            <p :class="$style.stateDescription">
                {{ t('bricks.templates.empty.description') }}
            </p>
            <BricksButton size="md" variant="secondary" @click="handleGoToPages">
                {{ t('bricks.templates.empty.action') }}
            </BricksButton>
        </div>

        <div v-else :class="$style.grid">
            <BuilderTemplatesCard
                v-for="template in props.templates"
                :key="template.id"
                :template="template"
                :is-pending="props.pendingTemplateId === template.id"
                @create-page="handleCreatePage"
                @preview-thumbnail="handlePreviewThumbnail"
                @rename="handleRename"
                @delete="handleDelete"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderTemplatesGrid {
    display: flex;
    flex: 1;
    flex-direction: column;
}

.grid {
    display: grid;

    // Колонка от 24rem: на 1160 контента даёт четыре колонки по 27.2rem, на
    // узком окне — три и две, без своих брейкпоинтов
    grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
    gap: 2.4rem;
}

.state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    flex-direction: column;
    gap: 0.8rem;
    padding: 2.4rem;
}

.stateIconCircle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 6.4rem;
    height: 6.4rem;
    margin-bottom: 1.2rem;
    border-radius: 50%;
    background: var(--bricks-base-100);
}

.stateIcon {
    width: 2.8rem;
    height: 2.8rem;
    color: var(--bricks-base-400);
}

.stateTitle {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.stateDescription {
    max-width: 36rem;
    margin: 0 0 1.6rem;
    text-align: center;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}

.skeletonCard {
    overflow: hidden;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.skeletonThumbnail {
    aspect-ratio: 16 / 10;
    background: var(--bricks-base-100);
}

.skeletonMeta {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.2rem 1.4rem;
}

.skeletonLine {
    width: 60%;
    height: 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    background: var(--bricks-base-100);
}

.skeletonLineWide {
    width: 80%;
}
</style>
