// #region Imports
// Types
import type { IBricksUserSummary } from '../../../common/types/auth';
import type { IUsersListResponse, IUsersState, IUseUsersDataReturn } from '../types/users';

// Utils
import { isUsersSectionUnavailableError } from '../utils/userErrors';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';

// Nuxt
import { useNuxtApp, useState } from '#imports';
// #endregion

// #region Data
/** Ключ общего состояния списка учёток: одно значение на приложение. */
const USERS_STATE_KEY = 'bricks-users';

/** Ручка списка и создания учёток. */
const USERS_ENDPOINT = '/api/bricks/users';

/**
 * Идущая загрузка — по экземпляру приложения Nuxt, а не переменной модуля.
 *
 * Модуль-глобальный промис на сервере общий для ВСЕХ запросов процесса: два
 * одновременных SSR-рендера дашборда получили бы один и тот же список, то есть
 * администратор мог бы увидеть ответ, полученный по чужой сессии. `WeakMap` по
 * экземпляру приложения изолирует дедупликацию по запросу и не держит ссылку
 * после его завершения.
 */
const inflightRequests = new WeakMap<object, Promise<void>>();
// #endregion

/**
 * Список учёток раздела «Пользователи»: чтение с сервера и точечные правки
 * состояния после операций.
 *
 * Состояние — `useState`, а не Pinia-store: список живёт на одной поверхности
 * (раздел дашборда), межповерхностного кеша ему не нужно, зато нужен SSR-сид —
 * счётчик в рейле рисуется в первом кадре, вместе с самим пунктом раздела.
 *
 * Правки после операций точечные (`upsertUser`, `removeUser`), а не повторное
 * чтение всего списка: ручки отдают полное состояние учётки, и второй GET за тем
 * же, что уже приехало, только добавил бы кадр, в котором список успел
 * перерисоваться дважды. Полное перечитывание остаётся у `refreshUsers` — для
 * повтора после отказа и для сверки, когда сервер сообщил о расхождении.
 *
 * @returns Список, признак готовности и операции над состоянием.
 */
export function useUsersData(): IUseUsersDataReturn {
    // #region Data
    const nuxtApp = useNuxtApp();
    const { apiFetcher } = useApiClient();
    const { canManageUsers } = useBuilderPermissions();

    // Состояние всегда заменяется целиком, а не правится по полям: `useState`
    // хранит объект, и точечная мутация внутри него не обязана оповещать
    // подписчиков — счётчик рейла и строки списка читают его через computed
    const state = useState<IUsersState>(USERS_STATE_KEY, () => ({ users: [], status: 'idle' }));
    // #endregion

    // #region Computed
    const users = computed<IBricksUserSummary[]>(() => state.value.users);
    const status = computed(() => state.value.status);

    const usersCount = computed<number | null>(() =>
        state.value.status === 'ready' ? state.value.users.length : null
    );

    /**
     * Единственный активный администратор — тот, кого нельзя ни понизить, ни
     * выключить, ни удалить: система осталась бы без управления учётками.
     *
     * Считается по полному списку (поиск и фильтр на это правило не влияют) и
     * остаётся подсказкой интерфейса: решает всё равно сервер, у которого набор
     * администраторов заблокирован транзакцией. Значение здесь ровно для того,
     * чтобы человек увидел замок с объяснением до клика, а не 409 после.
     */
    const lastActiveAdminId = computed<number | null>(() => {
        const activeAdmins = state.value.users.filter(
            (user) => user.isActive && user.role === 'admin'
        );

        return activeAdmins.length === 1 ? activeAdmins[0].id : null;
    });
    // #endregion

    // #region Methods
    /**
     * Читает список с сервера и раскладывает исход по состоянию раздела.
     *
     * Отказ наружу не бросается: загрузку запускает composition root до первого
     * кадра, и отклонённый промис унёс бы весь дашборд из-за раздела, которого
     * человек мог и не открыть. Вместо этого состояние помечается — окончательно
     * недоступным (раздела в установке нет) или временно отказавшим (сеть, 5xx),
     * и второе показывает кнопку повтора.
     */
    async function loadUsers(): Promise<void> {
        // Прочитанный список на время чтения не гасится: строки на экране уже
        // верны на момент прошлого ответа, а спиннер вместо них при каждом входе
        // в раздел отнимал бы у человека то, что он пришёл посмотреть. Отказ
        // состояние помечает по-прежнему — устаревший список молча выдавать за
        // свежий нельзя
        if (state.value.status !== 'ready') {
            state.value = { ...state.value, status: 'loading' };
        }

        try {
            const response = await requestWithinDeadline();

            state.value = { users: response.users, status: 'ready' };
        } catch (error: unknown) {
            state.value = {
                ...state.value,
                status: isUsersSectionUnavailableError(error) ? 'unavailable' : 'error',
            };

            console.error('[Builder] Failed to load users list:', error);
        }
    }

    /**
     * Ограничивает ожидание списка на SSR.
     *
     * Потолок транспорта на сервере инертен: относительный URL уходит внутренним
     * вызовом Nitro, а он `AbortSignal` не слушает. Без внешнего дедлайна
     * зависший запрос держал бы не список учёток, а весь ответ страницы —
     * дашборд не приехал бы вовсе из-за раздела, который в первом кадре
     * показывает одно число.
     *
     * @returns Ответ ручки списка.
     */
    function requestWithinDeadline(): Promise<IUsersListResponse> {
        const request = apiFetcher<IUsersListResponse>(USERS_ENDPOINT, {
            timeout: BRICKS_API_READ_TIMEOUT_MS,
        });

        if (!import.meta.server) {
            return request;
        }

        const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

        return withPromiseDeadline(
            request,
            deadlineMs,
            () => new Error(`Users list did not arrive within ${deadlineMs} ms`)
        );
    }

    /**
     * Отдаёт идущую загрузку либо запускает новую.
     *
     * Дедупликация нужна не от повторных вызовов composition root, а от второго
     * потребителя списка: рейл со счётчиком и сам раздел спрашивают одно
     * состояние, и без общего промиса первый кадр отправил бы два одинаковых GET.
     * Второй вызов во время идущей загрузки к ней и присоединяется — в том числе
     * повтор по кнопке, нажатой дважды.
     *
     * @returns Промис текущей загрузки.
     */
    function startLoad(): Promise<void> {
        const inflight = inflightRequests.get(nuxtApp);

        if (inflight) {
            return inflight;
        }

        const request = loadUsers().finally(() => {
            inflightRequests.delete(nuxtApp);
        });

        inflightRequests.set(nuxtApp, request);

        return request;
    }

    /**
     * Загружает список, если он ещё не прочитан.
     *
     * Право на раздел проверяется ЗДЕСЬ, а не у вызывающего: запрос без него
     * заведомо получит отказ, и держать этот гард на стороне хоста значило бы
     * терять его при появлении второго потребителя списка. Роль к моменту вызова
     * обязана быть известна — в сборке без SSR это `ensureRole` composition
     * root'а, иначе наблюдатель отправил бы запрос за отказом.
     *
     * Готовый список повторно не читается, недоступный раздел — тоже: 403 и 404
     * означают, что ручек в этой установке нет вовсе, и попытка «а вдруг
     * появились» на каждом входе в раздел была бы запросом ради того же ответа.
     */
    async function ensureUsers(): Promise<void> {
        if (!canManageUsers.value) {
            state.value = { ...state.value, status: 'unavailable' };
            return;
        }

        if (state.value.status === 'ready' || state.value.status === 'unavailable') {
            return;
        }

        return startLoad();
    }

    /**
     * Перечитывает список принудительно: повтор после временного отказа и сверка
     * после отказа операции, показавшего, что список отстал от базы.
     *
     * Прежний список при отказе повтора не исчезает — состояние лишь помечается
     * отказавшим, а строки остаются: пустой экран сообщил бы, что учёток нет.
     */
    async function refreshUsers(): Promise<void> {
        return startLoad();
    }

    /**
     * Кладёт учётку в список: известную — на её место, новую — в конец.
     *
     * В конец, а не в начало: сервер отдаёт список в порядке создания (по `id`),
     * и созданная учётка обязана оказаться там же, где окажется после следующего
     * чтения — иначе она прыгнула бы на другое место при первом же обновлении.
     *
     * @param user - Состояние учётки, полученное от ручки.
     */
    function upsertUser(user: IBricksUserSummary): void {
        const isKnown = state.value.users.some((item) => item.id === user.id);

        state.value = {
            ...state.value,
            users: isKnown
                ? state.value.users.map((item) => (item.id === user.id ? user : item))
                : [...state.value.users, user],
        };
    }

    /**
     * Убирает учётку из списка после подтверждённого удаления.
     *
     * @param userId - Идентификатор удалённой учётки.
     */
    function removeUser(userId: number): void {
        state.value = {
            ...state.value,
            users: state.value.users.filter((item) => item.id !== userId),
        };
    }
    // #endregion

    return {
        users,
        status,
        usersCount,
        lastActiveAdminId,
        ensureUsers,
        refreshUsers,
        upsertUser,
        removeUser,
    };
}
