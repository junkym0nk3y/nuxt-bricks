/**
 * Жизненный цикл файлов превью страницы в хранилище публикации.
 *
 * Ключ уникален на каждую загрузку (`page-<id>-<uuid>.webp`), а не постоянен на
 * страницу: галерея версий показывает превью каждого сохранённого состояния, и
 * при одном перезаписываемом ключе все версии показывали бы последний кадр.
 * Плата за уникальность — сироты: файл перестаёт быть нужным, когда версию,
 * которая на него ссылалась, вытеснил prune истории. Поэтому уборка идёт по
 * префиксу страницы с явным списком ещё нужных URL, а не по одному ключу.
 *
 * Зависимости передаются параметром (узкие Pick-контракты) — логика
 * тестируется юнитами без реального S3 (паттерн mediaOrchestration.ts).
 */
import { randomUUID } from 'node:crypto';
import type {
    IPageThumbnailPruneDeps,
    IPrunePageThumbnailsOptions,
    IPublishAdapter,
} from '../../types/adapters';

/**
 * Префиксы имён файлов превью одной страницы внутри thumbnail-namespace.
 *
 * Их два: `page-<id>-` — нынешний формат с uuid, `page-<id>.` — прежний
 * единственный файл страницы. Второй нужен, чтобы прежний кадр не остался
 * сиротой навсегда: после первого сохранения он перестаёт быть превью страницы
 * и уходит в версию, а из версии — в никуда, когда её вытеснит prune истории.
 *
 * Разделитель на конце обязателен у обоих: без него префикс страницы 1 накрыл
 * бы файлы страницы 12.
 *
 * @param pageId - Идентификатор страницы.
 * @returns Имена-префиксы для buildFileKey.
 */
function buildThumbnailFilenamePrefixes(pageId: number): string[] {
    return [`page-${pageId}-`, `page-${pageId}.`];
}

/**
 * Строит object key для нового файла превью страницы.
 *
 * @param publish - Publish-адаптер (источник namespace-префикса).
 * @param pageId - Идентификатор страницы.
 * @returns Полный object key.
 */
export function buildPageThumbnailKey(
    publish: Pick<IPublishAdapter, 'buildFileKey'>,
    pageId: number
): string {
    return publish.buildFileKey('thumbnail', `page-${pageId}-${randomUUID()}.webp`);
}

/**
 * Отрезает query от URL файла: у превью, сохранённых прежней схемой,
 * в URL есть cache-buster `?v=<ts>`, и без нормализации такой URL не совпал бы
 * с URL того же объекта из листинга хранилища.
 *
 * @param url - URL файла.
 * @returns URL без query и fragment.
 */
function stripUrlQuery(url: string): string {
    return url.split('#')[0].split('?')[0];
}

/**
 * Возраст, младше которого файл не удаляется как сирота (мс).
 *
 * Ссылка на свежезагруженный кадр появляется в БД не в момент загрузки: ручка
 * отдаёт URL, а записывает его отдельным PATCH'ем клиент. Пока PATCH в пути,
 * файл не значится нигде — и параллельная уборка соседнего сохранения приняла
 * бы его за сироту. Два сохранения подряд такие POST'ы реально порождают:
 * съёмка превью запускается fire-and-forget и не держит `isSubmitting`.
 * Отложенная на окно уборка сироту не теряет — её заберёт следующий проход.
 */
const RECENT_UPLOAD_GRACE_MS = 10 * 60 * 1000;

/**
 * Проверяет, что файл загружен слишком недавно, чтобы считать его сиротой.
 *
 * @param lastModified - ISO-дата последней записи объекта.
 * @param graceMs - Ширина защитного окна.
 * @returns true, если файл моложе окна.
 */
function isRecentUpload(lastModified: string, graceMs: number): boolean {
    const modifiedAt = new Date(lastModified).getTime();

    if (Number.isNaN(modifiedAt)) {
        // Хранилище не отдало внятную дату — считаем файл свежим и не трогаем:
        // ошибочное удаление живого кадра дороже пережившей проход сироты
        return true;
    }

    return Date.now() - modifiedAt < graceMs;
}

/**
 * Best-effort удаление файлов превью страницы, на которые больше никто не
 * ссылается: всё под префиксами страницы, кроме перечисленных в `keepUrls` и
 * кроме слишком свежих (см. `RECENT_UPLOAD_GRACE_MS`).
 *
 * Список нужных URL передаётся снаружи целиком (страница + все её версии +
 * только что загруженный кадр) — сравнение точное, без эвристик «оставить N
 * свежих».
 *
 * Превью — вторичный артефакт: любая ошибка гасится предупреждением и не роняет
 * вызывающую операцию (загрузку снимка, удаление страницы).
 *
 * @param publish - Publish-адаптер.
 * @param pageId - Идентификатор страницы.
 * @param keepUrls - URL, которые удалять нельзя (null/undefined игнорируются).
 * @param options - `includeRecentUploads` снимает защиту свежих файлов; ставится
 * при удалении страницы, где следующего прохода уже не будет и отложенный
 * файл остался бы в хранилище навсегда.
 */
export async function prunePageThumbnails(
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'listFiles' | 'deleteFile'>,
    pageId: number,
    keepUrls: readonly (string | null | undefined)[],
    options: IPrunePageThumbnailsOptions = {}
): Promise<void> {
    const keep = new Set(
        keepUrls.filter((url): url is string => Boolean(url)).map((url) => stripUrlQuery(url))
    );
    const graceMs = options.includeRecentUploads ? 0 : RECENT_UPLOAD_GRACE_MS;

    for (const filenamePrefix of buildThumbnailFilenamePrefixes(pageId)) {
        let prefixKey: string;

        try {
            prefixKey = publish.buildFileKey('thumbnail', filenamePrefix);
        } catch {
            // Отказ на построении ключа означает несконфигурированное хранилище
            // публикации: файлов превью в такой установке нет вовсе, и убирать
            // нечего. Молча — иначе обычное удаление страницы печатало бы
            // стектрейс на каждой инсталляции без S3
            return;
        }

        try {
            const files = await publish.listFiles(prefixKey);

            for (const file of files) {
                if (keep.has(stripUrlQuery(file.url))) {
                    continue;
                }

                if (graceMs > 0 && isRecentUpload(file.lastModified, graceMs)) {
                    continue;
                }

                try {
                    await publish.deleteFile(file.url);
                } catch (error: unknown) {
                    console.warn('[Page Thumbnails] Failed to delete orphaned thumbnail:', error);
                }
            }
        } catch (error: unknown) {
            console.warn('[Page Thumbnails] Failed to list page thumbnails:', error);
        }
    }
}

/**
 * Убирает сирот после загрузки нового кадра страницы: собирает keep-list из
 * живых источников и отдаёт его `prunePageThumbnails`.
 *
 * Источников три — сама страница, все её версии и только что загруженный кадр
 * (в БД его ещё нет: URL записывает отдельным PATCH клиент). Собрать их одним
 * чтением нельзя, а между чтениями может лечь commit отката: одной транзакцией
 * он уносит кадр страницы в новую версию, ставит странице кадр выбранной версии
 * и обрезает историю лимитом — на заполненной истории откат к самой старой
 * версии удаляет её же строку.
 *
 * Отсюда порядок «страница → версии → страница»: страница читается дважды, и
 * любой интерливинг оставляет оба спорных кадра в списке. Кадр, который откат
 * вытеснил, — либо ещё на странице (чтение до отката), либо уже в версии
 * (список после). Кадр восстановленной версии — либо ещё в списке версий
 * (чтение до отката), либо уже на странице (второе чтение после). Первое
 * чтение приходит параметром: его делает вызывающий, которому страница нужна и
 * для проверки существования.
 *
 * Best-effort целиком: превью — вторичный артефакт, и отказ чтения БД не должен
 * превращать успешную загрузку снимка в ошибку.
 *
 * @param deps - Storage- и publish-адаптеры (узкие контракты).
 * @param pageId - Идентификатор страницы.
 * @param uploadedUrl - URL только что загруженного кадра.
 * @param pageThumbnailUrl - Кадр страницы на момент чтения перед этим вызовом.
 */
export async function prunePageThumbnailsAfterUpload(
    deps: IPageThumbnailPruneDeps,
    pageId: number,
    uploadedUrl: string,
    pageThumbnailUrl: string | null
): Promise<void> {
    try {
        const versions = await deps.storage.listPageVersions(pageId);
        const pageAfterVersions = await deps.storage.getPage(pageId);

        await prunePageThumbnails(deps.publish, pageId, [
            uploadedUrl,
            pageThumbnailUrl,
            pageAfterVersions?.thumbnailUrl,
            ...versions.map((version) => version.thumbnailUrl),
        ]);
    } catch (error: unknown) {
        console.warn('[Page Thumbnails] Failed to prune orphaned thumbnails:', error);
    }
}
