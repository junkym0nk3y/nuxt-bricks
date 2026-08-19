<script setup lang="ts">
/**
 * @description Карточка шаблона в сетке раздела: превью, подпись и действия.
 *
 * Сетчатый вариант строки списка страниц — те же токены и тот же набор действий
 * за вычетом дублирования: копия шаблона ничего не даёт, шаблон и есть копия.
 * Поэтому основное действие живёт на превью («Создать страницу»), а клик по
 * карточке ведёт туда же.
 *
 * Наблюдателю создавать страницы нечем, и вместо основного действия ему остаётся
 * просмотр снимка — та же кнопка, что в футере.
 */

// #region Imports
// Types
import type { ITemplatesCardProps, ITemplatesCardEmits } from '../types/templates';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesCardProps>(), {
    isPending: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesCardEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
// #endregion

// #region Computed
/**
 * Мета-строка карточки: объём шаблона и дата сохранения. Дата создания, а не
 * обновления: обновляется только подпись, и «сохранён» после переименования
 * означал бы другое событие.
 */
const metaLine = computed<string>(() =>
    [
        t('bricks.templates.card.blocks', { count: props.template.blocksCount }),
        formatPageDate(props.template.createdAt),
    ].join(' · ')
);
// #endregion

// #region Methods
/**
 * Просит создать страницу из шаблона (клик по карточке и кнопка на превью).
 * Наблюдателю вместо создания открывается снимок: единственное, что ему доступно.
 */
function handlePrimaryAction(): void {
    if (props.isPending) {
        return;
    }

    if (!canEdit.value) {
        handlePreviewThumbnail();
        return;
    }

    emit('create-page', props.template);
}

/**
 * Просит открыть снимок шаблона в лайтбоксе.
 */
function handlePreviewThumbnail(): void {
    emit('preview-thumbnail', props.template);
}

/**
 * Просит открыть форму правки подписи.
 */
function handleRename(): void {
    emit('rename', props.template);
}

/**
 * Просит удалить шаблон (подтверждение спрашивает раздел).
 */
function handleDelete(): void {
    emit('delete', props.template);
}
// #endregion
</script>

<template>
    <article
        :class="[$style.BuilderTemplatesCard, props.isPending && $style._pending]"
        @click="handlePrimaryAction"
    >
        <div :class="$style.thumbnail">
            <img
                v-if="props.template.thumbnailUrl"
                :class="$style.thumbnailImage"
                :src="props.template.thumbnailUrl"
                :alt="props.template.name"
                loading="lazy"
            />
            <BricksIcon v-else icon="ta:outline-photo" :class="$style.thumbnailPlaceholder" />

            <!--
                Оверлей и кнопка появляются по наведению и по фокусу внутри
                карточки: с клавиатуры действие обязано быть видно, а не только
                достижимо
            -->
            <div :class="$style.overlay">
                <BricksButton
                    size="md"
                    :variant="canEdit ? 'primary' : 'secondary'"
                    :disabled="props.isPending"
                    @click.stop="handlePrimaryAction"
                >
                    {{
                        canEdit
                            ? t('bricks.templates.card.createPage')
                            : t('bricks.templates.card.preview')
                    }}
                </BricksButton>
            </div>
        </div>

        <div :class="$style.meta">
            <h3 :class="$style.name">{{ props.template.name }}</h3>
            <p v-if="props.template.description" :class="$style.description">
                {{ props.template.description }}
            </p>

            <div :class="$style.metaRow">
                <span :class="$style.metaText">{{ metaLine }}</span>

                <div :class="$style.actions" @click.stop>
                    <BricksIconButton
                        icon="ph:eye"
                        :label="t('bricks.templates.card.preview')"
                        @click="handlePreviewThumbnail"
                    />

                    <!-- Правка подписи — запись: наблюдателю ручка откажет -->
                    <BricksIconButton
                        v-if="canEdit"
                        icon="ta:outline-pencil"
                        :label="t('bricks.templates.card.rename')"
                        :disabled="props.isPending"
                        @click="handleRename"
                    />

                    <!-- Удаление — только администратору, как и у страницы -->
                    <BricksIconButton
                        v-if="canDelete"
                        icon="ta:outline-trash"
                        :label="t('bricks.templates.card.delete')"
                        danger
                        :disabled="props.isPending"
                        @click="handleDelete"
                    />
                </div>
            </div>
        </div>
    </article>
</template>

<style module lang="scss">
.BuilderTemplatesCard {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    cursor: pointer;

    &:hover,
    &:focus-within {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--bricks-shadow-sm);

        .overlay,
        .actions {
            opacity: 1;
            pointer-events: auto;
        }
    }
}

._pending {
    opacity: 0.6;
    cursor: default;
}

.thumbnail {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;

    // 16:10 — тот же кадр, что снимает превью страницы
    aspect-ratio: 16 / 10;
    border-bottom: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.thumbnailPlaceholder {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.overlay {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    inset: 0;

    // Готовый токен затемнения, а не `backdrop-filter`: второй убивает
    // производительность на сетке из карточек
    background: var(--bricks-overlay-dark);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);
}

.meta {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;

    // 1.2 сверху/снизу и 1.4 по бокам — геометрия эталонной карточки макета
    padding: 1.2rem 1.4rem;
}

.name {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.description {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.metaRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    min-height: 2.8rem;
}

.metaText {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.6rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);
}
</style>
