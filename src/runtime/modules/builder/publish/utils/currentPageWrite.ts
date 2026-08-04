/**
 * Запись текущего лендинга из сессии редактора: обычное сохранение
 * (`publishCurrentPage`) и сохранение копией (`saveCurrentPageAsCopy`). Обе
 * операции переживают свою сессию — за время запроса пользователь может открыть
 * другую страницу, — поэтому обе принимают `IPublishOperationOptions` и пишут в
 * общее состояние формы только по согласию инициатора.
 *
 * Зависимость стора передаётся узким контрактом — логика тестируется юнитом без
 * Pinia (паттерн `pageVersionRestore.ts`).
 */
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPublishedPage, TPublishFormState } from '../../../common/types/bricks-api';
import type { ICurrentPageWriteStoreDeps, IPublishOperationOptions } from '../types/publishStore';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { generateCopyPagename } from './slugify';
import { publishPageRequest } from './publishApi';

/**
 * Актуальна ли сессия, из которой ушёл запрос. Без опции — да: дашборд и прямые
 * вызовы вне редактора сессии не имеют.
 *
 * @param options - Опции записывающей операции стора.
 * @returns Можно ли писать в общее состояние формы.
 */
function isInitiatorCurrent(options?: IPublishOperationOptions): boolean {
    return options?.isInitiatorCurrent?.() ?? true;
}

/**
 * Освежает общий список страниц после попытки создания. Отказ и задержка на
 * результат вызывающего не влияют: при успешном ответе страница уже в списке
 * (её положил туда `syncPageInList`), а при обрыве по таймауту исход неизвестен —
 * тогда это единственная попытка увидеть, применил ли сервер запись.
 *
 * @param store - Узкий контракт стора.
 */
async function refreshPagesAfterPublish(store: ICurrentPageWriteStoreDeps): Promise<void> {
    try {
        await store.loadAllPages();
    } catch (error: unknown) {
        console.warn('[Publish Store] Pages refresh after publish failed:', error);
    }
}

/**
 * Создаёт страницу через API, сразу кладёт её в локальный список и запускает
 * освежение списка целиком.
 *
 * Синхронизация ответом обязательна, а не подстраховка: `loadAllPages` может быть
 * обесценен параллельной локальной записью, и тогда созданной страницы в списке не
 * окажется. Дальше `startEditingPage(id)` молча не найдёт её и оставит
 * `editingPageId === null` — следующее сохранение ушло бы вторым созданием вместо
 * обновления, а открытие нового слага с дашборда дало бы пустой черновик поверх
 * существующей страницы (guard списка сам породил эту дыру).
 *
 * Освежение списка **не входит в результат операции**: оно запускается и
 * отпускается. Сначала его отказ летел наружу как отказ создания — билдер
 * показывал «сохранить не удалось», а повторная попытка упиралась в собственный
 * slug как в занятый; модалка создания не закрывалась; дублирование плодило лишнюю
 * копию. Но и `await` с перехватом ошибки мало: операция записи считается
 * незавершённой до возврата отсюда, то есть медленный GET держал бы кнопку
 * сохранения заблокированной и запрещал бы следующую запись. Потолок ожидания у
 * запроса есть (политика транспорта), но он на порядок больше самой записи —
 * ждать его здесь значит расплачиваться заблокированной кнопкой за данные,
 * которые результату создания не нужны.
 *
 * Порядок обязателен: `syncPageInList` строго до запуска освежения. Иначе GET
 * стартует раньше локальной записи, та обесценит его своим номером — и созданная
 * страница исчезнет из списка вместе с отброшенным ответом.
 *
 * @param store - Узкий контракт стора.
 * @param schema - Схема лендинга.
 * @param formState - Данные формы публикации.
 * @returns ID созданной страницы.
 */
export async function runPublishPage(
    store: ICurrentPageWriteStoreDeps,
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<number> {
    let created: IPublishedPage;

    try {
        created = await publishPageRequest(schema, formState);
    } catch (error: unknown) {
        console.error('[Publish Store] Failed to publish page:', error);

        // Обрыв по таймауту не означает, что страница не создана: сервер мог
        // применить POST и не успеть ответить. Освежаем список — это шанс, что
        // созданная страница появится в дашборде и попадёт в проверку занятости
        // слага (иначе повтор упёрся бы в собственный слаг как в чужой), но не
        // гарантия: GET уходит немедленно и может обогнать ещё работающий
        // серверный handler. Гарантия требует idempotency key, то есть
        // расширения серверного контракта. Ждать ответ всё равно нельзя —
        // сообщение об исходе должно дойти сразу
        if (isRequestTimeoutError(error)) {
            refreshPagesAfterPublish(store);
        }

        throw error;
    }

    store.syncPageInList(created);

    // Промис намеренно не ожидается: ошибки гасятся внутри, а результат создания
    // от освежения не зависит. `void` здесь не пишем — правило `no-void`
    refreshPagesAfterPublish(store);

    return created.id;
}

/**
 * Публикует или обновляет текущий лендинг.
 *
 * @param store - Узкий контракт стора.
 * @param schema - Схема лендинга из канваса.
 * @param failedMessage - Сообщение по умолчанию при отказе записи.
 * @param options - Проверка актуальности сессии-инициатора.
 * @returns ID страницы или null при ошибке.
 */
export async function runPublishCurrentPage(
    store: ICurrentPageWriteStoreDeps,
    schema: IBricksSchema,
    failedMessage: string,
    options?: IPublishOperationOptions
): Promise<string | number | null> {
    // Заявка на запись — до валидации: она пишет `validationErrors` и
    // `generalError`, то есть второй submit успел бы переписать сообщения формы,
    // относящиеся к уже идущей операции
    const writeId = store.beginWrite();
    if (writeId === null) {
        return null;
    }

    // `try` открывается сразу после заявки, а не перед запросом: между ними стоит
    // валидация, и её исключение и оставляло бы запись активной навсегда (кнопки
    // заблокированы до перезагрузки), и уходило бы наружу мимо контракта «ID или
    // null при ошибке» — то есть в необслуженный промис вместо тоста. Форма
    // приходит в том числе из черновика localStorage (`JSON.parse` без проверки
    // типов), так что нестроковое поле в валидаторе — не гипотеза (находка ревью)
    try {
        if (!store.validateCurrentFormState()) {
            return null;
        }

        store.generalError = '';

        if (store.editingPageId !== null) {
            await store.updatePage(store.editingPageId, schema, store.currentFormState);
            store.lastSuccessfulSaveAt = Date.now();
            return store.editingPageId;
        }

        const createdId = await store.publishPage(schema, store.currentFormState);
        store.lastSuccessfulSaveAt = Date.now();
        return createdId;
    } catch (error: unknown) {
        console.error('[Publish Store] publishCurrentPage failed:', error);

        // Сообщение уходит в общее поле формы, то есть в сайдбар той страницы,
        // что открыта сейчас: сохранение прежней, доехавшее после перехода,
        // писало бы свою ошибку в чужую форму
        if (isInitiatorCurrent(options)) {
            store.generalError = (error as Error)?.message || failedMessage;
        }

        return null;
    } finally {
        store.endWrite(writeId);
    }
}

/**
 * Сохраняет текущую конфигурацию как копию страницы; сама синхронизирует список
 * (без `loadAllPages()`).
 *
 * @param store - Узкий контракт стора.
 * @param schema - Схема лендинга из канваса.
 * @param failedMessage - Сообщение по умолчанию при отказе записи.
 * @param options - Проверка актуальности сессии-инициатора.
 * @returns Нормализованная страница копии или null при ошибке.
 */
export async function runSaveCurrentPageAsCopy(
    store: ICurrentPageWriteStoreDeps,
    schema: IBricksSchema,
    failedMessage: string,
    options?: IPublishOperationOptions
): Promise<IPublishedPage | null> {
    // Заявка на запись — до подмены формы: копия временно ставит `editingPageId
    // = null` и свой pagename, и второй вызов, пройдя сюда, снял бы «оригинал»
    // уже с подменённого состояния — откат вернул бы форму в состояние копии
    const writeId = store.beginWrite();
    if (writeId === null) {
        return null;
    }

    const originalFormState = { ...store.currentFormState };
    const originalEditingPageId = store.editingPageId;
    const originalValidationErrors = { ...store.validationErrors };
    const originalGeneralError = store.generalError;

    // Всё, что после заявки, — под общим `try`: генерация имени копии и валидация
    // работают с формой, пришедшей в том числе из черновика localStorage. Их
    // исключение иначе оставляло бы запись активной навсегда и уходило наружу
    // мимо контракта «страница или null при ошибке» — то есть в необслуженный
    // промис вместо сообщения пользователю (находка ревью). Форма при этом
    // осталась бы подменённой состоянием копии — откат в `finally`
    try {
        const copyPagename = generateCopyPagename(
            toPageAddress(originalFormState.pagename, originalFormState.urlPrefix),
            (candidate) => store.isAddressAvailable(candidate)
        );
        const copyTitle = originalFormState.title
            ? `${originalFormState.title} (copy)`
            : originalFormState.title;

        store.editingPageId = null;
        store.currentFormState = {
            ...originalFormState,
            pagename: copyPagename,
            title: copyTitle,
            published: false,
            createdAt: '',
            updatedAt: '',
        };
        store.validationErrors = {};
        store.generalError = '';

        if (!store.validateCurrentFormState()) {
            store.generalError = originalGeneralError;
            return null;
        }

        const created = await publishPageRequest(schema, store.currentFormState);
        store.syncPageInList(created);

        if (isInitiatorCurrent(options)) {
            store.generalError = originalGeneralError;
        }

        return created;
    } catch (error: unknown) {
        console.error('[Publish Store] saveCurrentPageAsCopy failed:', error);

        // Копия могла быть создана — см. `runPublishPage`
        if (isRequestTimeoutError(error)) {
            refreshPagesAfterPublish(store);
        }

        // generalError НЕ восстанавливается вместе с формой — ошибка копии
        // должна пережить откат и дойти до пользователя
        if (isInitiatorCurrent(options)) {
            store.generalError = (error as Error)?.message || failedMessage;
        }

        return null;
    } finally {
        // Закрывать операцию обязан любой исход: копия действительно создана,
        // и список уже синхронизирован
        store.endWrite(writeId);

        // Форма откатывается только в ту сессию, из которой копия ушла: за время
        // POST пользователь мог открыть другую страницу, и её форму (уже
        // заполненную bootstrap'ом) откат затёр бы состоянием прежней, а
        // `switchToSavedPage` увёл бы маршрут на слаг копии
        if (isInitiatorCurrent(options)) {
            store.currentFormState = originalFormState;
            store.editingPageId = originalEditingPageId;
            store.validationErrors = { ...originalValidationErrors };
        }
    }
}
