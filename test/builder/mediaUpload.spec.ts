// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * Загрузка набора файлов в галерею: отказ по файлу обязан дойти до пользователя,
 * а не остаться в консоли — иначе пропущенный файл выглядит загруженным.
 */

// #region Mocks
const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));

vi.mock('nuxt/app', () => ({
    useAppConfig: () => ({}),
}));

vi.mock('vue-i18n', () => ({
    // Ключ вместе с параметрами: по нему проверяется и повод отказа, и имя файла
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/media/stores/media', () => ({
    useMediaStore: () => ({ uploadFile: uploadFileMock }),
}));
// #endregion

import { useMediaUpload } from '../../src/runtime/modules/builder/media/composables/useMediaUpload';

/**
 * Собирает файл заданного типа и размера.
 *
 * @param name - Имя файла.
 * @param type - MIME-тип.
 * @param sizeMb - Размер в мегабайтах.
 * @returns Файл для загрузки.
 */
function buildFile(name: string, type: string, sizeMb = 1): File {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: sizeMb * 1024 * 1024 });

    return file;
}

describe('useMediaUpload: доставка отказа по каждому файлу', () => {
    beforeEach(() => {
        uploadFileMock.mockReset();
    });

    it('отказ загрузки файла доходит до пользователя и не останавливает набор', async () => {
        const errors: string[] = [];
        const { uploadFiles } = useMediaUpload({
            resolveCategory: () => 'photos',
            resolveOptimization: () => ({ format: 'webp', quality: 70, maxWidth: 1920 }),
            onError: (message) => errors.push(message),
        });

        uploadFileMock.mockRejectedValueOnce(new Error('database is unavailable'));
        uploadFileMock.mockResolvedValueOnce({ id: 2 });

        await uploadFiles([
            buildFile('broken.webp', 'image/webp'),
            buildFile('fine.webp', 'image/webp'),
        ]);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('uploadFailedForFile');
        expect(errors[0]).toContain('broken.webp');
        expect(errors[0]).toContain('database is unavailable');

        // Один упавший файл не отменяет остальные
        expect(uploadFileMock).toHaveBeenCalledTimes(2);
    });

    it('неподдерживаемый тип файла сообщается, а не остаётся в консоли', async () => {
        const errors: string[] = [];
        const { uploadFiles } = useMediaUpload({
            resolveCategory: () => 'photos',
            resolveOptimization: () => ({ format: 'webp', quality: 70, maxWidth: 1920 }),
            onError: (message) => errors.push(message),
        });

        await uploadFiles([buildFile('notes.pdf', 'application/pdf')]);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('fileTypeUnsupported');
        expect(errors[0]).toContain('notes.pdf');
        expect(uploadFileMock).not.toHaveBeenCalled();
    });

    it('превышение лимита размера сообщается без обращения к серверу', async () => {
        const errors: string[] = [];
        const { uploadFiles } = useMediaUpload({
            resolveCategory: () => 'photos',
            resolveOptimization: () => ({ format: 'webp', quality: 70, maxWidth: 1920 }),
            onError: (message) => errors.push(message),
        });

        await uploadFiles([buildFile('huge.webp', 'image/webp', 11)]);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('fileTooLarge');
        expect(uploadFileMock).not.toHaveBeenCalled();
    });
});
