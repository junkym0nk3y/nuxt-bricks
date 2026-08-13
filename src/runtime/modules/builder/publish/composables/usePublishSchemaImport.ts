// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IParsedSchemaFile,
    IPublishSchemaImportTarget,
    IUsePublishSchemaImportOptions,
    IUsePublishSchemaImportReturn,
} from '../types/composables';

// Utils
import { requirePageRevision } from '../utils/requestErrors';
import { collectOrphanDeviceKeys } from '../utils/deviceImpact';

// Vue
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../stores/publish';

// Composables
import { useSchemaImageResolver } from '../../media/composables/useSchemaImageResolver';
import { useBricksDevices } from '../../../common/composables/useBricksDevices';
// #endregion

/**
 * Координатор импорта схемы на дашборде: подтверждение замены, резолвинг
 * картинок и запись схемы в страницу.
 *
 * Зачем координатор, а не обработчик в каждой точке входа. Импорт — операция из
 * нескольких асинхронных этапов (чтение файла, подтверждение, ожидание
 * медиатеки, модалка резолвера, PATCH), и всё это время пользователь свободно
 * ходит по списку страниц. Резолвер и подтверждение телепортированы в body,
 * поэтому переживают и смену выбранной страницы, и закрытие панели деталей.
 * Отсюда два инварианта:
 *
 * 1. Цель снимается **до** первого await и дальше не перечитывается. Иначе файл,
 *    выбранный для одной страницы, лёг бы в другую.
 * 2. Каждый этап сверяется с поколением операции. Одного сравнения id мало:
 *    уход со страницы и возврат на неё оставили бы прежнюю операцию годной, и
 *    подтверждение, данное до ухода, применилось бы к состоянию после.
 *
 * Резолвер один на обе точки входа: два экземпляра открыли бы две модалки
 * поверх друг друга и параллельно правили бы одно состояние медиатеки. Цена —
 * второй импорт не вытесняет первый, а получает отказ, пока тот не завершён.
 */
export function usePublishSchemaImport(
    options: IUsePublishSchemaImportOptions
): IUsePublishSchemaImportReturn {
    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();
    const imageResolver = useSchemaImageResolver();
    const { resolvePageDevices } = useBricksDevices();

    const pendingTarget = ref<IPublishSchemaImportTarget | null>(null);
    const pendingFile = ref<IParsedSchemaFile | null>(null);
    const isReplaceConfirmationOpen = ref(false);
    const isImporting = ref(false);
    const shouldMountResolver = ref(false);

    /**
     * Поколение операции импорта. Растёт на каждом старте и на каждом гашении;
     * этапы, стартовавшие в прежнем поколении, свои результаты не применяют.
     */
    let operationGeneration = 0;
    // #endregion

    // #region Computed
    const replaceConfirmationDescription = computed<string>(() => {
        const target = pendingTarget.value;
        const file = pendingFile.value;

        if (!target || !file) {
            return '';
        }

        return t('bricks.publish.dashboard.details.schema.replaceConfirm.description', {
            title: target.title,
            filename: file.filename,
        });
    });
    // #endregion

    // #region Methods
    /**
     * Выбрана ли страница-цель. Хост без списка страниц (создание из редактора)
     * проверки не передаёт: импорт в существующую страницу оттуда недоступен,
     * а единственная его операция — резолвинг схемы для новой страницы.
     *
     * @param pageId - Идентификатор страницы-цели.
     * @returns Актуальна ли цель импорта.
     */
    function isTargetSelected(pageId: string | number): boolean {
        return options.isTargetSelected?.(pageId) ?? true;
    }

    /**
     * Гасит операцию импорта: поднимает поколение, отменяет резолвер и убирает
     * подтверждение. Зовётся при смене выбранной страницы, закрытии панели и
     * размонтировании дашборда.
     */
    function cancelImport(): void {
        operationGeneration += 1;
        pendingTarget.value = null;
        pendingFile.value = null;
        isReplaceConfirmationOpen.value = false;
        imageResolver.handleCancel();
    }

    /**
     * Принимает выбранный файл и спрашивает подтверждение замены содержимого.
     *
     * Подтверждение обязательно, в отличие от редактора: там импорт кладёт схему
     * на канвас и ждёт «Сохранить», а здесь один промах по кнопке перезаписывает
     * страницу на сервере.
     *
     * Цель снимается здесь — синхронно, до подтверждения и резолвера: за это
     * время пользователь успевает выбрать в списке другую страницу.
     *
     * @param page - Страница, для которой выбрали файл.
     * @param file - Разобранный файл схемы.
     */
    function requestPageImport(page: TPublishedPageSummary, file: IParsedSchemaFile): void {
        // Цель уже не выбрана: чтение файла асинхронно и переживает смену
        // страницы, поэтому файл, выбранный для одной страницы, доезжает сюда
        // уже после ухода на другую. Подтверждение замены для неё было бы
        // предложением перезаписать не то, что открывал пользователь. Молча:
        // выбор относился к странице, которой на экране больше нет
        if (!isTargetSelected(page.id)) {
            return;
        }

        // Вытеснять идущий импорт нельзя: его резолвер уже ждёт ответа
        // пользователя, а второй `startResolving` оставил бы первый промис
        // неразрешённым
        if (isImporting.value) {
            options.onNotify(t('bricks.publish.dashboard.details.schema.busy'), 'error');
            return;
        }

        let target: IPublishSchemaImportTarget;

        try {
            target = {
                pageId: page.id,
                // Сводка без revision означала бы запись без precondition, то
                // есть молчаливую перезапись поверх чужих изменений
                expectedRevision: requirePageRevision(
                    page,
                    t('bricks.publish.dashboard.details.schema.importFailed')
                ),
                title: page.title || page.pagename,
            };
        } catch (error: unknown) {
            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.schema.importFailed'),
                'error'
            );
            return;
        }

        operationGeneration += 1;
        pendingTarget.value = target;
        pendingFile.value = file;
        isReplaceConfirmationOpen.value = true;
    }

    /**
     * Закрывает подтверждение и отменяет импорт целиком.
     */
    function closeReplaceConfirmation(): void {
        if (isImporting.value) {
            return;
        }

        cancelImport();
    }

    /**
     * Принимает подтверждение: закрывает диалог, сохраняя цель и файл.
     *
     * Резолвер здесь не запускается — он ждёт ухода диалога из DOM
     * (`handleConfirmationAfterLeave`): `force-mount` держит уезжающее
     * подтверждение до конца анимации, и открытая синхронно модалка резолвера
     * встала бы под ним со вторым focus trap.
     */
    function confirmReplace(): void {
        if (!pendingTarget.value || !pendingFile.value) {
            return;
        }

        isReplaceConfirmationOpen.value = false;
    }

    /**
     * Дожидается ухода подтверждения и применяет схему к странице.
     */
    async function handleConfirmationAfterLeave(): Promise<void> {
        const target = pendingTarget.value;
        const file = pendingFile.value;

        // Диалог уезжает и после отмены — там гасить уже нечего
        if (!target || !file) {
            return;
        }

        await applySchemaToPage(target, file);
    }

    /**
     * Прогоняет схему через резолвер и пишет её в страницу.
     *
     * @param target - Снимок цели импорта.
     * @param file - Разобранный файл переноса.
     */
    async function applySchemaToPage(
        target: IPublishSchemaImportTarget,
        file: IParsedSchemaFile
    ): Promise<void> {
        const startedIn = operationGeneration;
        isImporting.value = true;

        try {
            const { schema: resolved, isComparisonSkipped } = await imageResolver.startResolving(
                file.schema
            );

            // Отмена резолвера — отмена всей операции: подтверждение ещё ничего
            // не записало
            if (!resolved || !isOperationCurrent(startedIn, target)) {
                return;
            }

            // Схема и набор устройств уезжают одним PATCH'ем: ключи
            // `props.responsive` в файле относятся к его набору, и раздельная
            // запись оставила бы страницу в состоянии, где одно уже новое, а
            // другое ещё старое. Условие — по наличию набора, а не по `kind`:
            // файл, который про набор ничего не говорит (legacy-схема или
            // конверт без поля), не должен снимать набор целевой страницы
            await publishStore.patchPage(target.pageId, {
                schema: resolved,
                ...(file.viewportConfig === undefined
                    ? {}
                    : { viewportConfig: file.viewportConfig }),
                expectedRevision: target.expectedRevision,
            });

            // Один тост на исход, а не два подряд: toast — синглтон, и сообщение
            // об успехе немедленно затёрло бы предупреждение о пропущенном
            // сравнении с медиатекой. Оба показываются только после успешной
            // записи — иначе отказ сервера сопровождался бы обещанием, что схема
            // импортирована
            if (isComparisonSkipped) {
                options.onNotify(t('bricks.media.resolver.importedWithoutComparison'), 'error');
                return;
            }

            // Ключи устройств, которых в наборе страницы нет, остаются в схеме, но
            // CSS их не выбирает. Молчать об этом нельзя: раскладка разойдётся с
            // той, что была у источника, и это выглядит как баг рендера
            // Набор считается ПОСЛЕ записи: файл со своим набором его и задал, а
            // молчащий файл оставил странице её собственный
            const effectiveConfig =
                file.viewportConfig === undefined
                    ? (publishStore.getPageById(target.pageId)?.viewportConfig ?? null)
                    : file.viewportConfig;

            const orphanKeys = collectOrphanDeviceKeys(
                resolved.components,
                resolvePageDevices(effectiveConfig).map((device) => device.key)
            );

            if (orphanKeys.length > 0) {
                options.onNotify(
                    t('bricks.schema.importedWithOrphanDevices', { keys: orphanKeys.join(', ') }),
                    'error'
                );
                return;
            }

            options.onNotify(t('bricks.publish.toasts.schemaImported'), 'success');
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.schema.importFailed');
            options.onNotify(message, 'error');
        } finally {
            isImporting.value = false;
            pendingTarget.value = null;
            pendingFile.value = null;
        }
    }

    /**
     * Годна ли операция к записи: поколение не сменилось, страница ещё выбрана,
     * лежит в списке и не была перезаписана после подтверждения.
     *
     * @param startedIn - Поколение на момент старта этапа.
     * @param target - Снимок цели импорта.
     * @returns Можно ли писать схему.
     */
    function isOperationCurrent(startedIn: number, target: IPublishSchemaImportTarget): boolean {
        if (startedIn !== operationGeneration) {
            return false;
        }

        if (!isTargetSelected(target.pageId)) {
            return false;
        }

        const current = publishStore.getPageById(target.pageId);

        // Проверяется и наличие записи, и её revision: страницу могли удалить, а
        // совпадение revision у другой строки ничего не значит
        return Boolean(current) && current?.revision === target.expectedRevision;
    }

    /**
     * Прогоняет схему через резолвер картинок для создания новой страницы.
     * Подтверждение здесь не нужно — заменять нечего, страницы ещё нет.
     *
     * @param schema - Схема из выбранного файла.
     * @returns Схема к записи либо `null`, если импорт отменён или вытеснен.
     */
    async function resolveSchemaForCreate(schema: IBricksSchema): Promise<IBricksSchema | null> {
        if (isImporting.value) {
            options.onNotify(t('bricks.publish.dashboard.details.schema.busy'), 'error');
            return null;
        }

        operationGeneration += 1;
        const startedIn = operationGeneration;
        isImporting.value = true;

        try {
            const { schema: resolved, isComparisonSkipped } =
                await imageResolver.startResolving(schema);

            if (!resolved || startedIn !== operationGeneration) {
                return null;
            }

            // Предупреждение о пропущенном сравнении уходит до создания: сам
            // POST сообщит о своём исходе сам, а знать про непроверенные URL
            // пользователю нужно независимо от него
            if (isComparisonSkipped) {
                options.onNotify(t('bricks.media.resolver.importedWithoutComparison'), 'error');
            }

            return resolved;
        } finally {
            isImporting.value = false;
        }
    }
    // #endregion

    // #region Lifecycle
    // Латч монтирования модалки резолвера: сама модалка подключена лениво, но
    // без условия в шаблоне её чанк уехал бы к первому рендеру дашборда, то есть
    // ленивой она была бы только на бумаге. Обратно латч не снимается — иначе
    // компонент пересоздавался бы и терял leave-анимацию.
    watch(imageResolver.isModalOpen, (isOpen) => {
        if (isOpen) {
            shouldMountResolver.value = true;
        }
    });

    onScopeDispose(() => {
        cancelImport();
    });
    // #endregion

    return {
        isResolverModalOpen: imageResolver.isModalOpen,
        shouldMountResolver,
        resolverState: imageResolver.state,
        isReplaceConfirmationOpen,
        replaceConfirmationDescription,
        isImporting,
        requestPageImport,
        closeReplaceConfirmation,
        confirmReplace,
        handleConfirmationAfterLeave,
        resolveSchemaForCreate,
        cancelImport,
        handleResolverConfirm: imageResolver.handleConfirm,
        handleResolverCancel: imageResolver.handleCancel,
        handleResolverSkip: imageResolver.handleSkip,
        handleSetImageAction: imageResolver.setImageAction,
        handleSetGlobalAction: imageResolver.setGlobalAction,
    };
}
