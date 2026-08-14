// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    isAccessSatisfied,
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

    it('открывает собственный профиль любой роли, а управление учётками — только администратору', () => {
        expect(resolveRequiredAccess('/api/bricks/users/me', 'PATCH')).toBe('authenticated');
        expect(resolveRequiredAccess('/api/bricks/users/me/avatar', 'POST')).toBe('authenticated');
        expect(resolveRequiredAccess('/api/bricks/users/me/avatar', 'DELETE')).toBe(
            'authenticated'
        );

        expect(resolveRequiredAccess('/api/bricks/users', 'GET')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users', 'POST')).toBe('admin');
        expect(resolveRequiredAccess('/api/bricks/users/5/password', 'POST')).toBe('admin');
        // Префикс сопоставляется по сегменту: чужая ручка со схожим началом
        // имени не должна попасть в неймспейс собственного профиля
        expect(resolveRequiredAccess('/api/bricks/users/mentions', 'GET')).toBe('admin');
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
