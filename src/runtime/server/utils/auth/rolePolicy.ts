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

/**
 * Префикс ручек управления учётками: только администратор.
 */
const USER_MANAGEMENT_PREFIX = '/api/bricks/users';

/**
 * Ручки собственного профиля, которым достаточно любой валидной сессии: точные
 * пары «метод + путь», а не префикс.
 *
 * Своё имя, фото и пароль правит любой вошедший, включая наблюдателя, — это
 * единственное, что он вообще может изменить, и от флага раздела учёток профиль
 * не зависит.
 *
 * Список, а не префикс `/api/bricks/users/me/**`, потому что префикс работает
 * fail-open: он ослабляет и то, чего в нём ещё нет. `DELETE /api/bricks/users/me`
 * своей ручки не имеет и матчится параметрическим админским маршрутом
 * `[id].delete.ts`, а любая будущая админская ручка `/users/:id/<действие>`
 * автоматически стала бы доступна любой сессии на `id=me`, стоило автору забыть
 * продублировать ролевой гард внутри. С точным списком новая ручка по умолчанию
 * остаётся админской, и послабление для неё — отдельное осознанное решение.
 *
 * Дубль ролевого гарда внутри `:id`-ручек при этом сохраняется (`assertAdminRole`):
 * он ловит и случай, когда статический маршрут почему-то не совпал.
 *
 * Пути перечислены целиком: `PATH_ACCESS_OVERRIDES` рядом устроен так же —
 * второго разборщика параметрических путей здесь по-прежнему нет.
 */
const OWN_PROFILE_ROUTES: ReadonlySet<string> = new Set([
    'PATCH /api/bricks/users/me',
    'POST /api/bricks/users/me/password',
    'POST /api/bricks/users/me/avatar',
    'DELETE /api/bricks/users/me/avatar',
]);

/**
 * Запрос адресован ручке собственного профиля.
 *
 * @param pathname - Логический путь запроса (без baseURL и query).
 * @param method - HTTP-метод.
 */
function isOwnProfileRequest(pathname: string, method: string): boolean {
    return OWN_PROFILE_ROUTES.has(`${method.toUpperCase()} ${pathname}`);
}

/**
 * Путь принадлежит управлению учётками (и потому исчезает вместе с выключенным
 * разделом).
 *
 * Ручки собственного профиля в раздел не входят: `allowUserManagement: false` —
 * про ведение учёток снаружи, а не про запрет человеку сменить себе фото, и
 * документирован флаг именно так. Свою доступность профиль проверяет сам
 * (database-режим) и своим флагом закрывает только пароль.
 *
 * Исключение — те же точные пары «метод + путь», что и в матрице прав: всё
 * остальное под `/users/me` остаётся частью раздела и вместе с ним отвечает 404.
 * Иначе выключенный раздел выдавал бы себя чужим статусом на любом непокрытом
 * методе этого поддерева.
 *
 * @param pathname - Логический путь запроса (без baseURL и query).
 * @param method - HTTP-метод.
 */
export function isUserManagementPath(pathname: string, method: string): boolean {
    if (isOwnProfileRequest(pathname, method)) {
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
 * (boolean из опций либо строка из env). Не задано — включено, и пустая строка
 * тоже: `NUXT_BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` доезжает до собранного
 * приложения как `''` мимо build-time нормализации.
 */
export function isUserManagementAvailable(
    mode: string | undefined,
    allowUserManagementFlag: unknown
): boolean {
    // Вне database-режима учёток нет вовсе, управлять нечем
    if (mode !== 'database') {
        return false;
    }

    return parseBricksBooleanFlag(allowUserManagementFlag, true);
}

/**
 * Разрешена ли смена пароля из интерфейса — и своего в профиле, и чужого
 * администратором. Одно правило на обе ручки: разъехавшись, они дали бы
 * установке, где пароли ведут снаружи, ровно одну лазейку из двух.
 *
 * @param mode - Активный auth-режим.
 * @param allowPasswordChangeFlag - Значение `bricksAuthAllowPasswordChange`
 * (boolean из опций либо строка из env). Не задано — включено, и пустая строка
 * тоже: `NUXT_BRICKS_AUTH_ALLOW_PASSWORD_CHANGE=` доезжает до собранного
 * приложения как `''` мимо build-time нормализации.
 */
export function isPasswordChangeAvailable(
    mode: string | undefined,
    allowPasswordChangeFlag: unknown
): boolean {
    // Вне database-режима паролей учёток нет вовсе, менять нечего
    if (mode !== 'database') {
        return false;
    }

    return parseBricksBooleanFlag(allowPasswordChangeFlag, true);
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

    // Свой профиль — до правила раздела учёток: его пути лежат внутри
    // админского префикса, и порядок здесь и есть то самое послабление
    if (isOwnProfileRequest(pathname, method)) {
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
