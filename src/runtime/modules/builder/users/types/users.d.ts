/**
 * Типы раздела «Пользователи» дашборда: состояние списка, фильтры, формы и
 * контракты компонентов.
 *
 * Сама учётка описана в `common/types/auth` (`IBricksUserSummary`) — форма
 * ответа ручек одна на сервер и клиент, и второе объявление здесь разошлось бы
 * с серверным молча.
 */
import type { ComputedRef, Ref } from 'vue';
import type { IBricksUserSummary, TBricksUserRole } from '../../../common/types/auth';
import type { TBricksToastVariant } from '../../../ui/feedback/types';

/** Сегмент-фильтр списка по возможности входа. */
export type TUsersFilter = 'all' | 'active' | 'inactive';

export interface IUsersFilterCounts {
    all: number;
    active: number;
    inactive: number;
}

/**
 * Состояние загрузки раздела.
 *
 * `unavailable` отделён от `error` намеренно: 403 и 404 означают, что раздела в
 * этой установке нет вовсе (выключен флагом, режим не database, роль не та), и
 * предлагать повтор нечего — пункт рейла в этом состоянии исчезает. Всё
 * остальное (сеть, 5xx, обрыв по потолку ожидания) — временная неисправность:
 * раздел остаётся на месте с кнопкой повтора.
 */
export type TUsersStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

/**
 * Общее состояние раздела: список и признак его готовности.
 *
 * Живёт в `useState`, то есть уезжает в payload гидрации и изолировано на
 * запрос: модуль-глобальный `ref` смешал бы списки разных пользователей в одном
 * серверном процессе.
 */
export interface IUsersState {
    users: IBricksUserSummary[];
    status: TUsersStatus;
}

/** Ответ `GET /api/bricks/users`. */
export interface IUsersListResponse {
    users: IBricksUserSummary[];
}

/** Ответ ручек, отдающих одну учётку (создание и правка состояния). */
export interface IUserResponse {
    user: IBricksUserSummary;
}

export interface IUseUsersDataReturn {
    users: ComputedRef<IBricksUserSummary[]>;
    status: ComputedRef<TUsersStatus>;
    /**
     * Число учёток для счётчика рейла; `null` — список ещё не прочитан. Ноль
     * здесь был бы утверждением: учёток не может быть меньше одной (кто-то же
     * вошёл), и нарисованный во время загрузки ноль читался бы как поломка.
     */
    usersCount: ComputedRef<number | null>;
    /** Загружает список, если он ещё не прочитан; повторные вызовы ждут первый. */
    ensureUsers: () => Promise<void>;
    /** Перечитывает список принудительно (повтор после отказа, сверка после конфликта). */
    refreshUsers: () => Promise<void>;
    /**
     * Идентификатор единственного активного администратора; `null` — их больше
     * одного либо нет вовсе. Считается по ПОЛНОМУ списку, а не по видимому:
     * поиск и фильтр не меняют того, останется ли система с администратором.
     */
    lastActiveAdminId: ComputedRef<number | null>;
    /** Кладёт учётку в список: новую — в конец, известную — на её место. */
    upsertUser: (user: IBricksUserSummary) => void;
    /** Убирает учётку из списка после удаления. */
    removeUser: (userId: number) => void;
}

export interface IUseUsersListReturn {
    activeFilter: Ref<TUsersFilter>;
    filterCounts: ComputedRef<IUsersFilterCounts>;
    filteredUsers: ComputedRef<IBricksUserSummary[]>;
}

/** Что подтверждает диалог раздела: выключение входа или удаление учётки. */
export type TUsersConfirmKind = 'deactivate' | 'delete';

export interface IUseUsersActionsOptions {
    /** Показ тоста; вариант отделяет успех от отказа. */
    onNotify: (message: string, variant: TBricksToastVariant) => void;
}

export interface IUseUsersActionsReturn {
    /**
     * Учётка, над которой идёт операция; `null` — свободны все. Одна на весь
     * раздел, а не флаг на строку: две операции над одной строкой вернули бы два
     * полных состояния учётки, и порядок ответов решал бы, какое из них
     * останется в списке.
     */
    pendingUserId: ComputedRef<number | null>;
    /** Открыт диалог подтверждения. */
    isConfirmOpen: ComputedRef<boolean>;
    /** Заголовок и текст открытого подтверждения. */
    confirmTitle: ComputedRef<string>;
    confirmDescription: ComputedRef<string>;
    confirmActionText: ComputedRef<string>;
    /** Идёт подтверждённая операция — кнопка диалога в состоянии ожидания. */
    isConfirmLoading: ComputedRef<boolean>;
    /** Меняет роль учётки. */
    changeRole: (user: IBricksUserSummary, role: TBricksUserRole) => Promise<void>;
    /** Включает вход учётке (обратное деактивации; подтверждения не требует). */
    activateUser: (user: IBricksUserSummary) => Promise<void>;
    /** Спрашивает подтверждение выключения входа или удаления. */
    requestConfirm: (kind: TUsersConfirmKind, user: IBricksUserSummary) => void;
    /** Закрывает подтверждение, не выполняя операцию. */
    closeConfirm: () => void;
    /** Выполняет подтверждённую операцию. */
    confirmAction: () => Promise<void>;
}

/** Значения формы создания учётки. */
export interface IUsersCreateFormValues {
    username: string;
    displayName: string;
    password: string;
    role: TBricksUserRole;
    isActive: boolean;
}

/** Значения формы «задать пароль другому». */
export interface IUsersPasswordFormValues {
    password: string;
}

/**
 * Контекст фабрик yup-схем раздела: переводчик передаётся снаружи, поэтому
 * сообщения-функции реактивны к смене локали. Границы в сообщениях берутся из
 * общих константы, а не переписываются числом в текст перевода.
 */
export interface IUsersValidationSchemaOptions {
    t: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * Возвращаемые значения форм не описаны интерфейсами намеренно: сигнатуру
 * обработчика отправки задаёт vee-validate, и переписанная руками копия чужого
 * контракта разошлась бы с ним на первом же обновлении библиотеки. Так же
 * устроены формы логина и создания страницы.
 */
export interface IUseUsersCreateFormOptions {
    /** Учётка создана — вызывающий закрывает модалку. */
    onCreated: (user: IBricksUserSummary) => void;
}

export interface IUseUsersPasswordFormOptions {
    /** Учётка, которой задаётся пароль; `null` — модалка закрыта. */
    user: Ref<IBricksUserSummary | null> | ComputedRef<IBricksUserSummary | null>;
    /** Пароль задан — вызывающий закрывает модалку и показывает тост. */
    onSaved: (user: IBricksUserSummary) => void;
}

export interface IUsersSectionProps {
    /** Запрос из поля поиска общей шапки дашборда. */
    searchQuery: string;
    /** Открыта форма создания: её открывает первичная кнопка шапки. */
    isCreateModalOpen: boolean;
    /** Идентификатор своей учётки; `null` — профиль ещё не известен. */
    currentUserId: number | null;
}

export interface IUsersSectionEmits {
    /** Текст для тоста дашборда: тост один на всю поверхность. */
    notify: [message: string, variant: TBricksToastVariant];
    /** Форму создания закрывает хост — он же ею и владеет. */
    'close-create-modal': [];
    /** Пустой список просит создать первую учётку. */
    'create-user': [];
    /** Ключ в своей строке: открыть модалку профиля на вкладке пароля. */
    'change-own-password': [];
}

export interface IUsersListProps {
    users: IBricksUserSummary[];
    activeFilter: TUsersFilter;
    counts: IUsersFilterCounts;
    status: TUsersStatus;
    /** Есть ли учётки вообще — отличает «поиск ничего не нашёл» от пустого списка. */
    hasAnyUsers: boolean;
    /** Идентификатор своей учётки: её строка помечается и теряет часть действий. */
    currentUserId: number | null;
    /** Единственный активный администратор: его строка получает замок. */
    lastActiveAdminId: number | null;
    /** Учётка, над которой идёт операция. */
    pendingUserId: number | null;
}

export interface IUsersListEmits {
    'update:activeFilter': [filter: TUsersFilter];
    'create-user': [];
    /** Повтор загрузки после временного отказа. */
    retry: [];
    'change-role': [user: IBricksUserSummary, role: TBricksUserRole];
    'set-password': [user: IBricksUserSummary];
    /** Ключ в своей строке: свой пароль меняется формой профиля, а не админской. */
    'change-own-password': [];
    activate: [user: IBricksUserSummary];
    deactivate: [user: IBricksUserSummary];
    delete: [user: IBricksUserSummary];
}

export interface IUsersListRowProps {
    user: IBricksUserSummary;
    /** Строка своей учётки. */
    isCurrentUser?: boolean;
    /**
     * Учётка — единственный активный администратор: роль, выключение входа и
     * удаление ей закрыты, иначе управление учётками потерялось бы целиком.
     */
    isLastActiveAdmin?: boolean;
    /** Идёт операция над этой учёткой. */
    isPending?: boolean;
}

export interface IUsersListRowEmits {
    'change-role': [user: IBricksUserSummary, role: TBricksUserRole];
    'set-password': [user: IBricksUserSummary];
    'change-own-password': [];
    activate: [user: IBricksUserSummary];
    deactivate: [user: IBricksUserSummary];
    delete: [user: IBricksUserSummary];
}

export interface IUsersRolePillProps {
    role: TBricksUserRole;
    /** Подпись владельца роли для доступного имени кнопки. */
    userLabel: string;
    /**
     * Роль не меняется: своя учётка (права мимо второго администратора не
     * правятся) либо последний активный администратор. Замок объясняет причину.
     */
    isLocked?: boolean;
    /** Причина замка для подсказки и доступного имени. */
    lockedHint?: string;
    /** Идёт запрос смены роли — меню закрыто до ответа. */
    isPending?: boolean;
}

export interface IUsersRolePillEmits {
    select: [role: TBricksUserRole];
}

export interface IUsersCreateModalProps {
    isOpen: boolean;
}

export interface IUsersCreateModalEmits {
    close: [];
    created: [user: IBricksUserSummary];
}

export interface IUsersPasswordModalProps {
    /** Учётка, которой задаётся пароль; `null` — модалка закрыта. */
    user: IBricksUserSummary | null;
}

export interface IUsersPasswordModalEmits {
    close: [];
    saved: [user: IBricksUserSummary];
}
