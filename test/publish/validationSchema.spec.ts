// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { createPublishValidationSchema } from '../../src/runtime/modules/builder/publish/utils/validationSchema';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBricksOwnStaticRoutes,
    isEditorAddressTaken,
    isPageAddressTaken,
} from '../../src/runtime/modules/common/utils/bricks/routePaths';
import { getPageAddressKey } from '../../src/runtime/modules/common/utils/bricks/pageAddress';
// #endregion

/** Переводчик-заглушка: сообщение ошибки = i18n-ключ. */
const t = (key: string): string => key;

/**
 * Резолвер владельца пути: собственные маршруты модуля плюс страница
 * приложения-потребителя `/about` — в браузере эту роль играет `router.resolve`.
 */
const resolveRouteName = (path: string): string | undefined => {
    if (path === '/about') {
        return 'about';
    }

    const ownRoute = getBricksOwnStaticRoutes(DEFAULT_BRICKS_ROUTE_PREFIXES)[path];
    if (ownRoute) {
        return ownRoute;
    }

    // Остальное разбирают параметрические маршруты: под префиксом билдера —
    // редактор, в корне — published-страница
    return path.startsWith(`${DEFAULT_BRICKS_ROUTE_PREFIXES.builderPrefix}/`)
        ? 'bricks-builder-pagename'
        : 'bricks-page';
};

/**
 * Собирает схему с занятыми адресами и исключаемым id.
 *
 * @param takenAddresses - Карта занятых адресов (`blog/post`, `post`) → id владельца.
 * @param excludeId - Id страницы, исключаемой из проверки уникальности.
 * @returns Yup-схема формы публикации.
 */
function buildSchema(takenAddresses: Record<string, number> = {}, excludeId?: number) {
    return createPublishValidationSchema({
        t,
        isPageAddressFree: (address) =>
            !isPageAddressTaken(DEFAULT_BRICKS_ROUTE_PREFIXES, resolveRouteName, address),
        isEditorAddressFree: (address) =>
            !isEditorAddressTaken(DEFAULT_BRICKS_ROUTE_PREFIXES, resolveRouteName, address),
        isAddressAvailable: (address, exclude) => {
            const ownerId = takenAddresses[getPageAddressKey(address)];
            if (ownerId === undefined) {
                return true;
            }
            return String(ownerId) === String(exclude);
        },
        getExcludeId: () => excludeId,
    });
}

const VALID_VALUES = {
    pagename: 'landing-page',
    title: 'Landing page',
    description: 'Описание длиннее десяти символов',
    keywords: 'landing, page',
    socialImage: null,
    backgroundColor: null,
    layout: 'default',
    urlPrefix: null,
    subdomain: null,
};

describe('createPublishValidationSchema: yup-схема meta-полей', () => {
    it('пропускает валидный набор значений', async () => {
        await expect(buildSchema().validate(VALID_VALUES)).resolves.toBeTruthy();
    });

    it('режет pagename вне формата [a-z0-9-]', async () => {
        const schema = buildSchema();

        await expect(schema.validateAt('pagename', { pagename: 'Кириллица' })).rejects.toThrow(
            'bricks.publish.validation.pagenameFormat'
        );
        await expect(schema.validateAt('pagename', { pagename: 'with space' })).rejects.toThrow(
            'bricks.publish.validation.pagenameFormat'
        );
    });

    it('требует минимум 3 символа pagename', async () => {
        await expect(buildSchema().validateAt('pagename', { pagename: 'ab' })).rejects.toThrow(
            'bricks.publish.validation.pagenameMin'
        );
    });

    it('отклоняет pagename, чей адрес занят в роутинге, но не похожее имя', async () => {
        // Дашборд забирает live-адрес, страница потребителя /about — тоже
        for (const pagename of ['bricks', 'about']) {
            await expect(buildSchema().validateAt('pagename', { pagename })).rejects.toThrow(
                'bricks.publish.validation.pagenameAddressTaken'
            );
        }

        // bricks-login занимает адрес РЕДАКТОРА, а не live-адрес — сообщение другое
        await expect(
            buildSchema().validateAt('pagename', { pagename: 'bricks-login' })
        ).rejects.toThrow('bricks.publish.validation.pagenameEditorTaken');

        await expect(
            buildSchema().validateAt('pagename', { pagename: 'bricks-site' })
        ).resolves.toBe('bricks-site');
    });

    it('отклоняет urlPrefix, уводящий адрес страницы под занятый маршрут', async () => {
        // Ошибка садится на urlPrefix: сам pagename без префикса валиден
        await expect(
            buildSchema().validateAt('urlPrefix', { urlPrefix: 'bricks', pagename: 'landing' })
        ).rejects.toThrow('bricks.publish.validation.urlPrefixAddressTaken');

        await expect(
            buildSchema().validateAt('urlPrefix', { urlPrefix: 'bricks-site', pagename: 'landing' })
        ).resolves.toBe('bricks-site');
    });

    it('отклоняет занятый адрес без префикса — ошибкой на самом имени', async () => {
        // Уникальность проверяется на уровне объекта, а не поля: занят адрес
        // целиком, и тест на одном поле не пересчитывался бы при правке второго
        const schema = buildSchema({ home: 1 });

        await expect(schema.validate({ ...VALID_VALUES, pagename: 'home' })).rejects.toMatchObject({
            path: 'pagename',
            message: 'bricks.publish.validation.addressTaken',
        });
    });

    it('занятый адрес с префиксом краснит urlPrefix — им его и разводят', async () => {
        const schema = buildSchema({ 'blog/post': 1 });

        await expect(
            schema.validate({ ...VALID_VALUES, pagename: 'post', urlPrefix: 'blog' })
        ).rejects.toMatchObject({
            path: 'urlPrefix',
            message: 'bricks.publish.validation.addressTaken',
        });
    });

    it('то же имя под свободным префиксом занятым не считается', async () => {
        // Это и есть смысл адресной идентичности: `/blog/post` занят, а
        // `/news/post` и `/post` свободны
        const schema = buildSchema({ 'blog/post': 1 });

        await expect(
            schema.validate({ ...VALID_VALUES, pagename: 'post', urlPrefix: 'news' })
        ).resolves.toBeTruthy();
        await expect(schema.validate({ ...VALID_VALUES, pagename: 'post' })).resolves.toBeTruthy();
    });

    it('не считает занятым адрес самой редактируемой страницы (excludeId)', async () => {
        const schema = buildSchema({ home: 1 }, 1);

        await expect(schema.validate({ ...VALID_VALUES, pagename: 'home' })).resolves.toBeTruthy();
    });

    it('bricks-login под префиксом проходит: занят только его беспрефиксный редактор', async () => {
        await expect(
            buildSchema().validateAt('pagename', { pagename: 'bricks-login', urlPrefix: 'blog' })
        ).resolves.toBe('bricks-login');
    });

    it('требует description от 10 символов', async () => {
        await expect(
            buildSchema().validateAt('description', { description: 'коротко' })
        ).rejects.toThrow('bricks.publish.validation.descriptionMin');
    });

    it('валидирует формат urlPrefix (сегменты через слэш)', async () => {
        const schema = buildSchema();

        await expect(schema.validateAt('urlPrefix', { urlPrefix: 'blog/promo' })).resolves.toBe(
            'blog/promo'
        );
        await expect(schema.validateAt('urlPrefix', { urlPrefix: 'UPPER' })).rejects.toThrow(
            'bricks.publish.validation.urlPrefixFormat'
        );
        // Пустая строка трансформируется в null и проходит
        await expect(schema.validateAt('urlPrefix', { urlPrefix: '  ' })).resolves.toBeNull();
    });

    it('валидирует subdomain и пропускает пустое значение', async () => {
        const schema = buildSchema();

        await expect(schema.validateAt('subdomain', { subdomain: 'promo' })).resolves.toBe('promo');
        await expect(schema.validateAt('subdomain', { subdomain: 'bad.dot' })).rejects.toThrow(
            'bricks.publish.validation.subdomainFormat'
        );
        await expect(schema.validateAt('subdomain', { subdomain: '' })).resolves.toBeNull();
    });

    it('требует URL-формат socialImage, но допускает null', async () => {
        const schema = buildSchema();

        await expect(
            schema.validateAt('socialImage', { socialImage: 'not-a-url' })
        ).rejects.toThrow('bricks.publish.validation.socialImageUrl');
        await expect(
            schema.validateAt('socialImage', { socialImage: 'https://cdn.example.com/og.png' })
        ).resolves.toBeTruthy();
        await expect(schema.validateAt('socialImage', { socialImage: null })).resolves.toBeNull();
    });
});
