// #region Imports
// Types
import type { TViewportType } from '../types/components';

// Vue
import { computed } from 'vue';

// Pinia
import { useCanvasStore } from '../../stores/canvas';

// Composables
import { useBricksConfig } from '../../../common/composables/useBricksConfig';
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
 * @example
 * // app.config.ts
 * bricks: {
 *     breakpoints: {
 *         desktop: { width: 1600, remBase: '0.6944vw' },
 *         tablet:  { width: 768,  remBase: '10px' },
 *         mobile:  { width: 375,  remBase: '10px' },
 *     }
 * }
 */
export function useCanvasRemBase() {
    const canvasStore = useCanvasStore();
    const config = useBricksConfig();

    /**
     * Вычисляет целевой rem (в px) для указанного viewport на основе remBase из конфига.
     *
     * @param viewport - Тип viewport (mobile / tablet / desktop).
     * @returns Целевое значение 1rem в пикселях.
     */
    function computeTargetRemPx(viewport: TViewportType): number {
        const bp = config.canvasBreakpoints[viewport];
        const remBase = bp.remBase ?? `${LIBRARY_REM_BASE}px`;

        if (remBase.endsWith('vw')) {
            const coefficient = parseFloat(remBase);

            if (Number.isNaN(coefficient)) {
                return LIBRARY_REM_BASE;
            }

            return (coefficient * bp.width) / 100;
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
    function getRemCompensation(viewport: TViewportType): number {
        return computeTargetRemPx(viewport) / LIBRARY_REM_BASE;
    }

    return {
        remCompensation,
        getRemCompensation,
    };
}
