<script setup lang="ts">
// #region Imports
// Types
import type { IPageVersionSummary } from '../../../common/types/bricks-api';
import type {
    IPublishDetailsPanelVersionsProps,
    IPublishDetailsPanelVersionsEmits,
} from '../types/dashboard';

// Utils
import { formatPageDateTime } from '../utils/dates';

// Vue
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishPageVersions } from '../composables/usePublishPageVersions';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelVersionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelVersionsEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const { versions, isLoading, previewingVersionId, loadVersions, previewVersion } =
    usePublishPageVersions();

const isOpen = ref(false);
// #endregion

// #region Methods
/**
 * Загружает список версий; при ошибке уведомляет контроллер.
 */
async function reloadVersions(): Promise<void> {
    try {
        await loadVersions(props.page.id);
    } catch {
        emit('notify', t('bricks.publish.dashboard.details.versions.toasts.loadFailed'), 'error');
    }
}

/**
 * Разворачивает/сворачивает секцию версий; при открытии загружает свежий список.
 */
async function handleToggle(): Promise<void> {
    isOpen.value = !isOpen.value;

    if (isOpen.value) {
        await reloadVersions();
    }
}

/**
 * Открывает превью версии в новой вкладке.
 *
 * @param version - Сводка версии.
 */
async function handlePreview(version: IPageVersionSummary): Promise<void> {
    try {
        await previewVersion(props.page, version.id);
    } catch {
        emit(
            'notify',
            t('bricks.publish.dashboard.details.versions.toasts.previewFailed'),
            'error'
        );
    }
}

/**
 * Запрашивает откат страницы к версии (подтверждение — в контроллере).
 *
 * @param version - Сводка версии.
 */
function handleRestore(version: IPageVersionSummary): void {
    emit('restore', version);
}
// #endregion

// #region Lifecycle
watch(
    () => props.page.id,
    () => {
        isOpen.value = false;
        versions.value = [];
    }
);

// После отката/сохранения updatedAt меняется — перезагружаем открытый список
watch(
    () => props.page.updatedAt,
    () => {
        if (isOpen.value) {
            reloadVersions();
        }
    }
);
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanelVersions">
        <button :class="$style.versionsToggle" type="button" @click="handleToggle">
            <BricksIcon
                icon="ta:outline-chevron-right"
                :class="[$style.versionsCaret, isOpen && $style.versionsCaretOpen]"
            />
            {{ t('bricks.publish.dashboard.details.versions.title') }}
        </button>

        <div v-if="isOpen" :class="$style.versionsContent">
            <div v-if="isLoading" :class="$style.loading">
                <BricksIcon icon="ta:outline-loader-2" :class="$style.loadingIcon" />
            </div>

            <p v-else-if="versions.length === 0" :class="$style.empty">
                {{ t('bricks.publish.dashboard.details.versions.empty') }}
            </p>

            <ul v-else :class="$style.list">
                <li v-for="version in versions" :key="version.id" :class="$style.row">
                    <span :class="$style.date">{{ formatPageDateTime(version.createdAt) }}</span>
                    <div :class="$style.actions">
                        <button
                            :class="$style.actionButton"
                            type="button"
                            :disabled="previewingVersionId !== null"
                            :title="t('bricks.publish.dashboard.details.versions.preview')"
                            :aria-label="t('bricks.publish.dashboard.details.versions.preview')"
                            @click="handlePreview(version)"
                        >
                            <BricksIcon icon="ta:outline-eye" />
                        </button>
                        <button
                            :class="$style.actionButton"
                            type="button"
                            :title="t('bricks.publish.dashboard.details.versions.restore')"
                            :aria-label="t('bricks.publish.dashboard.details.versions.restore')"
                            @click="handleRestore(version)"
                        >
                            <BricksIcon icon="ta:outline-arrow-back-up" />
                        </button>
                    </div>
                </li>
            </ul>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanelVersions {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.versionsToggle {
    display: flex;
    align-items: center;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-900);
    }
}

.versionsCaret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--bricks-default-transition);
}

.versionsCaretOpen {
    transform: rotate(90deg);
}

.versionsContent {
    display: flex;
    flex-direction: column;
}

.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.8rem 0;
}

.loadingIcon {
    font-size: 1.8rem;
    color: var(--bricks-primary-500);
    animation: spin 1s linear infinite;
}

.empty {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.list {
    display: flex;
    margin: 0;
    padding: 0;
    flex-direction: column;
    list-style: none;
}

.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0;
    gap: 0.8rem;

    &:not(:last-child) {
        border-bottom: 1px solid var(--bricks-base-200);
    }
}

.date {
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.actions {
    display: flex;
    gap: 0.4rem;
}

.actionButton {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--bricks-base-400);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>
