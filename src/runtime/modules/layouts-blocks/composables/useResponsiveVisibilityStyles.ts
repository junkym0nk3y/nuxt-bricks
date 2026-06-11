// #region Imports
// Nuxt
import { useHead } from 'nuxt/app';

// Composables
import { useBricksConfig } from '../../common/composables/useBricksConfig';
// #endregion

/**
 * Инжектит глобальные CSS-правила для скрытия элементов по устройствам.
 *
 * Две ветки:
 * - Builder preview: ориентируемся на `data-bricks-viewport` у `.bricks-canvas`.
 * - Published page: ориентируемся на реальные брейкпоинты из `app.config.ts` через `@media`.
 *
 * Реализация SSR-safe: правила задаются через CSS (`display: none`), без JS device detection.
 */
export function useResponsiveVisibilityStyles(): void {
    const config = useBricksConfig();
    const breakpoints = config.breakpoints;

    const tabletMin = Number(breakpoints.tablet ?? 768);
    const desktopMin = Number(breakpoints.desktop ?? 1600);

    const mobileMax = Math.max(0, tabletMin - 1);
    const tabletMax = Math.max(tabletMin, desktopMin - 1);

    const styleContent = `
        /* ===== Device visibility: Builder (canvas viewport) ===== */
        .bricks-canvas[data-bricks-viewport="mobile"] .bricks-hide--mobile,
        .bricks-canvas[data-bricks-viewport="tablet"] .bricks-hide--tablet,
        .bricks-canvas[data-bricks-viewport="desktop"] .bricks-hide--desktop {
            display: none !important;
        }

        /* ===== Device visibility: Published (real viewport) ===== */
        /* На опубликованной странице полностью скрываем компоненты по media queries. */
        @media (max-width: ${mobileMax}px) {
            .bricks-hide--mobile:not(.bricks-canvas *) { display: none !important; }
        }

        @media (min-width: ${tabletMin}px) and (max-width: ${tabletMax}px) {
            .bricks-hide--tablet:not(.bricks-canvas *) { display: none !important; }
        }

        @media (min-width: ${desktopMin}px) {
            .bricks-hide--desktop:not(.bricks-canvas *) { display: none !important; }
        }
    `;

    useHead({
        style: [
            {
                key: 'bricks-responsive-visibility',
                innerHTML: styleContent,
            },
        ],
    });
}
