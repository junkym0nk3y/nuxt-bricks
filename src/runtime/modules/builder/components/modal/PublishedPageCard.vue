<script setup lang="ts">
// #region Imports
// Types
import type { IPublishedPageCardEmits, IPublishedPageCardProps } from './types';

// Vue
import { computed } from 'vue';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = defineProps<IPublishedPageCardProps>();
// #endregion

// #region Emits
const emit = defineEmits<IPublishedPageCardEmits>();
// #endregion

// #region Computed
const formattedDate = computed(() => {
    const rawDate = props.page.updatedAt || props.page.createdAt;

    if (!rawDate) {
        return '—';
    }

    const parsedDate = new Date(rawDate);

    if (Number.isNaN(parsedDate.getTime())) {
        return '—';
    }

    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const year = String(parsedDate.getFullYear()).slice(-2);
    const hours = String(parsedDate.getHours()).padStart(2, '0');
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} в ${hours}:${minutes}`;
});
// #endregion

// #region Methods
/**
 * Эмитит просмотр страницы.
 */
function handlePreview(): void {
    emit('preview', String(props.page.id));
}

/**
 * Эмитит редактирование страницы.
 */
function handleEdit(): void {
    emit('edit', String(props.page.id));
}

/**
 * Эмитит удаление страницы.
 */
function handleDelete(): void {
    emit('delete', String(props.page.id));
}

/**
 * Эмитит переключение статуса публикации.
 *
 * @param value - Новое значение publish-флага.
 */
function handleTogglePublished(value: boolean | string): void {
    emit('togglePublished', String(props.page.id), Boolean(value));
}
// #endregion
</script>

<template>
    <div :class="$style.PublishedPageCard">
        <div :class="$style.info">
            <h3 :class="$style.title">{{ props.page.title }}</h3>
            <p :class="$style.pagename">/landing/{{ props.page.pagename }}</p>
            <p :class="$style.description">
                {{ props.page.description }}
            </p>
            <div :class="$style.meta">
                <span :class="$style.date">Обновлено: {{ formattedDate }}</span>

                <BricksTooltip bottom>
                    <template #activator>
                        <div :class="$style.publishSwitch">
                            <BricksSwitch
                                :value="props.page.published"
                                :true-value="true"
                                :false-value="false"
                                false-label=""
                                true-label=""
                                size="small"
                                :disabled="props.isPublishing"
                                @update:value="handleTogglePublished"
                            >
                                <BricksIcon
                                    :icon="props.page.published ? 'fa:eye' : 'fa:reg-eye'"
                                />
                            </BricksSwitch>
                        </div>
                    </template>

                    <template #default>
                        <BricksTooltipHint text="Публикация страницы" />
                    </template>
                </BricksTooltip>
            </div>
        </div>

        <div :class="$style.actions">
            <BricksButton size="md" variant="secondary" @click="handlePreview">
                Превью
            </BricksButton>

            <BricksButton size="md" variant="secondary" @click="handleEdit">
                Редактировать
            </BricksButton>

            <BricksButton size="md" variant="danger" @click="handleDelete"> Удалить </BricksButton>
        </div>
    </div>
</template>

<style module lang="scss">
.PublishedPageCard {
    display: grid;
    padding: 1.6rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-0);
    grid-template-columns: 1fr auto;
    gap: 1.6rem;
}

.info {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.pagename {
    margin: 0;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}

.description {
    margin: 0.4rem 0 0;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
}

.meta {
    display: flex;
    gap: 1.2rem;
    align-items: center;
    margin-top: 0.8rem;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}

.date {
    white-space: nowrap;
}

.publishSwitch {
    display: flex;
    align-items: center;

    svg {
        margin-left: 1rem;
        font-size: 1.6rem;
    }
}

.actions {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    align-self: center;
}
</style>
