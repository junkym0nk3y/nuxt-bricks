// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type {
    IPageVersionSummary,
    TPublishedPageSummary,
} from '../../src/runtime/modules/common/types/bricks-api';

// Utils
import { createPageBuilder } from '../helpers/publishFixtures';
// #endregion

/**
 * Подтверждение операции записи после отказа: определённый отказ оставляет
 * диалог открытым (повтор безопасен и под рукой), а обрыв по потолку ожидания
 * его закрывает — исход неизвестен, и сообщение просит сначала обновить данные,
 * а не повторять.
 */

// #region Mocks
const { restorePageVersionMock } = vi.hoisted(() => ({ restorePageVersionMock: vi.fn() }));

vi.mock('vue-i18n', () => ({
    // Подстановки видны в результате: описание подтверждения проверяется по дате
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}|${Object.values(params).join(',')}` : key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/publish/stores/publish', () => ({
    usePublishStore: () => ({ restorePageVersion: restorePageVersionMock }),
}));
// #endregion

import { usePublishVersionRestore } from '../../src/runtime/modules/builder/publish/composables/usePublishVersionRestore';

const buildPage = createPageBuilder({ id: 9, socialImage: '', revision: 3 });

const VERSION: IPageVersionSummary = {
    id: 5,
    // Даты снапшота разные по смыслу: pageUpdatedAt — когда состояние сохранили,
    // createdAt — когда его вытеснило следующее сохранение. Без зоны: формат
    // дашборда локальный, и с `Z` ожидание зависело бы от TZ машины
    pageUpdatedAt: '2026-07-10T10:00:00',
    createdAt: '2026-07-10T14:35:00',
} as IPageVersionSummary;

/**
 * Заводит confirm-флоу отката и открывает подтверждение для версии страницы.
 *
 * @returns API композабла и собранные уведомления.
 */
function mountRestoreFlow() {
    const notifications: Array<{ message: string; variant: string }> = [];
    const flow = usePublishVersionRestore({
        onNotify: (message, variant) => notifications.push({ message, variant }),
    });

    flow.requestRestoreVersion(buildPage() as TPublishedPageSummary, VERSION);

    return { flow, notifications };
}

describe('usePublishVersionRestore: судьба подтверждения при отказе', () => {
    beforeEach(() => {
        restorePageVersionMock.mockReset();
    });

    it('подтверждение называет состояние датой карточки, а не датой вытеснения', async () => {
        const { flow } = mountRestoreFlow();

        // Дата вытеснения (createdAt) в описании — это чужое время: пользователь
        // выбирает карточку с одной датой, а перед необратимым действием увидел
        // бы другую, отличающуюся на интервал между сохранениями
        expect(flow.restoreConfirmationDescription.value).toContain('10.07.2026 10:00');
        expect(flow.restoreConfirmationDescription.value).not.toContain('14:35');
    });

    it('определённый отказ оставляет подтверждение открытым для повтора', async () => {
        const { flow, notifications } = mountRestoreFlow();

        restorePageVersionMock.mockRejectedValueOnce(new Error('POST /api/bricks/9/: 500'));

        await flow.confirmRestoreVersion();

        expect(notifications[0]?.variant).toBe('error');
        expect(flow.isRestoreConfirmationOpen.value).toBe(true);
        expect(flow.isRestoring.value).toBe(false);
    });

    it('обрыв по потолку ожидания закрывает подтверждение: исход неизвестен', async () => {
        const { flow, notifications } = mountRestoreFlow();

        const timeout = Object.assign(new Error('aborted due to timeout'), {
            name: 'TimeoutError',
        });
        restorePageVersionMock.mockRejectedValueOnce(
            new Error('bricks.common.writeTimeout', { cause: timeout })
        );

        await flow.confirmRestoreVersion();

        expect(notifications[0]?.message).toBe('bricks.common.writeTimeout');
        expect(flow.isRestoreConfirmationOpen.value).toBe(false);
    });

    it('успех закрывает подтверждение и сообщает об откате', async () => {
        const { flow, notifications } = mountRestoreFlow();

        restorePageVersionMock.mockResolvedValueOnce(buildPage({ revision: 4 }));

        await flow.confirmRestoreVersion();

        expect(notifications[0]?.variant).toBe('success');
        expect(flow.isRestoreConfirmationOpen.value).toBe(false);
    });
});
