// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';
import type { TMediaLightboxItem } from '../../media/types/media';
import type { IUsePublishTemplateSurfaceOptions } from '../types/composables';

// Utils
import { fetchPageRequest } from '../utils/publishApi';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Поверхность шаблонов на дашборде: подготовка источника из строки списка
 * страниц, предвыбранный шаблон формы создания и снимок для лайтбокса.
 *
 * Живёт в домене публикации, а не в шаблонах: чтобы сохранить страницу как
 * шаблон, нужна её СХЕМА, а сводка списка схему не несёт — её приходится читать
 * point-lookup'ом (`GET /api/bricks/:id`), то есть знать про страницы. Обратное
 * направление запрещено правилами слоёв: домен шаблонов о страницах не знает и
 * получает готовое содержимое значением.
 *
 * Здесь же предвыбор шаблона и снимок лайтбокса — состояние, которое иначе
 * лежало бы в хосте дашборда третьей машиной рядом со страницами и учётками.
 *
 * @param options - Показ тоста об отказе чтения.
 * @returns Состояние формы шаблона, предвыбор источника и снимок лайтбокса.
 */
export function usePublishTemplatesSurface(options: IUsePublishTemplateSurfaceOptions) {
    // #region Data
    const { t } = useI18n();

    const source = ref<ITemplateSaveSource | null>(null);
    const isModalOpen = ref(false);
    /** Страница, чью схему читают сейчас; `null` — чтения нет. */
    const preparingPageId = ref<string | null>(null);
    /** Шаблон, выбранный источником открываемой формы создания; `null` — нет. */
    const createTemplate = ref<TBricksTemplateSummary | null>(null);
    /** Снимок шаблона, открытый в лайтбоксе; `null` — закрыт. */
    const previewItem = ref<TMediaLightboxItem | null>(null);

    /**
     * Поколение подготовки: чтение схемы асинхронно, и за это время человек
     * успевает нажать действие у другой строки. Без счётчика доехавший первым
     * ответ открыл бы форму с содержимым не той страницы, которую выбрали
     * последней.
     */
    let preparationGeneration = 0;
    // #endregion

    // #region Methods
    /**
     * Читает страницу point-lookup'ом и открывает форму сохранения шаблона.
     *
     * Второй клик по другой строке НЕ отвергается: занятость видна только у своей
     * строки, а поколение ниже уже реализует last-click-wins — ранний `return`
     * делал кнопки остальных строк немыми, хотя выглядят они активными. Цена —
     * два параллельных GET на быстрый перещёлк; зато открывается ровно последний
     * выбор.
     *
     * Источник собирается ЦЕЛИКОМ из прочитанной строки, а не половина из неё,
     * половина из сводки списка: список мог отстать (страницу сохранил другой
     * редактор), и шаблон вышел бы из двух поколений данных — свежая схема со
     * старым оформлением и чужим кадром.
     *
     * @param page - Страница-источник из списка; из неё берётся только `id`.
     */
    async function requestFromPage(page: TPublishedPageSummary): Promise<void> {
        preparationGeneration += 1;

        const generation = preparationGeneration;

        preparingPageId.value = String(page.id);

        try {
            const fullPage = await fetchPageRequest(page.id);

            if (generation !== preparationGeneration) {
                return;
            }

            const label = fullPage.title || fullPage.pagename;

            source.value = {
                suggestedName: label,
                suggestedDescription: fullPage.description ?? '',
                schema: fullPage.schema,
                pageMeta: {
                    layout: fullPage.layout,
                    backgroundColor: fullPage.backgroundColor,
                    viewportConfig: fullPage.viewportConfig,
                },
                // Кадр страницы: сервер скопирует его в собственный файл шаблона
                thumbnailSourceUrl: fullPage.thumbnailUrl,
                pageLabel: label,
                pageAddressPath: getPublishedPagePath(
                    toPageAddress(fullPage.pagename, fullPage.urlPrefix)
                ),
                blocksCount: fullPage.schema.components.length,
                pageUpdatedAt: fullPage.updatedAt || fullPage.createdAt,
            };
            isModalOpen.value = true;
        } catch (error: unknown) {
            if (generation !== preparationGeneration) {
                return;
            }

            console.error('[Publish] Failed to read the page schema for a template:', error);
            options.onNotify(t('bricks.templates.errors.sourceReadFailed'), 'error');
        } finally {
            if (generation === preparationGeneration) {
                preparingPageId.value = null;
            }
        }
    }

    /**
     * Закрывает форму. Источник остаётся до следующего открытия: модалку держит в
     * DOM `force-mount` до конца leave-анимации, и снятый источник опустошил бы
     * карточку страницы прямо под уезжающим окном.
     */
    function close(): void {
        isModalOpen.value = false;
    }

    /**
     * Делает шаблон источником следующей открываемой формы создания страницы.
     *
     * @param template - Шаблон-источник.
     */
    function selectForCreate(template: TBricksTemplateSummary): void {
        createTemplate.value = template;
    }

    /**
     * Снимает предвыбор источника: форму открыли кнопкой шапки, а не карточкой.
     */
    function clearCreateSelection(): void {
        createTemplate.value = null;
    }

    /**
     * Готовит снимок шаблона для лайтбокса; шаблон без снимка не открывается.
     *
     * @param template - Шаблон.
     */
    function previewThumbnail(template: TBricksTemplateSummary): void {
        if (!template.thumbnailUrl) {
            return;
        }

        previewItem.value = {
            url: template.thumbnailUrl,
            mimeType: 'image/webp',
            alt: template.name,
            filename: `${template.name}.webp`,
        };
    }

    /**
     * Закрывает лайтбокс шаблона.
     */
    function closePreview(): void {
        previewItem.value = null;
    }
    // #endregion

    return {
        source: computed<ITemplateSaveSource | null>(() => source.value),
        isModalOpen: computed<boolean>(() => isModalOpen.value),
        preparingPageId: computed<string | null>(() => preparingPageId.value),
        createTemplate: computed<TBricksTemplateSummary | null>(() => createTemplate.value),
        previewItem: computed<TMediaLightboxItem | null>(() => previewItem.value),
        requestFromPage,
        close,
        selectForCreate,
        clearCreateSelection,
        previewThumbnail,
        closePreview,
    };
}
