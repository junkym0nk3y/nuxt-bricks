/**
 * Server-first валидация DTO ручек шаблонов (`/api/bricks/templates/**`).
 *
 * Как и у страниц: клиентский yup — UX, а не защита, поэтому здесь неизвестные
 * ключи отклоняются (400), типы и границы проверяются, а наружу уходит НОВЫЙ
 * объект только из известных нормализованных полей.
 *
 * Схема и её лимиты сложности переиспользуются целиком (`validatePageSchema` из
 * валидатора страниц): шаблон несёт ровно ту схему, которую приняла бы страница,
 * и второй набор границ разошёлся бы с первым при первой же правке.
 */
import type {
    IBricksTemplatePageMeta,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
} from '../../../common/types/templates';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import {
    TEMPLATE_DESCRIPTION_MAX_LENGTH,
    TEMPLATE_NAME_MAX_LENGTH,
    TEMPLATE_NAME_MIN_LENGTH,
} from '../../../common/constants/templates';
import {
    HTTP_URL_PATTERN,
    MAX_URL_LENGTH,
    assertKnownKeys,
    invalid,
    optionalNullableString,
    requireString,
} from './payloadPrimitives';
import { validatePageSchema } from './payloadValidation';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';

// #region Constants
/** Границы полей оформления — те же, что у страницы (`bricks_pages`). */
const LAYOUT_MAX_LENGTH = 100;
const BACKGROUND_COLOR_MAX_LENGTH = 100;
const LAYOUT_PATTERN = /^[\w-]+$/;

/**
 * Ключи payload'а создания шаблона.
 *
 * `thumbnailSourceUrl`, а не `thumbnailUrl`: клиент передаёт кадр СТРАНИЦЫ, из
 * которого ручка делает собственный файл шаблона. Имя поля говорит об этом
 * прямо — принять готовый `thumbnailUrl` значило бы позволить клиенту прописать
 * шаблону произвольную картинку и обойти копирование.
 */
const CREATE_TEMPLATE_KEYS = new Set([
    'name',
    'description',
    'schema',
    'pageMeta',
    'thumbnailSourceUrl',
]);

/** Ключи payload'а правки подписи шаблона. */
const UPDATE_TEMPLATE_KEYS = new Set(['name', 'description']);

/** Ключи объекта оформления страницы внутри payload'а. */
const PAGE_META_KEYS = new Set(['layout', 'backgroundColor', 'viewportConfig']);
// #endregion

// #region Types
/**
 * Payload создания шаблона на уровне ручки: содержит исходный кадр страницы
 * вместо готового URL превью (копию делает ручка).
 */
export interface ICreateTemplateRequest extends Omit<ICreateTemplatePayload, 'thumbnailUrl'> {
    /** Кадр страницы-источника, из которого копируется превью шаблона. */
    thumbnailSourceUrl: string | null;
}
// #endregion

// #region Field validators
/**
 * Валидирует имя шаблона: непустая строка в границах, уникальность проверяет
 * индекс базы (гонку двух создателей pre-check всё равно не ловит).
 *
 * @param value - Сырое значение поля.
 * @returns Нормализованное имя.
 */
function validateTemplateName(value: unknown): string {
    return requireString(value, 'name', {
        min: TEMPLATE_NAME_MIN_LENGTH,
        max: TEMPLATE_NAME_MAX_LENGTH,
    });
}

/**
 * Валидирует оформление страницы, уезжающее в шаблон.
 *
 * Отсутствующий `pageMeta` — законное «оформление по умолчанию»: шаблон могли
 * сохранить из страницы, у которой ни layout, ни фон не заданы. Набор устройств
 * проверяется тем же строгим валидатором, что и у страницы: значение уезжает в
 * ключи схемы и в генерацию `<style>`, поэтому «почти валидный» набор опаснее
 * отказа.
 *
 * @param value - Сырое значение поля.
 * @returns Нормализованное оформление.
 */
function validateTemplatePageMeta(value: unknown): IBricksTemplatePageMeta {
    if (value === undefined || value === null) {
        return { layout: null, backgroundColor: null, viewportConfig: null };
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        invalid('Field "pageMeta" must be an object');
    }

    const meta = value as Record<string, unknown>;
    assertKnownKeys(meta, PAGE_META_KEYS);

    return {
        layout:
            optionalNullableString(meta.layout, 'pageMeta.layout', {
                max: LAYOUT_MAX_LENGTH,
                pattern: LAYOUT_PATTERN,
            }) ?? null,
        backgroundColor:
            optionalNullableString(meta.backgroundColor, 'pageMeta.backgroundColor', {
                max: BACKGROUND_COLOR_MAX_LENGTH,
            }) ?? null,
        viewportConfig: validateTemplateViewportConfig(meta.viewportConfig),
    };
}

/**
 * Валидирует набор устройств шаблона; `null`/отсутствие — наследование набора
 * проекта.
 *
 * @param value - Сырое значение поля.
 * @returns Набор устройств либо null.
 */
function validateTemplateViewportConfig(value: unknown): TBricksPageDeviceSet | null {
    if (value === undefined || value === null) {
        return null;
    }

    const validation = validateDeviceSet(value);

    if (!validation.ok) {
        invalid(`Field "pageMeta.viewportConfig" is invalid: ${validation.errors.join('; ')}`);
    }

    return validation.value;
}

/**
 * Валидирует описание шаблона (необязательное).
 *
 * @param value - Сырое значение поля.
 * @returns Описание либо null.
 */
function validateTemplateDescription(value: unknown): string | null {
    return (
        optionalNullableString(value, 'description', {
            max: TEMPLATE_DESCRIPTION_MAX_LENGTH,
        }) ?? null
    );
}
// #endregion

// #region Template payloads
/**
 * Валидирует payload `POST /api/bricks/templates`.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload создания (с исходным кадром страницы).
 */
export function validateCreateTemplatePayload(
    body: Record<string, unknown>
): ICreateTemplateRequest {
    assertKnownKeys(body, CREATE_TEMPLATE_KEYS);

    return {
        name: validateTemplateName(body.name),
        description: validateTemplateDescription(body.description),
        schema: validatePageSchema(body.schema),
        pageMeta: validateTemplatePageMeta(body.pageMeta),
        thumbnailSourceUrl:
            optionalNullableString(body.thumbnailSourceUrl, 'thumbnailSourceUrl', {
                max: MAX_URL_LENGTH,
                pattern: HTTP_URL_PATTERN,
                patternHint: 'must be an http(s) URL',
            }) ?? null,
    };
}

/**
 * Валидирует payload `PATCH /api/bricks/templates/:id`: оба поля опциональны,
 * но хотя бы одно обязано быть передано — иначе запрос ничего не значит, а
 * адаптер собрал бы `UPDATE ... SET` без выражений.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Чистый payload правки подписи.
 */
export function validateUpdateTemplatePayload(
    body: Record<string, unknown>
): IUpdateTemplatePayload {
    assertKnownKeys(body, UPDATE_TEMPLATE_KEYS);

    const payload: IUpdateTemplatePayload = {};

    if (body.name !== undefined) {
        payload.name = validateTemplateName(body.name);
    }

    if (body.description !== undefined) {
        payload.description = validateTemplateDescription(body.description);
    }

    if (Object.keys(payload).length === 0) {
        invalid('No fields to update');
    }

    return payload;
}
// #endregion
