// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { createPublishValidationSchema } from '../src/runtime/modules/builder/publish/utils/validationSchema';
// #endregion

/** Переводчик-заглушка: сообщение ошибки = i18n-ключ. */
const t = (key: string): string => key;

/**
 * Собирает схему с занятыми pagename и исключаемым id.
 *
 * @param takenPagenames - Карта занятых pagename → id владельца.
 * @param excludeId - Id страницы, исключаемой из проверки уникальности.
 * @returns Yup-схема формы публикации.
 */
function buildSchema(takenPagenames: Record<string, number> = {}, excludeId?: number) {
    return createPublishValidationSchema({
        t,
        isPagenameAvailable: (pagename, exclude) => {
            const ownerId = takenPagenames[pagename];
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

    it('отклоняет занятый pagename', async () => {
        const schema = buildSchema({ home: 1 });

        await expect(schema.validateAt('pagename', { pagename: 'home' })).rejects.toThrow(
            'bricks.publish.validation.pagenameTaken'
        );
    });

    it('не считает занятым pagename самой редактируемой страницы (excludeId)', async () => {
        const schema = buildSchema({ home: 1 }, 1);

        await expect(schema.validateAt('pagename', { pagename: 'home' })).resolves.toBe('home');
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
