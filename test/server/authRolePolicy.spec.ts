// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    isAccessSatisfied,
    isPasswordChangeAvailable,
    isUserManagementPath,
    resolveRequiredAccess,
} from '../../src/runtime/server/utils/auth/rolePolicy';
import { BRICKS_BASIC_MODE_ROLE } from '../../src/runtime/modules/common/constants/auth';
import { normalizePathTrailingSlash } from '../../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

/**
 * Матрица прав: какая роль нужна защищённому пути. Правило выводится из метода
 * и префикса, поэтому проверяем и семантику методов, и края, где она не
 * применима (собственный профиль, управление учётками, POST-ручки чтения).
 */
describe('rolePolicy: минимальный доступ по пути и методу', () => {
    it('отдаёт удаление администратору, прочие записи — редактору, чтение — наблюдателю', () => {
        expect(resolveRequiredAccess('/api/bricks/1', 'GET')).toBe('viewer');
        expect(resolveRequiredAccess('/api/bricks/media', 'GET')).toBe('viewer');
        expect(resolveRequiredAccess('/api/bricks/1/versions', 'HEAD')).toBe('viewer');

        expect(resolveRequiredAccess('/api/bricks', 'POST')).toBe('editor');
        expect(resolveRequiredAccess('/api/bricks/1', 'PUT')).toBe('editor');
        expect(resolveRequiredAccess('/api/bricks/1', 'PATCH')).toBe('editor');
        expect(resolveRequiredAccess('/api/bricks/media/upload', 'POST')).toBe('editor');
        expect(resolveRequiredAccess('/api/bricks/media/categories', 'POST')).toBe('editor');

        expect(resolveRequiredAccess('/api/bricks/1', 'DELETE')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/media/7', 'DELETE')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/media/categories/photos', 'DELETE')).toBe(
            'admin'
        );
    });

    it('оставляет восстановление версии редактору: это правка страницы, а не удаление истории', () => {
        expect(resolveRequiredAccess('/api/bricks/1/versions/2/restore', 'POST')).toBe('editor');
    });

    it('держит s3-proxy на уровне чтения — иначе у наблюдателя пустой канвас', () => {
        // Метод POST взят из-за длинного URL в теле; ручка отдаёт уже
        // зарегистрированный файл и ничего не меняет
        expect(resolveRequiredAccess('/api/bricks/media/s3-proxy', 'POST')).toBe('viewer');
    });

    it('требует администратора на массовый импорт медиатеки', () => {
        expect(resolveRequiredAccess('/api/bricks/media/import', 'POST')).toBe('admin');
    });

    it('требует администратора на управление чужими учётками', () => {
        expect(resolveRequiredAccess('/api/bricks/users', 'GET')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users', 'POST')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/5', 'PATCH')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/5', 'DELETE')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/5/password', 'POST')).toBe('admin');
    });

    it('пускает в свой профиль любую валидную сессию, включая удаление фото', () => {
        // Своё имя, фото и пароль правит любой вошедший — наблюдателю это
        // единственное доступное изменение. DELETE аватара не становится
        // админским, хотя по методу должен был бы: правило профиля раньше
        expect(resolveRequiredAccess('/api/bricks/users/me', 'PATCH')).toBe('authenticated');
        expect(resolveRequiredAccess('/api/bricks/users/me/password', 'POST')).toBe(
            'authenticated'
        );
        expect(resolveRequiredAccess('/api/bricks/users/me/avatar', 'POST')).toBe('authenticated');
        expect(resolveRequiredAccess('/api/bricks/users/me/avatar', 'DELETE')).toBe(
            'authenticated'
        );
    });

    it('ослабляет ровно перечисленные пары «метод + путь», а не префикс профиля', () => {
        // Префикс работал бы fail-open: он ослаблял бы и то, чего в нём ещё нет.
        // `DELETE /users/me` матчится админской ручкой удаления учётки, а будущая
        // `/users/:id/<действие>` стала бы доступна любой сессии на `id=me`
        expect(resolveRequiredAccess('/api/bricks/users/me', 'DELETE')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/me', 'POST')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/me/sessions', 'DELETE')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/me/password', 'PATCH')).toBe('admin');
    });

    it('не распространяет послабление профиля на похожие пути', () => {
        // Сегмент сверяется целиком: учётка с id, начинающимся на «me», и чужой
        // логин `mentor` не должны получить права профиля
        expect(resolveRequiredAccess('/api/bricks/users/mentor', 'PATCH')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/me2/avatar', 'POST')).toBe('admin');
    });

    it('пускает на HTML-страницы билдера любую роль — наблюдателю нужен канвас', () => {
        expect(resolveRequiredAccess('/bricks', 'GET')).toBe('viewer');
        expect(resolveRequiredAccess('/bricks/my-page', 'GET')).toBe('viewer');
        expect(resolveRequiredAccess('/bricks-preview/my-page', 'GET')).toBe('viewer');
    });

    it('закрывается на самое узкое право при незнакомом методе', () => {
        // Новая ручка не должна получать широкий доступ по умолчанию
        expect(resolveRequiredAccess('/api/bricks/whatever', 'PROPFIND')).toBe('admin');
    });
});

describe('rolePolicy: путь приводится к виду, который сопоставляет роутер', () => {
    it('не отдаёт admin-ручку редактору из-за завершающего слеша', () => {
        // radix3 в нестрогом режиме отбрасывает завершающий слеш, поэтому
        // `/media/import/` вызывает ту же ручку. Сверяйся матрица с сырым путём —
        // она не узнала бы исключение и выдала бы права обычного POST
        for (const raw of [
            '/api/bricks/media/import/',
            '/api/bricks/media/import//',
            '/api/bricks/media/import',
        ]) {
            expect(resolveRequiredAccess(normalizePathTrailingSlash(raw), 'POST'), raw).toBe(
                'admin'
            );
        }
    });

    it('не превращает чтение в отказ из-за завершающего слеша', () => {
        expect(
            resolveRequiredAccess(normalizePathTrailingSlash('/api/bricks/media/s3-proxy/'), 'POST')
        ).toBe('viewer');
    });

    it('оставляет корень корнем', () => {
        expect(normalizePathTrailingSlash('/')).toBe('/');
        expect(normalizePathTrailingSlash('/bricks')).toBe('/bricks');
        expect(normalizePathTrailingSlash('/bricks/')).toBe('/bricks');
    });
});

describe('rolePolicy: границы раздела учёток и флага паролей', () => {
    it('не считает ручки своего профиля частью раздела учёток', () => {
        // От этого зависит 404-гейт: выключенный `allowUserManagement` — про
        // ведение чужих учёток снаружи, а не про запрет сменить себе фото
        expect(isUserManagementPath('/api/bricks/users', 'GET')).toBe(true);
        expect(isUserManagementPath('/api/bricks/users/5', 'PATCH')).toBe(true);
        expect(isUserManagementPath('/api/bricks/users/5/password', 'POST')).toBe(true);

        expect(isUserManagementPath('/api/bricks/users/me', 'PATCH')).toBe(false);
        expect(isUserManagementPath('/api/bricks/users/me/avatar', 'POST')).toBe(false);
        expect(isUserManagementPath('/api/bricks/users/me/avatar', 'DELETE')).toBe(false);

        // Всё непокрытое под `/users/me` остаётся частью раздела и вместе с ним
        // отвечает 404: иначе выключенный раздел выдавал бы себя чужим статусом
        expect(isUserManagementPath('/api/bricks/users/me', 'DELETE')).toBe(true);
        expect(isUserManagementPath('/api/bricks/users/me/sessions', 'DELETE')).toBe(true);

        // Похожий сегмент профилем не становится
        expect(isUserManagementPath('/api/bricks/users/mentor', 'PATCH')).toBe(true);
    });

    it('держит смену пароля включённой по умолчанию и выключает её строкой из env', () => {
        expect(isPasswordChangeAvailable('database', undefined)).toBe(true);
        // Так выглядит объявленная без значения env-переменная: не «выключено»
        expect(isPasswordChangeAvailable('database', '')).toBe(true);
        expect(isPasswordChangeAvailable('database', false)).toBe(false);
        expect(isPasswordChangeAvailable('database', 'false')).toBe(false);
    });

    it('не даёт менять пароль вне database-режима: паролей учёток там нет', () => {
        expect(isPasswordChangeAvailable('basic', true)).toBe(false);
        expect(isPasswordChangeAvailable(undefined, true)).toBe(false);
    });
});

describe('rolePolicy: покрытие требования ролью', () => {
    it('считает роли вложенными', () => {
        expect(isAccessSatisfied('admin', 'admin')).toBe(true);
        expect(isAccessSatisfied('admin', 'editor')).toBe(true);
        expect(isAccessSatisfied('admin', 'viewer')).toBe(true);

        expect(isAccessSatisfied('editor', 'admin')).toBe(false);
        expect(isAccessSatisfied('editor', 'editor')).toBe(true);
        expect(isAccessSatisfied('editor', 'viewer')).toBe(true);

        expect(isAccessSatisfied('viewer', 'admin')).toBe(false);
        expect(isAccessSatisfied('viewer', 'editor')).toBe(false);
        expect(isAccessSatisfied('viewer', 'viewer')).toBe(true);
    });

    it('пропускает любую роль там, где достаточно самого факта входа', () => {
        expect(isAccessSatisfied('viewer', 'authenticated')).toBe(true);
        expect(isAccessSatisfied('editor', 'authenticated')).toBe(true);
        expect(isAccessSatisfied('admin', 'authenticated')).toBe(true);
    });

    it('даёт basic-identity пройти всю матрицу: учёток в этом режиме нет', () => {
        for (const requirement of ['viewer', 'editor', 'admin', 'authenticated'] as const) {
            expect(isAccessSatisfied(BRICKS_BASIC_MODE_ROLE, requirement)).toBe(true);
        }
    });
});
