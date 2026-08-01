/**
 * Запись страниц вне сессии редактора: создание черновика из модалки дашборда
 * (пустым холстом или сразу из JSON-файла) и дублирование произвольной
 * страницы. Общая черта — `currentFormState` не
 * трогается: форма принадлежит открытой в редакторе странице, а эти операции
 * работают со списком.
 *
 * Зависимость стора передаётся узким контрактом — логика тестируется юнитом без
 * Pinia (паттерн `currentPageWrite.ts`).
 */
import type { IBricksSchema } from '../../../common/types/brick';
import type { TPublishFormState } from '../../../common/types/bricks-api';
import type { IPageLibraryWriteStoreDeps } from '../types/publishStore';
import { buildCopyFormState } from './formState';
import { fetchPageRequest } from './publishApi';
import { generateCopyPagename } from './slugify';

/**
 * Создаёт страницу-черновик с заданной схемой.
 *
 * Схема приходит параметром, а не подставляется пустой здесь: страницу можно
 * создать как чистый холст, так и сразу из JSON-файла, и выбор источника — дело
 * вызывающего. Пустой холст передаёт `{ components: [] }` явно.
 *
 * `published: false` навязывается здесь, а не оставляется на форму: страница без
 * содержимого, опубликованная сразу, немедленно уходит в выдачу пустой.
 *
 * @param store - Узкий контракт стора.
 * @param schema - Схема новой страницы.
 * @param formState - Meta-поля новой страницы.
 * @returns ID созданной страницы.
 */
export async function runCreatePage(
    store: IPageLibraryWriteStoreDeps,
    schema: IBricksSchema,
    formState: TPublishFormState
): Promise<number> {
    return await store.publishPage(schema, { ...formState, published: false });
}

/**
 * Дублирует страницу по идентификатору: клонирует meta и схему, создаёт черновик
 * с уникальным `pagename` (суффикс «-copy»).
 *
 * @param store - Узкий контракт стора.
 * @param id - Идентификатор исходной страницы.
 * @param failedMessage - Сообщение на случай, если страницы нет в списке.
 * @returns ID созданной копии.
 */
export async function runDuplicatePage(
    store: IPageLibraryWriteStoreDeps,
    id: string | number,
    failedMessage: string
): Promise<number> {
    const page = store.getPageById(id);
    if (!page) {
        console.error('[Publish Store] duplicatePage: page not found', id);
        throw new Error(failedMessage);
    }

    const copyPagename = generateCopyPagename(page.pagename, (candidate) =>
        store.isPagenameAvailable(candidate)
    );

    // Сводка списка схему не несёт — исходная схема запрашивается point-lookup'ом
    const fullPage = await fetchPageRequest(page.id);

    return await store.publishPage(fullPage.schema, buildCopyFormState(page, copyPagename));
}
