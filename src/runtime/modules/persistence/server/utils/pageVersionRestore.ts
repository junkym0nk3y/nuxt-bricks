/**
 * Оркестрация отката страницы к сохранённой версии (POST .../restore).
 *
 * Применяет schema + layout + backgroundColor + thumbnailUrl + набор устройств:
 * pagename/title/SEO/published не трогает (нет конфликтов уникальности pagename
 * и неожиданных SEO-откатов). Идёт через storage.updatePage, который сам снапшотит текущее
 * состояние перед откатом («откат отката» бесплатно) и применяет optimistic
 * locking по expectedRevision — несовпадение бросает BricksRevisionConflictError
 * (маппится на 409 REVISION_CONFLICT в toPageHttpError на ручке).
 *
 * Зависимость передаётся параметром (узкий Pick-контракт) — логика
 * тестируется юнитом без реального Postgres (паттерн mediaOrchestration.ts).
 */
import { createError } from 'h3';
import type { IBricksPageRow } from '../../../common/types/bricks-api';
import type { TBricksPageDeviceSet } from '../../../common/types/devices';
import type { IStorageAdapter } from '../../types/adapters';
import { validateSchemaComponentGraph } from '../../../common/utils/bricks/schemaContract';
import { validateDeviceSet } from '../../../common/utils/bricks/devices';

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
 * h3-ошибка 400 — сохранённая версия содержит схему, не проходящую
 * структурный контракт графа компонентов (см. schemaContract.ts) —
 * такую версию нельзя откатывать, не восстанавливая при этом сломанный рендер;
 * BricksRevisionConflictError — precondition не совпал с текущей revision.
 */
/**
 * Проверяет сохранённый в версии набор устройств перед откатом.
 *
 * Повреждённый набор — отказ, а не тихая замена на наследование: ключи
 * `props.responsive` в схеме версии относятся к её набору, и восстановить схему
 * без него значит вернуть страницу в состояние, где переопределения блоков
 * указывают на несуществующие ступени. Ровно от этого набор в версии и хранится.
 * Схема с битым контрактом отвергается тут же рядом по той же причине.
 *
 * @param stored - Значение `viewport_config` из снимка версии.
 * @returns Набор устройств либо `null` (версия наследующей страницы).
 * @throws h3-ошибка 400 — сохранённый набор не проходит контракт.
 */
function resolveStoredViewportConfig(stored: unknown): TBricksPageDeviceSet | null {
    if (stored === null || stored === undefined) {
        return null;
    }

    const validation = validateDeviceSet(stored);

    if (!validation.ok) {
        throw createError({
            statusCode: 400,
            statusMessage: `Stored version viewport config is invalid: ${validation.errors
                .slice(0, 3)
                .join('; ')}`,
        });
    }

    return validation.value;
}

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

    const contractErrors = Array.isArray(version.schema?.components)
        ? validateSchemaComponentGraph(version.schema.components)
        : ['Field "schema.components" must be an array'];

    if (contractErrors.length > 0) {
        throw createError({
            statusCode: 400,
            statusMessage: `Stored version schema is invalid: ${contractErrors
                .slice(0, 3)
                .join('; ')}`,
        });
    }

    // Превью едет вместе со схемой, включая `null`: содержимое страницы после
    // отката — содержимое версии, и прежний кадр показывал бы то, чего на
    // странице больше нет. У версии без снимка честнее плейсхолдер, чем чужая
    // картинка; страница получит свой кадр на первом же сохранении из билдера.
    // Кадр состояния, которое откат вытесняет, не теряется — его уносит
    // снапшот, который updatePage делает перед записью.
    // Набор устройств едет вместе со схемой: ключи `props.responsive` в снимке
    // относятся к тому набору, при котором его сняли, и откат схемы без набора
    // дал бы страницу, где переопределения блоков указывают на несуществующие
    // ступени. `null` восстанавливается как есть — версия наследующей страницы
    // остаётся наследующей
    const restoredViewportConfig = resolveStoredViewportConfig(version.viewportConfig);

    const result = await deps.storage.updatePage(pageId, {
        schema: version.schema,
        layout: version.layout,
        backgroundColor: version.backgroundColor,
        thumbnailUrl: version.thumbnailUrl,
        viewportConfig: restoredViewportConfig,
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
