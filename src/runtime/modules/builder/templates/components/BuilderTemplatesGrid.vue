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
import BricksEmptyState from '../../../ui/feedback/BricksEmptyState.vue';
import BricksSkeleton from '../../../ui/feedback/BricksSkeleton.vue';
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
                <BricksSkeleton shape="block" :class="$style.skeletonThumbnail" />
                <div :class="$style.skeletonMeta">
                    <BricksSkeleton :class="[$style.skeletonLine, $style.skeletonLineWide]" />
                    <BricksSkeleton :class="$style.skeletonLine" />
                </div>
            </div>
        </div>

        <div v-else-if="props.isSearchEmpty" :class="$style.state">
            <BricksEmptyState
                icon="ta:outline-search"
                :title="t('bricks.templates.notFound.title')"
                :description="t('bricks.templates.notFound.description')"
            />
        </div>

        <div v-else-if="!props.hasAnyTemplates" :class="$style.state">
            <BricksEmptyState
                icon="ta:outline-package"
                :title="t('bricks.templates.empty.title')"
                :description="t('bricks.templates.empty.description')"
            >
                <BricksButton size="md" variant="secondary" @click="handleGoToPages">
                    {{ t('bricks.templates.empty.action') }}
                </BricksButton>
            </BricksEmptyState>
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

.skeletonCard {
    overflow: hidden;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.skeletonThumbnail {
    aspect-ratio: 16 / 10;
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
}

.skeletonLineWide {
    width: 80%;
}
</style>
