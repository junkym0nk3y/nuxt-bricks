/**
 * Политика object key S3-хранилища: извлечение ключа из публичного URL и
 * проверка принадлежности managed-namespace'у (префиксы модуля в бакете).
 *
 * Чистые функции без runtimeConfig — используются s3PublishAdapter и юнит-тестами.
 * Managed-namespace ограничивает операции адаптера (delete/proxy/регистрация)
 * собственными префиксами: в shared-бакете модуль не может затронуть
 * посторонние объекты даже по валидному URL бакета.
 *
 * Канонизация (аудит A-01): прежняя проверка была строковым `startsWith` по
 * сырому URL и пропускала `bricks-media/../x` — HTTP-клиент нормализовал такой
 * адрес в объект ВНЕ managed namespace (воспроизведено через media-proxy).
 * Теперь URL разбирается WHATWG-парсером (protocol/host/userinfo сверяются с
 * базой явно; литеральные `.`/`..`/backslash парсер нормализует сам), ключ
 * декодируется ровно один раз, после чего отклоняются dot-сегменты, пустые
 * сегменты, управляющие символы, backslash и остаточный `%` (неоднозначное
 * двойное кодирование). Ключи модуля генерируются сервером (randomUUID,
 * `page-<pagename>.webp`) и этим ограничениям всегда удовлетворяют.
 */

/**
 * Базовый адрес бакета для извлечения ключа.
 */
export interface IStorageUrlBase {
    endpoint: string;
    bucket: string;
}

/** Управляющие символы (C0 + DEL) и backslash — запрещены в object key. */
// oxlint-disable-next-line no-control-regex
const UNSAFE_KEY_CHARS_PATTERN = /[\\\u0000-\u001F\u007F]/;

/**
 * Проверяет, что декодированный object key не содержит traversal/injection-
 * примитивов: dot-сегментов (`.`, `..`), пустых сегментов, управляющих
 * символов, backslash и `%` (после однократного декодирования остаточный `%`
 * означает неоднозначное повторное кодирование).
 *
 * @param key - Декодированный S3 object key.
 * @returns true, если ключ безопасен.
 */
export function isSafeStorageKey(key: string): boolean {
    if (!key || key.includes('%') || UNSAFE_KEY_CHARS_PATTERN.test(key)) {
        return false;
    }

    return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * Извлекает канонический S3 object key из публичного URL файла.
 * URL разбирается парсером: протокол/host/userinfo сверяются с базой,
 * query/fragment отбрасываются (cache-buster `?v=` не является частью ключа),
 * ключ декодируется один раз и проходит `isSafeStorageKey`.
 *
 * @param url - Полный URL файла.
 * @param base - Endpoint и bucket хранилища.
 * @returns Канонический key или null (чужой origin/бакет, небезопасный ключ).
 */
export function extractStorageKey(url: string, base: IStorageUrlBase): string | null {
    let parsed: URL;
    let baseUrl: URL;

    try {
        parsed = new URL(url);
        baseUrl = new URL(`${base.endpoint.replace(/\/+$/, '')}/${base.bucket}/`);
    } catch {
        return null;
    }

    const sameOrigin =
        parsed.protocol === baseUrl.protocol &&
        parsed.host === baseUrl.host &&
        parsed.username === '' &&
        parsed.password === '';

    if (!sameOrigin || !parsed.pathname.startsWith(baseUrl.pathname)) {
        return null;
    }

    let key: string;

    try {
        key = decodeURIComponent(parsed.pathname.slice(baseUrl.pathname.length));
    } catch {
        return null;
    }

    return isSafeStorageKey(key) ? key : null;
}

/**
 * Проверяет, что ключ безопасен и лежит внутри одного из managed-префиксов
 * модуля с непустым именем после префикса (сам префикс — не файл).
 *
 * @param key - S3 object key (декодированный).
 * @param managedPrefixes - Префиксы, которыми владеет модуль (с завершающим `/`).
 * @returns true, если ключ принадлежит managed-namespace.
 */
export function isManagedStorageKey(key: string, managedPrefixes: readonly string[]): boolean {
    if (!isSafeStorageKey(key)) {
        return false;
    }

    return managedPrefixes.some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
}
