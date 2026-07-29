// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    extractStorageKey,
    isManagedStorageKey,
    isSafeStorageKey,
} from '../../src/runtime/modules/persistence/server/s3/s3KeyPolicy';
// #endregion

const BASE = { endpoint: 'https://storage.example.com', bucket: 'my-bucket' };
const MANAGED_PREFIXES = ['bricks-media/', 'bricks-thumbnails/'];

describe('extractStorageKey: извлечение ключа из URL бакета', () => {
    it('извлекает ключ из URL собственного бакета', () => {
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/a.webp', BASE)
        ).toBe('bricks-media/a.webp');
    });

    it('отрезает query и fragment (cache-buster превью)', () => {
        expect(
            extractStorageKey(
                'https://storage.example.com/my-bucket/bricks-thumbnails/page-1.webp?v=123',
                BASE
            )
        ).toBe('bricks-thumbnails/page-1.webp');
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/a.svg#icon', BASE)
        ).toBe('bricks-media/a.svg');
    });

    it('возвращает null для чужого origin (anti-SSRF)', () => {
        expect(extractStorageKey('https://169.254.169.254/my-bucket/bricks-media/a', BASE)).toBe(
            null
        );
        expect(extractStorageKey('http://localhost:8080/secret', BASE)).toBe(null);
    });

    it('возвращает null для чужого бакета на том же endpoint', () => {
        expect(
            extractStorageKey('https://storage.example.com/other-bucket/bricks-media/a.webp', BASE)
        ).toBe(null);
    });

    it('возвращает null для пустого ключа (URL бакета без объекта)', () => {
        expect(extractStorageKey('https://storage.example.com/my-bucket/', BASE)).toBe(null);
        expect(extractStorageKey('https://storage.example.com/my-bucket/?list', BASE)).toBe(null);
    });
});

describe('isManagedStorageKey: namespace ключей модуля', () => {
    it('принимает ключи внутри managed-префиксов', () => {
        expect(isManagedStorageKey('bricks-media/a.webp', MANAGED_PREFIXES)).toBe(true);
        expect(isManagedStorageKey('bricks-thumbnails/page-1.webp', MANAGED_PREFIXES)).toBe(true);
    });

    it('отклоняет посторонние ключи shared-бакета', () => {
        expect(isManagedStorageKey('backups/db.dump', MANAGED_PREFIXES)).toBe(false);
        expect(isManagedStorageKey('index.html', MANAGED_PREFIXES)).toBe(false);
    });

    it('отклоняет ключ, равный префиксу (сам префикс — не файл)', () => {
        expect(isManagedStorageKey('bricks-media/', MANAGED_PREFIXES)).toBe(false);
    });

    it('отклоняет похожий, но не вложенный префикс', () => {
        expect(isManagedStorageKey('bricks-media-backup/a.webp', MANAGED_PREFIXES)).toBe(false);
    });
});

/**
 * Композиция extract + managed-проверки — так адаптер строит extractManagedKey
 * (deleteFile/isOwnedUrl/media-proxy).
 */
function extractManagedKey(url: string): string | null {
    const key = extractStorageKey(url, BASE);
    return key !== null && isManagedStorageKey(key, MANAGED_PREFIXES) ? key : null;
}

describe('extractStorageKey: канонизация URL', () => {
    it('нормализует литеральные dot-сегменты до канонического ключа', () => {
        // WHATWG-парсер резолвит ../ ещё до namespace-проверки
        expect(
            extractStorageKey(
                'https://storage.example.com/my-bucket/bricks-media/../private.txt',
                BASE
            )
        ).toBe('private.txt');
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/./a.webp', BASE)
        ).toBe('bricks-media/a.webp');
    });

    it('нормализует одиночный percent-encoded dot-сегмент так же, как литеральный', () => {
        // WHATWG-парсер трактует одиночный `%2e`-сегмент как `.` и резолвит его
        // ещё до decodeURIComponent — итоговый ключ идентичен литеральному './'
        // случаю выше и остаётся внутри managed-префикса (не traversal).
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/%2e/a.webp', BASE)
        ).toBe('bricks-media/a.webp');
    });

    it('декодирует ключ ровно один раз (percent-encoded slash)', () => {
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media%2Fa.webp', BASE)
        ).toBe('bricks-media/a.webp');
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/a%20b.webp', BASE)
        ).toBe('bricks-media/a b.webp');
    });

    it('принимает endpoint с завершающим слэшем в конфиге', () => {
        expect(
            extractStorageKey('https://storage.example.com/my-bucket/bricks-media/a.webp', {
                endpoint: 'https://storage.example.com/',
                bucket: 'my-bucket',
            })
        ).toBe('bricks-media/a.webp');
    });

    it.each([
        ['userinfo в URL', 'https://admin@storage.example.com/my-bucket/bricks-media/a.webp'],
        ['нестандартный порт', 'https://storage.example.com:8443/my-bucket/bricks-media/a.webp'],
        ['downgrade протокола', 'http://storage.example.com/my-bucket/bricks-media/a.webp'],
        ['похожий origin', 'https://storage.example.com.evil.io/my-bucket/bricks-media/a.webp'],
        ['не-URL', 'not-a-url'],
    ])('возвращает null: %s', (_label, url) => {
        expect(extractStorageKey(url, BASE)).toBe(null);
    });
});

describe('managed-композиция: adversarial URL не выходит из namespace', () => {
    it.each([
        [
            'литеральный ../ (нормализуется в объект вне префикса)',
            'https://storage.example.com/my-bucket/bricks-media/../private.txt',
        ],
        [
            'percent-encoded %2e%2e',
            'https://storage.example.com/my-bucket/bricks-media/%2e%2e/private.txt',
        ],
        [
            'двойное кодирование %252e%252e',
            'https://storage.example.com/my-bucket/bricks-media/%252e%252e/private.txt',
        ],
        [
            'literal backslash (парсер трактует как /)',
            'https://storage.example.com/my-bucket/bricks-media\\..\\private.txt',
        ],
        [
            'percent-encoded backslash',
            'https://storage.example.com/my-bucket/bricks-media/%5C..%5Cprivate.txt',
        ],
        [
            'управляющий символ в ключе',
            'https://storage.example.com/my-bucket/bricks-media/%00a.webp',
        ],
        ['пустой сегмент //', 'https://storage.example.com/my-bucket/bricks-media//a.webp'],
        ['похожий бакет', 'https://storage.example.com/my-bucket-backup/bricks-media/a.webp'],
        ['похожий префикс ключа', 'https://storage.example.com/my-bucket/bricks-media-x/a.webp'],
    ])('отклоняет: %s', (_label, url) => {
        expect(extractManagedKey(url)).toBe(null);
    });

    it('принимает канонический URL с query/fragment', () => {
        expect(
            extractManagedKey('https://storage.example.com/my-bucket/bricks-media/a.webp?v=1#x')
        ).toBe('bricks-media/a.webp');
    });

    it('принимает одиночный percent-encoded dot-сегмент (нормализуется, остаётся в namespace)', () => {
        // Аналог '%2e/'-теста выше на уровне композиции extract+managed: WHATWG
        // нормализует его как './' до decodeURIComponent, итог — валидный ключ.
        expect(
            extractManagedKey('https://storage.example.com/my-bucket/bricks-media/%2e/a.webp')
        ).toBe('bricks-media/a.webp');
    });
});

describe('isSafeStorageKey / isManagedStorageKey: segment safety', () => {
    it.each([
        ['dot-сегмент ..', 'bricks-media/../a.webp'],
        ['dot-сегмент .', 'bricks-media/./a.webp'],
        ['пустой сегмент', 'bricks-media//a.webp'],
        ['остаточный %', 'bricks-media/a%2e.webp'],
        ['backslash', 'bricks-media/a\\b.webp'],
        ['управляющий символ', 'bricks-media/a\u0000.webp'],
        ['пустой ключ', ''],
    ])('отклоняет ключ: %s', (_label, key) => {
        expect(isSafeStorageKey(key)).toBe(false);
        expect(isManagedStorageKey(key, MANAGED_PREFIXES)).toBe(false);
    });

    it('принимает обычный managed-ключ', () => {
        expect(isSafeStorageKey('bricks-media/a.webp')).toBe(true);
        expect(isManagedStorageKey('bricks-media/a.webp', MANAGED_PREFIXES)).toBe(true);
    });
});
