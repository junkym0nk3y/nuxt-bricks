// #region Imports
// Types
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { computed } from 'vue';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// #endregion

/** Базовое значение rem библиотеки (px). */
const LIBRARY_REM_BASE = 10;

/**
 * Вычисляет rem-компенсацию для канваса, если проект использует нестандартный
 * html { font-size } (например, vw-based).
 *
 * Билдер принудительно выставляет html { font-size: 10px } инлайном,
 * а этот composable возвращает коэффициент, на который нужно домножить
 * scale канваса, чтобы контент выглядел так же, как на published page.
 *
 * `remBase` — свойство набора ПРОЕКТА (опция модуля `bricks.devices`), а не
 * страницы: одна страница в другой rem-системе, чем соседние, — не настройка,
 * а поломка. Резолвер набора подмешивает его по совпадающему ключу.
 *
 * @example
 * // nuxt.config.ts
 * bricks: {
 *     devices: [
 *         { key: 'mobile', label: 'Мобильный', icon: 'device-mobile', width: 375, aside: 0.4 },
 *         { key: 'desktop', label: 'Десктоп', icon: 'device-desktop', width: 1600, aside: 2,
 *           remBase: '0.6944vw' },
 *     ],
 * }
 */
export function useCanvasRemBase() {
    const canvasStore = useCanvasStore();

    /**
     * Вычисляет целевой rem (в px) для указанного viewport на основе remBase из конфига.
     *
     * @param viewport - Тип viewport (mobile / tablet / desktop).
     * @returns Целевое значение 1rem в пикселях.
     */
    function computeTargetRemPx(viewport: TBricksDeviceKey): number {
        const device = canvasStore.devices.find((item) => item.key === viewport);

        if (!device) {
            return LIBRARY_REM_BASE;
        }

        const remBase = device.remBase ?? `${LIBRARY_REM_BASE}px`;

        if (remBase.endsWith('vw')) {
            const coefficient = parseFloat(remBase);

            if (Number.isNaN(coefficient)) {
                return LIBRARY_REM_BASE;
            }

            return (coefficient * device.width) / 100;
        }

        const parsed = parseFloat(remBase);
        return Number.isNaN(parsed) ? LIBRARY_REM_BASE : parsed;
    }

    /**
     * Коэффициент компенсации rem для текущего viewport.
     * Домножается на scale канваса для визуального соответствия published page.
     *
     * При `remBase: '10px'` (дефолт) возвращает 1 — компенсация не нужна.
     */
    const remCompensation = computed<number>(() => {
        return computeTargetRemPx(canvasStore.viewport) / LIBRARY_REM_BASE;
    });

    /**
     * Компенсация для конкретного viewport (используется в Figma Mode,
     * где три viewport-а рендерятся одновременно).
     *
     * @param viewport - Тип viewport.
     * @returns Коэффициент компенсации.
     */
    function getRemCompensation(viewport: TBricksDeviceKey): number {
        return computeTargetRemPx(viewport) / LIBRARY_REM_BASE;
    }

    return {
        remCompensation,
        getRemCompensation,
    };
}
