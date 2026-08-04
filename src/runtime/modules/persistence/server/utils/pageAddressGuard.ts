/**
 * Проверка адреса страницы при ЧАСТИЧНОМ обновлении: перекрывает адрес сумма
 * `urlPrefix + pagename`, а payload несёт любое одно поле пары.
 *
 * Отдельно от `pageUpdate.ts` намеренно: там ручка тянет реестр адаптеров и
 * runtimeConfig (Nitro), а здесь остаётся чистая оркестрация с DI — её и
 * проверяют тесты.
 */
import { createError } from 'h3';
import { assertPagePathAllowed } from './payloadValidation';
import type { IUpdatePagePayload } from '../../../common/types/bricks-api';
import type { IPageAddressContext } from '../../types/pageAddress';
import type { IStorageAdapter } from '../../types/adapters';

/**
 * Дополняет payload обновления проверкой адреса: вторую половину пары берёт из
 * сохранённой строки, если её нет в payload.
 *
 * Найденная revision уходит в precondition, когда вызывающий свою не передал:
 * между чтением строки и записью её routing-поле может сменить другой писатель,
 * и два по отдельности безопасных изменения собрали бы запрещённый адрес. С
 * precondition такая запись падает в 409 вместо тихой поломки адреса.
 *
 * @param adapter - Читающая часть storage-адаптера.
 * @param id - Id страницы.
 * @param payload - Провалидированный payload обновления.
 * @param context - Контекст адреса страницы.
 * @returns Payload (при необходимости — с добавленным precondition).
 */
export async function withCheckedPagePath(
    adapter: Pick<IStorageAdapter, 'getPage'>,
    id: number,
    payload: IUpdatePagePayload,
    context: IPageAddressContext
): Promise<IUpdatePagePayload> {
    const { pagename, urlPrefix } = payload;

    if (pagename === undefined && urlPrefix === undefined) {
        return payload;
    }

    // Оба поля пришли — сохранённая строка не нужна, и лишнего чтения нет
    if (pagename !== undefined && urlPrefix !== undefined) {
        assertPagePathAllowed(context, urlPrefix, pagename);

        return payload;
    }

    const current = await adapter.getPage(id);

    if (!current) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    }

    // Сравнение именно с undefined: `urlPrefix: null` — это осознанная очистка
    // префикса, и подстановка сохранённого значения на её месте проверяла бы
    // адрес, которого после записи не будет
    assertPagePathAllowed(
        context,
        urlPrefix !== undefined ? urlPrefix : current.urlPrefix,
        pagename !== undefined ? pagename : current.pagename
    );

    return payload.expectedRevision === undefined
        ? { ...payload, expectedRevision: current.revision }
        : payload;
}
