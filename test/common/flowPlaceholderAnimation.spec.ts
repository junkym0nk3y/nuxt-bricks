// Vitest
import { describe, expect, it, vi } from 'vitest';

// Utils
import { animateFlowPlaceholder } from '../../src/runtime/modules/common/utils/dragAndDrop';

interface IAnimateCall {
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
}

/**
 * Собирает заглушку плейсхолдера с перехватом Web Animations API.
 *
 * @param rect - Координаты, которые вернёт getBoundingClientRect.
 * @returns Элемент-заглушка и журнал вызовов animate.
 */
function makePlaceholder(rect: { left: number; top: number }): {
    element: HTMLElement;
    calls: IAnimateCall[];
} {
    const calls: IAnimateCall[] = [];
    const element = {
        animate: vi.fn((keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
            calls.push({ keyframes, options });
        }),
        getBoundingClientRect: () => ({ left: rect.left, top: rect.top }) as DOMRect,
    } as unknown as HTMLElement;

    return { element, calls };
}

describe('анимация места вставки вне Vue-потока', () => {
    it('первое появление проигрывает fade-in', () => {
        const { element, calls } = makePlaceholder({ left: 0, top: 0 });

        animateFlowPlaceholder(element, null);

        expect(calls).toHaveLength(1);
        expect(calls[0].keyframes[0]).toMatchObject({ opacity: 0 });
        expect(calls[0].options.duration).toBe(140);
    });

    it('смена позиции анимируется FLIP-переездом от прежних координат', () => {
        const { element, calls } = makePlaceholder({ left: 120, top: 300 });

        animateFlowPlaceholder(element, { left: 40, top: 260 } as DOMRect);

        expect(calls).toHaveLength(1);
        expect(calls[0].keyframes[0]).toMatchObject({ transform: 'translate(-80px, -40px)' });
        expect(calls[0].keyframes[1]).toMatchObject({ transform: 'none' });
    });

    it('не анимирует, когда позиция фактически не изменилась', () => {
        const { element, calls } = makePlaceholder({ left: 120, top: 300 });

        animateFlowPlaceholder(element, { left: 120, top: 300 } as DOMRect);

        expect(calls).toEqual([]);
    });

    it('молча пропускает окружение без Web Animations API', () => {
        const element = {
            getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
        } as unknown as HTMLElement;

        expect(() => animateFlowPlaceholder(element, null)).not.toThrow();
    });
});
