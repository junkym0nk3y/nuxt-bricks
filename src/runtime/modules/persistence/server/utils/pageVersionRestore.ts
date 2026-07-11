/**
 * Оркестрация отката страницы к сохранённой версии (POST .../restore).
 *
 * Применяет только schema + layout + backgroundColor: pagename/title/SEO/
 * published не трогает (нет конфликтов уникальности pagename и неожиданных
 * SEO-откатов). Идёт через storage.updatePage, который сам снапшотит текущее
 * состояние перед откатом («откат отката» бесплатно) и применяет optimistic
 * locking по expectedRevision — несовпадение бросает BricksRevisionConflictError
 * (маппится на 409 REVISION_CONFLICT в toPageHttpError на ручке).
 *
 * Зависимость передаётся параметром (узкий Pick-контракт) — логика
 * тестируется юнитом без реального Postgres (паттерн mediaOrchestration.ts).
 */
import { createError } from 'h3';
import type { IBricksPageRow } from '../../../common/types/bricks-api';
import type { IStorageAdapter } from '../../types/adapters';

/**
 * Зависимости оркестрации отката версии страницы.
 */
export interface IPageVersionRestoreDeps {
    storage: Pick<IStorageAdapter, 'getPageVersion' | 'updatePage'>;
}

/**
 * Откатывает страницу к указанной версии с проверкой revision-precondition.
 *
 * @param deps - Storage-адаптер (узкий контракт).
 * @param pageId - Идентификатор страницы.
 * @param versionId - Идентификатор версии (обязана принадлежать pageId).
 * @param expectedRevision - Precondition optimistic locking.
 * @returns Обновлённая страница.
 * @throws h3-ошибка 404 — версия или страница не найдены;
 * BricksRevisionConflictError — precondition не совпал с текущей revision.
 */
export async function restorePageVersion(
    deps: IPageVersionRestoreDeps,
    pageId: number,
    versionId: number,
    expectedRevision: number
): Promise<IBricksPageRow> {
    const version = await deps.storage.getPageVersion(pageId, versionId);

    if (!version) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Page version not found',
        });
    }

    const result = await deps.storage.updatePage(pageId, {
        schema: version.schema,
        layout: version.layout,
        backgroundColor: version.backgroundColor,
        expectedRevision,
    });

    if (!result) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    }

    return result;
}
