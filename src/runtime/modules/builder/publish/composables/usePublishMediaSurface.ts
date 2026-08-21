// #region Imports
// Types
import type {
    IBricksMediaOptimization,
    IMediaItem,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import type {
    IUsePublishMediaSurfaceOptions,
    IUsePublishMediaSurfaceReturn,
} from '../types/composables';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
import { DEFAULT_MEDIA_OPTIMIZATION } from '../../../common/constants/mediaOptimization';
import { getBricksErrorMessage } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaStore } from '../../media/stores/media';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaUpload } from '../../media/composables/useMediaUpload';
// #endregion

/**
 * Поверхность медиатеки на дашборде: загрузка, выбранный файл и его правки.
 *
 * Живёт в хосте дашборда, а не в самом разделе, потому что состояние медиатеки
 * разорвано между тремя местами разметки. Кнопка загрузки с поповером параметров
 * стоит в шапке дашборда (там же, где «Создать страницу» у страниц), тело
 * раздела рисует дорожку категорий и сетку, а свойства выбранного файла уезжают
 * в панель деталей — в тот же слот оболочки, что и панель страницы. Раздел,
 * который держал бы это у себя, не смог бы отдать шапке ни прогресс, ни
 * параметры оптимизации.
 *
 * Стора для этого нет намеренно: параметры оптимизации и выбранная категория
 * относятся к сессии работы с медиатекой, а не к самой медиатеке, — уход с
 * раздела обязан вернуть их к дефолтам конфига (`resetSurface`).
 *
 * @param options - Показ тостов об отказах.
 * @returns Состояние медиатеки и действия над файлом.
 */
export function usePublishMediaSurface(
    options: IUsePublishMediaSurfaceOptions
): IUsePublishMediaSurfaceReturn {
    // #region Data
    const { t } = useI18n();
    const mediaStore = useMediaStore();
    const { canEdit, canDelete } = useBuilderPermissions();

    const categoryFilter = ref<string>(ALL_MEDIA_CATEGORIES_FILTER);
    const selectedItemId = ref<number | null>(null);
    const previewItem = ref<IMediaItem | null>(null);
    const isDeleteConfirmOpen = ref(false);
    const isDeleting = ref(false);

    /**
     * Параметры загрузки. Инициализируются общими дефолтами и накрываются
     * дефолтами конфига сразу после `useMediaUpload` — раньше конфиг взять
     * негде, а объявить ref позже нельзя: композабл читает его в колбэке.
     */
    const uploadOptimization = ref<IBricksMediaOptimization>({ ...DEFAULT_MEDIA_OPTIMIZATION });

    /** Летящее чтение списка; `null` — чтения нет. См. `ensureMedia`. */
    let pendingLoad: Promise<void> | null = null;

    const { maxImageSizeMb, maxVideoSizeMb, defaultOptimization, uploadProgress, uploadFiles } =
        useMediaUpload({
            resolveCategory: resolveUploadCategory,
            resolveOptimization: () => uploadOptimization.value,
            onError: (message: string) => options.onNotify(message, 'error'),
        });

    uploadOptimization.value = { ...defaultOptimization };
    // #endregion

    // #region Computed
    /**
     * Выбранный файл — из стора, а не снимком на момент клика: панель деталей
     * обязана видеть результат PATCH'а и исчезновение файла после удаления.
     */
    const selectedItem = computed<IMediaItem | null>(
        () => mediaStore.items.find((item) => item.id === selectedItemId.value) ?? null
    );

    /**
     * Счётчик рейла. `null` до первого успешного ответа: длина списка сама по
     * себе о составе медиатеки не говорит — только что загруженный файл лежит в
     * нём ещё до всякого GET'а.
     */
    const mediaCount = computed<number | null>(() =>
        mediaStore.hasLoadedItemsSnapshot ? mediaStore.items.length : null
    );

    // #endregion

    // #region Methods
    /**
     * Категория загружаемых файлов — активная категория дорожки. При фильтре
     * «Все» файл сохраняется без категории и виден только там же.
     *
     * @returns Slug категории или null.
     */
    function resolveUploadCategory(): string | null {
        return categoryFilter.value !== ALL_MEDIA_CATEGORIES_FILTER ? categoryFilter.value : null;
    }

    /**
     * Читает список файлов, если достоверного снимка ещё нет.
     *
     * Отказ остаётся тостом и раздел не уносит: медиатека — не тот раздел, ради
     * которого стоит рушить дашборд, а повтор придёт со следующим открытием.
     */
    async function ensureMedia(): Promise<void> {
        if (mediaStore.hasLoadedItemsSnapshot) {
            return;
        }

        // Второй вход в раздел ждёт уже летящее чтение, а не заводит своё.
        // Сам стор этого не делает намеренно: у списка latest-wins по номеру
        // запроса — модалка при каждом открытии обязана читать заново. Здесь же
        // два параллельных чтения дали бы и лишний GET, и худшее: поздний отказ
        // обесценил бы уже пришедший успех, и снимка не осталось бы вовсе
        if (pendingLoad) {
            return pendingLoad;
        }

        pendingLoad = mediaStore
            .loadItems()
            .catch((error: unknown) => {
                options.onNotify(
                    getBricksErrorMessage(error, t('bricks.media.loadFailedCheckDb')),
                    'error'
                );
            })
            .finally(() => {
                pendingLoad = null;
            });

        return pendingLoad;
    }

    /**
     * Загружает набор файлов.
     *
     * Проверка права — не дубль скрытой кнопки: приёмник ловит перетаскивание на
     * всю сетку раздела и остался бы рабочим входом в загрузку у роли, для
     * которой кнопка уже убрана.
     *
     * @param files - Выбранные или брошенные файлы.
     */
    async function handleUploadFiles(files: File[]): Promise<void> {
        if (!canEdit.value) {
            return;
        }

        await uploadFiles(files);
    }

    /**
     * Принимает параметры оптимизации из поповера шапки.
     *
     * @param value - Новые параметры.
     */
    function setOptimization(value: IBricksMediaOptimization): void {
        uploadOptimization.value = value;
    }

    /**
     * Открывает панель деталей файла.
     *
     * @param item - Выбранный файл.
     */
    function selectItem(item: IMediaItem): void {
        selectedItemId.value = item.id;
    }

    /**
     * Закрывает панель деталей.
     */
    function closeDetails(): void {
        selectedItemId.value = null;
    }

    /**
     * Открывает файл во весь экран.
     *
     * @param item - Файл.
     */
    function openPreview(item: IMediaItem): void {
        previewItem.value = item;
    }

    /**
     * Закрывает полноэкранный просмотр.
     */
    function closePreview(): void {
        previewItem.value = null;
    }

    /**
     * Сохраняет правку имени и alt выбранного файла; отказ — тост.
     *
     * @param meta - Изменённые поля.
     */
    async function updateMeta(meta: IMediaUpdateMetaRequest): Promise<void> {
        const item = selectedItem.value;

        if (!item || !canEdit.value) {
            return;
        }

        try {
            await mediaStore.updateItemMeta(item.id, meta);
        } catch (error: unknown) {
            options.onNotify(
                getBricksErrorMessage(error, t('bricks.media.updateMetaFailed')),
                'error'
            );
        }
    }

    /**
     * Меняет категорию выбранного файла; `null` — снять категорию.
     *
     * @param category - Новая категория или null.
     */
    async function updateCategory(category: string | null): Promise<void> {
        const item = selectedItem.value;

        if (!item || !canEdit.value) {
            return;
        }

        try {
            await mediaStore.updateItemCategory(item.id, category);
        } catch (error: unknown) {
            options.onNotify(
                getBricksErrorMessage(error, t('bricks.media.updateCategoryFailed')),
                'error'
            );
        }
    }

    /**
     * Спрашивает подтверждение удаления выбранного файла.
     */
    function requestDelete(): void {
        if (selectedItemId.value === null) {
            return;
        }

        isDeleteConfirmOpen.value = true;
    }

    /**
     * Закрывает подтверждение удаления.
     */
    function closeDeleteConfirm(): void {
        isDeleteConfirmOpen.value = false;
    }

    /**
     * Удаляет выбранный файл.
     *
     * Определённый отказ сервера оставляет подтверждение открытым — файл на
     * месте, повтор безопасен и под рукой. Обрыв по потолку ожидания закрывает
     * его: исход неизвестен, файл мог быть удалён, и повтор получил бы 404.
     */
    async function confirmDelete(): Promise<void> {
        const id = selectedItemId.value;

        if (id === null || !canDelete.value) {
            return;
        }

        isDeleting.value = true;

        try {
            await mediaStore.removeItem(id);
            selectedItemId.value = null;
            isDeleteConfirmOpen.value = false;
        } catch (error: unknown) {
            options.onNotify(getBricksErrorMessage(error, t('bricks.media.deleteFailed')), 'error');

            if (isRequestTimeoutError(error)) {
                isDeleteConfirmOpen.value = false;
            }
        } finally {
            isDeleting.value = false;
        }
    }

    /**
     * Сбрасывает сессию работы с медиатекой: уход с раздела обязан вернуть
     * фильтр, выбор и параметры загрузки к исходным — иначе следующее открытие
     * показывало бы чужую категорию и грузило файлы с чужими настройками.
     *
     * Подтверждение удаления гасится здесь же: оно рендерится в хосте, вне
     * раздела, и само по себе не закрывается.
     */
    function resetSurface(): void {
        categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
        selectedItemId.value = null;
        previewItem.value = null;
        isDeleteConfirmOpen.value = false;
        uploadOptimization.value = { ...defaultOptimization };
    }
    // #endregion

    return {
        categoryFilter,
        maxImageSizeMb,
        maxVideoSizeMb,
        defaultOptimization,
        uploadOptimization,
        uploadProgress,
        selectedItemId,
        selectedItem,
        previewItem,
        mediaCount,
        isDeleteConfirmOpen,
        isDeleting,
        ensureMedia,
        uploadFiles: handleUploadFiles,
        setOptimization,
        selectItem,
        closeDetails,
        openPreview,
        closePreview,
        updateMeta,
        updateCategory,
        requestDelete,
        closeDeleteConfirm,
        confirmDelete,
        resetSurface,
    };
}
