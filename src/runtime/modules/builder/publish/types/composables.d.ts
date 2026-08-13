/**
 * Типы композаблов домена publish.
 */

import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { ComputedRef, Ref } from 'vue';
import type {
    IPageVersion,
    IPageVersionSummary,
    TPublishedPageSummary,
} from '../../../common/types/bricks-api';
import type { IBricksSchema } from '../../../common/types/brick';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type {
    IImageResolverState,
    TImageResolveAction,
} from '../../media/types/schemaImageResolver';

// #region usePublishVersionRestore
/**
 * Опции `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * Страница и версия, ожидающие подтверждения отката.
 */
export interface IPendingVersionRestore {
    page: TPublishedPageSummary;
    version: IPageVersionSummary;
}

/**
 * Возвращаемое значение `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreReturn {
    isRestoreConfirmationOpen: Ref<boolean>;
    isRestoring: Ref<boolean>;
    restoreConfirmationDescription: ComputedRef<string>;
    requestRestoreVersion: (page: TPublishedPageSummary, version: IPageVersionSummary) => void;
    closeRestoreConfirmation: (force?: boolean) => void;
    confirmRestoreVersion: () => Promise<void>;
}
// #endregion

// #region usePublishPageVersions
/**
 * Возвращаемое значение `usePublishPageVersions`.
 */
export interface IUsePublishPageVersionsReturn {
    versions: Ref<IPageVersionSummary[]>;
    isLoading: ComputedRef<boolean>;
    loadVersions: (pageId: string | number) => Promise<void>;
    /**
     * Открывает превью версии в новой вкладке. Синхронно: снапшот тянет сервер по
     * `?version=`, клиенту грузить нечего. `false` — вкладка не открылась.
     */
    previewVersion: (page: TPublishedPageSummary, versionId: number) => boolean;
    /** Очищает список и обесценивает летящий запрос (переключение страницы). */
    resetVersions: () => void;
}
// #endregion

// #region usePublishPagesData
/**
 * Данные списка страниц в кеше `useAsyncData('bricks-pages')`.
 *
 * Самих страниц здесь нет: список лежит в `publishStore.publishedPages` —
 * единственном источнике и для дашборда, и для билдера. Вторая копия в payload
 * разъехалась бы с ним при первой же локальной записи (создание, удаление,
 * переключение публикации), а на SSR ещё и удвоила бы вес страницы: состояние
 * сторов Pinia и так уезжает клиенту payload'ом.
 */
export interface IPublishPagesData {
    /**
     * SSR-прогон деградировал: список не загружен, и его обязан догрузить
     * клиент. Поле обязательное, а не опциональное, чтобы ветка, забывшая его
     * выставить, не выдавала пустой список за загруженный.
     *
     * Отказ на клиенте маркером не кодируется — он живёт в `error` того же
     * `useAsyncData`: там его видно вызывающему, и повтор возможен сразу.
     */
    isPartial: boolean;
}

/**
 * Опции `usePublishPagesData`.
 */
export interface IUsePublishPagesDataOptions {
    /** Сообщает об отказе загрузки на клиенте (тост дашборда). */
    onLoadFailed: () => void;
}

/**
 * Возвращаемое значение `usePublishPagesData`.
 */
export interface IUsePublishPagesDataReturn {
    isLoadingPages: ComputedRef<boolean>;
}
// #endregion

// #region usePublishDetailsUrl
/**
 * Реактивные поля формы панели деталей, участвующие в live-URL.
 */
export interface IPublishDetailsUrlFields {
    pagename: Ref<string>;
    urlPrefix: Ref<string>;
    subdomain: Ref<string>;
}

/**
 * Возвращаемое значение `usePublishDetailsUrl`.
 */
export interface IPublishDetailsUrlReturn {
    liveUrl: ComputedRef<string>;
    copyLiveUrl: () => Promise<boolean>;
}
// #endregion

// #region useSchemaFileTransfer
/**
 * Разобранный и провалидированный JSON-файл схемы вместе с метаданными выбора.
 *
 * Метаданные лежат рядом со схемой одним объектом, а не отдельными ref'ами:
 * подтверждение замены печатает имя файла, а строка выбора в модалке создания —
 * имя и число блоков. Раздельное хранение расходилось бы при повторном выборе
 * файла (новая схема, прежнее имя).
 */
export interface IParsedSchemaFile {
    schema: IBricksSchema;
    filename: string;
    /** Число корневых блоков схемы — то, что показывает строка выбранного файла. */
    blocksCount: number;
    /**
     * Откуда взялся файл: `envelope` несёт набор устройств, `legacy` — голая
     * схема из файлов, записанных до появления набора.
     *
     * Различать обязательно: у legacy-файла набора нет, и подставлять ему
     * какой-либо — значит менять раскладку целевой страницы без спроса.
     */
    kind: 'envelope' | 'legacy';
    /**
     * Набор устройств из файла. Три состояния, и третье обязательно:
     *
     * - набор — файл описывает свои ступени;
     * - `null` — файл прямо говорит «страница наследует набор проекта»;
     * - `undefined` — файл про набор не говорит **ничего**: legacy-схема или
     *   конверт, в котором поля нет. Целевая страница сохраняет свой набор.
     *
     * Без третьего состояния конверт без поля читался бы как явный `null` и
     * молча снимал бы собственный набор страницы, в которую импортируют.
     */
    viewportConfig?: TBricksPageDeviceSet | null;
}

/**
 * Формат файла переноса страницы.
 *
 * Версия в файле, а не в имени: голая схема (файлы до появления набора
 * устройств) продолжает приниматься, и отличить её от конверта нужно по
 * содержимому.
 */
export interface IBricksPageTransferFile {
    version: 1;
    schema: IBricksSchema;
    viewportConfig: TBricksPageDeviceSet | null;
}

/**
 * Конверт после разбора чужого файла.
 *
 * Отличается от записываемого формата одним: поля `viewportConfig` в файле может
 * не быть вовсе. Свои файлы пакет всегда пишет с ним, но разбирать приходится и
 * то, что собрал кто-то другой.
 */
export interface IParsedEnvelope extends Omit<IBricksPageTransferFile, 'viewportConfig'> {
    viewportConfig?: TBricksPageDeviceSet | null;
}

/**
 * Исход чтения выбранного файла. Union, а не колбэк: у двух потребителей разные
 * жизненные циклы — панель деталей применяет схему сразу, модалка создания
 * держит файл до сабмита, — и общий `onImport` навязывал бы им один.
 */
export type TSchemaFileReadResult =
    | { status: 'success'; file: IParsedSchemaFile }
    | { status: 'error'; message: string };

/**
 * Минимальная форма файлового input'а, нужная чтению: выбранные файлы и
 * сбрасываемое значение. `HTMLInputElement` ей соответствует структурно.
 *
 * Чтение принимает эту форму, а не `Event`: событие приносило бы цель, которую
 * всё равно приходится приводить к типу, — а композабл уже владеет ref'ом
 * input'а. Заодно чтение проверяется без DOM.
 */
export interface ISchemaFileInput {
    files: FileList | File[] | null;
    value: string;
}

/**
 * Возвращаемое значение `useSchemaFileTransfer`.
 */
export interface IUseSchemaFileTransferReturn {
    fileInputRef: Ref<HTMLInputElement | null>;
    openFilePicker: () => void;
    /**
     * Читает выбранный файл; `null` — файла не было (диалог отменён).
     * `value` input'а сбрасывается на любом исходе, иначе повторный выбор того же
     * файла не поднимет `change`.
     */
    readSelectedFile: (input: ISchemaFileInput | null) => Promise<TSchemaFileReadResult | null>;
    /**
     * Скачивает страницу конвертом: схема вместе с набором устройств. Без
     * набора round-trip терял бы описание диапазонов, и импортированная
     * страница показывала бы `props.responsive` ступеней, которых у неё нет.
     */
    downloadSchema: (
        schema: IBricksSchema,
        filename: string,
        viewportConfig: TBricksPageDeviceSet | null
    ) => void;
}
// #endregion

// #region usePublishSchemaImport
/**
 * Цель импорта в существующую страницу, снятая в момент выбора файла.
 *
 * Снимок, а не ссылка на выбранную страницу: между выбором файла и PATCH'ем
 * стоят чтение файла, подтверждение и резолвер картинок, и в этом окне
 * пользователь успевает выбрать в списке другую страницу. `expectedRevision`
 * тоже из момента выбора — подтверждение относится к тому состоянию, которое
 * пользователь видел, а не к тому, что успело приехать после.
 */
export interface IPublishSchemaImportTarget {
    pageId: string | number;
    expectedRevision: number;
    title: string;
}

/**
 * Опции `usePublishSchemaImport`.
 */
export interface IUsePublishSchemaImportOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
    /**
     * Актуальна ли цель: id ещё выбран в списке (панель деталей открыта).
     *
     * Необязательна: проверка принадлежит хосту со списком страниц. Там, где
     * списка нет (создание страницы из редактора), импорт в существующую
     * страницу недоступен, и сверять нечего.
     */
    isTargetSelected?: (pageId: string | number) => boolean;
}

/**
 * Возвращаемое значение `usePublishSchemaImport`.
 */
export interface IUsePublishSchemaImportReturn {
    isResolverModalOpen: Ref<boolean>;
    /** Модалку резолвера уже открывали — с этого момента её чанк смонтирован. */
    shouldMountResolver: Ref<boolean>;
    resolverState: IImageResolverState;
    isReplaceConfirmationOpen: Ref<boolean>;
    replaceConfirmationDescription: ComputedRef<string>;
    isImporting: Ref<boolean>;
    requestPageImport: (page: TPublishedPageSummary, file: IParsedSchemaFile) => void;
    closeReplaceConfirmation: () => void;
    confirmReplace: () => void;
    /** Запускает резолвер после ухода диалога подтверждения из DOM. */
    handleConfirmationAfterLeave: () => Promise<void>;
    /**
     * Прогоняет схему через резолвер картинок для создания страницы.
     * `null` — импорт отменён или вытеснен; вызывающий не создаёт страницу.
     */
    resolveSchemaForCreate: (schema: IBricksSchema) => Promise<IBricksSchema | null>;
    /** Гасит операцию: смена выбранной страницы, закрытие панели, размонтирование. */
    cancelImport: () => void;
    handleResolverConfirm: () => void;
    handleResolverCancel: () => void;
    handleResolverSkip: () => void;
    handleSetImageAction: (url: string, action: TImageResolveAction) => void;
    handleSetGlobalAction: (action: TImageResolveAction) => void;
}
// #endregion

// #region usePublishPreview
/**
 * Возвращаемое значение `usePublishPreview`.
 */
export interface IUsePublishPreviewReturn {
    previewCurrentPage: (schema: IBricksSchema) => IBricksPageAddress | null;
    /** Превью сохранённой версии: `?version=` в превью-роуте, без localStorage. */
    previewPageVersion: (
        address: IBricksPageAddress,
        versionId: number
    ) => IBricksPageAddress | null;
    generatePreviewUrl: (address: IBricksPageAddress, versionId?: number) => string;
}
// #endregion
