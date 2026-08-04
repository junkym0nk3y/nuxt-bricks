import type { IBricksSchema } from '../../types/brick';
import type { IPublishedPage, TPublishedPageSummary } from '../../types/bricks-api';
import { toCamelCase } from '../case-transform';

export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
export const DEFAULT_LAYOUT = 'default';

/**
 * Проверяет, что значение похоже на IBricksSchema.
 *
 * @param value - Проверяемое значение.
 */
function isBricksSchema(value: unknown): value is IBricksSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return Array.isArray(record.components);
}

/**
 * Нормализует схему: гарантирует наличие components, сохраняет meta если не пуста.
 *
 * @param schema - Схема лендинга.
 * @returns Нормализованная схема.
 */
export function preserveSchema(schema: IBricksSchema | null | undefined): IBricksSchema {
    if (!schema) {
        return { components: [] };
    }

    const result: IBricksSchema = {
        components: schema.components ?? [],
    };

    if (schema.meta && Object.keys(schema.meta).length > 0) {
        result.meta = schema.meta;
    }

    return result;
}

/**
 * Проверяет соответствие subdomain страницы фактическому хосту запроса
 * (прежний `includes` матчил notpromo.example под "promo").
 * Хост нормализуется URL-парсером (порт, регистр, trailing dot); значение
 * без точек сравнивается с первым label hostname, с точками — с полным
 * hostname (явный mapping). Ожидаются ASCII-slug значения — punycode-хосты
 * с non-ASCII конфигом сознательно не матчатся.
 *
 * @param hostHeader - Host-заголовок SSR (может содержать порт) или hostname браузера.
 * @param subdomain - Поле subdomain страницы.
 * @returns true — страница показывается на этом хосте.
 */
export function matchesPageSubdomain(
    hostHeader: string | undefined,
    subdomain: string | null | undefined
): boolean {
    const requested = (subdomain ?? '').trim().toLowerCase();

    if (!requested) {
        return true;
    }

    if (!hostHeader) {
        return false;
    }

    let hostname: string;

    try {
        hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    } catch {
        return false;
    }

    hostname = hostname.replace(/\.$/, '');

    if (requested.includes('.')) {
        return hostname === requested;
    }

    const [firstLabel] = hostname.split('.');
    return firstLabel === requested;
}

/**
 * Нормализует ответ API в форму IPublishedPage.
 * Конвертирует snake_case ключи из Django backend в camelCase, но не трогает `schema`
 * (это пользовательский JSON).
 *
 * @param rawPage - Данные страницы из API (может быть в snake_case).
 * @param defaultBackgroundColor - Цвет фона, если страница его не хранит.
 * @returns Нормализованная опубликованная страница в camelCase.
 */
export function normalizePublishedPage(
    rawPage: unknown,
    defaultBackgroundColor: string = DEFAULT_BACKGROUND_COLOR
): IPublishedPage {
    const rawRecord: Record<string, unknown> =
        typeof rawPage === 'object' && rawPage !== null && !Array.isArray(rawPage)
            ? (rawPage as Record<string, unknown>)
            : {};

    const rawSchema = rawRecord.schema;
    const rest: Record<string, unknown> = { ...rawRecord };
    delete rest.schema;

    const page = toCamelCase<Partial<IPublishedPage>>(rest);
    const schema = isBricksSchema(rawSchema) ? rawSchema : { components: [] };

    const createdAt = page.createdAt ?? '';
    const updatedAt = page.updatedAt ?? createdAt;

    return {
        id: page.id as number,
        pagename: page.pagename as string,
        title: page.title ?? '',
        description: page.description ?? '',
        keywords: page.keywords ?? '',
        backgroundColor: page.backgroundColor ?? defaultBackgroundColor,
        layout: page.layout ?? DEFAULT_LAYOUT,
        socialImage: page.socialImage ?? '',
        urlPrefix: page.urlPrefix ?? null,
        subdomain: page.subdomain ?? null,
        thumbnailUrl: page.thumbnailUrl ?? null,
        schema: preserveSchema(schema),
        published: Boolean(page.published),
        // Отсутствует в public-проекции и старых снапшотах — тогда запись без precondition
        revision: typeof page.revision === 'number' ? page.revision : undefined,
        createdAt,
        updatedAt,
        isPreview: page.isPreview,
    };
}

/**
 * Собирает страницу превью из снапшота сохранённой версии: содержимое и meta —
 * версии, тождество страницы — текущей строки.
 *
 * `id` снапшота — идентификатор записи истории, а не страницы; адрес
 * (`pagename` + `urlPrefix`) в нём мог остаться прежним, если страницу
 * переместили, — а превью открыто по нынешнему адресу. Поэтому и id, и обе
 * половины адреса берутся у страницы: со старым префиксом в снапшоте сверка
 * адреса в превью и рендерере отвергала бы страницу как чужую.
 *
 * `updatedAt` — `pageUpdatedAt` снапшота, то есть момент, когда снятое состояние
 * сохранили: этой же датой подписана карточка версии в галерее. `revision` не
 * переносится — из превью писать нечем, precondition ни к чему.
 *
 * @param rawVersion - Ответ `GET /api/bricks/:id/versions/:versionId` (возможен snake_case).
 * @param page - Сводка текущей страницы.
 * @returns Страница для рендера превью версии.
 */
export function normalizePageVersionPreview(
    rawVersion: unknown,
    page: TPublishedPageSummary
): IPublishedPage {
    const rawRecord: Record<string, unknown> =
        typeof rawVersion === 'object' && rawVersion !== null && !Array.isArray(rawVersion)
            ? (rawVersion as Record<string, unknown>)
            : {};

    const rawPageUpdatedAt = rawRecord.pageUpdatedAt ?? rawRecord.page_updated_at;
    const pageUpdatedAt = typeof rawPageUpdatedAt === 'string' ? rawPageUpdatedAt : '';

    return {
        ...normalizePublishedPage(rawVersion),
        id: page.id,
        pagename: page.pagename,
        urlPrefix: page.urlPrefix,
        createdAt: page.createdAt,
        updatedAt: pageUpdatedAt || page.updatedAt,
        revision: undefined,
        isPreview: true,
    };
}

/**
 * Нормализует сводку страницы editorial-списка (без `schema`): те же правила,
 * что normalizePublishedPage, но без фабрикации пустой схемы — сводка схему
 * не несёт, и в стор списка она попадать не должна.
 *
 * @param rawPage - Данные сводки из API (может быть в snake_case).
 * @param defaultBackgroundColor - Цвет фона, если страница его не хранит.
 * @returns Нормализованная сводка страницы.
 */
export function normalizePublishedPageSummary(
    rawPage: unknown,
    defaultBackgroundColor: string = DEFAULT_BACKGROUND_COLOR
): TPublishedPageSummary {
    const {
        schema: _schema,
        isPreview: _isPreview,
        ...summary
    } = normalizePublishedPage(rawPage, defaultBackgroundColor);

    return summary;
}
