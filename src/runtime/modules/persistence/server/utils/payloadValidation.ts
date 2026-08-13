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
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import {
    DESCRIPTION_MAX_LENGTH,
    KEYWORDS_MAX_LENGTH,
    PAGENAME_MAX_LENGTH,
    PAGENAME_MIN_LENGTH,
    PAGENAME_PATTERN,
    SUBDOMAIN_MAX_LENGTH,
    SUBDOMAIN_PATTERN,
    TITLE_MAX_LENGTH,
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
    requirePositiveInteger,
    requireString,
} from './payloadPrimitives';
import { assertSchemaComplexity } from './schemaPayloadValidation';
import type { IPageAddressContext } from '../../types/pageAddress';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBricksOwnStaticRoutes,
    getBuilderPagePath,
    getPublishedPagePath,
    isEditorAddressTaken,
    isPageAddressTaken,
    type IBricksRoutePrefixes,
} from '../../../common/utils/bricks/routePaths';

// #region Constants
/** Лимит числа компонентов схемы. */
const MAX_SCHEMA_COMPONENTS = 5000;

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
    'viewportConfig',
    'schema',
    'published',
]);

const UPDATE_PAGE_KEYS = new Set([...CREATE_PAGE_KEYS, 'thumbnailUrl', 'expectedRevision']);

/**
 * Контекст адреса для вызовов без явного аргумента: ручки передают активный
 * (`getConfiguredPageAddressContext`), дефолт нужен прямым вызовам вне Nitro,
 * где runtimeConfig недоступен.
 */
const DEFAULT_PAGE_ADDRESS_CONTEXT: IPageAddressContext = {
    prefixes: DEFAULT_BRICKS_ROUTE_PREFIXES,
    isLiveSurfaceEnabled: true,
};

/** Payload POST /api/bricks/:id/versions/:versionId/restore — precondition only. */
const RESTORE_VERSION_KEYS = new Set(['expectedRevision']);

// #endregion

// #region Field validators
/**
 * Валидирует набор устройств страницы.
 *
 * Строгий и не чинящий: значение уезжает и в генерацию `<style>`, и в ключи
 * схемы, поэтому «почти валидный» набор опаснее отказа. Сортировка, обрезка
 * длины и отбрасывание дублей здесь запрещены — они молча меняли бы раскладку
 * страницы на не ту, что заказывал клиент.
 *
 * @param value - Сырое значение поля.
 * @returns Набор устройств либо `null` (наследование набора проекта).
 */
function validateViewportConfig(value: unknown): TBricksPageDeviceSet | null {
    if (value === null) {
        return null;
    }

    const validation = validateDeviceSet(value);

    if (!validation.ok) {
        invalid(`Field "viewportConfig" is invalid: ${validation.errors.join('; ')}`);
    }

    return validation.value;
}

/**
 * Резолвер владельца пути для сервера: живого роутера здесь нет, поэтому ответ
 * даётся по собственным маршрутам модуля. Страниц приложения-потребителя сервер
 * не видит — их конфликты ловит клиентская проверка через роутер.
 *
 * @param prefixes - Активные префиксы маршрутов.
 * @returns Функция «путь → имя владеющего маршрута».
 */
function createOwnRouteResolver(
    prefixes: IBricksRoutePrefixes
): (path: string) => string | undefined {
    const ownRoutes = getBricksOwnStaticRoutes(prefixes);

    return (path: string) => ownRoutes[path];
}

/**
 * Валидирует pagename: формат и границы длины.
 *
 * Доступность адреса редактора здесь НЕ проверяется, хотя раньше проверялась:
 * адрес редактора складывается из пары `urlPrefix + pagename`, а PATCH несёт
 * любое одно поле пары. Проверка по одному имени отвергала бы законный
 * `pagename: bricks-login` с префиксом (его редактор живёт по свободному
 * `<builderPrefix>/blog/bricks-login`) и пропускала бы запрещённый адрес,
 * собранный из сохранённого имени и нового префикса. Обе половины сводит
 * `assertPageAddressAllowed`.
 *
 * @param value - Сырое значение.
 * @returns Нормализованный pagename.
 */
function validatePagename(value: unknown): string {
    return requireString(value, 'pagename', {
        min: PAGENAME_MIN_LENGTH,
        max: PAGENAME_MAX_LENGTH,
        pattern: PAGENAME_PATTERN,
        patternHint: 'only lowercase letters, digits and hyphens are allowed',
    });
}

/**
 * Валидирует schema страницы: объект с массивом components в допустимых
 * границах. Глубина/число узлов/типы значений/сериализованный размер —
 * `assertSchemaComplexity` (итеративный обход до `JSON.stringify`, см.
 * schemaPayloadValidation.ts); структурный контракт графа компонентов
 * (форма узла, уникальность/согласованность id, ацикличность, глубина
 * дерева) — `validateSchemaComponentGraph` (см.
 * common/utils/bricks/schemaContract.ts).
 *
 * @param value - Сырое значение поля schema.
 * @returns Схема (форма и граф компонентов проверены).
 * @throws 400 — форма schema/components невалидна, либо превышены лимиты
 * сложности, либо граф компонентов нарушает контракт (см. schemaContract.ts).
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

    assertSchemaComplexity(value);

    const contractErrors = validateSchemaComponentGraph(components);

    if (contractErrors.length > 0) {
        invalid(`Invalid schema: ${contractErrors.slice(0, 3).join('; ')}`);
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
    return requirePositiveInteger(value, 'expectedRevision');
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

    if (body.viewportConfig !== undefined) {
        result.viewportConfig = validateViewportConfig(body.viewportConfig);
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
 * Проверяет, что адрес страницы не перекрыт поверхностью bricks — и адрес
 * редактора, и live-адрес.
 *
 * Отдельной функцией, а не внутри валидаторов полей: адрес складывает СУММА
 * `urlPrefix + pagename`, а PATCH несёт любое одно поле пары — вторую половину
 * ручка обновления достаёт из сохранённой строки и зовёт эту проверку сама.
 *
 * Адрес редактора проверяется всегда, а live-адрес — только при включённом
 * live-рендере: без него у страницы нет собственного URL, а редактор есть
 * всегда. Клиент решает так же, иначе один и тот же адрес проходил бы форму и
 * падал на сервере.
 *
 * @param context - Контекст адреса страницы.
 * @param address - Адрес страницы.
 */
export function assertPageAddressAllowed(
    context: IPageAddressContext,
    address: IBricksPageAddress
): void {
    const { prefixes, isLiveSurfaceEnabled } = context;
    const resolveOwnRoute = createOwnRouteResolver(prefixes);

    if (isEditorAddressTaken(prefixes, resolveOwnRoute, address)) {
        invalid(
            `Editor path "${getBuilderPagePath(prefixes, address)}" is reserved by a builder route`
        );
    }

    if (!isLiveSurfaceEnabled) {
        return;
    }

    if (isPageAddressTaken(prefixes, resolveOwnRoute, address)) {
        invalid(`Page path "${getPublishedPagePath(address)}" is reserved by the builder surface`);
    }
}

/**
 * Валидирует payload POST /api/bricks (создание страницы).
 *
 * @param body - Нормализованное тело запроса.
 * @param context - Контекст адреса (дефолт — для вызовов вне Nitro).
 * @returns Чистый payload создания.
 */
export function validateCreatePagePayload(
    body: Record<string, unknown>,
    context: IPageAddressContext = DEFAULT_PAGE_ADDRESS_CONTEXT
): ICreatePagePayload {
    assertKnownKeys(body, CREATE_PAGE_KEYS);

    const payload: ICreatePagePayload = {
        ...validatePageMetaFields(body),
        pagename: validatePagename(body.pagename),
        schema: validateSchema(body.schema),
    };

    // Создание знает оба поля пары сразу, поэтому проверяется здесь же
    assertPageAddressAllowed(context, toPageAddress(payload.pagename, payload.urlPrefix));

    return payload;
}

/**
 * Валидирует payload PUT/PATCH /api/bricks/:id (обновление страницы).
 * Все поля опциональны; требует хотя бы одно записываемое
 * (precondition expectedRevision полем данных не считается).
 *
 * Адрес страницы здесь НЕ проверяется, поэтому и контекст адреса не нужен:
 * половина пары может остаться в сохранённой строке, и сводит их ручка
 * (`updatePageFromEvent`) через `withCheckedPagePath` →
 * `assertPageAddressAllowed`.
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

/**
 * Валидирует payload POST /api/bricks/:id/versions/:versionId/restore.
 * В отличие от PUT/PATCH, `expectedRevision` здесь обязателен — restore не
 * поддерживает last-write-wins (несовпадение revision → 409 REVISION_CONFLICT
 * в toPageHttpError, см. JSDoc ручки restore.post.ts).
 *
 * @param body - Нормализованное тело запроса.
 * @returns Precondition отката.
 */
export function validateRestoreVersionPayload(body: Record<string, unknown>): {
    expectedRevision: number;
} {
    assertKnownKeys(body, RESTORE_VERSION_KEYS);

    return { expectedRevision: validateExpectedRevision(body.expectedRevision) };
}
// #endregion
