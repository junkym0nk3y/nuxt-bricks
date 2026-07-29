// #region Imports
// Types
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPublishedPage } from '../../../common/types/bricks-api';
import type { IBuilderDraftEntry, IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type { IBuilderSessionOptions } from '../types/composables';

// Utils
import { serializeSchema } from '../../core/utils/history';
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { getBuilderDraft, removeBuilderDraft } from '../../publish/utils/draftStorage';
import { fetchPageRequest } from '../../publish/utils/publishApi';

// Vue
import { onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const EMPTY_SCHEMA: IBricksSchema = {
    components: [],
};

/**
 * Предел ожидания bootstrap'а. Зависший (не отвечающий и не падающий) запрос иначе
 * оставляет рабочую область под щитом навсегда: `catch`/`finally` недостижимы,
 * лоадер прячется сам, и пользователь видит только полупрозрачную заглушку без
 * объяснения и без выхода. По таймауту сессия уходит в состояние ошибки с кнопкой
 * «Повторить» (BM-23).
 */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30000;

/**
 * Сессия билдера: открытие страницы по pagename (существующая / новая),
 * обнаружение черновика в localStorage и модалка восстановления.
 * Watcher на routePagename переоткрывает сессию при навигации на другую страницу;
 * rename собственной сессии (routePagename догнал sessionPagename после
 * `renameSession`) повторного bootstrap не вызывает.
 * Первичное открытие — на стороне вызывающего (onMounted, см. [pagename].vue).
 */
export function useBuilderSession(options: IBuilderSessionOptions) {
    const { routePagename, sessionPagename, showToast, renameSession, sessionToken } = options;

    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    const isSessionLoading = ref(true);
    // Сессия догрузилась до согласованного состояния. Отдельный признак от
    // isSessionLoading: тот снимается и по ошибке bootstrap'а, после которой на
    // канвасе и в форме лежит мусор (дефолты или остатки прошлой страницы), и его
    // нельзя писать в черновик — затрёт валидную запись, см. BM-20.
    const isSessionReady = ref(false);
    // Причина отказа bootstrap'а — для блокирующего экрана. Пока значение стоит,
    // сессия несогласована: править нечего, потому что автосейв и сохранение
    // отклоняют всё по !isSessionReady (BM-23). Снимается на входе в следующее
    // открытие, в том числе на «Повторить».
    const sessionError = ref<string | null>(null);
    const isRestoreDraftModalOpen = ref(false);
    const pendingDraft = ref<IBuilderDraftEntry | null>(null);
    const savedSnapshot = ref<IBuilderDraftSnapshot | null>(null);

    // Поколение открытия сессии — общий токен билдера (useBuilderSessionToken):
    // инкремент на каждый вход в openBuilderSession. Watcher маршрута зовёт
    // открытие без сериализации, поэтому на быстрых переходах A → B → C ответ B
    // может прийти после C. Применять его нельзя: схема B легла бы на канвас под
    // ключом C, а сессия объявилась бы готовой — дальше автосейв и сохранение
    // уехали бы под C с чужим содержимым (BM-24). Тем же токеном сверяются
    // операции за пределами этого файла — сохранение, снимок превью, синк
    // превью-вкладки, портальные модалки (BM-26).
    const isCurrentSession = sessionToken.isCurrent;

    // Поколение открытия, показавшего модалку восстановления, — вместе с
    // `pointer-events: none` на уезжающей модалке (transitions.scss) закрывает
    // запоздалый ответ: клик по уже сброшенной модалке поднимал бы готовность
    // другой — грузящейся или упавшей — сессии. Обнуляется после ответа, поэтому
    // ответ ещё и одноразовый: повторный клик по той же модалке — no-op (BM-23).
    let restoreDraftGeneration: number | null = null;

    /**
     * Принадлежит ли ответ на модалку восстановления актуальному открытию. Отсекает
     * и запоздалый клик по уезжающей модалке прежней сессии, и повторный ответ.
     *
     * @returns Можно ли применять ответ.
     */
    function isRestoreAnswerCurrent(): boolean {
        return restoreDraftGeneration !== null && isCurrentSession(restoreDraftGeneration);
    }

    // Счётчик локален экземпляру, а незавершённое открытие переживает свой экземпляр:
    // сторы живут на уровне приложения, поэтому поздний ответ покойной страницы
    // (уход на дашборд → открытие другой страницы) писал бы схему в чужую сессию,
    // пройдя проверку собственного, уже неактуального поколения. Инкремент на
    // dispose гасит все открытия этого экземпляра разом.
    onScopeDispose(() => {
        sessionToken.invalidate();
    });

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
     * записи в сторы. Список страниц (`loadAllPages`) — исключение: он общий кеш, и
     * ради него не стоит второго запроса. Его собственные гонки закрыты на стороне
     * стора, а не поколением: устаревший ответ не заменяет более свежий список, и
     * ошибка загрузки больше не пишется в `generalError` (BM-26).
     *
     * @param pagename - ЧПУ страницы из URL.
     * @param generation - Поколение этого открытия сессии.
     */
    async function bootstrapSession(pagename: string, generation: number): Promise<void> {
        if (!publishStore.publishedPages.length) {
            await publishStore.loadAllPages();

            if (!isCurrentSession(generation)) {
                return;
            }
        }

        const existingPage = publishStore.getPageByPagename(pagename);
        const draft = getBuilderDraft(pagename);

        if (existingPage) {
            publishStore.startEditingPage(existingPage.id);

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
                pendingDraft.value = draft;
                isRestoreDraftModalOpen.value = true;
                restoreDraftGeneration = generation;
                return;
            }

            if (draft && draft.mode === 'edit' && draft.draftSnapshot) {
                removeBuilderDraft(pagename);
            }

            return;
        }

        publishStore.startNewPublish();
        publishStore.setCurrentFormField('pagename', pagename);
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
     * Загружает страницу в билдер по pagename, учитывая черновики.
     *
     * @param pagename - ЧПУ страницы из URL.
     */
    async function openBuilderSession(pagename: string): Promise<void> {
        if (!pagename) {
            return;
        }

        sessionToken.invalidate();
        const generation = sessionToken.capture();

        // Фиксируем ключ сессии: черновики пишутся/удаляются по нему до следующего
        // открытия или rename (см. useBuilderPagename.renameSession)
        sessionPagename.value = pagename;

        isSessionLoading.value = true;
        isSessionReady.value = false;
        sessionError.value = null;
        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        restoreDraftGeneration = null;
        savedSnapshot.value = null;

        try {
            await withBootstrapTimeout(bootstrapSession(pagename, generation));

            if (!isCurrentSession(generation)) {
                return;
            }

            // Модалка восстановления — тоже несогласованное состояние: на канвасе
            // сохранённая версия, ответа пользователя ещё нет, а автосейв в этом окне
            // всё отклоняет по `isRestoreDraftModalOpen`. С поднятой готовностью
            // глобальный Ctrl+V проходил бы guard и тихо терялся (BM-23). Готовность
            // поднимут `handleRestoreDraft` / `handleDiscardDraft` — других выходов у
            // модалки нет
            if (isRestoreDraftModalOpen.value) {
                return;
            }

            // Готовность — только после всех ветвей bootstrap'а, включая применение
            // черновика: падение на нём с поднятым флагом означало бы, что сброс на
            // выгрузке затрёт черновик недособранным состоянием
            isSessionReady.value = true;
        } catch (error: unknown) {
            // Ошибка вытесненного открытия пользователя уже не касается: на экране
            // другая страница, и её загрузка идёт своим поколением
            if (!isCurrentSession(generation)) {
                return;
            }

            const message =
                error instanceof Error ? error.message : t('bricks.publish.toasts.loadPageFailed');

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
     * блокирующем экране. Pagename берётся из маршрута: он источник истины URL, а
     * `sessionPagename` после неудачного открытия равен ему.
     */
    async function retryBuilderSession(): Promise<void> {
        await openBuilderSession(routePagename.value);
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
     * черновик — правки, сделанные до сохранения, терялись на reload (BM-26).
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
        removeBuilderDraft(sessionPagename.value);
    }

    /**
     * Единый переход сессии на сохранённую страницу (Save as Copy): переводит store
     * в edit mode, переносит route/sessionPagename через `renameSession` (миграция
     * черновика + `router.replace`) и только затем фиксирует новый `savedSnapshot`
     * (удаляя черновик по актуальному ключу). Порядок фиксирован — иначе URL и
     * ключ черновика остаются от оригинала: автосейв копии писал бы под slug
     * оригинала, а reload оригинала предлагал бы восстановить чужие данные (P1).
     *
     * @param page - Нормализованная страница копии (обязательны `id` и `pagename`).
     */
    async function switchToSavedPage(page: IPublishedPage): Promise<void> {
        const startedIn = sessionToken.capture();

        publishStore.startEditingPage(page.id);
        await renameSession(page.pagename);
        commitSavedSnapshot(startedIn);
    }

    /**
     * Восстанавливает изменения из черновика (для существующей страницы).
     * Ответ на модалку — вторая (и последняя) точка подъёма готовности: до него
     * сессия несогласована, см. `openBuilderSession`.
     */
    function handleRestoreDraft(): void {
        if (!isRestoreAnswerCurrent()) {
            return;
        }

        const draft = pendingDraft.value;
        if (draft?.draftSnapshot) {
            applySnapshot(draft.draftSnapshot);
        }

        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        restoreDraftGeneration = null;
        isSessionReady.value = true;
    }

    /**
     * Отказывается от восстановления и удаляет черновик, открывая сохранённую версию.
     * Как и `handleRestoreDraft`, поднимает готовность сессии.
     */
    function handleDiscardDraft(): void {
        if (!isRestoreAnswerCurrent()) {
            return;
        }

        // Ключ берём у самого черновика: он и есть предмет ответа. Расходиться с
        // `sessionPagename` он не успевает — перенос сессии снимает предложение
        // целиком (watcher ниже)
        const pagename = pendingDraft.value?.pagename ?? sessionPagename.value;
        if (pagename) {
            removeBuilderDraft(pagename);
        }

        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        restoreDraftGeneration = null;
        isSessionReady.value = true;
    }

    // Перенос сессии отменяет предложение восстановить черновик. `renameSession`
    // зовут напрямую уже начатые save / Save as Copy, поэтому `sessionPagename`
    // меняется без смены поколения, а `migrateBuilderDraft` к этому моменту уже
    // перенёс запись под новый ключ: «Восстановить» применил бы снапшот прежней
    // страницы, «Открыть сохранённую» удалила бы пустой старый ключ. Ничего не
    // трогаем: черновик остаётся на диске, сессия объявляется согласованной, а
    // пользователь при желании перезагрузит страницу и получит предложение заново.
    watch(
        () => sessionPagename.value,
        () => {
            if (restoreDraftGeneration === null) {
                return;
            }

            isRestoreDraftModalOpen.value = false;
            pendingDraft.value = null;
            restoreDraftGeneration = null;
            isSessionReady.value = true;
        }
    );

    // Без immediate: при immediate колбэк выполняется синхронно в setup ещё до гидрации
    // и успевает заполнить publishStore.currentFormState (pagename из URL), из-за чего
    // клиентский рендер расходится с SSR (hydration mismatch в TheBuilderShellToolbar).
    // Первичное открытие сессии — в onMounted страницы, watcher отвечает только за смену маршрута.
    watch(
        () => routePagename.value,
        (next) => {
            // routePagename догнал sessionPagename после renameSession — это rename
            // собственной сессии, а не навигация: повторный bootstrap не нужен
            if (!next || next === sessionPagename.value) {
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
        isRestoreDraftModalOpen,
        pendingDraft,
        savedSnapshot,
        buildCurrentSnapshot,
        commitSavedSnapshot,
        switchToSavedPage,
        openBuilderSession,
        retryBuilderSession,
        handleRestoreDraft,
        handleDiscardDraft,
    };
}
