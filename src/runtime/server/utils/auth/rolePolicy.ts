/**
 * Матрица прав: какая минимальная роль нужна уже авторизованному запросу.
 *
 * Вызывается только для путей, которые матрица защиты (`routeProtection`) сочла
 * требующими авторизации, — открытые пути (public read-model, health, манифест
 * компонентов, страница логина) сюда не доходят.
 *
 * Правило выводится из МЕТОДА и ПРЕФИКСА, а не из конкретного маршрута с
 * параметрами. Так сделано намеренно: утверждённая матрица прав ложится на
 * семантику методов один в один — удаление (страниц, версий, медиа, категорий)
 * доступно только `admin`, прочие записи (сохранение, публикация, загрузка,
 * набор устройств) — `editor` и выше, чтение — `viewer`. Разбирать `:id` и
 * `**:address` для этого не нужно вовсе, а второй разборщик путей рядом с
 * роутером Nitro неизбежно разошёлся бы с ним в краях.
 *
 * Регистрировать отдельную ручку-гард на том же `route` + `method` перед
 * основной нельзя: роутер h3 хранит по одному обработчику на пару
 * «маршрут + метод» (`route.handlers[method] = handler`), поэтому вторая
 * регистрация вытеснила бы первую — гард либо съел бы ручку, либо был бы съеден.
 *
 * Дефолт незнакомого метода — `admin`: новая ручка получает самое узкое право,
 * а не самое широкое.
 */
import { BRICKS_ROLE_RANK } from '../../../modules/common/constants/auth';
import { parseBricksBooleanFlag } from '../../../modules/common/utils/main';
import type { TBricksUserRole } from '../../../modules/common/types/auth';
import type { TBricksAccessRequirement } from './types';

/** Методы чтения: ничего не меняют, поэтому доступны наблюдателю. */
const READ_METHODS = new Set(['GET', 'HEAD']);

/** Записи, требующие `editor`. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Пути, у которых требование расходится с методом. Ключ — точный логический
 * путь, значение — требуемый доступ; сопоставление идёт до правил по методу.
 *
 * `s3-proxy` — POST, но по сути чтение: ручка отдаёт уже зарегистрированный в
 * медиатеке файл (метод взят из-за длинного URL в теле, а не из-за записи).
 * Требуй она `editor`, наблюдатель получил бы канвас без картинок.
 *
 * `media/import` — наоборот: POST, регистрирующий в медиатеке весь managed-
 * префикс хранилища разом. Это массовая операция над библиотекой, а не работа
 * над страницей, поэтому `admin`.
 */
const PATH_ACCESS_OVERRIDES: Record<string, TBricksAccessRequirement> = {
    '/api/bricks/media/s3-proxy': 'viewer',
    '/api/bricks/media/import': 'admin',
};

/** Префикс ручек собственного профиля: доступны любому вошедшему. */
const SELF_PROFILE_PREFIX = '/api/bricks/users/me';

/** Префикс ручек управления учётками: только администратор. */
const USER_MANAGEMENT_PREFIX = '/api/bricks/users';

/**
 * Путь принадлежит управлению чужими учётками (и потому исчезает вместе с
 * выключенным разделом). Собственный профиль сюда НЕ входит: он доступен любому
 * вошедшему независимо от флага раздела.
 *
 * @param pathname - Логический путь запроса (без baseURL и query).
 */
export function isUserManagementPath(pathname: string): boolean {
    if (pathname === SELF_PROFILE_PREFIX || pathname.startsWith(`${SELF_PROFILE_PREFIX}/`)) {
        return false;
    }

    return pathname === USER_MANAGEMENT_PREFIX || pathname.startsWith(`${USER_MANAGEMENT_PREFIX}/`);
}

/**
 * Доступен ли раздел управления учётками. Одно правило на два вызова — гейт
 * middleware (отвечает 404 до всякой авторизации) и проверка внутри ручек:
 * разъехавшись, они дали бы разный ответ на один и тот же запрос.
 *
 * @param mode - Активный auth-режим.
 * @param allowUserManagementFlag - Значение `bricksAuthAllowUserManagement`
 * (boolean из опций либо строка из env; не задано — включено).
 */
export function isUserManagementAvailable(
    mode: string | undefined,
    allowUserManagementFlag: unknown
): boolean {
    // Вне database-режима учёток нет вовсе, управлять нечем
    if (mode !== 'database') {
        return false;
    }

    return parseBricksBooleanFlag(allowUserManagementFlag ?? true);
}

/**
 * Возвращает минимальный доступ, необходимый защищённому пути.
 *
 * @param pathname - Логический путь запроса (без baseURL и query).
 * @param method - HTTP-метод.
 * @returns Требуемая роль или `'authenticated'` (достаточно любой сессии).
 */
export function resolveRequiredAccess(
    pathname: string,
    method: string
): Exclude<TBricksAccessRequirement, null> {
    // HTML-страницы билдера и превью открыты любой роли: наблюдателю нужен
    // доступ к канвасу и превью, а редактирование гасит режим просмотра —
    // отказ на входе оставил бы его без единственного доступного экрана
    if (!pathname.startsWith('/api/bricks')) {
        return 'viewer';
    }

    if (pathname === SELF_PROFILE_PREFIX || pathname.startsWith(`${SELF_PROFILE_PREFIX}/`)) {
        return 'authenticated';
    }

    if (pathname === USER_MANAGEMENT_PREFIX || pathname.startsWith(`${USER_MANAGEMENT_PREFIX}/`)) {
        return 'admin';
    }

    const override = PATH_ACCESS_OVERRIDES[pathname];

    if (override) {
        return override;
    }

    const normalizedMethod = method.toUpperCase();

    if (READ_METHODS.has(normalizedMethod)) {
        return 'viewer';
    }

    if (normalizedMethod === 'DELETE') {
        return 'admin';
    }

    if (WRITE_METHODS.has(normalizedMethod)) {
        return 'editor';
    }

    return 'admin';
}

/**
 * Проверяет, покрывает ли роль требование доступа.
 *
 * @param role - Роль пользователя запроса.
 * @param requirement - Требование из `resolveRequiredAccess`.
 * @returns true — доступ разрешён.
 */
export function isAccessSatisfied(
    role: TBricksUserRole,
    requirement: Exclude<TBricksAccessRequirement, null>
): boolean {
    if (requirement === 'authenticated') {
        return true;
    }

    return BRICKS_ROLE_RANK[role] >= BRICKS_ROLE_RANK[requirement];
}
