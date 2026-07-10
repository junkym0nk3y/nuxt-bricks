/**
 * Server-first валидация DTO ручек страниц (/api/bricks — create/update).
 *
 * Клиентский yup — UX, не защита: сюда попадает произвольное тело запроса.
 * Каждый валидатор отклоняет неизвестные ключи (400), проверяет типы/границы
 * и возвращает НОВЫЙ объект только из известных нормализованных полей —
 * лишнее не доезжает до адаптеров даже при дрейфе whitelist'ов ниже по стеку.
 * Общие примитивы — payloadPrimitives.ts, валидаторы медиа — mediaPayloadValidation.ts.
 */
import type { IBricksSchema } from '../../../common/types/brick';
import type { ICreatePagePayload, IUpdatePagePayload } from '../../../common/types/bricks-api';
import {
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    PAGENAME_PATTERN,
    RESERVED_PAGENAMES,
    SUBDOMAIN_MAX_LENGTH,
    SUBDOMAIN_PATTERN,
    URL_PREFIX_MAX_LENGTH,
    URL_PREFIX_PATTERN,
} from '../../../common/constants/publish';
import {
    HTTP_URL_PATTERN,
    MAX_URL_LENGTH,
    assertKnownKeys,
    invalid,
    optionalBoolean,
    optionalNullableString,
    requireString,
} from './payloadPrimitives';

// #region Constants
/** Лимит сериализованной schema — защита от JSONB-бомбы. */
const MAX_SCHEMA_JSON_CHARS = 2 * 1024 * 1024;
/** Лимит числа компонентов схемы. */
const MAX_SCHEMA_COMPONENTS = 5000;

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;
const KEYWORDS_MAX_LENGTH = 255;
const LAYOUT_MAX_LENGTH = 100;
const BACKGROUND_COLOR_MAX_LENGTH = 100;

const LAYOUT_PATTERN = /^[\w-]+$/;

const CREATE_PAGE_KEYS = new Set([
    'pagename',
    'title',
    'description',
    'keywords',
    'socialImage',
    'layout',
    'backgroundColor',
    'urlPrefix',
    'subdomain',
    'schema',
    'published',
]);

const UPDATE_PAGE_KEYS = new Set([...CREATE_PAGE_KEYS, 'thumbnailUrl', 'expectedRevision']);
// #endregion

// #region Field validators
/**
 * Валидирует pagename: формат, границы длины, зарезервированные имена.
 *
 * @param value - Сырое значение.
 * @returns Нормализованный pagename.
 */
function validatePagename(value: unknown): string {
    const pagename = requireString(value, 'pagename', {
        min: PAGENAME_MIN_LENGTH,
        max: PAGENAME_MAX_LENGTH,
        pattern: PAGENAME_PATTERN,
        patternHint: 'only lowercase letters, digits and hyphens are allowed',
    });

    if (RESERVED_PAGENAMES.includes(pagename)) {
        invalid(`Pagename "${pagename}" is reserved`);
    }

    return pagename;
}

/**
 * Валидирует schema страницы: объект с массивом components в допустимых границах.
 *
 * @param value - Сырое значение поля schema.
 * @returns Схема (форма проверена, содержимое компонентов — как есть).
 */
function validateSchema(value: unknown): IBricksSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        invalid('Field "schema" must be an object');
    }

    const components = (value as Record<string, unknown>).components;

    if (!Array.isArray(components)) {
        invalid('Field "schema.components" must be an array');
    }

    if (components.length > MAX_SCHEMA_COMPONENTS) {
        invalid(`Schema exceeds ${MAX_SCHEMA_COMPONENTS} components limit`);
    }

    if (JSON.stringify(value).length > MAX_SCHEMA_JSON_CHARS) {
        invalid('Schema payload is too large');
    }

    return value as IBricksSchema;
}

/**
 * Валидирует precondition optimistic locking: положительный safe integer.
 *
 * @param value - Сырое значение поля expectedRevision.
 * @returns Ожидаемая revision.
 */
function validateExpectedRevision(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        invalid('Field "expectedRevision" must be a positive integer');
    }

    return value;
}

/**
 * Валидирует общие meta-поля страницы (create и update).
 *
 * @param body - Нормализованное тело запроса.
 * @returns Нормализованные meta-поля (только переданные).
 */
function validatePageMetaFields(body: Record<string, unknown>): Partial<IUpdatePagePayload> {
    const result: Partial<IUpdatePagePayload> = {};

    if (body.title !== undefined) {
        result.title = requireString(body.title, 'title', { max: TITLE_MAX_LENGTH });
    }

    if (body.description !== undefined) {
        result.description = requireString(body.description, 'description', {
            max: DESCRIPTION_MAX_LENGTH,
        });
    }

    if (body.keywords !== undefined) {
        result.keywords = requireString(body.keywords, 'keywords', {
            max: KEYWORDS_MAX_LENGTH,
        });
    }

    const socialImage = optionalNullableString(body.socialImage, 'socialImage', {
        max: MAX_URL_LENGTH,
        pattern: HTTP_URL_PATTERN,
        patternHint: 'must be an http(s) URL',
    });
    if (socialImage !== undefined) {
        result.socialImage = socialImage;
    }

    const layout = optionalNullableString(body.layout, 'layout', {
        max: LAYOUT_MAX_LENGTH,
        pattern: LAYOUT_PATTERN,
    });
    if (layout !== undefined) {
        result.layout = layout;
    }

    const backgroundColor = optionalNullableString(body.backgroundColor, 'backgroundColor', {
        max: BACKGROUND_COLOR_MAX_LENGTH,
    });
    if (backgroundColor !== undefined) {
        result.backgroundColor = backgroundColor;
    }

    const urlPrefix = optionalNullableString(body.urlPrefix, 'urlPrefix', {
        max: URL_PREFIX_MAX_LENGTH,
        pattern: URL_PREFIX_PATTERN,
        patternHint: 'segments of lowercase letters, digits and hyphens separated by "/"',
    });
    if (urlPrefix !== undefined) {
        result.urlPrefix = urlPrefix;
    }

    const subdomain = optionalNullableString(body.subdomain, 'subdomain', {
        max: SUBDOMAIN_MAX_LENGTH,
        pattern: SUBDOMAIN_PATTERN,
        patternHint: 'only lowercase letters, digits and hyphens are allowed',
    });
    if (subdomain !== undefined) {
        result.subdomain = subdomain;
    }

    const published = optionalBoolean(body.published, 'published');
    if (published !== undefined) {
        result.published = published;
    }

    return result;
}
// #endregion

// #region Page payloads
/**
 * Валидирует payload POST /api/bricks (создание страницы).
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload создания.
 */
export function validateCreatePagePayload(body: Record<string, unknown>): ICreatePagePayload {
    assertKnownKeys(body, CREATE_PAGE_KEYS);

    return {
        ...validatePageMetaFields(body),
        pagename: validatePagename(body.pagename),
        schema: validateSchema(body.schema),
    };
}

/**
 * Валидирует payload PUT/PATCH /api/bricks/:id (обновление страницы).
 * Все поля опциональны; требует хотя бы одно записываемое
 * (precondition expectedRevision полем данных не считается).
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload обновления.
 */
export function validateUpdatePagePayload(body: Record<string, unknown>): IUpdatePagePayload {
    assertKnownKeys(body, UPDATE_PAGE_KEYS);

    const result: IUpdatePagePayload = validatePageMetaFields(body);

    if (body.pagename !== undefined) {
        result.pagename = validatePagename(body.pagename);
    }

    if (body.schema !== undefined) {
        result.schema = validateSchema(body.schema);
    }

    const thumbnailUrl = optionalNullableString(body.thumbnailUrl, 'thumbnailUrl', {
        max: MAX_URL_LENGTH,
        pattern: HTTP_URL_PATTERN,
        patternHint: 'must be an http(s) URL',
    });
    if (thumbnailUrl !== undefined) {
        result.thumbnailUrl = thumbnailUrl;
    }

    if (Object.values(result).every((value) => value === undefined)) {
        invalid('No fields to update');
    }

    if (body.expectedRevision !== undefined) {
        result.expectedRevision = validateExpectedRevision(body.expectedRevision);
    }

    return result;
}
// #endregion
