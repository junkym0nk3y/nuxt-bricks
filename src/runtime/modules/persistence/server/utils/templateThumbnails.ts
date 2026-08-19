/**
 * Жизненный цикл файлов превью шаблона в хранилище публикации.
 *
 * У шаблона СВОЙ файл, скопированный из кадра страницы, а не ссылка на этот
 * кадр. Причина не в аккуратности: кадры страницы живут по её keep-list'у
 * (страница + её версии, см. `pageThumbnails.ts`), и ссылка из шаблона той
 * уборке невидима — первое же сохранение страницы, вытеснившее кадр из истории,
 * оставило бы карточку шаблона с битой картинкой.
 *
 * Ключ шаблона (`template-<uuid>.webp`) лежит в том же thumbnail-namespace, но
 * под другим именем: уборка страницы перечисляет только префиксы
 * `page-<id>-`/`page-<id>.`, поэтому файлы шаблонов ей не видны вовсе.
 *
 * Зависимости передаются параметром (узкие Pick-контракты) — логика тестируется
 * юнитами без реального S3 (паттерн `avatarFiles.ts`).
 */
import { randomUUID } from 'node:crypto';
import type { IPublishAdapter } from '../../types/adapters';
import { sniffImageFormat, type TSniffedImageFormat } from './fileSignatures';
import { collectWebStreamWithLimit } from './requestBodyLimits';

/** Потолок размера копируемого кадра (МБ): превью страницы — webp ≤480px. */
const MAX_THUMBNAIL_COPY_MB = 10;
const MAX_THUMBNAIL_COPY_BYTES = MAX_THUMBNAIL_COPY_MB * 1024 * 1024;

/** Потолок ожидания хранилища при копировании кадра (мс). */
const THUMBNAIL_COPY_TIMEOUT_MS = 10_000;

/** MIME по распознанному формату растра: content-type хранилища не авторитет. */
const THUMBNAIL_MIME_TYPES: Partial<Record<TSniffedImageFormat, string>> = {
    webp: 'image/webp',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    avif: 'image/avif',
};

/**
 * Строит object key для нового файла превью шаблона.
 *
 * Имя не содержит id шаблона: файл копируется ДО вставки строки (id ещё нет), а
 * uuid делает ключ уникальным сам по себе. Связь «файл → шаблон» держит колонка
 * `thumbnail_url`, и она же единственный источник для уборки.
 *
 * @param publish - Publish-адаптер (источник namespace-префикса).
 * @returns Полный object key.
 */
export function buildTemplateThumbnailKey(publish: Pick<IPublishAdapter, 'buildFileKey'>): string {
    return publish.buildFileKey('thumbnail', `template-${randomUUID()}.webp`);
}

/**
 * Копирует кадр страницы в собственный файл шаблона.
 *
 * Best-effort: превью — вторичный артефакт, и отказ копирования обязан оставить
 * шаблон без картинки, а не отменить его сохранение (карточка нарисует
 * плейсхолдер — состояние предусмотренное). Поэтому исход — `string | null`, а
 * не исключение.
 *
 * Проверок две, и обе обязательны. `isOwnedUrl` — anti-SSRF: URL приходит из
 * тела запроса, и без него ручка тянула бы произвольный хост (localhost,
 * cloud metadata) серверным fetch'ем. Магические байты — потому что источник
 * может отдать что угодно под любым content-type, а в бакет уйдёт файл, который
 * потом покажется в интерфейсе.
 *
 * @param publish - Publish-адаптер хранилища.
 * @param sourceUrl - URL кадра страницы; null/пустой — копировать нечего.
 * @returns URL собственного файла шаблона либо null.
 */
export async function copyThumbnailForTemplate(
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'uploadFile' | 'isOwnedUrl'>,
    sourceUrl: string | null | undefined
): Promise<string | null> {
    if (!sourceUrl) {
        return null;
    }

    try {
        if (!publish.isOwnedUrl(sourceUrl)) {
            console.warn('[Template Thumbnails] Refused to copy a foreign thumbnail:', sourceUrl);
            return null;
        }

        const response = await fetch(sourceUrl, {
            redirect: 'error',
            signal: AbortSignal.timeout(THUMBNAIL_COPY_TIMEOUT_MS),
        });

        if (!response.ok || !response.body) {
            console.warn(
                '[Template Thumbnails] Source thumbnail is not readable:',
                sourceUrl,
                response.status
            );
            return null;
        }

        const buffer = await collectWebStreamWithLimit(
            response.body,
            MAX_THUMBNAIL_COPY_BYTES,
            () => new Error(`Thumbnail exceeds ${MAX_THUMBNAIL_COPY_MB}MB limit`)
        );
        const format = sniffImageFormat(buffer);
        const mimeType = format ? THUMBNAIL_MIME_TYPES[format] : undefined;

        if (!mimeType) {
            console.warn(
                '[Template Thumbnails] Source thumbnail is not a supported raster image:',
                sourceUrl
            );
            return null;
        }

        const uploaded = await publish.uploadFile({
            buffer,
            mimeType,
            key: buildTemplateThumbnailKey(publish),
        });

        return uploaded.url;
    } catch (error: unknown) {
        console.warn('[Template Thumbnails] Failed to copy the page thumbnail:', sourceUrl, error);
        return null;
    }
}

/**
 * Убирает файл превью удалённого шаблона.
 *
 * Best-effort и после удаления строки — по той же причине, что у фото профиля:
 * ссылки на файл больше нет, состояние, которое видит пользователь, верно, и
 * отказ хранилища не должен превращать успешное удаление в ошибку, повторить
 * которую уже нечем.
 *
 * Проверка принадлежности идёт ВНУТРИ `try`: `isOwnedUrl` дефолтного адаптера
 * резолвит конфигурацию и бросает на несконфигурированном бакете — снаружи это
 * дало бы клиенту 500 на успешно удалённом шаблоне.
 *
 * @param publish - Publish-адаптер хранилища.
 * @param url - Ссылка на файл; null/пустая — убирать нечего.
 */
export async function discardTemplateThumbnail(
    publish: Pick<IPublishAdapter, 'deleteFile' | 'isOwnedUrl'>,
    url: string | null
): Promise<void> {
    if (!url) {
        return;
    }

    try {
        if (!publish.isOwnedUrl(url)) {
            return;
        }

        await publish.deleteFile(url);
    } catch (error: unknown) {
        console.warn(
            '[Template Thumbnails] Failed to delete an orphaned template thumbnail:',
            url,
            error
        );
    }
}
