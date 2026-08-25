/**
 * @vitest-environment happy-dom
 *
 * DOM-окружение включено только для этого файла: лоадер живёт на
 * requestAnimationFrame и Transition, а им нужен настоящий документ.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';

// Components
import TheBuilderLoader from '../../src/runtime/modules/builder/app/components/TheBuilderLoader.vue';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        // Фразы лежат в локали массивом: компонент берёт их через tm и прогоняет
        // каждую через rt
        tm: () => ['фраза один', 'фраза два'],
        rt: (message: string) => message,
    }),
}));
// #endregion

// #region Helpers
/** Лого — своя анимация и SVG; для цикла показа важен только факт вставки. */
const BuilderLogoStub = defineComponent({
    name: 'BuilderLogo',
    setup: () => () => h('span'),
});

/** Порог показа при переключении страниц (см. TheBuilderLoader). */
const SWITCH_MIN_VISIBLE_DURATION_MS = 1200;

/** Кадры rAF гоняем вручную: так тест видит ровно те моменты, что и лоадер. */
let frameCallbacks: FrameRequestCallback[] = [];
let currentTime = 0;

/**
 * Проигрывает один кадр анимации.
 *
 * @param advanceMs - На сколько сдвинуть время кадра.
 */
async function runFrame(advanceMs: number): Promise<void> {
    currentTime += advanceMs;
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    callbacks.forEach((callback) => callback(currentTime));
    await nextTick();
}

/**
 * Монтирует лоадер незагруженным.
 *
 * Порог показа зависит от пути: смонтированный сразу с загрузкой лоадер держит
 * порог первого открытия редактора, а поднятый пропом позже — короткий порог
 * переключения страниц. Здесь проверяется второй.
 *
 * @param isLoading - Стартовое состояние загрузки.
 * @returns Обёртка компонента.
 */
function mountLoader(isLoading: boolean): VueWrapper {
    // Transition остаётся стабом по умолчанию: уход оверлея проверяется как
    // решение компонента, а не как отработавшая CSS-анимация
    return mount(TheBuilderLoader, {
        props: { isLoading },
        global: {
            components: { BuilderLogo: BuilderLogoStub },
        },
    });
}

/** Виден ли оверлей. */
function isOverlayVisible(wrapper: VueWrapper): boolean {
    return wrapper.find('div').exists();
}

/**
 * Кадры, заказанные самим лоадером: Vue заказывает свои для анимаций перехода, и
 * без отбора тест считал бы чужие.
 *
 * @returns Ожидающие кадры цикла показа.
 */
function pendingLoaderFrames(): FrameRequestCallback[] {
    return frameCallbacks.filter((callback) => callback.name === 'tick');
}
// #endregion

describe('лоадер билдера: цикл показа', () => {
    beforeEach(() => {
        frameCallbacks = [];
        currentTime = 0;

        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        });
        vi.stubGlobal('cancelAnimationFrame', () => {
            frameCallbacks = [];
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('загрузка дольше порога не оставляет крутящихся кадров', async () => {
        const wrapper = mountLoader(false);
        await wrapper.setProps({ isLoading: true });

        // Порог выдержан, загрузка идёт: полоска на потолке и двигаться ей некуда
        await runFrame(0);
        await runFrame(SWITCH_MIN_VISIBLE_DURATION_MS);

        expect(pendingLoaderFrames()).toHaveLength(0);
        expect(isOverlayVisible(wrapper)).toBe(true);

        wrapper.unmount();
    });

    it('оверлей уходит, даже если кадры уже остановлены на потолке', async () => {
        const wrapper = mountLoader(false);
        await wrapper.setProps({ isLoading: true });

        await runFrame(0);
        await runFrame(SWITCH_MIN_VISIBLE_DURATION_MS);
        expect(pendingLoaderFrames()).toHaveLength(0);

        // Без этой ветки снимать оверлей было бы некому — он остался бы навсегда
        await wrapper.setProps({ isLoading: false });
        await nextTick();

        expect(isOverlayVisible(wrapper)).toBe(false);

        wrapper.unmount();
    });

    it('загрузка короче порога досматривает цикл кадрами', async () => {
        const wrapper = mountLoader(false);
        await wrapper.setProps({ isLoading: true });

        await runFrame(0);
        await wrapper.setProps({ isLoading: false });
        await runFrame(SWITCH_MIN_VISIBLE_DURATION_MS / 2);

        // Порог ещё не выдержан: оверлей на месте, кадры продолжаются
        expect(isOverlayVisible(wrapper)).toBe(true);
        expect(pendingLoaderFrames().length).toBeGreaterThan(0);

        await runFrame(SWITCH_MIN_VISIBLE_DURATION_MS / 2);
        expect(isOverlayVisible(wrapper)).toBe(false);

        wrapper.unmount();
    });
});
