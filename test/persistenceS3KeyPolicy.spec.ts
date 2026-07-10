// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    extractStorageKey,
    isManagedStorageKey,
} from '../src/runtime/modules/persistence/server/s3/s3KeyPolicy';
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
