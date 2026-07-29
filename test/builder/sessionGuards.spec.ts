// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Utils
import {
    runSaveWhenSessionReady,
    withSessionReadyGuard,
} from '../../src/runtime/modules/builder/app/utils/sessionGuards';
// #endregion

describe('несогласованная сессия: правило сохранения', () => {
    it('guard не пускает сохранение, пока сессия не готова', async () => {
        const save = vi.fn(() => Promise.resolve());
        const onBlocked = vi.fn();

        const isSaved = await runSaveWhenSessionReady({
            isSessionReady: () => false,
            save,
            onBlocked,
        });

        expect(isSaved).toBe(false);
        expect(save).not.toHaveBeenCalled();
        expect(onBlocked).toHaveBeenCalledTimes(1);
    });

    it('guard клавиатуры читает готовность на каждом событии, а не при создании', () => {
        const handler = vi.fn();
        let isReady = false;

        // Обёртка одна: в проде она создаётся до загрузки страницы, поэтому
        // реализация, захватившая готовность при создании, осталась бы выключенной
        // навсегда — и две разные обёртки такую ошибку не различали бы
        const guarded = withSessionReadyGuard<KeyboardEvent>(() => isReady, handler);

        guarded({} as KeyboardEvent);
        expect(handler).not.toHaveBeenCalled();

        isReady = true;
        guarded({} as KeyboardEvent);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('guard пропускает сохранение в согласованную сессию', async () => {
        const save = vi.fn(() => Promise.resolve());
        const onBlocked = vi.fn();

        const isSaved = await runSaveWhenSessionReady({
            isSessionReady: () => true,
            save,
            onBlocked,
        });

        expect(isSaved).toBe(true);
        expect(save).toHaveBeenCalledTimes(1);
        expect(onBlocked).not.toHaveBeenCalled();
    });
});
