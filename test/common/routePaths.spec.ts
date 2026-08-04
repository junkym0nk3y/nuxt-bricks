// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBricksOwnStaticRoutes,
    getBuilderLoginPath,
    getBuilderPagePath,
    getPreviewPagePath,
    getPublishedPagePath,
    isBuilderPath,
    isEditorAddressTaken,
    isPageAddressTaken,
    isProtectedBricksHtmlPath,
    joinPathBase,
    stripPathBase,
    validateBricksRoutePrefixes,
    type IBricksRoutePrefixes,
} from '../../src/runtime/modules/common/utils/bricks/routePaths';
import { toPageAddress } from '../../src/runtime/modules/common/utils/bricks/pageAddress';
// #endregion

const CUSTOM_PREFIXES = { builderPrefix: '/admin/builder', previewPrefix: '/look' };

/**
 * Адрес без префикса — короткая запись для кейсов, которым префикс не важен.
 *
 * @param pagename - ЧПУ страницы.
 * @returns Адрес страницы.
 */
function bare(pagename: string) {
    return toPageAddress(pagename, null);
}

describe('routePaths: построение путей', () => {
    it('строит login и preview пути из префиксов', () => {
        expect(getBuilderLoginPath(DEFAULT_BRICKS_ROUTE_PREFIXES)).toBe('/bricks/bricks-login');
        expect(getBuilderLoginPath(CUSTOM_PREFIXES)).toBe('/admin/builder/bricks-login');
        expect(getPreviewPagePath(DEFAULT_BRICKS_ROUTE_PREFIXES, bare('my-page'))).toBe(
            '/bricks-preview/my-page'
        );
        expect(getPreviewPagePath(CUSTOM_PREFIXES, bare('my-page'))).toBe('/look/my-page');
    });

    it('адресные пути включают префикс: live, редактор и превью', () => {
        const address = toPageAddress('post', 'blog');

        // Одно имя страницу больше не определяет: у `/blog/post` и `/news/post`
        // должны различаться и live-адрес, и редактор, и превью
        expect(getPublishedPagePath(address)).toBe('/blog/post');
        expect(getBuilderPagePath(DEFAULT_BRICKS_ROUTE_PREFIXES, address)).toBe(
            '/bricks/blog/post'
        );
        expect(getPreviewPagePath(DEFAULT_BRICKS_ROUTE_PREFIXES, address)).toBe(
            '/bricks-preview/blog/post'
        );
        expect(getPublishedPagePath(toPageAddress('post', 'news'))).toBe('/news/post');
    });

    it('пробельный префикс — это отсутствие префикса во всех путях', () => {
        // Запись, созданная в обход нормализации, иначе отвечала бы по двум
        // разным адресам сразу
        expect(getPublishedPagePath(toPageAddress('post', '   '))).toBe('/post');
        expect(getBuilderPagePath(DEFAULT_BRICKS_ROUTE_PREFIXES, toPageAddress('post', ''))).toBe(
            '/bricks/post'
        );
    });
});

describe('routePaths: доступность адреса по роутингу', () => {
    /** Резолвер владельца пути по собственным маршрутам модуля (как на сервере). */
    function ownResolver(prefixes: IBricksRoutePrefixes) {
        const routes = getBricksOwnStaticRoutes(prefixes);

        return (path: string): string | undefined => routes[path];
    }

    /** Резолвер, дополненный страницей приложения-потребителя (как в браузере). */
    function appResolver(prefixes: IBricksRoutePrefixes) {
        const own = ownResolver(prefixes);

        return (path: string): string | undefined => (path === '/about' ? 'about' : own(path));
    }

    it('live-адрес занят и маршрутом поверхности, и её поддеревом за auth', () => {
        const taken = (urlPrefix: string | null, pagename: string) =>
            isPageAddressTaken(
                DEFAULT_BRICKS_ROUTE_PREFIXES,
                ownResolver(DEFAULT_BRICKS_ROUTE_PREFIXES),
                toPageAddress(pagename, urlPrefix)
            );

        // Дашборд забирает адрес маршрутом, превью — поддеревом (маршрута ровно
        // на префиксе нет, но auth-матрица защищает и его)
        expect(taken(null, 'bricks')).toBe(true);
        expect(taken(null, 'bricks-preview')).toBe(true);
        expect(taken('bricks', 'foo')).toBe(true);
        // Похожий, но чужой адрес свободен
        expect(taken('bricks-site', 'foo')).toBe(false);
        expect(taken(null, 'landing')).toBe(false);
    });

    it('точное совпадение с многосегментным префиксом видно только по паре полей', () => {
        const resolve = ownResolver(CUSTOM_PREFIXES);

        expect(
            isPageAddressTaken(CUSTOM_PREFIXES, resolve, toPageAddress('builder', 'admin'))
        ).toBe(true);
        expect(isPageAddressTaken(CUSTOM_PREFIXES, resolve, toPageAddress('foo', 'admin'))).toBe(
            false
        );
    });

    it('страница приложения-потребителя перекрывает адрес так же, как поверхность', () => {
        // Это и есть смысл вопроса к роутеру: список имён такого не знает
        expect(
            isPageAddressTaken(
                DEFAULT_BRICKS_ROUTE_PREFIXES,
                appResolver(DEFAULT_BRICKS_ROUTE_PREFIXES),
                bare('about')
            )
        ).toBe(true);
    });

    it('адрес редактора занимает статический сосед, live-адрес при этом свободен', () => {
        const resolve = ownResolver(DEFAULT_BRICKS_ROUTE_PREFIXES);

        expect(
            isEditorAddressTaken(DEFAULT_BRICKS_ROUTE_PREFIXES, resolve, bare('bricks-login'))
        ).toBe(true);
        expect(isEditorAddressTaken(DEFAULT_BRICKS_ROUTE_PREFIXES, resolve, bare('landing'))).toBe(
            false
        );
        // Сама страница /bricks-login достижима — недостижим её редактор
        expect(
            isPageAddressTaken(DEFAULT_BRICKS_ROUTE_PREFIXES, resolve, bare('bricks-login'))
        ).toBe(false);
    });

    it('то же имя под префиксом редактор не отбирает', () => {
        const resolve = ownResolver(DEFAULT_BRICKS_ROUTE_PREFIXES);

        // `<builderPrefix>/blog/bricks-login` свободен: страницу логина отбирает
        // только `bricks-login` без префикса, и запрещать пару не за что
        expect(
            isEditorAddressTaken(
                DEFAULT_BRICKS_ROUTE_PREFIXES,
                resolve,
                toPageAddress('bricks-login', 'blog')
            )
        ).toBe(false);
    });
});

describe('routePaths: матчинг поверхностей', () => {
    it('isBuilderPath матчит префикс и его поддерево, но не похожие пути', () => {
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks')).toBe(true);
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks/my-page')).toBe(true);
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks-like-page')).toBe(false);
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/')).toBe(false);

        expect(isBuilderPath(CUSTOM_PREFIXES, '/admin/builder/my-page')).toBe(true);
        expect(isBuilderPath(CUSTOM_PREFIXES, '/admin')).toBe(false);
        expect(isBuilderPath(CUSTOM_PREFIXES, '/bricks')).toBe(false);
    });

    it('isProtectedBricksHtmlPath покрывает билдер и превью', () => {
        expect(isProtectedBricksHtmlPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks')).toBe(true);
        expect(isProtectedBricksHtmlPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks-preview/x')).toBe(
            true
        );
        expect(isProtectedBricksHtmlPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/my-landing')).toBe(false);

        expect(isProtectedBricksHtmlPath(CUSTOM_PREFIXES, '/look/x')).toBe(true);
        expect(isProtectedBricksHtmlPath(CUSTOM_PREFIXES, '/preview/x')).toBe(false);
    });
});

describe('routePaths: baseURL', () => {
    it('stripPathBase убирает base и не трогает чужие пути', () => {
        expect(stripPathBase('/app/bricks/page', '/app/')).toBe('/bricks/page');
        expect(stripPathBase('/app/bricks/page', '/app')).toBe('/bricks/page');
        expect(stripPathBase('/app', '/app/')).toBe('/');
        expect(stripPathBase('/bricks', '/')).toBe('/bricks');
        expect(stripPathBase('/bricks', '')).toBe('/bricks');
        expect(stripPathBase('/other/bricks', '/app/')).toBe('/other/bricks');
        // Похожий, но чужой корень не срезается
        expect(stripPathBase('/application/bricks', '/app/')).toBe('/application/bricks');
    });

    it('joinPathBase добавляет base без дублирования слэшей', () => {
        expect(joinPathBase('/app/', '/bricks/login')).toBe('/app/bricks/login');
        expect(joinPathBase('/app', '/bricks/login')).toBe('/app/bricks/login');
        expect(joinPathBase('/', '/bricks')).toBe('/bricks');
        expect(joinPathBase('', '/bricks')).toBe('/bricks');
    });

    it('strip и join взаимно обратны на путях под base', () => {
        const base = '/app/';
        const path = '/bricks/my-page';
        expect(stripPathBase(joinPathBase(base, path), base)).toBe(path);
    });
});

describe('routePaths: валидация префиксов (fail-fast module.ts)', () => {
    it('принимает валидные конфигурации', () => {
        expect(() => validateBricksRoutePrefixes(DEFAULT_BRICKS_ROUTE_PREFIXES)).not.toThrow();
        expect(() => validateBricksRoutePrefixes(CUSTOM_PREFIXES)).not.toThrow();
    });

    it('отклоняет невалидный формат', () => {
        const cases = ['bricks', '/bricks/', '/Bricks', '/bricks page', '/', '/bricks//x'];

        for (const builderPrefix of cases) {
            expect(() =>
                validateBricksRoutePrefixes({ builderPrefix, previewPrefix: '/preview' })
            ).toThrow('builderPrefix');
        }
    });

    it('отклоняет зарезервированные корневые сегменты', () => {
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/api/builder', previewPrefix: '/look' })
        ).toThrow('reserved');
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/admin', previewPrefix: '/api/x' })
        ).toThrow('reserved');
    });

    it('бывший mock-api больше не зарезервирован', () => {
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/admin', previewPrefix: '/mock-api/x' })
        ).not.toThrow();
    });

    it('отклоняет равные и вложенные префиксы', () => {
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/bricks', previewPrefix: '/bricks' })
        ).toThrow('must not overlap');
        expect(() =>
            validateBricksRoutePrefixes({
                builderPrefix: '/bricks',
                previewPrefix: '/bricks/preview',
            })
        ).toThrow('must not overlap');
        expect(() =>
            validateBricksRoutePrefixes({
                builderPrefix: '/preview/builder',
                previewPrefix: '/preview',
            })
        ).toThrow('must not overlap');
    });
});
