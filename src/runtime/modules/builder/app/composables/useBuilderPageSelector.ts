// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IBuilderPageSelectorOptions,
    IUseBuilderPageSelectorReturn,
} from '../types/composables';

// Utils
import { BRICKS_ROUTE_NAMES } from '../../../common/constants/routes';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useRouter } from '#imports';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';

// Composables
import { usePublishSchemaImport } from '../../publish/composables/usePublishSchemaImport';
// #endregion

/**
 * Дольше обычного тоста: сообщение объясняет разошедшееся состояние и то, что
 * делать дальше, — прочитать его нужно успеть.
 */
const REPLACED_PAGE_NOTICE_MS = 10000;

/**
 * Обвязка селектора страниц в тулбаре: догрузка и освежение списка, переход на
 * выбранную страницу и создание новой.
 *
 * Живёт рядом с composition root, а не в самом тулбаре: список принадлежит
 * publish-стору, а навигация — маршрутизатору страницы, и тулбар не должен знать
 * ни о том, ни о другом.
 *
 * @param options - Идентичность открытой сессии и способ её переоткрыть.
 */
export function useBuilderPageSelector(
    options: IBuilderPageSelectorOptions
): IUseBuilderPageSelectorReturn {
    // #region Data
    const router = useRouter();
    const publishStore = usePublishStore();
    const { t } = useI18n();

    const isPagesRefreshing = ref(false);

    // Незавершённое освежение: частые открытия попапа не должны множить запросы
    let pagesRefreshPromise: Promise<void> | null = null;

    // Создание страницы модалкой менеджера страниц — вместе с резолвером картинок
    // импортируемой схемы, иначе импорт вёл бы себя по-разному в двух местах.
    // Латч монтирования обратно не снимается: снятый, он пересоздавал бы
    // компонент и терял анимацию закрытия
    const shouldMountCreatePageModal = ref(false);
    const isCreatePageModalOpen = ref(false);
    const schemaImport = usePublishSchemaImport({ onNotify: options.showToast });

    // Поколение сессии на момент открытия модалки создания. Страница билдера
    // переживает смену `:pagename` (статический page key), поэтому модалка и её
    // запрос живут дольше сессии, в которой их открыли
    let createStartedIn: number | null = null;
    // #endregion

    // #region Methods
    /**
     * Догружает и освежает список страниц к открытию селектора: страницы создают
     * и удаляют и в соседней вкладке, а список живёт в сторе до перезагрузки
     * приложения.
     *
     * Отказ гасится в консоль: список — кеш, а не данные сессии. Тост объявил бы
     * сломанным попап, в котором лежит вполне пригодный прежний список, а
     * блокирующий экран сессии к нему тем более не относится.
     */
    async function handleOpenPageSelector(): Promise<void> {
        if (pagesRefreshPromise) {
            return;
        }

        isPagesRefreshing.value = true;
        const request =
            publishStore.pagesLoadedAt === null
                ? publishStore.ensurePagesLoaded()
                : publishStore.loadAllPages();
        pagesRefreshPromise = request;

        try {
            await request;
        } catch (error: unknown) {
            console.warn('[Builder] Failed to refresh pages for selector:', error);
        } finally {
            if (pagesRefreshPromise === request) {
                pagesRefreshPromise = null;
                isPagesRefreshing.value = false;
            }
        }
    }

    /**
     * Переходит к выбранной странице.
     *
     * Несохранённые правки переживают переход: автосейв синхронно сбрасывает
     * черновик на смене маршрута, а на возврате его предложат восстановить.
     *
     * Совпадение адреса при другом идентификаторе — особый случай: страницу по
     * этому адресу заменили в другом месте (удалили и создали заново). Открыть
     * её здесь нельзя: маршрут тот же, поэтому сессию пришлось бы переоткрывать
     * напрямую, а такой переход обходит синхронный сброс черновика и приводит к
     * его удалению — bootstrap признаёт запись принадлежащей прежней странице.
     * Правки открытой страницы к этому моменту и так не сохранить (её строки
     * больше нет в списке), и черновик — единственная их копия, поэтому вместо
     * молчаливой замены содержимого объясняем ситуацию: перезагрузка редактора
     * остаётся за пользователем, и до неё он может сохранить копию.
     *
     * @param page - Выбранная страница.
     */
    async function handleSelectPage(page: TPublishedPageSummary): Promise<void> {
        if (String(page.id) === String(options.sessionPageId.value)) {
            return;
        }

        if (page.pagename === options.routePagename.value) {
            options.showToast(
                t('bricks.toolbar.pageSelector.replaced', { pagename: page.pagename }),
                'error',
                REPLACED_PAGE_NOTICE_MS
            );
            return;
        }

        await router.push({
            name: BRICKS_ROUTE_NAMES.builderPage,
            params: { pagename: page.pagename },
        });
    }

    /**
     * Открывает модалку создания страницы.
     */
    function handleOpenCreatePage(): void {
        createStartedIn = options.sessionToken.capture();
        shouldMountCreatePageModal.value = true;
        isCreatePageModalOpen.value = true;
    }

    /**
     * Закрывает модалку создания страницы.
     */
    function handleCloseCreatePage(): void {
        isCreatePageModalOpen.value = false;
    }

    /**
     * Уводит в редактор созданной страницы.
     *
     * Переход — только если сессия та же, в которой открывали модалку. Резолвер
     * картинок и сам POST переживают навигацию (страница билдера не
     * перемонтируется при смене `:pagename`), и увести пользователя с той
     * страницы, куда он тем временем ушёл, значило бы отменить его же действие.
     * О созданной странице в этом случае сообщаем тостом — она создана, и знать
     * об этом нужно.
     *
     * @param pagename - ЧПУ созданной страницы.
     */
    async function handlePageCreated(pagename: string): Promise<void> {
        isCreatePageModalOpen.value = false;

        if (createStartedIn !== null && !options.sessionToken.isCurrent(createStartedIn)) {
            options.showToast(t('bricks.toolbar.pageSelector.created', { pagename }), 'success');
            return;
        }

        await router.push({ name: BRICKS_ROUTE_NAMES.builderPage, params: { pagename } });
    }
    // #endregion

    return {
        isPagesRefreshing,
        shouldMountCreatePageModal,
        isCreatePageModalOpen,
        schemaImport,
        handleOpenPageSelector,
        handleSelectPage,
        handleOpenCreatePage,
        handleCloseCreatePage,
        handlePageCreated,
    };
}
