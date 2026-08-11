/**
 * Нормализация медиа-элемента из ответа API.
 *
 * Отдельно от стора: это чистое приведение данных, у которого свои правила по
 * каждому полю, и держать их среди действий стора значило бы прятать контракт
 * ответа внутри работы с сетью.
 */

// Types
import type { IMediaItem } from '../../../common/types/media';

// Utils
import { toCamelCase } from '../../../common/utils/case-transform';

const DEFAULT_MEDIA_MIME_TYPE = 'image/png';

/**
 * Нормализует медиа-элемент из ответа API.
 * Конвертирует snake_case ключи из Django backend в camelCase.
 *
 * @param rawItem - Данные медиа из API (может быть в snake_case).
 * @returns Нормализованный медиа-элемент в camelCase.
 */
export function normalizeMediaItem(rawItem: IMediaItem): IMediaItem {
    // Конвертируем snake_case → camelCase
    const item = toCamelCase<IMediaItem>(rawItem);

    return {
        ...item,
        alt: item.alt ?? '',
        // Пустая строка от внешнего backend'а — то же самое, что «без категории»
        category: item.category || null,
        mimeType: item.mimeType || DEFAULT_MEDIA_MIME_TYPE,
        // Внешний backend вправе не отдавать эти поля вовсе; `undefined` в них
        // сломал бы проверки «вариант есть?» — потребитель ждёт строку или null.
        // Размеры остаются на `??`: ноль здесь — полученное значение, а не
        // «неизвестно», и пригодность его проверяет потребитель
        width: item.width ?? null,
        height: item.height ?? null,
        // А у вариантов пустая строка равнозначна их отсутствию: потребитель
        // берёт `previewUrl ?? url`, и `''` дошло бы до `<img src="">` —
        // это запрос на саму страницу вместо картинки и битая плитка
        previewUrl: item.previewUrl || null,
        mockUrl: item.mockUrl || null,
    };
}
