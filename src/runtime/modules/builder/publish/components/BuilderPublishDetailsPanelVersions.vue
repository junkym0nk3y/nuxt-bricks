<script setup lang="ts">
// #region Imports
// Types
import type { IPageVersionSummary } from '../../../common/types/bricks-api';
import type {
    IPublishDetailsPanelVersionsProps,
    IPublishDetailsPanelVersionsEmits,
    IPublishVersionCard,
} from '../types/dashboard';

// Utils
import { formatPageDateTime, formatPageVersionDateTime } from '../utils/dates';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishPageVersions } from '../composables/usePublishPageVersions';

// Components
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelVersionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelVersionsEmits>();
// #endregion

// #region Data
/** Сколько карточек-заглушек держат высоту панели, пока список едет. */
const SKELETON_CARDS_COUNT = 4;

const { t } = useI18n();

const { versions, isLoading, loadVersions, previewVersion, resetVersions } =
    usePublishPageVersions();

const isOpen = ref(false);
// #endregion

// #region Computed
/**
 * Карточки галереи: текущее состояние страницы первым, за ним история.
 * Пока истории нет, текущая карточка не показывается — сравнивать не с чем,
 * и секция честно отвечает пустым состоянием.
 */
const versionCards = computed<IPublishVersionCard[]>(() => {
    if (versions.value.length === 0) {
        return [];
    }

    return [
        {
            key: 'current',
            version: null,
            thumbnailUrl: props.page.thumbnailUrl,
            date: formatPageDateTime(props.page.updatedAt),
        },
        // Дата карточки — момент, когда снятое состояние сохранили, а не когда
        // его вытеснили (см. formatPageVersionDateTime); той же датой
        // подписывается подтверждение отката
        ...versions.value.map((version) => ({
            key: `version-${version.id}`,
            version,
            thumbnailUrl: version.thumbnailUrl,
            date: formatPageVersionDateTime(version),
        })),
    ];
});
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
 * Открывает превью версии в новой вкладке. Загружать нечего — версия уходит в
 * URL превью-роута; сообщаем только о неоткрывшейся вкладке.
 *
 * @param version - Сводка версии.
 */
function handlePreview(version: IPageVersionSummary): void {
    if (!previewVersion(props.page, version.id)) {
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
        // Через композабл, а не присваиванием в `versions`: сброс обязан
        // обесценить и уже летящий запрос прежней страницы
        resetVersions();
    }
);

// Любая запись страницы (откат, сохранение meta, импорт схемы) вытесняет версию
// — перезагружаем открытый список. Слежение за `revision`, а не за `updatedAt`:
// revision монотонна по контракту, а две быстрые записи могут получить
// неразличимый timestamp, и обновление истории тогда потерялось бы
watch(
    () => props.page.revision,
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
            <!-- Скелет — только пока показывать нечего: перезагрузка открытой
                 секции (после отката или сохранения) не должна мигать пустой
                 сеткой поверх уже показанных версий -->
            <div v-if="isLoading && versions.length === 0" :class="$style.grid">
                <div v-for="index in SKELETON_CARDS_COUNT" :key="index" :class="$style.card">
                    <div :class="[$style.thumb, $style.thumbSkeleton]" />
                    <span :class="$style.dateSkeleton" />
                </div>
            </div>

            <p v-else-if="versions.length === 0" :class="$style.empty">
                {{ t('bricks.publish.dashboard.details.versions.empty') }}
            </p>

            <ul v-else :class="$style.grid">
                <li
                    v-for="card in versionCards"
                    :key="card.key"
                    :class="[$style.card, !card.version && $style.cardCurrent]"
                >
                    <div :class="$style.thumb">
                        <!-- alt пустой намеренно: описать скриншот страницы
                             текстом нечем, а дата уже озвучена соседней
                             строкой — с `alt="дата"` скринридер повторял бы её
                             дважды подряд -->
                        <img
                            v-if="card.thumbnailUrl"
                            :class="$style.thumbImage"
                            :src="card.thumbnailUrl"
                            alt=""
                            loading="lazy"
                        />
                        <div v-else :class="$style.placeholder">
                            <BricksIcon icon="ta:outline-photo" :class="$style.placeholderIcon" />
                            <span :class="$style.placeholderText">
                                {{ t('bricks.publish.dashboard.details.versions.noThumbnail') }}
                            </span>
                        </div>

                        <span v-if="!card.version" :class="$style.currentBadge">
                            {{ t('bricks.publish.dashboard.details.versions.current') }}
                        </span>

                        <!-- Подпись действий — тултип кита, а не нативный
                             `title`: стрелка «восстановить» без подписи
                             читается как «отменить», а цена ошибки здесь —
                             перезаписанное содержимое страницы. `aria-label`
                             остаётся: содержимое тултипа уезжает в портал и
                             доступным именем кнопки не становится -->
                        <div v-if="card.version" :class="$style.actions">
                            <BricksTooltip bottom>
                                <template #activator>
                                    <button
                                        :class="$style.actionButton"
                                        type="button"
                                        :aria-label="
                                            t('bricks.publish.dashboard.details.versions.preview')
                                        "
                                        @click="handlePreview(card.version)"
                                    >
                                        <BricksIcon icon="ta:outline-eye" />
                                    </button>
                                </template>
                                <BricksTooltipHint
                                    :text="t('bricks.publish.dashboard.details.versions.preview')"
                                />
                            </BricksTooltip>

                            <BricksTooltip bottom>
                                <template #activator>
                                    <button
                                        :class="$style.actionButton"
                                        type="button"
                                        :aria-label="
                                            t('bricks.publish.dashboard.details.versions.restore')
                                        "
                                        @click="handleRestore(card.version)"
                                    >
                                        <BricksIcon icon="ta:outline-arrow-back-up" />
                                    </button>
                                </template>
                                <BricksTooltipHint
                                    :text="t('bricks.publish.dashboard.details.versions.restore')"
                                />
                            </BricksTooltip>
                        </div>
                    </div>

                    <span :class="[$style.date, !card.version && $style.dateCurrent]">
                        {{ card.date }}
                    </span>
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

.empty {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.grid {
    display: grid;

    // Две карточки в ряд — ширина контента панели (34rem минус паддинги)
    // делится ровно на 14.4rem + 1.2rem + 14.4rem, и превью получает точное 16:10
    margin: 0;
    padding: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.2rem;
    list-style: none;
}

.card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
}

.thumb {
    position: relative;
    overflow: hidden;

    // 16:10 — то же соотношение, что у миниатюры в списке страниц
    aspect-ratio: 16 / 10;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.thumbSkeleton {
    border-color: transparent;
    background: var(--bricks-base-100);
}

.thumbImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--bricks-base-100);
    transition: opacity var(--bricks-default-transition);
}

.placeholderIcon {
    font-size: 2rem;
    color: var(--bricks-base-400);
}

.placeholderText {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.currentBadge {
    position: absolute;
    top: 0.8rem;
    left: 0.8rem;
    padding: 0.2rem 0.8rem;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-primary-500);
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-static-white);
}

.cardCurrent {
    .thumb {
        border-color: var(--bricks-primary-500);
        border-width: 0.2rem;
    }
}

.actions {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;

    // Затемнение — не отдельный слой: своим фоном оно и гасит превью,
    // и ловит мышь, пока действия видны
    background: var(--bricks-overlay-dark);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);
}

.card:hover .actions,
.card:focus-within .actions {
    opacity: 1;
    pointer-events: auto;
}

// Знак «снимка нет» под вуалью сталкивается с иконками действий: он тоже
// по центру. Пока действия открыты, показывать нечего — плейсхолдер уходит
.card:hover .placeholder,
.card:focus-within .placeholder {
    opacity: 0;
}

.actionButton {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.8rem;
    height: 2.8rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    font-size: 1.8rem;

    // Кнопки лежат на тёмной вуали в обеих темах — цвет статичный,
    // `base-900` в тёмной теме стал бы почти белым на почти белом
    color: var(--bricks-static-white);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--bricks-overlay-light);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
}

.date {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.dateCurrent {
    font-weight: 500;
    color: var(--bricks-base-900);
}

.dateSkeleton {
    width: 60%;
    height: 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    background: var(--bricks-base-100);
}
</style>
