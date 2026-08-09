// #region Imports
// Types
import type { IMediaCategory } from '../../src/runtime/modules/common/types/media';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    buildMediaVariantFilename,
    isMediaVariantFilename,
} from '../../src/runtime/modules/persistence/server/utils/mediaVariants';
import { assertKnownMediaCategory } from '../../src/runtime/modules/persistence/server/utils/mediaCategoryRules';
import {
    BricksStorageWriteRejectedError,
    BricksUnknownMediaCategoryError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import { validateCreateMediaCategoryPayload } from '../../src/runtime/modules/persistence/server/utils/mediaPayloadValidation';
// #endregion

// #region Fakes
/**
 * Хранилище с заданным набором категорий.
 *
 * @param slugs - Slug'и известных категорий.
 */
function makeCategoryStorage(slugs: string[]): {
    listMediaCategories: () => Promise<IMediaCategory[]>;
} {
    return {
        async listMediaCategories(): Promise<IMediaCategory[]> {
            return slugs.map((slug, index) => ({
                id: index + 1,
                slug,
                label: slug,
                sortOrder: (index + 1) * 10,
            }));
        },
    };
}
// #endregion

describe('имена уменьшенных вариантов', () => {
    it('вариант ложится рядом с полным файлом под тем же uuid', () => {
        expect(buildMediaVariantFilename('abc-123.webp', 'preview', 'webp')).toBe(
            'abc-123-preview.webp'
        );
        expect(buildMediaVariantFilename('abc-123.webp', 'mock', 'webp')).toBe('abc-123-mock.webp');
    });

    it('расширение варианта своё: полный файл может быть avif или png', () => {
        expect(buildMediaVariantFilename('abc-123.avif', 'preview', 'webp')).toBe(
            'abc-123-preview.webp'
        );
        expect(buildMediaVariantFilename('abc-123.png', 'mock', 'webp')).toBe('abc-123-mock.webp');
    });

    it('варианты опознаются и по имени, и по полному S3-ключу', () => {
        expect(isMediaVariantFilename('abc-preview.webp')).toBe(true);
        expect(isMediaVariantFilename('bricks-media/abc-mock.webp')).toBe(true);
        expect(isMediaVariantFilename('bricks-media/abc.webp')).toBe(false);
    });

    it('честное имя пользователя не принимается за вариант: суффикс проверяется на конце', () => {
        // Без сверки конца имени импорт из бакета выбросил бы этот файл из медиатеки
        expect(isMediaVariantFilename('hero-preview-final.webp')).toBe(false);
        expect(isMediaVariantFilename('mock-up.png')).toBe(false);
    });
});

describe('серверная проверка существования категории', () => {
    it('известная категория проходит', async () => {
        await expect(
            assertKnownMediaCategory(makeCategoryStorage(['photos', 'promo']), 'promo')
        ).resolves.toBeUndefined();
    });

    it('неизвестная отклоняется доменной ошибкой — тем же классом, что и отказ FK', async () => {
        await expect(
            assertKnownMediaCategory(makeCategoryStorage(['photos']), 'typo')
        ).rejects.toBeInstanceOf(BricksUnknownMediaCategoryError);
    });

    it('отказ ранней проверки безопасен для компенсации файлов', async () => {
        // Наследование маркера — единственное, что разрешает удалить уже
        // загруженный файл: без него загрузка с исчезнувшей категорией
        // оставляла бы объект в бакете навсегда
        await expect(
            assertKnownMediaCategory(makeCategoryStorage([]), 'gone')
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });
});

describe('валидация создания категории', () => {
    it('подпись принимается, slug считается сервером', () => {
        expect(validateCreateMediaCategoryPayload({ label: 'Промо' })).toEqual({
            slug: 'promo',
            label: 'Промо',
        });
    });

    it('клиентский slug в payload не принимается — только известные ключи', () => {
        expect(() =>
            validateCreateMediaCategoryPayload({ label: 'Промо', slug: 'anything' })
        ).toThrow();
    });

    it('подпись без букв и цифр отклоняется: slug из неё пустой', () => {
        expect(() => validateCreateMediaCategoryPayload({ label: '!!!' })).toThrow();
    });

    it('пустая подпись отклоняется', () => {
        expect(() => validateCreateMediaCategoryPayload({ label: '   ' })).toThrow();
    });

    it('подпись, дающая служебный slug фильтра, отклоняется', () => {
        // Иначе в ряду чипов два элемента с одним value, а категория становится
        // нефильтруемой: «все» пропускает всё, а загрузка при нём уходит в приёмник
        expect(() => validateCreateMediaCategoryPayload({ label: 'All' })).toThrow();
        expect(() => validateCreateMediaCategoryPayload({ label: ' all ' })).toThrow();
    });
});
