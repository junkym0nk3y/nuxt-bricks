/**
 * Оркестрация отката страницы к версии для publish-стора: revision-precondition
 * (обязателен, в отличие от update/patch — см. `requirePageRevision`), запрос
 * отката, синхронизация локального списка и приведение 409-конфликта к
 * понятному сообщению (`toPageWriteError`).
 *
 * Зависимость стора передаётся узким Pick-контрактом — логика тестируется
 * юнитом без Pinia (паттерн persistence/server/utils/mediaOrchestration.ts).
 */
import type { IPublishedPage } from '../../../common/types/bricks-api';
import { restorePageVersionRequest } from './publishApi';
import { requirePageRevision, toPageWriteError } from './requestErrors';

/**
 * Узкий контракт стора, нужный для отката версии.
 */
export interface IVersionRestoreStoreDeps {
    getPageById: (id: string | number) => { revision?: number } | undefined;
    syncPageInList: (page: IPublishedPage) => void;
    loadAllPages: () => Promise<void>;
}

/**
 * Откатывает страницу к версии с обязательным revision-precondition.
 *
 * @param deps - Узкий контракт стора (getPageById/syncPageInList/loadAllPages).
 * @param id - Идентификатор страницы.
 * @param versionId - Идентификатор версии.
 * @param revisionMissingMessage - Сообщение об ошибке, если у страницы нет revision.
 * @returns Нормализованная страница после отката.
 * @throws Локализованная ошибка: revision не найден, конфликт precondition
 * (`toPageWriteError`) либо иная ошибка запроса.
 */
export async function restorePageVersionWithPrecondition(
    deps: IVersionRestoreStoreDeps,
    id: string | number,
    versionId: number,
    revisionMissingMessage: string
): Promise<IPublishedPage> {
    const expectedRevision = requirePageRevision(deps.getPageById(id), revisionMissingMessage);

    try {
        const normalized = await restorePageVersionRequest(id, versionId, expectedRevision);
        deps.syncPageInList(normalized);

        return normalized;
    } catch (error: unknown) {
        console.error('[Publish Store] Failed to restore page version:', error);
        throw await toPageWriteError(error, deps.loadAllPages);
    }
}
