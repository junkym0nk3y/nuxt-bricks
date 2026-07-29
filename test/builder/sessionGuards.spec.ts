// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Node
import { readFileSync } from 'node:fs';

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

/**
 * Само правило проверяется поведением выше; здесь — только его подключение и щиты
 * в шаблоне composition root'а. Смонтировать SFC нечем (jsdom в наборе нет), поэтому
 * проводка сверяется по тексту — тот же приём, что в
 * test/module/bricksManifestAssetNamespace.spec.ts для монтирования server asset.
 * Кейсы краснеют на расцеплении, но поведения не доказывают.
 */
describe('несогласованная сессия: проводка щитов и кнопки', () => {
    const builderPage = readFileSync(
        'src/runtime/modules/builder/app/pages/[pagename].vue',
        'utf8'
    );
    const toolbar = readFileSync(
        'src/runtime/modules/builder/shell/toolbar/components/TheBuilderShellToolbar.vue',
        'utf8'
    );

    it('пишущие действия тулбара выключены, пока сессия не готова', () => {
        expect(builderPage).toContain(':is-session-ready="isSessionReady"');

        // Сохранение, медиагалерея и превью: выход на дашборд остаётся доступным
        const disabledByReadiness = toolbar.match(/:disabled="!props\.isSessionReady"/g) ?? [];
        expect(disabledByReadiness).toHaveLength(3);
    });

    it('оба действия сохранения идут через guard со своей готовностью и действием', () => {
        expect(builderPage).toContain('@save-draft="handleSaveDraftGuarded"');
        expect(builderPage).toContain('@save-as-copy="handleSaveAsCopyGuarded"');
        expect(builderPage).toContain('save: handleSaveDraft,');
        expect(builderPage).toContain('save: handleSaveAsCopy,');

        // Иначе `isSessionReady: () => true` в одном из обработчиков снимало бы
        // защиту, не роняя ни один кейс
        const readinessArguments =
            builderPage.match(/isSessionReady: \(\) => isSessionReady\.value/g) ?? [];
        expect(readinessArguments).toHaveLength(2);
    });

    it('рабочая область закрыта и на отказе, и на незавершённом открытии', () => {
        expect(builderPage).toContain('<TheBuilderSessionError');
        expect(builderPage).toContain('v-if="sessionError"');
        expect(builderPage).toContain('@retry="handleRetrySession"');
        expect(builderPage).toContain('@open-pages-manager="handleOpenPagesManager"');
        expect(builderPage).toContain('v-else-if="!isSessionReady"');
        expect(builderPage).toContain('$style.sessionShield');
    });

    it('клавиатура закрыта отдельно от мыши: inert и guard на глобальном обработчике', () => {
        // Щит держит только указатель — Tab, уже сфокусированное поле и window-listener
        // проходят мимо него
        expect(builderPage).toContain(':inert="!isSessionReady"');
        expect(builderPage).toContain("addEventListener('keydown', handleGuardedKeyDown)");
        expect(builderPage).toContain("removeEventListener('keydown', handleGuardedKeyDown)");
        expect(builderPage).toContain('withSessionReadyGuard<KeyboardEvent>(');
    });

    it('уезжающая модалка не принимает ни указатель, ни клавиатуру', () => {
        const modal = readFileSync('src/runtime/modules/ui/base/modal/BricksModal.vue', 'utf8');
        const transitions = readFileSync('src/runtime/assets/scss/common/transitions.scss', 'utf8');

        // `force-mount` держит кнопки в DOM до конца leave-анимации: указатель
        // закрывает CSS (обёртка и потомки — кнопки ставят себе pointer-events: auto),
        // клавиатуру и assistive tech — `inert`, который ставится императивно, потому
        // что биндинги уезжающего элемента больше не патчатся
        // Селектор и объявление сверяются одним блоком: по отдельности они прошли бы
        // и на `pointer-events` из чужого правила
        expect(transitions).toMatch(
            /\.bricks-modal-fade-leave-active,\s*\n\s*\.bricks-modal-fade-leave-active \*\s*\{[^}]*pointer-events:\s*none;/
        );
        expect(modal).toContain('@leave="onLeave"');
        expect(modal).toContain("element.setAttribute('inert', '')");
    });

    it('экран ошибки объявлен для скринридера и забирает фокус', () => {
        const errorScreen = readFileSync(
            'src/runtime/modules/builder/app/components/TheBuilderSessionError.vue',
            'utf8'
        );

        expect(errorScreen).toContain('role="alertdialog"');
        expect(errorScreen).toContain('aria-labelledby="bricks-session-error-title"');
        expect(errorScreen).toContain('aria-describedby="bricks-session-error-description"');
        // Фокус мог остаться в поле, уехавшем под inert
        expect(errorScreen).toContain('retryButtonRef.value?.$el?.focus?.()');
    });
});
