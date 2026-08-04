// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type { IBuilderSessionOptions } from '../types/composables';

// Utils
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isSamePageAddress, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { serializeSchema } from '../../core/utils/history';
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { getBuilderDraft, removeBuilderDraft } from '../../publish/utils/draftStorage';
import { fetchPageRequest } from '../../publish/utils/publishApi';

// Vue
import { onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderDraftPrompt } from './useBuilderDraftPrompt';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const EMPTY_SCHEMA: IBricksSchema = {
    components: [],
};

/**
 * Предел ожидания bootstrap'а. Зависший (не отвечающий и не падающий) запрос иначе
 * оставляет рабочую область заблокированной навсегда: `catch`/`finally`
 * недостижимы, и пользователь видит лоадер без конца и без выхода. По таймауту
 * сессия уходит в состояние ошибки с кнопкой «Повторить».
 */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30000;

/**
 * Сессия билдера: открытие страницы по АДРЕСУ (существующая / новая) — имя
 * страницу не определяет, одноимённые под разными префиксами разные, и поиск по
 * имени открывал бы произвольную из них. Плюс обнаружение черновика в
 * localStorage и предложение его восстановить.
 * Watcher на routeAddress переоткрывает сессию при навигации; rename собственной
 * сессии (routeAddress догнал sessionAddress) повторного bootstrap не вызывает.
 * Первичное открытие — на стороне вызывающего (onMounted, см. [pagename].vue).
 */
export function useBuilderSession(options: IBuilderSessionOptions) {
    const {
        routeAddress,
        sessionAddress,
        showToast,
        renameSession,
        sessionToken,
        draftStorageNotice,
    } = options;

    /**
     * Удаляет черновик и сообщает, если хранилище отказало. Тихий отказ здесь
     * означал бы, что отклонённый или уже сохранённый черновик снова предложат
     * восстановить при следующем заходе.
     *
     * @param address - Адрес сессии, по которому лежит черновик.
     */
    function discardDraft(address: IBricksPageAddress): void {
        if (!removeBuilderDraft(address)) {
            draftStorageNotice.report();
        }
    }

    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    const isSessionLoading = ref(true);
    // Сессия догрузилась до согласованного состояния. Отдельный признак от
    // isSessionLoading: тот снимается и по ошибке bootstrap'а, после которой на
    // канвасе и в форме лежит мусор (дефолты или остатки прошлой страницы), и его
    // нельзя писать в черновик — затрёт валидную запись.
    const isSessionReady = ref(false);
    // Причина отказа bootstrap'а — для блокирующего экрана. Пока значение стоит,
    // сессия несогласована: править нечего, потому что автосейв и сохранение
    // отклоняют всё по !isSessionReady. Снимается на входе в следующее
    // открытие, в том числе на «Повторить».
    const sessionError = ref<string | null>(null);
    const savedSnapshot = ref<IBuilderDraftSnapshot | null>(null);

    // Идентичность открытой страницы: id сохранённой либо null у новой. Меняется
    // только на переходах сессии, поэтому пригодна как признак «эта страница
    // открыта» для интерфейса. `publishStore.editingPageId` для этого не годится:
    // Save as Copy на время POST сбрасывает его в null (форма выглядит как новая
    // страница), и отметка текущей строки мигала бы на каждом сохранении копии.
    // Сравнение по pagename не годится тем более — оно не отличает удалённую
    // страницу от созданной заново под тем же слагом.
    const sessionPageId = ref<string | number | null>(null);

    // Поколение открытия сессии — общий токен билдера (useBuilderSessionToken):
    // инкремент на каждый вход в openBuilderSession. Watcher маршрута зовёт
    // открытие без сериализации, поэтому на быстрых переходах A → B → C ответ B
    // может прийти после C. Применять его нельзя: схема B легла бы на канвас под
    // ключом C, а сессия объявилась бы готовой — дальше автосейв и сохранение
    // уехали бы под C с чужим содержимым. Тем же токеном сверяются
    // операции за пределами этого файла — сохранение, снимок превью, синк
    // превью-вкладки, портальные модалки.
    const isCurrentSession = sessionToken.isCurrent;

    // Предложение восстановить найденный черновик: состояние, окно и три исхода.
    // Отдельным композаблом, потому что своей готовности у него нет — оно живёт
    // поверх открытой сессии и снимается её же событиями (переоткрытие, rename).
    const {
        isDraftRestorePending,
        isRestoreDraftModalOpen,
        pendingDraft,
        armDraftPrompt,
        resolveDraftPrompt,
        stopDraftPromptWatch,
        openRestoreDraftModal,
        handleDeferDraft,
        handleRestoreDraft,
        handleDiscardDraft,
    } = useBuilderDraftPrompt({
        isCurrentSession,
        applySnapshot,
        discardDraft,
        sessionAddress,
        savedSnapshot,
    });

    /**
     * Гасит всё, начатое прежней сессией: и операции, сверяющие токен (открытие,
     * сохранение, снимок превью, портальные модалки), и незавершённые записи в
     * сторе. Одной точкой, потому что расходиться им нельзя: запись, оставшаяся
     * в списке активных, держала бы индикатор и запрет второго submit на
     * странице, к которой не относится.
     *
     * Сами запросы при этом продолжают лететь — их исход доходит до пользователя
     * тостом с меткой своей страницы.
     */
    function abandonSessionOperations(): void {
        sessionToken.invalidate();
        publishStore.resetActiveWrites();

        // Наблюдатель за первой правкой ставится вне setup (после await'ов
        // bootstrap'а), поэтому активного scope в момент регистрации нет и сам он
        // не остановится — снимаем его здесь, на общей точке гашения сессии
        stopDraftPromptWatch();
    }

    // Счётчик локален экземпляру, а незавершённое открытие переживает свой экземпляр:
    // сторы живут на уровне приложения, поэтому поздний ответ покойной страницы
    // (уход на дашборд → открытие другой страницы) писал бы схему в чужую сессию,
    // пройдя проверку собственного, уже неактуального поколения. Инкремент на
    // dispose гасит все открытия этого экземпляра разом.
    onScopeDispose(abandonSessionOperations);

    /**
     * Строит актуальный снапшот из стора канваса и publish настроек.
     */
    function buildCurrentSnapshot(): IBuilderDraftSnapshot {
        return {
            schema: serializeSchema(componentsStore.components),
            formState: publishStore.currentFormState,
        };
    }

    /**
     * Применяет снапшот в сторы билдера.
     *
     * @param snapshot - Снапшот для применения.
     */
    function applySnapshot(snapshot: IBuilderDraftSnapshot): void {
        componentsStore.loadSchema(snapshot.schema, { resetHistory: true });
        publishStore.setCurrentFormState(snapshot.formState);
    }

    /**
     * Приводит сторы билдера к состоянию открываемой страницы: сохранённая версия
     * или чистый холст, плюс разбор найденного черновика. Бросает наружу — тогда
     * сессия остаётся неготовой и автосейв её состояние не пишет.
     *
     * Каждый await сверяется с поколением: вытесненное открытие выходит молча, до
     * записи в сторы. Список страниц (`ensurePagesLoaded`) — исключение: он общий
     * кеш, и ради него не стоит второго запроса. Его собственные гонки закрыты на
     * стороне стора, а не поколением: устаревший ответ не заменяет более свежий
     * список, и ошибка загрузки больше не пишется в `generalError`.
     *
     * Условие «список пуст» здесь не годится: пустой список — законный ответ для
     * первой страницы проекта, и открытие сессии запрашивало бы его каждый раз.
     * Пустоту от незагруженности отличает сам стор.
     *
     * @param address - Адрес страницы из URL.
     * @param generation - Поколение этого открытия сессии.
     */
    async function bootstrapSession(
        address: IBricksPageAddress,
        generation: number
    ): Promise<void> {
        await publishStore.ensurePagesLoaded();

        if (!isCurrentSession(generation)) {
            return;
        }

        const existingPage = publishStore.getPageByAddress(address);
        const draft = getBuilderDraft(address);

        if (existingPage) {
            publishStore.startEditingPage(existingPage.id);
            sessionPageId.value = existingPage.id;

            // Список стора — сводки без schema: схему канваса грузим point-lookup'ом
            const fullPage = await fetchPageRequest(existingPage.id);

            if (!isCurrentSession(generation)) {
                return;
            }

            componentsStore.loadSchema(fullPage.schema, { resetHistory: true });

            savedSnapshot.value = buildCurrentSnapshot();

            // Черновик предлагается на восстановление только если он точно
            // принадлежит этой странице (draft.pageId === existingPage.id).
            // Черновик без pageId или с чужим pageId (например, ключ сессии
            // переиспользован после Save as Copy) — stale, не предлагается
            // и подчищается ниже.
            const isDraftOwnedByPage = draft?.pageId === existingPage.id;

            if (
                draft &&
                draft.mode === 'edit' &&
                draft.draftSnapshot &&
                isDraftOwnedByPage &&
                !isSnapshotEqual(draft.draftSnapshot, savedSnapshot.value)
            ) {
                // Только взводим предложение: спрашивать посреди загрузки нечем —
                // модалка вылезала бы поверх лоадера. Тост поднимет страница, когда
                // лоадер уйдёт, а модалку откроет уже клик по нему
                armDraftPrompt(draft, generation);
                return;
            }

            if (draft && draft.mode === 'edit' && draft.draftSnapshot) {
                discardDraft(address);
            }

            return;
        }

        publishStore.startNewPublish();
        publishStore.setCurrentFormField('pagename', address.pagename);
        // Префикс из URL — тоже часть открываемого адреса: без него форма новой
        // страницы сохранила бы её в корень, а редактор открыт по `/blog/post`
        publishStore.setCurrentFormField('urlPrefix', address.urlPrefix);
        componentsStore.loadSchema(EMPTY_SCHEMA, { resetHistory: true });

        if (draft?.draftSnapshot) {
            applySnapshot(draft.draftSnapshot);
            showToast(t('bricks.publish.toasts.unsavedChanges'), 'error', 30000);
        }
    }

    /**
     * Ограничивает ожидание bootstrap'а по времени. Отдельный таймер, а не
     * `AbortSignal` у запроса: гасить надо всё открытие целиком, включая ветку,
     * которая уже прошла список и ждёт схему.
     *
     * @param bootstrap - Промис открытия сессии.
     * @returns Промис, отклоняющийся по истечении лимита.
     */
    async function withBootstrapTimeout(bootstrap: Promise<void>): Promise<void> {
        if (typeof window === 'undefined') {
            return bootstrap;
        }

        let timer: number | null = null;
        const deadline = new Promise<never>((_resolve, reject) => {
            timer = window.setTimeout(() => {
                reject(new Error(t('bricks.publish.session.errorTimeout')));
            }, SESSION_BOOTSTRAP_TIMEOUT_MS);
        });

        try {
            await Promise.race([bootstrap, deadline]);
        } finally {
            if (timer !== null) {
                window.clearTimeout(timer);
            }
        }
    }

    /**
     * Загружает страницу в билдер по адресу, учитывая черновики.
     *
     * @param address - Адрес страницы из URL.
     */
    async function openBuilderSession(address: IBricksPageAddress): Promise<void> {
        if (!address.pagename) {
            return;
        }

        abandonSessionOperations();
        const generation = sessionToken.capture();

        // Фиксируем ключ сессии: черновики пишутся/удаляются по нему до следующего
        // открытия или rename (см. useBuilderSessionAddress.renameSession)
        sessionAddress.value = address;

        isSessionLoading.value = true;
        isSessionReady.value = false;
        sessionError.value = null;
        resolveDraftPrompt();
        savedSnapshot.value = null;
        // Открываемая страница ещё не опознана: до конца bootstrap'а она не
        // «текущая» ни для одной строки списка
        sessionPageId.value = null;

        try {
            await withBootstrapTimeout(bootstrapSession(address, generation));

            if (!isCurrentSession(generation)) {
                return;
            }

            // Готовность — только после всех ветвей bootstrap'а, включая применение
            // черновика: падение на нём с поднятым флагом означало бы, что сброс на
            // выгрузке затрёт черновик недособранным состоянием.
            //
            // Ненайденный ответ на черновик готовность больше не держит: на канвасе
            // лежит сохранённая версия страницы — состояние согласованное, править
            // его можно, и первая же правка снимает предложение (`armDraftSupersedeWatch`).
            // Пока ответа нет, автосейв не трогает запись черновика по
            // `isDraftRestorePending` — иначе он удалил бы её как совпадающую с
            // сохранённой версией
            isSessionReady.value = true;
        } catch (error: unknown) {
            // Ошибка вытесненного открытия пользователя уже не касается: на экране
            // другая страница, и её загрузка идёт своим поколением
            if (!isCurrentSession(generation)) {
                return;
            }

            // Запрос, оборванный собственным потолком, для пользователя —
            // то же событие, что и просроченный bootstrap целиком: показываем один
            // и тот же продуктовый текст, а не транспортное сообщение о таймауте
            // чтения. Иначе один и тот же экран объяснял бы неотвечающий сервер
            // двумя разными фразами в зависимости от того, чей таймер сработал
            const message = isRequestTimeoutError(error)
                ? t('bricks.publish.session.errorTimeout')
                : error instanceof Error
                  ? error.message
                  : t('bricks.publish.toasts.loadPageFailed');

            // Открытие, брошенное по таймауту, может всё ещё лететь: гасим его
            // поколением, иначе поздний ответ лёг бы на канвас поверх экрана ошибки.
            // Лоадер снимаем здесь же — finally увидит поколение уже неактуальным
            sessionToken.invalidate();
            isSessionLoading.value = false;

            // Экран и тост вместе не дублируют друг друга: экран объясняет состояние
            // и держит рабочую область закрытой, тост отмечает сам факт неудачи —
            // иначе повторный отказ по «Повторить» выглядел бы как «ничего не произошло»
            sessionError.value = message;
            showToast(message, 'error');
        } finally {
            // Снимать лоадер имеет право только актуальное открытие: иначе поздний
            // ответ вытесненного открывал бы канвас, пока текущее ещё грузится
            if (isCurrentSession(generation)) {
                isSessionLoading.value = false;
            }
        }
    }

    /**
     * Повторяет открытие сессии после отказа bootstrap'а — кнопка «Повторить» на
     * блокирующем экране. Адрес берётся из маршрута: он источник истины URL, а
     * `sessionAddress` после неудачного открытия равен ему.
     */
    async function retryBuilderSession(): Promise<void> {
        await openBuilderSession(routeAddress.value);
    }

    /**
     * Фиксирует текущее состояние как сохранённое: новый `savedSnapshot` и удаление
     * черновика по актуальному ключу сессии. Единственная точка фиксации — её зовут
     * и обычное сохранение (`useBuilderPage.submitPageWithPublishState`), и переход
     * на копию (`switchToSavedPage`).
     *
     * Явный вызов вместо прежнего watch'а на `publishStore.lastSuccessfulSaveAt`:
     * watcher не знал инициатора, поэтому сохранение прежней страницы, доехавшее
     * после открытия новой, объявляло снапшот новой сохранённым и удаляло её
     * черновик — правки, сделанные до сохранения, терялись на reload.
     *
     * Токен обязателен и сверяется здесь, а не у вызывающего: между его проверкой и
     * фиксацией у обоих путей стоит `await renameSession` (внутри — `router.replace`),
     * и перехваченная за это время навигация возвращала бы ровно тот же дефект —
     * снапшот чужой страницы и удаление её черновика (находка ревью).
     *
     * @param capturedToken - Токен сессии, снятый на старте сохранения.
     */
    function commitSavedSnapshot(capturedToken: number): void {
        if (!isCurrentSession(capturedToken)) {
            return;
        }

        savedSnapshot.value = buildCurrentSnapshot();
        discardDraft(sessionAddress.value);

        // Здесь же сессия принимает идентичность сохранённой страницы: обе записи
        // (обычное сохранение и переход на копию) к этому моменту уже перевели
        // стор в edit mode, а первое сохранение новой страницы иначе оставило бы
        // сессию безымянной до перезагрузки — в списке не было бы отмечено, что
        // открыто именно оно
        sessionPageId.value = publishStore.editingPageId;
    }

    /**
     * Единый переход сессии на сохранённую страницу (Save as Copy): переводит store
     * в edit mode, переносит route/sessionAddress через `renameSession` (миграция
     * черновика + `router.replace`) и только затем фиксирует новый `savedSnapshot`
     * (удаляя черновик по актуальному ключу). Порядок фиксирован — иначе URL и
     * ключ черновика остаются от оригинала: автосейв копии писал бы под адресом
     * оригинала, а reload оригинала предлагал бы восстановить чужие данные (P1).
     *
     * Адрес берётся у сохранённой строки целиком: копия наследует `urlPrefix`,
     * и перенос по одному имени увёл бы URL редактора в корень.
     *
     * @param page - Нормализованная страница копии (обязательны `id` и адрес).
     */
    async function switchToSavedPage(page: IPublishedPage): Promise<void> {
        const startedIn = sessionToken.capture();

        publishStore.startEditingPage(page.id);
        await renameSession(toPageAddress(page.pagename, page.urlPrefix));
        commitSavedSnapshot(startedIn);
    }

    // Перенос сессии отменяет предложение восстановить черновик. `renameSession`
    // зовут напрямую уже начатые save / Save as Copy, поэтому `sessionAddress`
    // меняется без смены поколения, а `migrateBuilderDraft` к этому моменту уже
    // перенёс запись под новый ключ: «Восстановить» применил бы снапшот прежней
    // страницы, «Удалить» снесло бы пустой старый ключ. Ничего не трогаем:
    // черновик остаётся на диске, предложение снимается, а пользователь при
    // желании перезагрузит страницу и получит его заново.
    watch(
        () => sessionAddress.value,
        (next, previous) => {
            if (!isDraftRestorePending.value || isSamePageAddress(next, previous)) {
                return;
            }

            resolveDraftPrompt();
        }
    );

    // Без immediate: при immediate колбэк выполняется синхронно в setup ещё до гидрации
    // и успевает заполнить publishStore.currentFormState (pagename из URL), из-за чего
    // клиентский рендер расходится с SSR (hydration mismatch в TheBuilderShellToolbar).
    // Первичное открытие сессии — в onMounted страницы, watcher отвечает только за смену маршрута.
    watch(
        () => routeAddress.value,
        (next) => {
            // routeAddress догнал sessionAddress после renameSession — это rename
            // собственной сессии, а не навигация: повторный bootstrap не нужен.
            // Сравнение адресом целиком: смена префикса — тоже другая страница
            if (!next.pagename || isSamePageAddress(next, sessionAddress.value)) {
                return;
            }

            openBuilderSession(next).catch((error: unknown) => {
                console.error('[Builder] Failed to open builder session:', error);
            });
        }
    );

    return {
        isSessionLoading,
        isSessionReady,
        sessionError,
        sessionPageId,
        isDraftRestorePending,
        isRestoreDraftModalOpen,
        pendingDraft,
        savedSnapshot,
        buildCurrentSnapshot,
        commitSavedSnapshot,
        switchToSavedPage,
        openBuilderSession,
        retryBuilderSession,
        openRestoreDraftModal,
        handleDeferDraft,
        handleRestoreDraft,
        handleDiscardDraft,
    };
}
