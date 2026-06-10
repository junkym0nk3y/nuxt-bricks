// #region Imports
// Nuxt
import { useHead } from 'nuxt/app';

// Composables
import { useLandingConfig } from '../../common/composables/useLandingConfig';
// #endregion

/**
 * Инжектит глобальные CSS-правила для responsive layout-настроек (Grid/Flex) через CSS variables.
 *
 * В схеме layout-компоненты хранят `props.responsive.{mobile|tablet|desktop}` с overrides.
 * Рендерер выставляет переменные вида `--bricks-grid-columns-mobile` и т.д.
 * Здесь мы только выбираем активные переменные (`--bricks-grid-columns`, `--bricks-flex-direction`, …)
 * в зависимости от текущего viewport (builder) или брейкпоинтов (published).
 *
 * Реализация SSR-safe: никаких JS device detection, только CSS.
 */
export function useLandingResponsiveLayoutStyles(): void {
    const config = useLandingConfig();
    const breakpoints = config.breakpoints;

    const tabletMin = Number(breakpoints.tablet ?? 768);
    const desktopMin = Number(breakpoints.desktop ?? 1600);

    const mobileMax = Math.max(0, tabletMin - 1);
    const tabletMax = Math.max(tabletMin, desktopMin - 1);

    const styleContent = `
	        /* ===== Responsive layout vars: Defaults (desktop) ===== */
	        [data-bricks-layout="grid"] {
	            --bricks-grid-columns: var(--bricks-grid-columns-desktop);
	            --bricks-grid-rows: var(--bricks-grid-rows-desktop);
	            --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-desktop);
	            --bricks-grid-gap: var(--bricks-grid-gap-desktop);
	            --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-desktop);
	            --bricks-grid-lead-left: var(--bricks-grid-lead-left-desktop);
	            --bricks-grid-lead-right: var(--bricks-grid-lead-right-desktop);
	        }

        [data-bricks-layout="flex"] {
            --bricks-flex-direction: var(--bricks-flex-direction-desktop);
            --bricks-flex-justify: var(--bricks-flex-justify-desktop);
            --bricks-flex-wrap: var(--bricks-flex-wrap-desktop);
            --bricks-flex-gap: var(--bricks-flex-gap-desktop);
        }

	        /* ===== Responsive layout vars: Builder (canvas viewport) ===== */
	        .landing-canvas[data-landing-viewport="mobile"] [data-bricks-layout="grid"] {
	            --bricks-grid-columns: var(--bricks-grid-columns-mobile);
	            --bricks-grid-rows: var(--bricks-grid-rows-mobile);
	            --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-mobile);
	            --bricks-grid-gap: var(--bricks-grid-gap-mobile);
	            --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-mobile);
	            --bricks-grid-lead-left: var(--bricks-grid-lead-left-mobile);
	            --bricks-grid-lead-right: var(--bricks-grid-lead-right-mobile);
	        }
	        .landing-canvas[data-landing-viewport="tablet"] [data-bricks-layout="grid"] {
	            --bricks-grid-columns: var(--bricks-grid-columns-tablet);
	            --bricks-grid-rows: var(--bricks-grid-rows-tablet);
	            --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-tablet);
	            --bricks-grid-gap: var(--bricks-grid-gap-tablet);
	            --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-tablet);
	            --bricks-grid-lead-left: var(--bricks-grid-lead-left-tablet);
	            --bricks-grid-lead-right: var(--bricks-grid-lead-right-tablet);
	        }
	        .landing-canvas[data-landing-viewport="desktop"] [data-bricks-layout="grid"] {
	            --bricks-grid-columns: var(--bricks-grid-columns-desktop);
	            --bricks-grid-rows: var(--bricks-grid-rows-desktop);
	            --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-desktop);
	            --bricks-grid-gap: var(--bricks-grid-gap-desktop);
	            --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-desktop);
	            --bricks-grid-lead-left: var(--bricks-grid-lead-left-desktop);
	            --bricks-grid-lead-right: var(--bricks-grid-lead-right-desktop);
	        }

        .landing-canvas[data-landing-viewport="mobile"] [data-bricks-layout="flex"] {
            --bricks-flex-direction: var(--bricks-flex-direction-mobile);
            --bricks-flex-justify: var(--bricks-flex-justify-mobile);
            --bricks-flex-wrap: var(--bricks-flex-wrap-mobile);
            --bricks-flex-gap: var(--bricks-flex-gap-mobile);
        }
        .landing-canvas[data-landing-viewport="tablet"] [data-bricks-layout="flex"] {
            --bricks-flex-direction: var(--bricks-flex-direction-tablet);
            --bricks-flex-justify: var(--bricks-flex-justify-tablet);
            --bricks-flex-wrap: var(--bricks-flex-wrap-tablet);
            --bricks-flex-gap: var(--bricks-flex-gap-tablet);
        }
        .landing-canvas[data-landing-viewport="desktop"] [data-bricks-layout="flex"] {
            --bricks-flex-direction: var(--bricks-flex-direction-desktop);
            --bricks-flex-justify: var(--bricks-flex-justify-desktop);
            --bricks-flex-wrap: var(--bricks-flex-wrap-desktop);
            --bricks-flex-gap: var(--bricks-flex-gap-desktop);
        }

        /* ===== Section responsive vars: Defaults (desktop) ===== */
        [data-bricks-layout="section"] {
            --bricks-section-pt: var(--bricks-section-pt-desktop);
            --bricks-section-pb: var(--bricks-section-pb-desktop);
            --bricks-section-px: var(--bricks-section-px-desktop);
            --bricks-section-radius: var(--bricks-section-radius-desktop);
            --bricks-section-min-h: var(--bricks-section-min-h-desktop);
        }

        /* Section: Builder viewport */
        .landing-canvas[data-landing-viewport="mobile"] [data-bricks-layout="section"] {
            --bricks-section-pt: var(--bricks-section-pt-mobile);
            --bricks-section-pb: var(--bricks-section-pb-mobile);
            --bricks-section-px: var(--bricks-section-px-mobile);
            --bricks-section-radius: var(--bricks-section-radius-mobile);
            --bricks-section-min-h: var(--bricks-section-min-h-mobile);
        }
        .landing-canvas[data-landing-viewport="tablet"] [data-bricks-layout="section"] {
            --bricks-section-pt: var(--bricks-section-pt-tablet);
            --bricks-section-pb: var(--bricks-section-pb-tablet);
            --bricks-section-px: var(--bricks-section-px-tablet);
            --bricks-section-radius: var(--bricks-section-radius-tablet);
            --bricks-section-min-h: var(--bricks-section-min-h-tablet);
        }
        .landing-canvas[data-landing-viewport="desktop"] [data-bricks-layout="section"] {
            --bricks-section-pt: var(--bricks-section-pt-desktop);
            --bricks-section-pb: var(--bricks-section-pb-desktop);
            --bricks-section-px: var(--bricks-section-px-desktop);
            --bricks-section-radius: var(--bricks-section-radius-desktop);
            --bricks-section-min-h: var(--bricks-section-min-h-desktop);
        }

        /* ===== Space responsive vars: Defaults (desktop) ===== */
        [data-bricks-layout="space"] {
            --bricks-space-size: var(--bricks-space-size-desktop);
            --bricks-space-divider-mx: var(--bricks-space-divider-mx-desktop);
        }

        /* Space: Builder viewport */
        .landing-canvas[data-landing-viewport="mobile"] [data-bricks-layout="space"] {
            --bricks-space-size: var(--bricks-space-size-mobile);
            --bricks-space-divider-mx: var(--bricks-space-divider-mx-mobile);
        }
        .landing-canvas[data-landing-viewport="tablet"] [data-bricks-layout="space"] {
            --bricks-space-size: var(--bricks-space-size-tablet);
            --bricks-space-divider-mx: var(--bricks-space-divider-mx-tablet);
        }
        .landing-canvas[data-landing-viewport="desktop"] [data-bricks-layout="space"] {
            --bricks-space-size: var(--bricks-space-size-desktop);
            --bricks-space-divider-mx: var(--bricks-space-divider-mx-desktop);
        }

        /* ===== Media responsive vars: Defaults (desktop) ===== */
        [data-bricks-layout="media"],
        [data-bricks-layout="svg"] {
            --bricks-media-width: var(--bricks-media-width-desktop);
            --bricks-media-height: var(--bricks-media-height-desktop);
            --bricks-media-radius: var(--bricks-media-radius-desktop);
        }

        /* Media: Builder viewport */
        .landing-canvas[data-landing-viewport="mobile"] [data-bricks-layout="media"],
        .landing-canvas[data-landing-viewport="mobile"] [data-bricks-layout="svg"] {
            --bricks-media-width: var(--bricks-media-width-mobile);
            --bricks-media-height: var(--bricks-media-height-mobile);
            --bricks-media-radius: var(--bricks-media-radius-mobile);
        }
        .landing-canvas[data-landing-viewport="tablet"] [data-bricks-layout="media"],
        .landing-canvas[data-landing-viewport="tablet"] [data-bricks-layout="svg"] {
            --bricks-media-width: var(--bricks-media-width-tablet);
            --bricks-media-height: var(--bricks-media-height-tablet);
            --bricks-media-radius: var(--bricks-media-radius-tablet);
        }
        .landing-canvas[data-landing-viewport="desktop"] [data-bricks-layout="media"],
        .landing-canvas[data-landing-viewport="desktop"] [data-bricks-layout="svg"] {
            --bricks-media-width: var(--bricks-media-width-desktop);
            --bricks-media-height: var(--bricks-media-height-desktop);
            --bricks-media-radius: var(--bricks-media-radius-desktop);
        }

	        /* ===== Responsive layout vars: Published (real viewport) ===== */
	        @media (max-width: ${mobileMax}px) {
	            [data-bricks-layout="grid"] {
	                --bricks-grid-columns: var(--bricks-grid-columns-mobile);
	                --bricks-grid-rows: var(--bricks-grid-rows-mobile);
	                --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-mobile);
	                --bricks-grid-gap: var(--bricks-grid-gap-mobile);
	                --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-mobile);
	                --bricks-grid-lead-left: var(--bricks-grid-lead-left-mobile);
	                --bricks-grid-lead-right: var(--bricks-grid-lead-right-mobile);
	            }

            [data-bricks-layout="flex"] {
                --bricks-flex-direction: var(--bricks-flex-direction-mobile);
                --bricks-flex-justify: var(--bricks-flex-justify-mobile);
                --bricks-flex-wrap: var(--bricks-flex-wrap-mobile);
                --bricks-flex-gap: var(--bricks-flex-gap-mobile);
            }

            [data-bricks-layout="section"] {
                --bricks-section-pt: var(--bricks-section-pt-mobile);
                --bricks-section-pb: var(--bricks-section-pb-mobile);
                --bricks-section-px: var(--bricks-section-px-mobile);
                --bricks-section-radius: var(--bricks-section-radius-mobile);
                --bricks-section-min-h: var(--bricks-section-min-h-mobile);
            }

            [data-bricks-layout="space"] {
                --bricks-space-size: var(--bricks-space-size-mobile);
                --bricks-space-divider-mx: var(--bricks-space-divider-mx-mobile);
            }

            [data-bricks-layout="media"],
            [data-bricks-layout="svg"] {
                --bricks-media-width: var(--bricks-media-width-mobile);
                --bricks-media-height: var(--bricks-media-height-mobile);
                --bricks-media-radius: var(--bricks-media-radius-mobile);
            }
        }

	        @media (min-width: ${tabletMin}px) and (max-width: ${tabletMax}px) {
	            [data-bricks-layout="grid"] {
	                --bricks-grid-columns: var(--bricks-grid-columns-tablet);
	                --bricks-grid-rows: var(--bricks-grid-rows-tablet);
	                --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-tablet);
	                --bricks-grid-gap: var(--bricks-grid-gap-tablet);
	                --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-tablet);
	                --bricks-grid-lead-left: var(--bricks-grid-lead-left-tablet);
	                --bricks-grid-lead-right: var(--bricks-grid-lead-right-tablet);
	            }

            [data-bricks-layout="flex"] {
                --bricks-flex-direction: var(--bricks-flex-direction-tablet);
                --bricks-flex-justify: var(--bricks-flex-justify-tablet);
                --bricks-flex-wrap: var(--bricks-flex-wrap-tablet);
                --bricks-flex-gap: var(--bricks-flex-gap-tablet);
            }

            [data-bricks-layout="section"] {
                --bricks-section-pt: var(--bricks-section-pt-tablet);
                --bricks-section-pb: var(--bricks-section-pb-tablet);
                --bricks-section-px: var(--bricks-section-px-tablet);
                --bricks-section-radius: var(--bricks-section-radius-tablet);
                --bricks-section-min-h: var(--bricks-section-min-h-tablet);
            }

            [data-bricks-layout="space"] {
                --bricks-space-size: var(--bricks-space-size-tablet);
                --bricks-space-divider-mx: var(--bricks-space-divider-mx-tablet);
            }

            [data-bricks-layout="media"],
            [data-bricks-layout="svg"] {
                --bricks-media-width: var(--bricks-media-width-tablet);
                --bricks-media-height: var(--bricks-media-height-tablet);
                --bricks-media-radius: var(--bricks-media-radius-tablet);
            }
        }

	        @media (min-width: ${desktopMin}px) {
	            [data-bricks-layout="grid"] {
	                --bricks-grid-columns: var(--bricks-grid-columns-desktop);
	                --bricks-grid-rows: var(--bricks-grid-rows-desktop);
	                --bricks-grid-auto-rows: var(--bricks-grid-auto-rows-desktop);
	                --bricks-grid-gap: var(--bricks-grid-gap-desktop);
	                --bricks-grid-auto-flow: var(--bricks-grid-auto-flow-desktop);
	                --bricks-grid-lead-left: var(--bricks-grid-lead-left-desktop);
	                --bricks-grid-lead-right: var(--bricks-grid-lead-right-desktop);
	            }

            [data-bricks-layout="flex"] {
                --bricks-flex-direction: var(--bricks-flex-direction-desktop);
                --bricks-flex-justify: var(--bricks-flex-justify-desktop);
                --bricks-flex-wrap: var(--bricks-flex-wrap-desktop);
                --bricks-flex-gap: var(--bricks-flex-gap-desktop);
            }

            [data-bricks-layout="section"] {
                --bricks-section-pt: var(--bricks-section-pt-desktop);
                --bricks-section-pb: var(--bricks-section-pb-desktop);
                --bricks-section-px: var(--bricks-section-px-desktop);
                --bricks-section-radius: var(--bricks-section-radius-desktop);
                --bricks-section-min-h: var(--bricks-section-min-h-desktop);
            }

            [data-bricks-layout="space"] {
                --bricks-space-size: var(--bricks-space-size-desktop);
                --bricks-space-divider-mx: var(--bricks-space-divider-mx-desktop);
            }

            [data-bricks-layout="media"],
            [data-bricks-layout="svg"] {
                --bricks-media-width: var(--bricks-media-width-desktop);
                --bricks-media-height: var(--bricks-media-height-desktop);
                --bricks-media-radius: var(--bricks-media-radius-desktop);
            }
        }
    `;

    useHead({
        style: [
            {
                key: 'bricks-responsive-layout',
                innerHTML: styleContent,
            },
        ],
    });
}
