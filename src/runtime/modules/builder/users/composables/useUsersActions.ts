// #region Imports
// Types
import type { IBricksUserSummary, TBricksUserRole } from '../../../common/types/auth';
import type {
    IUserResponse,
    IUseUsersActionsOptions,
    IUseUsersActionsReturn,
    TUsersConfirmKind,
} from '../types/users';

// Utils
import { isStaleListError, resolveUserActionErrorKey } from '../utils/userErrors';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useUsersData } from './useUsersData';

// Constants
import { BRICKS_AUTH_REQUEST_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';
// #endregion

/**
 * Операции над чужими учётками: роль, вход и удаление — вместе с
 * подтверждениями и тостами.
 *
 * Оптимистичных правок здесь нет ни у одной операции: ручки отдают полное
 * состояние строки, и ждать ответа дешевле, чем рисовать предположение, которое
 * при отказе надо откатывать. Пока запрос летит, занят весь раздел: вторая
 * операция не начинается ни над этой строкой, ни над соседней.
 *
 * Над одной строкой — потому что два ответа с полным состоянием учётки
 * перезаписали бы друг друга в порядке прихода. Над соседними параллельность
 * технически возможна (список правится по `id`, ответы разных строк не
 * сталкиваются), но не нужна: операций над учётками мало и идут они по одной, а
 * платой была бы пара занятых строк на экране, набор занятых `id` вместо одного
 * и разбор порядка тостов. Занятость поэтому одна на раздел — и разметка обязана
 * гасить действия ВСЕХ строк, иначе кнопки соседних выглядят рабочими, а клик по
 * ним молча ничего не делает.
 *
 * Отказы разбираются по существу. Расхождение с сервером (краевое правило,
 * которого интерфейс не ждал, или исчезнувшая учётка) и обрыв по потолку
 * ожидания дополнительно перечитывают список: в первом случае показанное
 * состояние отстало от базы, во втором исход операции неизвестен — сервер мог её
 * применить и не успеть ответить, и «не удалось» было бы неправдой.
 *
 * @param options - Показ тостов (владеет им дашборд).
 * @returns Состояние занятости, подтверждения и операции.
 */
export function useUsersActions(options: IUseUsersActionsOptions): IUseUsersActionsReturn {
    // #region Data
    const { t } = useI18n();
    const { apiFetcher } = useApiClient();
    const { upsertUser, removeUser, refreshUsers } = useUsersData();

    const pendingUserId = ref<number | null>(null);
    /** Что подтверждаем и над кем; `null` — диалог закрыт. */
    const confirmKind = ref<TUsersConfirmKind | null>(null);
    const confirmTarget = ref<IBricksUserSummary | null>(null);
    const isConfirmLoading = ref(false);
    // #endregion

    // #region Computed
    const isConfirmOpen = computed<boolean>(() => confirmKind.value !== null);

    /**
     * Подпись цели подтверждения. Берётся из снимка учётки, сделанного в момент
     * запроса подтверждения: список за время открытого диалога может измениться,
     * и заголовок обязан называть того, о ком спрашивали.
     */
    const confirmUserLabel = computed<string>(() =>
        confirmTarget.value ? resolveUserLabel(confirmTarget.value) : ''
    );

    const confirmTitle = computed<string>(() =>
        confirmKind.value
            ? t(`bricks.users.confirm.${confirmKind.value}.title`, { user: confirmUserLabel.value })
            : ''
    );

    const confirmDescription = computed<string>(() =>
        confirmKind.value ? t(`bricks.users.confirm.${confirmKind.value}.description`) : ''
    );

    const confirmActionText = computed<string>(() =>
        confirmKind.value ? t(`bricks.users.confirm.${confirmKind.value}.action`) : ''
    );
    // #endregion

    // #region Methods
    /**
     * Выполняет операцию над учёткой под флагом занятости и разбирает отказ.
     *
     * Один порядок на все операции: занятость, запрос, разбор отказа, снятие
     * занятости. Отдельные `try/catch` в каждой операции разъехались бы —
     * например, перечитывание списка после обрыва появилось бы у одной из них.
     *
     * @param user - Учётка-цель.
     * @param operation - Сам запрос.
     * @returns Признак успеха: вызывающему нужно знать, показывать ли тост успеха.
     */
    async function runUserOperation(
        user: IBricksUserSummary,
        operation: () => Promise<void>
    ): Promise<boolean> {
        // Занятость общая на раздел: пока идёт операция, вторая не начинается
        // ни здесь, ни в соседней строке
        if (pendingUserId.value !== null) {
            return false;
        }

        pendingUserId.value = user.id;

        try {
            await operation();

            return true;
        } catch (error: unknown) {
            options.onNotify(t(resolveUserActionErrorKey(error)), 'error');

            if (isStaleListError(error) || isRequestTimeoutError(error)) {
                await refreshUsers();
            }

            return false;
        } finally {
            pendingUserId.value = null;
        }
    }

    /**
     * Правит состояние учётки (роль или возможность входа) и кладёт ответ в
     * список.
     *
     * @param user - Учётка-цель.
     * @param change - Изменяемые поля.
     */
    async function patchUser(
        user: IBricksUserSummary,
        change: { role?: TBricksUserRole; isActive?: boolean }
    ): Promise<void> {
        const response = await apiFetcher<IUserResponse>(`/api/bricks/users/${user.id}`, {
            method: 'PATCH',
            body: change,
            // Короткая запись — один UPDATE строки учётки с отзывом её сессий;
            // общий потолок записи держал бы строку занятой втрое дольше нужного
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });

        upsertUser(response.user);
    }

    /**
     * Меняет роль учётки.
     *
     * Повторный выбор текущей роли запроса не отправляет вовсе: сервер такую
     * правку игнорирует (состояние не изменилось — сессии не рвутся), но тост
     * «сессии завершены» после неё был бы ложью, а строка мигнула бы занятостью
     * без причины.
     *
     * @param user - Учётка-цель.
     * @param role - Новая роль.
     */
    async function changeRole(user: IBricksUserSummary, role: TBricksUserRole): Promise<void> {
        if (user.role === role) {
            return;
        }

        const isDone = await runUserOperation(user, () => patchUser(user, { role }));

        if (isDone) {
            options.onNotify(t('bricks.users.toasts.roleChanged'), 'success');
        }
    }

    /**
     * Включает вход учётке.
     *
     * Подтверждения не требует, в отличие от выключения: включение расширяет
     * доступ и отменяется тем же действием рядом, а вопрос перед безобидной
     * операцией учит закрывать вопросы не читая.
     *
     * @param user - Учётка-цель.
     */
    async function activateUser(user: IBricksUserSummary): Promise<void> {
        const isDone = await runUserOperation(user, () => patchUser(user, { isActive: true }));

        if (isDone) {
            options.onNotify(t('bricks.users.toasts.activated'), 'success');
        }
    }

    /**
     * Спрашивает подтверждение операции, которую человек не ждёт отменить одним
     * кликом: выключение входа рвёт живые сессии, удаление необратимо.
     *
     * @param kind - Что подтверждаем.
     * @param user - Учётка-цель.
     */
    function requestConfirm(kind: TUsersConfirmKind, user: IBricksUserSummary): void {
        // Диалог не открывается на время чужой операции: подтверждённая правка
        // всё равно была бы отброшена занятостью, и вопрос остался бы без ответа
        if (pendingUserId.value !== null) {
            return;
        }

        confirmKind.value = kind;
        confirmTarget.value = user;
    }

    /**
     * Закрывает подтверждение, не выполняя операцию.
     *
     * Цель снимается вместе с видом: оставленный снимок учётки читался бы
     * заголовком следующего диалога до того, как в него положат новую цель.
     */
    function closeConfirm(): void {
        confirmKind.value = null;
        confirmTarget.value = null;
    }

    /**
     * Выключает вход учётке.
     *
     * @param user - Учётка-цель.
     */
    async function deactivateUser(user: IBricksUserSummary): Promise<void> {
        const isDone = await runUserOperation(user, () => patchUser(user, { isActive: false }));

        if (isDone) {
            options.onNotify(t('bricks.users.toasts.deactivated'), 'success');
        }
    }

    /**
     * Удаляет учётку и убирает её строку из списка.
     *
     * Строка снимается только после ответа: удаление, показанное до
     * подтверждения сервером, при отказе пришлось бы возвращать на её место в
     * порядке списка.
     *
     * @param user - Учётка-цель.
     */
    async function deleteUser(user: IBricksUserSummary): Promise<void> {
        const isDone = await runUserOperation(user, async () => {
            await apiFetcher(`/api/bricks/users/${user.id}`, {
                method: 'DELETE',
                timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
            });

            removeUser(user.id);
        });

        if (isDone) {
            options.onNotify(
                t('bricks.users.toasts.deleted', { user: resolveUserLabel(user) }),
                'success'
            );
        }
    }

    /**
     * Выполняет подтверждённую операцию и закрывает диалог.
     *
     * Диалог закрывается ПОСЛЕ ответа, а его кнопка держит состояние ожидания:
     * закройся он раньше — и человек остался бы со списком, в котором строка ещё
     * не изменилась, не зная, идёт ли операция.
     */
    async function confirmAction(): Promise<void> {
        const target = confirmTarget.value;
        const kind = confirmKind.value;

        if (!target || !kind || isConfirmLoading.value) {
            return;
        }

        isConfirmLoading.value = true;

        try {
            if (kind === 'delete') {
                await deleteUser(target);
            } else {
                await deactivateUser(target);
            }
        } finally {
            isConfirmLoading.value = false;
            closeConfirm();
        }
    }
    // #endregion

    return {
        pendingUserId: computed(() => pendingUserId.value),
        isConfirmOpen,
        confirmTitle,
        confirmDescription,
        confirmActionText,
        isConfirmLoading: computed(() => isConfirmLoading.value),
        changeRole,
        activateUser,
        requestConfirm,
        closeConfirm,
        confirmAction,
    };
}
