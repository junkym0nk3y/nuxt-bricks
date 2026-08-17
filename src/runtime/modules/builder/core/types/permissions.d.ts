/**
 * Типы прав билдера по роли учётки (`composables/useBuilderPermissions.ts`).
 */
import type { ComputedRef } from 'vue';
import type { TBricksUserRole } from '../../../common/types/auth';

/**
 * Права текущей сессии в интерфейсе билдера и дашборда.
 *
 * Флаги названы по действиям, а не по ролям: ручки требуют `editor` для записей
 * и `admin` для удалений, и код экрана должен спрашивать «можно ли удалить», а не
 * «админ ли это» — иначе каждое изменение матрицы прав пришлось бы искать по
 * сравнениям ролей во всех компонентах.
 */
export interface IBuilderPermissions {
    /** Роль сессии; `viewer` — пока роль неизвестна (самое узкое право). */
    role: ComputedRef<TBricksUserRole>;
    /**
     * Роль получена. false — SSR не дал контекста запроса (клиентский рендер) и
     * ручка `me` ещё не ответила: интерфейс в этот момент держится закрытым, а не
     * показывает действия, которые может тут же отобрать.
     */
    isRoleKnown: ComputedRef<boolean>;
    /** Сохранение, публикация, загрузка медиа, drag&drop, панель свойств. */
    canEdit: ComputedRef<boolean>;
    /** Удаление страниц, версий, медиа и категорий. */
    canDelete: ComputedRef<boolean>;
    /** Раздел «Пользователи»: роль администратора И включённая опция модуля. */
    canManageUsers: ComputedRef<boolean>;
    /**
     * Формы пароля: своя в профиле и «ключ» смены чужого в строке списка учёток.
     * Роли здесь нет — свой пароль меняет любой вошедший, включая наблюдателя;
     * чужой закрыт этим флагом ВМЕСТЕ с `canManageUsers`.
     */
    canChangePassword: ComputedRef<boolean>;
    /**
     * Досылает роль, если контекст запроса её не дал. Загрузчик передаёт
     * composition root: ручка `me` живёт в auth-домене, которого нижний слой не
     * видит по границам модулей.
     */
    ensureRole(fetchRole: TFetchSessionRole): Promise<void>;
}

/** Загрузчик роли сессии (ручка `me` из auth-домена). */
export type TFetchSessionRole = () => Promise<TBricksUserRole | null>;
