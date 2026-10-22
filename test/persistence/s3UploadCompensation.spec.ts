/**
 * Судьба объекта, чья запись в хранилище завершилась неизвестно чем.
 *
 * Отказ PUT не доказывает, что объекта в бакете нет: ответ мог потеряться или
 * упереться в таймаут уже после записи. Вызывающий при этом URL не получил, то
 * есть ссылки на объект не появится никогда и удалить его может только сам
 * адаптер — иначе каждая такая ошибка оставляла бы невидимый мусор.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { sendMock, runtimeConfigMock } = vi.hoisted(() => ({
    sendMock: vi.fn(),
    runtimeConfigMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: class {
        send = sendMock;
    },
    PutObjectCommand: class {
        kind = 'put';

        constructor(public input: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class {
        kind = 'delete';

        constructor(public input: Record<string, unknown>) {}
    },
    ListObjectsV2Command: class {
        constructor(public input: Record<string, unknown>) {}
    },
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: runtimeConfigMock,
}));

import { createS3PublishAdapter } from '../../src/runtime/modules/persistence/server/s3/s3PublishAdapter';
// #endregion

/** Команды, отданные клиенту за прогон, в виде `<вид>:<ключ>`. */
function sentCommands(): string[] {
    return sendMock.mock.calls.map((call) => {
        const command = call[0] as { kind?: string; input: { Key?: string } };

        return `${command.kind ?? 'unknown'}:${command.input.Key ?? ''}`;
    });
}

describe('s3PublishAdapter.uploadFile: неподтверждённая запись убирается', () => {
    beforeEach(() => {
        sendMock.mockReset();
        runtimeConfigMock.mockReset();
        runtimeConfigMock.mockReturnValue({
            bricksS3: {
                endpoint: 'https://storage.example.com',
                bucket: 'bucket',
                accessKeyId: 'key',
                secretAccessKey: 'secret',
                prefix: 'bricks-media/',
                thumbnailsPrefix: 'bricks-thumbnails/',
            },
        });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('успешная запись ничего не удаляет', async () => {
        sendMock.mockResolvedValueOnce({});

        const adapter = createS3PublishAdapter();
        const uploaded = await adapter.uploadFile({
            buffer: Buffer.from('binary'),
            mimeType: 'image/webp',
            key: 'bricks-media/uuid.webp',
        });

        expect(uploaded.url).toBe('https://storage.example.com/bucket/bricks-media/uuid.webp');
        expect(sentCommands()).toEqual(['put:bricks-media/uuid.webp']);
    });

    it('отказ записи убирает объект по тому же ключу и пробрасывает исходную ошибку', async () => {
        const putError = Object.assign(new Error('socket timed out'), { name: 'TimeoutError' });
        sendMock.mockRejectedValueOnce(putError).mockResolvedValueOnce({});

        const adapter = createS3PublishAdapter();

        await expect(
            adapter.uploadFile({
                buffer: Buffer.from('binary'),
                mimeType: 'image/webp',
                key: 'bricks-media/uuid.webp',
            })
        ).rejects.toBe(putError);

        expect(sentCommands()).toEqual([
            'put:bricks-media/uuid.webp',
            'delete:bricks-media/uuid.webp',
        ]);
    });

    it('отказ уборки не подменяет ошибку загрузки', async () => {
        const putError = new Error('socket timed out');
        sendMock.mockRejectedValueOnce(putError).mockRejectedValueOnce(new Error('bucket is gone'));

        const adapter = createS3PublishAdapter();

        // Пользователю нужна причина, по которой не сохранился его файл, а не
        // причина, по которой не удалось убрать за собой
        await expect(
            adapter.uploadFile({
                buffer: Buffer.from('binary'),
                mimeType: 'image/webp',
                key: 'bricks-media/uuid.webp',
            })
        ).rejects.toBe(putError);
    });

    it('ключ вне managed-префиксов отклоняется до всякого запроса', async () => {
        const adapter = createS3PublishAdapter();

        await expect(
            adapter.uploadFile({
                buffer: Buffer.from('binary'),
                mimeType: 'image/webp',
                key: 'someone-else/uuid.webp',
            })
        ).rejects.toThrow('outside of the managed prefixes');

        // Ни PUT, ни компенсирующего DELETE: чужой префикс адаптер не трогает
        expect(sendMock).not.toHaveBeenCalled();
    });
});
