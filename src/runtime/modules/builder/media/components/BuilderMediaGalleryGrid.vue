<script setup lang="ts">
/**
 * @description Сетка плиток медиатеки. Плитка 210×172: превью 126 + инфо 46,
 * шесть колонок через 20 укладываются в ширину контента модалки ровно.
 *
 * Углы превью разведены намеренно: кнопка полноэкранного просмотра — в правом
 * верхнем, бейдж выбора — в левом. У выбранной плитки под курсором они видны
 * одновременно и в одном углу наложились бы.
 *
 * Светлым форсируется только окно превью — картинка остаётся на светлой подложке,
 * как канвас. Сама карточка живёт в токенах темы: раньше светлой была плитка
 * целиком, и в тёмной теме дюжина белых карточек читалась как световая стена.
 */

// #region Imports
// Types
import type { IMediaItem } from '../../../common/types/media';
import type { IMediaGalleryGridProps, IMediaGalleryGridEmits } from '../types/media';

// Utils
import { formatFileSize } from '../utils/formatFileSize';
import { formatMediaDimensions, isVideoMedia } from '../utils/mediaSummary';

// Vue
import { useI18n } from 'vue-i18n';

// Components
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksImage from '../../../ui/base/image/BricksImage.vue';
import BricksSkeleton from '../../../ui/feedback/BricksSkeleton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryGridProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryGridEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Methods
/** Эмитит выбор элемента галереи. */
function handleSelectItem(item: IMediaItem): void {
    emit('select', item);
}

/** Эмитит открытие полноэкранного предпросмотра. */
function handleOpenPreview(item: IMediaItem): void {
    emit('preview', item);
}

/** Просит вызывающего открыть выбор файлов. */
function handleUploadRequest(): void {
    emit('upload');
}

/**
 * Превью плитки: сама галерея показывает уменьшенный вариант, если он есть —
 * двенадцать полных файлов в сетке весили бы на порядок больше без всякой пользы.
 * Постепенная загрузка здесь не нужна: вариант и есть конечная картинка плитки.
 *
 * @param item - Медиа-элемент.
 * @returns URL для показа в плитке.
 */
function resolveThumbSrc(item: IMediaItem): string {
    return item.previewUrl ?? item.url;
}
// #endregion
</script>

<template>
    <div
        role="listbox"
        :aria-label="t('bricks.media.galleryTitle')"
        :class="$style.BuilderMediaGalleryGrid"
    >
        <!--
            Плитка-приёмник первой ячейкой: постоянной зоны загрузки в модалке
            нет, и точка входа обязана остаться видимой. В сетке она не может
            «схлопнуться» — её размер задаёт колонка грида, а не свободное место
            в колонке контента, из-за которого прежняя полоса срезала себе
            подсказку. Из accessibility tree не убрана: это кнопка загрузки.
        -->
        <button
            v-if="props.showUploadTile"
            type="button"
            :class="[$style.galleryItem, $style._upload]"
            @click="handleUploadRequest"
        >
            <BricksIcon :class="$style.uploadIcon" icon="ta:outline-cloud-upload" />
            <span :class="$style.uploadLabel">{{ t('bricks.media.tileUpload') }}</span>
            <span :class="$style.uploadHint">{{ t('bricks.media.tileUploadHint') }}</span>
        </button>

        <!--
            Скелет первым элементом: сетка идёт от новых к старым, и загруженный
            файл встанет ровно на его место. Из accessibility tree убран — это не
            выбираемый вариант, а место под будущий файл.
        -->
        <div
            v-if="props.showSkeleton"
            aria-hidden="true"
            :class="[$style.galleryItem, $style._skeleton]"
        >
            <div :class="$style.thumb">
                <BricksIcon :class="$style.placeholderIcon" icon="ta:outline-photo" />
            </div>
            <div :class="$style.itemInfo">
                <BricksSkeleton :class="[$style.skeletonBar, $style._wide]" />
                <BricksSkeleton :class="$style.skeletonBar" />
            </div>
        </div>

        <!--
            Плитка — `option` в списке, а не кнопка: она выбирает файл, а не
            запускает действие. До этого она была немым `div` с `@click` — выбрать
            файл с клавиатуры было нельзя вовсе, хотя кнопка полноэкранного
            просмотра внутри неё в таб-порядок попадала.

            `.self` на клавиатуре обязателен: внутри плитки лежит настоящая
            кнопка, и без него Enter на ней всплывал до плитки, выбирал файл, а
            `prevent` отменял нативную активацию кнопки — лайтбокс не открывался.

            Известное ограничение: `tabindex="0"` у КАЖДОЙ плитки, то есть сетка
            из сотни файлов проходится Tab'ом целиком. Правильный listbox — roving
            tabindex со стрелками, и делать его руками рядом с `selectedItemId`
            легко рассинхронизировать; это отдельный заход, возможно на готовом
            примитиве reka.
        -->
        <div
            v-for="item in props.items"
            :key="item.id"
            role="option"
            tabindex="0"
            :aria-selected="props.selectedItemId === item.id"
            :class="[$style.galleryItem, { [$style._selected]: props.selectedItemId === item.id }]"
            @click="handleSelectItem(item)"
            @keydown.enter.self.prevent="handleSelectItem(item)"
            @keydown.space.self.prevent="handleSelectItem(item)"
        >
            <div :class="$style.thumb">
                <div v-if="isVideoMedia(item)" :class="$style.videoPlaceholder">
                    <BricksIcon :class="$style.placeholderIcon" icon="ta:outline-video" />
                </div>
                <BricksImage
                    v-else
                    :src="resolveThumbSrc(item)"
                    :alt="item.alt || item.filename"
                    fit="scale-down"
                />

                <Transition name="bricks-fade-fast">
                    <BricksBadge
                        v-if="props.selectedItemId === item.id"
                        :class="$style.selectedBadge"
                        tone="primary"
                        shape="pill"
                    >
                        <BricksIcon icon="ta:outline-check" />
                    </BricksBadge>
                </Transition>

                <BricksButton
                    :class="$style.previewBtn"
                    size="sm"
                    variant="ghost"
                    equal
                    :aria-label="t('bricks.media.fullscreen')"
                    @click.stop="handleOpenPreview(item)"
                >
                    <BricksIcon icon="ta:outline-search" />
                </BricksButton>
            </div>

            <div :class="$style.itemInfo">
                <span :class="$style.filename">{{ item.filename }}</span>
                <span :class="$style.meta">
                    {{ formatFileSize(item.size) }} · {{ formatMediaDimensions(item, t) }}
                </span>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
/* Минимум колонки 20rem, а не 21rem по ширине плитки макета: на вертикальный
   скроллбар контента уходит ~11px, и при 21rem шестая колонка перестаёт влезать —
   сетка падает до пяти и растягивает плитки до 254. С 20rem шесть колонок
   держатся, а `1fr` доводит их до фактических ~208. */
.BuilderMediaGalleryGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: 2rem;
}

.galleryItem {
    position: relative;
    overflow: hidden;
    height: 17.2rem;
    border-radius: var(--bricks-border-radius-md);

    /* Рамка в покое: до редизайна она была прозрачной, и на белом фоне модалки
       плитка не читалась как объект — видны были только картинка и подписи. */
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--bricks-shadow-md);

        .previewBtn {
            opacity: 1;
        }
    }

    /* Плитка выбирается с клавиатуры, значит фокус обязан быть виден. Кнопка
       полноэкранного просмотра при этом показывается тоже: иначе доехать до неё
       Tab'ом можно, а понять, где она, — нет. */
    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);

        .previewBtn {
            opacity: 1;
        }
    }

    /* Рамка 2px внутрь: свечения `box-shadow` из прежней версии здесь нет — на
       сетке из двенадцати плиток оно мылило края соседей, а рамка с бейджем
       и так однозначны. */
    &._selected {
        border-color: var(--bricks-primary);
        border-width: 0.2rem;
    }

    &._skeleton {
        cursor: default;
    }

    /* Приёмник — та же плитка, но пунктиром и без превью: в ряду с файлами он
       обязан читаться как место, а не как ещё один файл. */
    &._upload {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border-style: dashed;
        background: var(--bricks-base-50);
        flex-direction: column;
        gap: 0.4rem;

        &:hover {
            border-color: var(--bricks-primary);
            background: var(--bricks-primary-50);
        }
    }
}

/* Окно превью — единственное место плитки, которое форсирует светлые токены:
   картинка и снимок страницы остаются на светлой подложке, как канвас. */
.thumb {
    --bricks-base-100: #f3f4f6;
    --bricks-base-400: #9ca3af;

    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 12.6rem;
    background: var(--bricks-base-100);
}

.placeholderIcon {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.videoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

/* Плашка кита в круглом исполнении: своих цветов не задаём, `tone="primary"` уже
   даёт заливку primary и подпись static/white. Квадрат под галочку — своя
   геометрия: формы «круг фиксированного размера» в ките нет и заводить её ради
   одного места не стоит. */
.selectedBadge {
    position: absolute;
    top: 0.8rem;
    left: 0.8rem;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    padding: 0;
}

/* Кнопка кита; переопределяется только скин: по макету это тёмный оверлей со
   белым глифом поверх картинки, а такого варианта в ките нет. Размер, фокус и
   семантику даёт `BricksButton`. */
.previewBtn {
    position: absolute;
    top: 0.8rem;
    right: 0.8rem;
    border-radius: var(--bricks-border-radius-control);
    background: var(--bricks-overlay-dark);
    color: var(--bricks-static-white);
    opacity: 0;

    &:hover {
        background: var(--bricks-overlay-dark);
        color: var(--bricks-static-white);
    }

    &:focus-visible {
        opacity: 1;
    }
}

.itemInfo {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.6rem 1rem;
}

.filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.meta {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.uploadIcon {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.uploadLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.uploadHint {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

/* Фон приезжает из `BricksSkeleton` — здесь он был `base-200` против `base-100`
   у остальных трёх наборов заглушек. */
.skeletonBar {
    width: 60%;
    height: 1rem;

    &._wide {
        width: 85%;
    }
}
</style>
