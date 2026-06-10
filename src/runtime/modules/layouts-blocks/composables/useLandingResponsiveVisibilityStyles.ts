// #region Imports
// Nuxt
import { useHead } from 'nuxt/app';

// Composables
import { useLandingConfig } from '../../common/composables/useLandingConfig';
// #endregion

/**
 * Инжектит глобальные CSS-правила для скрытия элементов по устройствам.
 *
 * Две ветки:
 * - Builder preview: ориентируемся на `data-landing-viewport` у `.landing-canvas`.
 * - Published page: ориентируемся на реальные брейкпоинты из `app.config.ts` через `@media`.
 *
 * Реализация SSR-safe: правила задаются через CSS (`display: none`), без JS device detection.
 */
export function useLandingResponsiveVisibilityStyles(): void {
    const config = useLandingConfig();
    const breakpoints = config.breakpoints;

    const tabletMin = Number(breakpoints.tablet ?? 768);
    const desktopMin = Number(breakpoints.desktop ?? 1600);

    const mobileMax = Math.max(0, tabletMin - 1);
    const tabletMax = Math.max(tabletMin, desktopMin - 1);

    const styleContent = `
        /* ===== Device visibility: Builder (canvas viewport) ===== */
        .landing-canvas[data-landing-viewport="mobile"] .bricks-hide--mobile,
        .landing-canvas[data-landing-viewport="tablet"] .bricks-hide--tablet,
        .landing-canvas[data-landing-viewport="desktop"] .bricks-hide--desktop {
            display: none !important;
        }

        /* ===== Device visibility: Published (real viewport) ===== */
        /* На опубликованной странице полностью скрываем компоненты по media queries. */
        @media (max-width: ${mobileMax}px) {
            .bricks-hide--mobile:not(.landing-canvas *) { display: none !important; }
        }

        @media (min-width: ${tabletMin}px) and (max-width: ${tabletMax}px) {
            .bricks-hide--tablet:not(.landing-canvas *) { display: none !important; }
        }

        @media (min-width: ${desktopMin}px) {
            .bricks-hide--desktop:not(.landing-canvas *) { display: none !important; }
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
