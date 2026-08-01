// #region Imports
// Types
import type {
    IPublishPagesData,
    IUsePublishPagesDataOptions,
    IUsePublishPagesDataReturn,
} from '../types/composables';

// Utils
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed, onScopeDispose, ref, watch } from 'vue';

// Nuxt
import { onNuxtReady, useAsyncData } from '#imports';

// Pinia
import { usePublishStore } from '../stores/publish';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';
// #endregion

/** Ключ кеша списка: один на приложение — дашборд и билдер делят один список. */
const PAGES_ASYNC_DATA_KEY = 'bricks-pages';

/**
 * Ограничивает ожидание списка на SSR.
 *
 * Потолок транспорта здесь инертен: относительный URL уходит внутренним вызовом
 * Nitro, а он `AbortSignal` не слушает. Без внешнего дедлайна зависший запрос
 * держал бы не список, а весь ответ страницы: пока список грузился с клиента,
 * зависание оставляло пользователю рабочий дашборд, а серверное ожидание не
 * отдаст ему HTML вовсе. Зависший запрос дедлайн не обрывает — только перестаёт
 * его ждать; сам ресурс ограничивает серверный лимит хранилища.
 *
 * Ошибка дедлайна от прочих отказов не отличается: на сервере оба исхода ведут
 * в одну деградацию, и различать их было бы знанием без потребителя.
 *
 * @param request - Промис загрузки списка в стор.
 * @returns Тот же промис, на клиенте — без дедлайна.
 */
function loadPagesWithinDeadline(request: Promise<void>): Promise<void> {
    if (!import.meta.server) {
        return request;
    }

    const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

    return withPromiseDeadline(
        request,
        deadlineMs,
        () => new Error(`Pages list did not arrive within ${deadlineMs} ms`)
    );
}

/**
 * Загружает список страниц дашборда на сервере, чтобы разметка первого кадра
 * приезжала уже со страницами. Раньше список грузился из `onMounted`, и
 * SSR-разметка уходила пользователю с пустым списком — до ответа ручки он видел
 * не спиннер, а пустое состояние «страниц пока нет».
 *
 * Результат кладётся в `publishStore.publishedPages` — единственный источник
 * списка: оттуда же его берёт bootstrap сессии билдера, который ходит за
 * списком, только если стор пуст. Загрузка идёт store-действием `loadAllPages`,
 * а не отдельным запросом, чтобы у списка осталась одна точка записи вместе с
 * её защитой от устаревших ответов.
 *
 * Отказ на сервере не отклоняет загрузку, а помечает её деградированной:
 * отклонение легло бы в `payload._errors`, а при гидрации с ошибкой Nuxt
 * пропускает первый запрос — список остался бы пустым до полной перезагрузки,
 * которая снова ушла бы в тот же SSR. Клиент повторяет запрос один раз и чинит
 * оба исхода — включая мёртвую сессию database-режима, где 401 на клиенте
 * уводит на логин (на сервере обработчик 401 выходит сразу и редиректа не
 * делает).
 *
 * @param options - Колбэк отказа загрузки (тост дашборда).
 * @returns Признак идущей загрузки для списка страниц.
 */
export async function usePublishPagesData(
    options: IUsePublishPagesDataOptions
): Promise<IUsePublishPagesDataReturn> {
    const publishStore = usePublishStore();

    // Промис `useAsyncData` намеренно не await'ится здесь: до await нужно
    // синхронно зарегистрировать восстановление и наблюдателя отказа, а после
    // него активный scope потерян
    const pagesData = useAsyncData<IPublishPagesData>(PAGES_ASYNC_DATA_KEY, async () => {
        try {
            await loadPagesWithinDeadline(publishStore.loadAllPages());
        } catch (error: unknown) {
            if (!import.meta.server) {
                throw error;
            }

            console.warn('[BricksBuilder] Pages list SSR load failed:', error);

            return { isPartial: true };
        }

        return { isPartial: false };
    });

    // Деградировавший SSR-прогон снимается клиентским повтором; до его конца
    // список считается загружающимся
    const isRecoveryFinished = ref(false);

    // Спиннер вместо пустого состояния и после SSR-отказа: «страниц пока нет» с
    // кнопкой создания — утверждение, а список в этот момент ещё не прочитан
    const isLoadingPages = computed<boolean>(
        () =>
            pagesData.status.value === 'pending' ||
            (pagesData.data.value?.isPartial === true && !isRecoveryFinished.value)
    );

    // Отказ докладывается наблюдателем, а не по месту вызова: инициатора два —
    // первый запрос при клиентской навигации в дашборд и восстановление после
    // SSR, и на клиенте ни один из них не await'ится. На сервере колбэки watch
    // не исполняются, поэтому тихая деградация остаётся тихой
    watch(pagesData.error, (error: unknown) => {
        if (error) {
            options.onLoadFailed();
        }
    });

    // Страница ещё смонтирована на момент запуска восстановления: пользователь
    // успевает уйти в билдер, пока восстановление ждёт конца гидрации
    let isPageAlive = true;
    let isRecoveryStarted = false;

    /**
     * Восстанавливает список после деградировавшего SSR-прогона — ровно один
     * запрос с клиента. Прежний список при отказе повтора не исчезает: он живёт
     * в сторе, а `loadAllPages` при отказе его не трогает.
     */
    function recoverDegradedPages(): void {
        if (!isPageAlive || isRecoveryStarted || pagesData.data.value?.isPartial !== true) {
            return;
        }

        isRecoveryStarted = true;

        // Отпускаем: результат ждать некому, отказ доложит наблюдатель выше.
        // `void` не пишем — правило `no-void` в oxlint
        pagesData
            .refresh()
            .catch((error: unknown) => {
                console.warn('[BricksBuilder] Pages list recovery failed:', error);
            })
            .finally(() => {
                isRecoveryFinished.value = true;
            });
    }

    // `onScopeDispose` вместо `onUnmounted`: со вторым аргументом он молчит вне
    // компонента, поэтому композабл остаётся вызываемым в unit-тестах
    onScopeDispose(() => {
        isPageAlive = false;
    }, true);

    // Не `onMounted`: пока идёт гидрация, `refresh()` возвращает ответ из
    // payload, не обращаясь к ручке. `onNuxtReady` привязан к моменту, когда
    // повтор реально уйдёт в сеть; на сервере он не делает ничего
    onNuxtReady(recoverDegradedPages);

    // Ожидание только на сервере: без него разметка уедет с пустым списком —
    // ровно то, что этой загрузкой и чинится. На клиенте ожидание задержало бы
    // переход из билдера в дашборд на время запроса, и вместо спиннера в списке
    // пользователь смотрел бы на замерший билдер
    if (import.meta.server) {
        await pagesData;
    }

    return {
        isLoadingPages,
    };
}
