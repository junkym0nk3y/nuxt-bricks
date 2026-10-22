// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

/**
 * Список версий панели деталей: ответ, доехавший после переключения на другую
 * страницу, показывал её версии как версии новой (с ними уходил бы и откат);
 * общий флаг загрузки снимала первая из двух параллельных загрузок; отказ стирал
 * уже показанный список.
 */

// #region Mocks
const { fetchVersionsMock } = vi.hoisted(() => ({ fetchVersionsMock: vi.fn() }));

vi.mock('../../src/runtime/modules/builder/publish/utils/publishApi', () => ({
    fetchPageVersionsRequest: fetchVersionsMock,
}));

vi.mock('../../src/runtime/modules/builder/publish/composables/usePublishPreview', () => ({
    usePublishPreview: () => ({ previewPageVersion: vi.fn() }),
}));
// #endregion

import { usePublishPageVersions } from '../../src/runtime/modules/builder/publish/composables/usePublishPageVersions';

/**
 * Собирает сводку версии.
 *
 * @param id - Идентификатор версии.
 * @returns Сводка для фикстуры.
 */
function buildVersion(id: number) {
    return { id, createdAt: '2026-07-10T10:00:00Z' };
}

describe('usePublishPageVersions.loadVersions: порядок ответов и доставка отказа', () => {
    beforeEach(() => {
        fetchVersionsMock.mockReset();
    });

    it('ответ прежней страницы не приземляется после переключения панели', async () => {
        const flow = usePublishPageVersions();

        let resolveStale: ((versions: unknown) => void) | undefined;
        fetchVersionsMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );

        const stale = flow.loadVersions(1);

        // Пользователь выбрал в списке другую страницу
        flow.resetVersions();

        resolveStale?.([buildVersion(11)]);
        await stale;

        expect(flow.versions.value).toEqual([]);
    });

    it('ответ более раннего запроса не заменяет более свежий список', async () => {
        const flow = usePublishPageVersions();

        let resolveStale: ((versions: unknown) => void) | undefined;
        fetchVersionsMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveStale = resolve;
                })
        );
        fetchVersionsMock.mockResolvedValueOnce([buildVersion(22)]);

        const stale = flow.loadVersions(1);
        await flow.loadVersions(1);

        resolveStale?.([buildVersion(11)]);
        await stale;

        expect(flow.versions.value.map((version) => version.id)).toEqual([22]);
    });

    it('индикатор снимается только после последней из параллельных загрузок', async () => {
        const flow = usePublishPageVersions();

        let resolveFirst: ((versions: unknown) => void) | undefined;
        let resolveSecond: ((versions: unknown) => void) | undefined;
        fetchVersionsMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                })
        );
        fetchVersionsMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveSecond = resolve;
                })
        );

        const first = flow.loadVersions(1);
        const second = flow.loadVersions(1);

        expect(flow.isLoading.value).toBe(true);

        resolveFirst?.([buildVersion(11)]);
        await first;

        expect(flow.isLoading.value).toBe(true);

        resolveSecond?.([buildVersion(22)]);
        await second;

        expect(flow.isLoading.value).toBe(false);
    });

    it('отказ загрузки не стирает уже показанный список', async () => {
        const flow = usePublishPageVersions();

        fetchVersionsMock.mockResolvedValueOnce([buildVersion(33)]);
        await flow.loadVersions(1);

        fetchVersionsMock.mockRejectedValueOnce(new Error('GET /api/bricks/1/versions/: 503'));
        await expect(flow.loadVersions(1)).rejects.toThrow();

        expect(flow.versions.value.map((version) => version.id)).toEqual([33]);
    });

    it('отказ вытесненного запроса не доходит до вызывающего', async () => {
        const flow = usePublishPageVersions();

        let rejectStale: ((error: unknown) => void) | undefined;
        fetchVersionsMock.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    rejectStale = reject;
                })
        );
        fetchVersionsMock.mockResolvedValueOnce([buildVersion(44)]);

        const stale = flow.loadVersions(1);
        await flow.loadVersions(1);

        rejectStale?.(new Error('503'));

        // Уведомление об устаревшей попытке накрыло бы результат более свежей
        await expect(stale).resolves.toBeUndefined();
        expect(flow.versions.value.map((version) => version.id)).toEqual([44]);
    });
});
