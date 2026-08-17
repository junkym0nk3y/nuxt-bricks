// #region Imports
// Types
import type { IBuilderDraftPersistenceOptions } from '../types/composables';

// Utils
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { getPageAddressKey } from '../../../common/utils/bricks/pageAddress';
import {
    isBuilderDraftStorageAvailable,
    removeBuilderDraft,
    setBuilderDraft,
} from '../../publish/utils/draftStorage';

// Vue
import { onScopeDispose, watch } from 'vue';

// Pinia
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Автосохранение черновика билдера в localStorage (debounce 800ms) при изменении
 * истории канваса или настроек публикации. Запись идёт всегда, а вот удаление
 * записи ждёт ответа на предложение восстановить (`isDraftRestorePending`):
 * запрещать заодно и запись нельзя — правка пропса меняет компонент синхронно, а
 * историю фиксирует через 300 мс, и `pagehide` в это окно потерял бы её. Ключ черновика — sessionAddress
 * (переживает rename сессии). Если изменений относительно сохранённой версии
 * нет — черновик удаляется. Отложенное сохранение сбрасывается синхронно на обоих
 * терминальных событиях: выгрузка страницы (`pagehide`) и остановка scope
 * (уход из редактора SPA-навигацией).
 */
export function useBuilderDraftPersistence(options: IBuilderDraftPersistenceOptions): void {
    const {
        routeAddress,
        sessionAddress,
        isSessionLoading,
        isSessionReady,
        isDraftRestorePending,
        savedSnapshot,
        buildCurrentSnapshot,
        draftStorageNotice,
        canEdit,
    } = options;

    const historyStore = useHistoryStore();
    const publishStore = usePublishStore();

    let persistTimer: number | null = null;

    /**
     * Очищает таймер отложенного сохранения.
     */
    function clearPersistTimer(): void {
        if (persistTimer === null) {
            return;
        }

        window.clearTimeout(persistTimer);
        persistTimer = null;
    }

    /**
     * Сохраняет черновик в localStorage, если есть несохранённые изменения.
     */
    function persistDraftNow(): void {
        if (typeof window === 'undefined') {
            return;
        }

        // Без права правки автосейв не трогает черновик вовсе — ни запись, ни
        // удаление (почему — в IBuilderDraftPersistenceOptions)
        if (!canEdit.value) {
            return;
        }

        // Без isSessionReady сюда проходило бы состояние после ошибки bootstrap'а
        // (isSessionLoading снимается в finally): сохранение мусора затёрло бы
        // валидный черновик — тем заметнее, что сброс на выгрузке безусловный.
        if (isSessionLoading.value || !isSessionReady.value) {
            return;
        }

        const address = sessionAddress.value;
        if (!address.pagename) {
            return;
        }

        const snapshot = buildCurrentSnapshot();
        const isEditing = publishStore.editingPageId !== null;

        if (isEditing && savedSnapshot.value && isSnapshotEqual(snapshot, savedSnapshot.value)) {
            // Пока на предложение восстановить не ответили, «совпадает с сохранённой
            // версией» означает лишь то, что пользователь ещё ничего не менял, — а
            // не то, что черновик лишний: удалить его здесь значит ответить за
            // пользователя. Сюда приходит и служебная перезапись формы (сохранение
            // заново присваивает `published`), и сброс на выгрузке
            if (isDraftRestorePending.value) {
                return;
            }

            // Исход важен и здесь: неудалённый черновик равен сохранённому
            // состоянию лишь сейчас, а после следующей правки снова разойдётся
            // с ним и при новом заходе предложит восстановление
            if (!removeBuilderDraft(address)) {
                draftStorageNotice.report();
            }

            return;
        }

        const isPersisted = setBuilderDraft({
            pagename: address.pagename,
            urlPrefix: address.urlPrefix,
            updatedAt: new Date().toISOString(),
            mode: isEditing ? 'edit' : 'new',
            pageId:
                typeof publishStore.editingPageId === 'number'
                    ? publishStore.editingPageId
                    : undefined,
            savedSnapshot: savedSnapshot.value ?? undefined,
            draftSnapshot: snapshot,
        });

        // Второй путь к тому же сообщению: проба на входе в сессию ловит
        // запрещённое хранилище, а сюда приходит отказ, возникший уже по ходу
        // работы (например, исчерпанная квота на большой схеме)
        if (!isPersisted) {
            draftStorageNotice.report();
        }
    }

    /**
     * Планирует сохранение черновика (debounce).
     */
    function scheduleDraftPersist(): void {
        if (typeof window === 'undefined' || isSessionLoading.value || !isSessionReady.value) {
            return;
        }

        clearPersistTimer();
        persistTimer = window.setTimeout(() => {
            persistDraftNow();
            clearPersistTimer();
        }, 800);
    }

    /**
     * Синхронно сохраняет черновик при выгрузке страницы: таймер debounce её не
     * переживает, поэтому без сброса терялись изменения последних 800 мс — F5,
     * закрытие вкладки, мягкий рестарт dev-сервера на правку brick-файла.
     *
     * Сохраняет безусловно, а не только при запланированном таймере: «таймера
     * нет» не значит «нечего сохранять». Правка пропса меняет компонент в сторе
     * синхронно, а `saveToHistory` вызывает через собственный debounce 300 мс
     * (`core/stores/actions/properties.ts`), так что в это окно `historyIndex`
     * ещё прежний, watch ниже не срабатывал и таймера нет — а `buildCurrentSnapshot`
     * уже отдаёт новое значение. Цена — возможная лишняя запись в localStorage,
     * если таймер успел отработать перед выгрузкой; нового состояния восстановления
     * она не создаёт (в edit-режиме `persistDraftNow` сверяется с `savedSnapshot`,
     * `updatedAt` черновика никто не читает).
     */
    function flushDraft(): void {
        clearPersistTimer();
        persistDraftNow();
    }

    // Проба на готовности сессии, а не на первой правке: запрещённое хранилище
    // иначе обнаружилось бы только через ~800 мс после первого изменения на
    // канвасе — то есть предупреждение приходило бы уже после того, как
    // пользователь начал работать, считая правки защищёнными.
    //
    // Право правки — второй источник наблюдения, а не просто условие внутри:
    // проба сама пишет в хранилище, и без него роль без права правки трогала бы
    // localStorage и получала бы сообщение о черновиках, которых у неё нет
    watch([isSessionReady, canEdit], ([isReady, isEditable]) => {
        if (!isReady || !isEditable || isBuilderDraftStorageAvailable()) {
            return;
        }

        draftStorageNotice.report();
    });

    watch(
        // Ссылка на текущий снапшот истории, а не `historyIndex`: при заполненной
        // истории `capture()` поднимает индекс и тут же возвращает его обратно
        // `clampHistory`, поэтому наблюдаемое значение индекса не меняется и правки
        // канваса переставали автосохраняться совсем. Объект снапшота новый на
        // каждый `capture`, а undo/redo двигают индекс — оба случая видны.
        [
            () => historyStore.history[historyStore.historyIndex],
            () => publishStore.currentFormState,
        ],
        () => {
            scheduleDraftPersist();
        },
        { deep: false }
    );

    // Переход на другую страницу билдера не размонтирует страницу (статический page
    // key в `[pagename].vue`), поэтому `onScopeDispose` не сработает, а
    // `openBuilderSession` успеет переписать `sessionAddress` и снять
    // `isSessionReady` — отложенное сохранение прежней страницы иначе теряется.
    // `flush: 'sync'` обязателен: обычный watcher выполнился бы после watcher'а
    // сессии (тот зарегистрирован раньше), то есть уже с ключом новой страницы.
    //
    // Следим за адресом целиком: переход `/bricks/blog/post` → `/bricks/news/post`
    // меняет только префикс, и watcher по имени его бы не заметил — отложенная
    // запись прежней страницы ушла бы под ключ новой.
    watch(
        () => getPageAddressKey(routeAddress.value),
        () => {
            flushDraft();
        },
        { flush: 'sync' }
    );

    // pagehide, а не beforeunload: приходит и при переходе страницы в page cache,
    // и на мобильных, где beforeunload не гарантирован
    if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', flushDraft);
    }

    onScopeDispose(() => {
        // Уход из редактора на дашборд — не выгрузка документа: `pagehide` не
        // придёт, а запланированное сохранение иначе просто отбрасывалось бы
        // вместе с таймером. Состояние на этот момент честное: сторы живут на
        // уровне приложения, unmount страницы их не сбрасывает.
        flushDraft();

        if (typeof window !== 'undefined') {
            window.removeEventListener('pagehide', flushDraft);
        }
    });
}
