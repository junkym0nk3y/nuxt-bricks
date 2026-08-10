/**
 * Server-first валидация DTO ручек медиа (/api/bricks/media/**).
 *
 * Каждый валидатор отклоняет неизвестные ключи (400), проверяет типы/границы
 * и возвращает НОВЫЙ объект только из известных нормализованных полей.
 * Общие примитивы — payloadPrimitives.ts, валидаторы страниц — payloadValidation.ts.
 */
import type { ICreateMediaCategoryPayload, TUpdateMediaPayload } from '../../types/adapters';
import { assertKnownKeys, invalid, requireString } from './payloadPrimitives';
import {
    ALL_MEDIA_CATEGORIES_FILTER,
    MEDIA_CATEGORY_LABEL_MAX_LENGTH,
    MEDIA_CATEGORY_SLUG_MAX_LENGTH,
    mediaCategoryLabelToSlug,
} from '../../../common/constants/mediaCategories';

// #region Constants
const FILENAME_MAX_LENGTH = 255;
const ALT_MAX_LENGTH = 512;

const UPDATE_MEDIA_KEYS = new Set(['filename', 'alt', 'category']);
const CREATE_MEDIA_CATEGORY_KEYS = new Set(['label']);
// #endregion

/**
 * Валидирует payload PATCH /api/bricks/media/:id.
 * Все поля опциональны; требует хотя бы одно.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload обновления медиа.
 */
export function validateUpdateMediaPayload(body: Record<string, unknown>): TUpdateMediaPayload {
    assertKnownKeys(body, UPDATE_MEDIA_KEYS);

    const result: TUpdateMediaPayload = {};

    if (body.filename !== undefined) {
        result.filename = requireString(body.filename, 'filename', {
            min: 1,
            max: FILENAME_MAX_LENGTH,
        });
    }

    if (body.alt !== undefined) {
        result.alt = requireString(body.alt, 'alt', { max: ALT_MAX_LENGTH });
    }

    // null — осознанное снятие категории с файла, поэтому отличается от
    // отсутствия ключа: undefined значит «не трогать», null — «убрать»
    if (body.category !== undefined) {
        result.category = body.category === null ? null : validateMediaCategory(body.category);
    }

    if (Object.keys(result).length === 0) {
        invalid('No fields to update');
    }

    return result;
}

/**
 * Валидирует slug категории медиа синтаксически (используется и
 * multipart-ручкой загрузки). Потолок длины — ровно колонка `VARCHAR(50)`:
 * прежние 100 символов проходили валидацию и падали уже на вставке.
 *
 * Существование категории здесь НЕ проверяется — это делает
 * `assertKnownMediaCategory` на ручке, которой доступно хранилище.
 *
 * @param value - Сырое значение поля category.
 * @returns Категория после trim.
 */
export function validateMediaCategory(value: unknown): string {
    return requireString(value, 'category', { min: 1, max: MEDIA_CATEGORY_SLUG_MAX_LENGTH });
}

/**
 * Валидирует payload POST /api/bricks/media/categories и выводит slug из
 * подписи. Slug считает сервер, а не клиент: он уезжает в колонку и в фильтр,
 * и доверять его вычисление вводу означало бы принимать любую строку.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Slug и подпись новой категории.
 */
export function validateCreateMediaCategoryPayload(
    body: Record<string, unknown>
): ICreateMediaCategoryPayload {
    assertKnownKeys(body, CREATE_MEDIA_CATEGORY_KEYS);

    const label = requireString(body.label, 'label', {
        min: 1,
        max: MEDIA_CATEGORY_LABEL_MAX_LENGTH,
    });
    const slug = mediaCategoryLabelToSlug(label);

    if (!slug) {
        invalid('Category label must contain at least one letter or digit');
    }

    // Служебное значение фильтра «все категории» категорией быть не может:
    // подпись «All» даёт ровно этот slug, и в ряду чипов оказались бы два
    // элемента с одним значением — а сама категория стала бы нефильтруемой и
    // недостижимой для загрузки (категория новых файлов берётся из активного
    // фильтра, а при «Все» файл сохраняется вовсе без категории)
    if (slug === ALL_MEDIA_CATEGORIES_FILTER) {
        invalid(`Category slug "${ALL_MEDIA_CATEGORIES_FILTER}" is reserved for the "all" filter`);
    }

    return { slug, label };
}
