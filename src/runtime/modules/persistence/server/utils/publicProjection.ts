/**
 * Публичная проекция страницы для read-model `/api/bricks/public/**`.
 *
 * Editorial-строка БД содержит editor-only поля (thumbnailUrl — превью канваса
 * для дашборда) — наружу уходит только безопасное подмножество. Новые
 * editor-поля по умолчанию НЕ попадают в public-ответ: проекция собирается
 * явным перечислением, а не delete-ом лишнего.
 */
import type { IBricksPageRow } from '../../../common/types/bricks-api';

/** Публичное подмножество полей страницы (без editor-only данных). */
export type TPublicPageProjection = Omit<IBricksPageRow, 'thumbnailUrl' | 'revision'>;

/**
 * Собирает публичную проекцию страницы.
 *
 * @param page - Полная строка страницы из адаптера.
 * @returns Публичное подмножество полей.
 */
export function toPublicPageProjection(page: IBricksPageRow): TPublicPageProjection {
    return {
        id: page.id,
        pagename: page.pagename,
        title: page.title,
        description: page.description,
        keywords: page.keywords,
        backgroundColor: page.backgroundColor,
        layout: page.layout,
        socialImage: page.socialImage,
        urlPrefix: page.urlPrefix,
        subdomain: page.subdomain,
        // Набор устройств — часть раскладки published-страницы, а не editor-only
        // данные: без него опубликованная страница считала бы пороги по набору
        // проекта, пока билдер показывает собственный набор страницы
        viewportConfig: page.viewportConfig,
        schema: page.schema,
        published: page.published,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
    };
}
