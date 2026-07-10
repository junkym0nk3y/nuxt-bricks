/**
 * Политика object key S3-хранилища: извлечение ключа из публичного URL и
 * проверка принадлежности managed-namespace'у (префиксы модуля в бакете).
 *
 * Чистые функции без runtimeConfig — используются s3PublishAdapter и юнит-тестами.
 * Managed-namespace ограничивает операции адаптера (delete/proxy/регистрация)
 * собственными префиксами: в shared-бакете модуль не может затронуть
 * посторонние объекты даже по валидному URL бакета.
 */

/**
 * Базовый адрес бакета для извлечения ключа.
 */
export interface IStorageUrlBase {
    endpoint: string;
    bucket: string;
}

/**
 * Извлекает S3 object key из публичного URL файла.
 * Query/fragment отрезаются: URL медиа может содержать cache-buster (`?v=`),
 * который не является частью ключа.
 *
 * @param url - Полный URL файла.
 * @param base - Endpoint и bucket хранилища.
 * @returns Key или null, если URL не принадлежит бакету или ключ пуст.
 */
export function extractStorageKey(url: string, base: IStorageUrlBase): string | null {
    const prefix = `${base.endpoint}/${base.bucket}/`;

    if (!url.startsWith(prefix)) {
        return null;
    }

    const key = url.slice(prefix.length).split(/[?#]/)[0];

    return key ? key : null;
}

/**
 * Проверяет, что ключ лежит внутри одного из managed-префиксов модуля
 * и содержит непустое имя после префикса (сам префикс — не файл).
 *
 * @param key - S3 object key.
 * @param managedPrefixes - Префиксы, которыми владеет модуль (с завершающим `/`).
 * @returns true, если ключ принадлежит managed-namespace.
 */
export function isManagedStorageKey(key: string, managedPrefixes: readonly string[]): boolean {
    return managedPrefixes.some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
}
