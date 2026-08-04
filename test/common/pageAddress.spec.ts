// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    getBuilderPageRouteLocation,
    getPageAddressKey,
    isSamePageAddress,
    isValidPageAddress,
    normalizeUrlPrefix,
    resolvePageAddressFromRoute,
    resolveRequestedUrlPrefix,
    toPageAddress,
} from '../../src/runtime/modules/common/utils/bricks/pageAddress';
import { getBricksPageDataKey } from '../../src/runtime/modules/common/utils/bricks/previewRoute';
// #endregion

describe('normalizeUrlPrefix: отсутствие префикса — одно значение', () => {
    it('пустое, пробельное и null означают одно и то же', () => {
        // Иначе запись, созданная в обход валидации, считалась бы префиксной в
        // одном месте и беспрефиксной в другом — то есть страница отвечала бы по
        // двум разным адресам
        expect(normalizeUrlPrefix(null)).toBeNull();
        expect(normalizeUrlPrefix(undefined)).toBeNull();
        expect(normalizeUrlPrefix('')).toBeNull();
        expect(normalizeUrlPrefix('   ')).toBeNull();
    });

    it('значимый префикс теряет только окружающие пробелы', () => {
        expect(normalizeUrlPrefix(' blog ')).toBe('blog');
        expect(normalizeUrlPrefix('blog/2026')).toBe('blog/2026');
    });
});

describe('getPageAddressKey: каноническая сериализация адреса', () => {
    it('разные префиксы при одном имени дают разные ключи', () => {
        expect(getPageAddressKey(toPageAddress('post', 'blog'))).toBe('blog/post');
        expect(getPageAddressKey(toPageAddress('post', 'news'))).toBe('news/post');
    });

    it('у страницы без префикса ключ совпадает с прежним — по одному имени', () => {
        // Побочное следствие, на которое опираются черновики localStorage:
        // записи беспрефиксных страниц переживают переход на адресную идентичность
        expect(getPageAddressKey(toPageAddress('post', null))).toBe('post');
        expect(getPageAddressKey(toPageAddress('post', '  '))).toBe('post');
    });
});

describe('isSamePageAddress: сравнение по значению, а не по полям', () => {
    it('одно имя под разными префиксами — разные страницы', () => {
        expect(
            isSamePageAddress(toPageAddress('post', 'blog'), toPageAddress('post', 'news'))
        ).toBe(false);
        expect(isSamePageAddress(toPageAddress('post', 'blog'), toPageAddress('post', null))).toBe(
            false
        );
    });

    it('пробельный и отсутствующий префикс — один адрес', () => {
        expect(isSamePageAddress(toPageAddress('post', '  '), toPageAddress('post', null))).toBe(
            true
        );
        expect(
            isSamePageAddress(toPageAddress('post', ' blog '), toPageAddress('post', 'blog'))
        ).toBe(true);
    });
});

describe('resolveRequestedUrlPrefix: параметр маршрута', () => {
    it('склеивает repeatable-параметр маршрута в префикс', () => {
        expect(resolveRequestedUrlPrefix(['blog'])).toBe('blog');
        expect(resolveRequestedUrlPrefix(['blog', '2026'])).toBe('blog/2026');
    });

    it('отсутствующий параметр — пустой префикс', () => {
        expect(resolveRequestedUrlPrefix(undefined)).toBe('');
        expect(resolveRequestedUrlPrefix([])).toBe('');
    });

    it('строковый параметр проходит как есть', () => {
        expect(resolveRequestedUrlPrefix('blog')).toBe('blog');
    });
});

describe('resolvePageAddressFromRoute: адрес из параметров маршрута', () => {
    it('bare-маршрут даёт адрес без префикса, prefixed — с ним', () => {
        expect(resolvePageAddressFromRoute({ pagename: 'post' })).toEqual({
            pagename: 'post',
            urlPrefix: null,
        });
        expect(
            resolvePageAddressFromRoute({ pagename: 'post', urlPrefix: ['blog', '2026'] })
        ).toEqual({ pagename: 'post', urlPrefix: 'blog/2026' });
    });
});

describe('getBuilderPageRouteLocation: обратное преобразование в маршрут', () => {
    it('имя маршрута выбирается по наличию префикса', () => {
        // Уйди prefixed-адрес на bare-маршрут — переход открыл бы чужую
        // одноимённую страницу либо пустую форму новой
        expect(getBuilderPageRouteLocation(toPageAddress('post', null))).toEqual({
            name: 'bricks-builder-pagename',
            params: { pagename: 'post' },
        });
        expect(getBuilderPageRouteLocation(toPageAddress('post', 'blog/2026'))).toEqual({
            name: 'bricks-builder-pagename-prefixed',
            params: { pagename: 'post', urlPrefix: ['blog', '2026'] },
        });
    });

    it('разбор параметров и сборка локации взаимно обратны', () => {
        const address = toPageAddress('post', 'blog/2026');
        const location = getBuilderPageRouteLocation(address);

        expect(resolvePageAddressFromRoute(location.params)).toEqual(address);
    });
});

describe('isValidPageAddress: одна проверка формата на все поверхности', () => {
    it('принимает валидные адреса с префиксом и без', () => {
        expect(isValidPageAddress(toPageAddress('post', null))).toBe(true);
        expect(isValidPageAddress(toPageAddress('post', 'blog/2026'))).toBe(true);
        expect(isValidPageAddress(toPageAddress('post', '   '))).toBe(true);
    });

    it('отклоняет то, что запись никогда не создаст', () => {
        expect(isValidPageAddress(toPageAddress('po', null))).toBe(false);
        expect(isValidPageAddress(toPageAddress('Post', null))).toBe(false);
        expect(isValidPageAddress(toPageAddress('post', 'Blog'))).toBe(false);
        expect(isValidPageAddress(toPageAddress('post', 'blog/'))).toBe(false);
        expect(isValidPageAddress(toPageAddress('post', 'a'.repeat(101)))).toBe(false);
    });
});

describe('getBricksPageDataKey: ключ SSR-payload', () => {
    it('одноимённые страницы под разными префиксами не делят ключ', () => {
        // Ключ по имени был не просто коллизией кеша: middleware при
        // payload-хите перепроверяет адрес и на несовпадении отдаёт 404, то есть
        // SPA-переход между одноимёнными страницами ломал живую страницу
        expect(getBricksPageDataKey(toPageAddress('post', 'blog'), false)).toBe(
            'bricks-page-blog/post-live'
        );
        expect(getBricksPageDataKey(toPageAddress('post', 'news'), false)).toBe(
            'bricks-page-news/post-live'
        );
        expect(getBricksPageDataKey(toPageAddress('post', null), false)).toBe(
            'bricks-page-post-live'
        );
    });

    it('режим и версия по-прежнему входят в ключ', () => {
        const address = toPageAddress('post', 'blog');

        expect(getBricksPageDataKey(address, true)).toBe('bricks-page-blog/post-preview');
        expect(getBricksPageDataKey(address, true, 44)).toBe(
            'bricks-page-blog/post-preview-version-44'
        );
    });
});
