// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';
import type {
    IUseBuilderTemplateSaveOptions,
    IUseBuilderTemplateSaveReturn,
} from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Сохранение канваса как шаблона из билдера (третий пункт сплит-кнопки).
 *
 * Источник собирается на месте, синхронно: в шаблон уезжает то, что СЕЙЧАС на
 * канвасе, вместе с несохранёнными правками — читать страницу из базы здесь было
 * бы прямо неверно.
 *
 * Миниатюра — кадр последнего сохранения страницы (`thumbnailUrl` её строки в
 * списке): своего снимка у несохранённых правок нет, а съёмка канваса на месте
 * потребовала бы ещё одной ручки загрузки и своего namespace ключей. Модалка об
 * этом говорит подписью, поэтому расхождение картинки с содержимым не выглядит
 * поломкой. У страницы, которую ни разу не сохраняли, кадра нет вовсе — шаблон
 * останется с плейсхолдером.
 *
 * @param options - Готовность сессии и показ тоста.
 * @returns Состояние формы шаблона и запрос её открытия.
 */
export function useBuilderTemplateSave(
    options: IUseBuilderTemplateSaveOptions
): IUseBuilderTemplateSaveReturn {
    // #region Data
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    const source = ref<ITemplateSaveSource | null>(null);
    const isModalOpen = ref(false);
    /**
     * Латч монтирования формы: сама она подключена лениво, но без условия в
     * шаблоне её чанк уехал бы к первому рендеру билдера. Обратно латч не
     * снимается — иначе компонент пересоздавался бы и терял leave-анимацию.
     */
    const shouldMountModal = ref(false);
    // #endregion

    // #region Methods
    /**
     * Собирает источник из канваса и формы публикации и открывает форму шаблона.
     *
     * Гард сессии здесь, а не у вызывающего: до её готовности схемы на канвасе
     * ещё нет, и шаблон унёс бы пустой холст — то же правило, что у сохранения
     * страницы.
     */
    function requestFromCanvas(): void {
        if (!options.isSessionReady.value) {
            options.showToast(t('bricks.publish.session.saveBlocked'), 'error');
            return;
        }

        const schema = componentsStore.exportSchema();
        const formState = publishStore.currentFormState;
        const savedPage =
            publishStore.editingPageId === null
                ? null
                : (publishStore.getPageById(publishStore.editingPageId) ?? null);
        const label = formState.title || formState.pagename;

        source.value = {
            suggestedName: label,
            suggestedDescription: formState.description ?? '',
            schema,
            pageMeta: {
                layout: formState.layout || null,
                backgroundColor: formState.backgroundColor || null,
                viewportConfig: formState.viewportConfig ?? null,
            },
            thumbnailSourceUrl: savedPage?.thumbnailUrl ?? null,
            pageLabel: label,
            pageAddressPath: formState.pagename
                ? getPublishedPagePath(toPageAddress(formState.pagename, formState.urlPrefix))
                : '',
            blocksCount: schema.components.length,
            // `null` — страницы в базе ещё нет: модалка скажет, что уедет только
            // то, что на канвасе
            pageUpdatedAt: savedPage?.updatedAt ?? null,
        };
        shouldMountModal.value = true;
        isModalOpen.value = true;
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
     * Шаблон сохранён: закрываем форму и сообщаем.
     *
     * @param template - Сохранённый шаблон.
     */
    function handleSaved(template: TBricksTemplateSummary): void {
        close();
        options.showToast(t('bricks.templates.toasts.saved', { name: template.name }), 'success');
    }
    // #endregion

    return {
        source: computed<ITemplateSaveSource | null>(() => source.value),
        isModalOpen: computed<boolean>(() => isModalOpen.value),
        shouldMountModal: computed<boolean>(() => shouldMountModal.value),
        requestFromCanvas,
        close,
        handleSaved,
    };
}
