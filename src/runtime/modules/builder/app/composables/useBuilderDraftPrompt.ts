// #region Imports
// Types
import type { IBuilderDraftEntry } from '../../publish/types/builderDrafts';
import type { IBuilderDraftPromptOptions } from '../types/composables';

// Utils
import { isFormStateEqual } from '../../publish/utils/draftSnapshots';

// Vue
import { ref, watch } from 'vue';

// Pinia
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Предложение восстановить найденный черновик: состояние «черновик есть, ответа
 * нет», окно с выбором и три исхода — восстановить, удалить, отложить.
 *
 * Готовность сессии предложением не держится: на канвасе лежит сохранённая
 * версия страницы, править её можно, а предложение висит рядом тостом. Взамен
 * готовности состояние охраняет запись черновика — пока ответа нет, автосейв её
 * не трогает (`useBuilderDraftPersistence`), иначе совпадение с сохранённой
 * версией удалило бы предложенный снапшот до ответа.
 *
 * Владелец предложения — `useBuilderSession`: он взводит его на bootstrap'е и
 * снимает при переоткрытии сессии.
 */
export function useBuilderDraftPrompt(options: IBuilderDraftPromptOptions) {
    const { isCurrentSession, applySnapshot, discardDraft, sessionPagename, savedSnapshot } =
        options;

    const historyStore = useHistoryStore();
    const publishStore = usePublishStore();

    // Черновик найден, ответа на него нет: держит тост на экране и запрет
    // автосейву трогать запись
    const isDraftRestorePending = ref(false);
    const isRestoreDraftModalOpen = ref(false);
    const pendingDraft = ref<IBuilderDraftEntry | null>(null);

    // Поколение открытия, нашедшего черновик, — вместе с `pointer-events: none`
    // на уезжающей модалке (transitions.scss) закрывает запоздалый ответ: клик по
    // уже сброшенному предложению отвечал бы за другую — грузящуюся или упавшую —
    // сессию. Обнуляется после ответа, поэтому ответ ещё и одноразовый: повторный
    // клик по той же модалке — no-op.
    let promptGeneration: number | null = null;

    /** Остановка наблюдателя за первой собственной правкой (см. `armSupersedeWatch`). */
    let stopSupersedeWatch: (() => void) | null = null;

    /**
     * Принадлежит ли ответ актуальному открытию сессии. Отсекает и запоздалый клик
     * по предложению прежней сессии, и повторный ответ.
     *
     * @returns Можно ли применять ответ.
     */
    function isAnswerCurrent(): boolean {
        return promptGeneration !== null && isCurrentSession(promptGeneration);
    }

    /**
     * Снимает предложение целиком: тост, окно, снапшот в памяти и запрет
     * автосейва. Единая точка выхода из состояния «черновик найден, ответа нет» —
     * ею пользуются и ответы пользователя, и вытеснение предложения (первая
     * правка, перенос или переоткрытие сессии).
     */
    function resolveDraftPrompt(): void {
        stopSupersedeWatch?.();
        stopSupersedeWatch = null;

        isDraftRestorePending.value = false;
        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        promptGeneration = null;
    }

    /**
     * Снимает предложение при первой собственной правке пользователя: с этого
     * момента автосейв перезапишет черновик текущим состоянием, и восстанавливать
     * станет нечего — предложенный снапшот уже вытеснен.
     *
     * Два наблюдателя вместо одного, потому что источники неравноценны:
     *
     * - новая запись в истории канваса бывает только от действия пользователя —
     *   снимаем сразу;
     * - форму публикации переписывает и служебный код. Сохранение на каждом заходе
     *   заново присваивает `published` (`useBuilderPageWrite`), в том числе тем же
     *   значением, — приняв это за правку, предложение снималось бы само, а
     *   автосейв следом удалял бы черновик как совпадающий с сохранённой версией.
     *   Поэтому здесь сверяемся с сохранённой версией: пока форма от неё не
     *   отличается, правки не было.
     *
     * `flush: 'sync'` — чтобы предложение снималось в момент мутации, а не через
     * очередь: между pre-watcher'ами и синхронным сбросом черновика на выгрузке
     * страницы порядок иначе не гарантирован.
     */
    function armSupersedeWatch(): void {
        stopSupersedeWatch?.();

        const stopHistoryWatch = watch(
            () => historyStore.history[historyStore.historyIndex],
            () => {
                resolveDraftPrompt();
            },
            { flush: 'sync' }
        );

        const stopFormWatch = watch(
            () => publishStore.currentFormState,
            (formState) => {
                const savedFormState = savedSnapshot.value?.formState;

                if (savedFormState && isFormStateEqual(formState, savedFormState)) {
                    return;
                }

                resolveDraftPrompt();
            },
            { flush: 'sync' }
        );

        stopSupersedeWatch = () => {
            stopHistoryWatch();
            stopFormWatch();
        };
    }

    /**
     * Взводит предложение по найденному черновику. Зовётся на bootstrap'е, до
     * подъёма готовности: спрашивать посреди загрузки нечем — окно вылезло бы
     * поверх лоадера, поэтому показ тоста остаётся за страницей.
     *
     * @param draft - Найденная запись черновика.
     * @param generation - Поколение открытия сессии, нашедшего её.
     */
    function armDraftPrompt(draft: IBuilderDraftEntry, generation: number): void {
        pendingDraft.value = draft;
        isDraftRestorePending.value = true;
        promptGeneration = generation;
        armSupersedeWatch();
    }

    /**
     * Останавливает наблюдатель, не снимая самого предложения. Нужен на гашении
     * сессии: наблюдатель ставится вне активного scope (после await'ов
     * bootstrap'а) и сам бы не остановился.
     */
    function stopDraftPromptWatch(): void {
        stopSupersedeWatch?.();
        stopSupersedeWatch = null;
    }

    /**
     * Открывает окно с выбором — по клику в тосте. Запоздалый клик по тосту
     * прежней сессии отсекается тем же поколением, что и ответы в самом окне.
     */
    function openRestoreDraftModal(): void {
        if (!isAnswerCurrent()) {
            return;
        }

        isRestoreDraftModalOpen.value = true;
    }

    /**
     * Закрывает окно, не отвечая: X, Esc и клик по фону. Черновик остаётся на
     * диске, предложение — на экране. Закрытие перестало быть удалением: раньше
     * промах мимо кнопки уносил несохранённую работу без возврата.
     */
    function handleDeferDraft(): void {
        isRestoreDraftModalOpen.value = false;
    }

    /**
     * Восстанавливает изменения из черновика поверх уже открытой сохранённой
     * версии.
     */
    function handleRestoreDraft(): void {
        if (!isAnswerCurrent()) {
            return;
        }

        const draft = pendingDraft.value;

        // Снимаем предложение до применения: снапшот идёт в сторы, а наблюдатель за
        // первой правкой смотрит ровно на них — иначе он снял бы предложение сам,
        // уже после того как окно закрылось, и порядок стал бы неочевидным
        resolveDraftPrompt();

        if (draft?.draftSnapshot) {
            applySnapshot(draft.draftSnapshot);
        }
    }

    /**
     * Удаляет черновик по явному требованию пользователя и оставляет на канвасе
     * сохранённую версию. Единственный путь, на котором черновик исчезает по
     * ответу: закрытие окна и закрытие тоста — только откладывают.
     */
    function handleDiscardDraft(): void {
        if (!isAnswerCurrent()) {
            return;
        }

        // Ключ берём у самого черновика: он и есть предмет ответа. Расходиться с
        // `sessionPagename` он не успевает — перенос сессии снимает предложение
        // целиком (watcher в useBuilderSession)
        const pagename = pendingDraft.value?.pagename ?? sessionPagename.value;
        if (pagename) {
            discardDraft(pagename);
        }

        resolveDraftPrompt();
    }

    return {
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
    };
}
