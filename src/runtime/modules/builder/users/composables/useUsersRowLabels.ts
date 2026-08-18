// #region Imports
// Types
import type { IUsersListRowProps, IUseUsersRowLabelsReturn } from '../types/users';

// Utils
import { formatUserDate, formatUserLoginDate, resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Тексты строки учётки: подпись человека, мета-строка дат, доступные имена
 * кнопок и причины запретов.
 *
 * Вынесено из строки целиком, потому что это её самая обособленная часть: тексты
 * не касаются ни разметки, ни событий наружу и зависят только от учётки и её
 * положения (своя, последний администратор). Разметке остаётся то, чем она и
 * является, — узлы и обработчики.
 *
 * Замки объявляются здесь же, а не рядом с обработчиками, потому что замок — это
 * и есть текст причины: `isRoleLocked` и `isStateLocked` производны от подсказок,
 * и разнесение двух половин одного правила по файлам развело бы их молча.
 *
 * @param props - Свойства строки; читаются реактивно, снимок не делается.
 * @returns Подписи и подсказки строки.
 */
export function useUsersRowLabels(props: IUsersListRowProps): IUseUsersRowLabelsReturn {
    // #region Data
    const { t } = useI18n();
    // #endregion

    // #region Computed
    const userLabel = computed<string>(() => resolveUserLabel(props.user));

    /**
     * Логин рядом с именем — только если он отличается от показанного имени: у
     * учётки без отображаемого имени в заголовке и так стоит логин, и повтор
     * выглядел бы как две разные подписи одного человека.
     */
    const hasSecondaryUsername = computed<boolean>(() => userLabel.value !== props.user.username);

    /**
     * Мета-строка: когда учётку создали и когда по ней входили последний раз.
     *
     * «Ни разу не входил» — не украшение: по нему администратор находит учётки,
     * которые завели и забыли, а именно они и остаются лишним входом в систему.
     */
    const metaText = computed<string>(() => {
        const created = t('bricks.users.row.created', {
            date: formatUserDate(props.user.createdAt),
        });
        const login = formatUserLoginDate(props.user.lastLoginAt, {
            today: t('bricks.users.row.today'),
            yesterday: t('bricks.users.row.yesterday'),
        });

        const loginText = login
            ? t('bricks.users.row.lastLogin', { date: login })
            : t('bricks.users.row.neverLoggedIn');

        return `${created} · ${loginText}`;
    });

    /** Метка своей строки: её ищут глазами прежде, чем нажать на действие. */
    const selfBadgeLabel = computed<string>(() => t('bricks.users.row.you'));

    const statusLabel = computed<string>(() =>
        props.user.isActive ? t('bricks.users.status.active') : t('bricks.users.status.inactive')
    );

    /**
     * Причина, по которой роль не меняется. Своя учётка и последний
     * администратор — разные причины, и общий текст «нельзя» не подсказал бы, что
     * делать: во втором случае достаточно назначить второго администратора.
     */
    const roleLockHint = computed<string>(() => {
        if (props.isCurrentUser) {
            return t('bricks.users.row.locks.selfRole');
        }

        return props.isLastActiveAdmin ? t('bricks.users.row.locks.lastAdmin') : '';
    });

    const isRoleLocked = computed<boolean>(() => roleLockHint.value !== '');

    /**
     * Причина, по которой недоступны выключение входа и удаление.
     */
    const stateLockHint = computed<string>(() => {
        if (props.isCurrentUser) {
            return t('bricks.users.row.locks.self');
        }

        return props.isLastActiveAdmin ? t('bricks.users.row.locks.lastAdmin') : '';
    });

    const isStateLocked = computed<boolean>(() => stateLockHint.value !== '');

    /** Подпись кнопки пароля: своя форма и админская — разные операции. */
    const passwordActionLabel = computed<string>(() =>
        props.isCurrentUser
            ? t('bricks.users.row.changeOwnPassword')
            : t('bricks.users.row.setPassword', { user: userLabel.value })
    );

    /** Подпись кнопки входа — по текущему состоянию учётки. */
    const toggleActiveLabel = computed<string>(() =>
        props.user.isActive
            ? t('bricks.users.row.deactivate', { user: userLabel.value })
            : t('bricks.users.row.activate', { user: userLabel.value })
    );

    /**
     * Подсказка кнопки: у заблокированной — причина запрета, у доступной — само
     * действие. Доступное имя при этом остаётся действием всегда: подсказка
     * объясняет, почему кнопка не срабатывает, но не отменяет того, чем она была.
     */
    const toggleActiveTitle = computed<string>(() =>
        isStateLocked.value ? stateLockHint.value : toggleActiveLabel.value
    );

    const deleteLabel = computed<string>(() =>
        t('bricks.users.row.delete', { user: userLabel.value })
    );

    const deleteTitle = computed<string>(() =>
        isStateLocked.value ? stateLockHint.value : deleteLabel.value
    );
    // #endregion

    return {
        userLabel,
        hasSecondaryUsername,
        metaText,
        selfBadgeLabel,
        statusLabel,
        roleLockHint,
        isRoleLocked,
        isStateLocked,
        passwordActionLabel,
        toggleActiveLabel,
        toggleActiveTitle,
        deleteLabel,
        deleteTitle,
    };
}
